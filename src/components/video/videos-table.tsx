"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge, Dot } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/misc";
import { useRealtimeBoard } from "@/hooks/use-realtime-board";
import { applyFilters, EMPTY_FILTERS, progressOf, type BoardFilters } from "@/lib/board-state";
import { dueLabel, isOverdue } from "@/lib/dates";
import { priorityMeta } from "@/lib/domain/pipeline";
import { cn } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";

type SortKey = "due" | "title" | "stage" | "updated";

export function VideosTable({ initialVideos }: { initialVideos: BoardVideo[] }) {
  const {
    workspaceId,
    channels,
    channelById,
    memberById,
    stageById,
    stages: allStages,
  } = useWorkspace();
  const { videos } = useRealtimeBoard(workspaceId, initialVideos);

  const [filters, setFilters] = React.useState<BoardFilters>(EMPTY_FILTERS);
  const [stage, setStage] = React.useState<string>("");
  const [sort, setSort] = React.useState<SortKey>("due");

  const rows = React.useMemo(() => {
    const filtered = applyFilters(videos, filters).filter(
      (video) => !stage || video.stage_id === stage,
    );

    const order = allStages.map((item) => item.id);

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "stage":
          return order.indexOf(a.stage_id) - order.indexOf(b.stage_id);
        case "updated":
          return b.updated_at.localeCompare(a.updated_at);
        default: {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        }
      }
    });
  }, [videos, filters, stage, sort, allStages]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search
            className="text-ink-400 absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder="Buscar por título o referencia"
            className="pl-9"
            aria-label="Buscar videos"
          />
        </div>

        <Select
          aria-label="Etapa"
          className="w-auto min-w-36"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
        >
          <option value="">Todas las etapas</option>
          {allStages
            .filter((item) => item.kind !== "archived")
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </Select>

        <Select
          aria-label="Canal"
          className="w-auto min-w-36"
          value={filters.channelId ?? ""}
          onChange={(event) => setFilters({ ...filters, channelId: event.target.value || null })}
        >
          <option value="">Todos los canales</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Ordenar"
          className="w-auto min-w-36"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
        >
          <option value="due">Por fecha limite</option>
          <option value="stage">Por etapa</option>
          <option value="title">Por título</option>
          <option value="updated">Por actividad</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Ningun video coincide"
          description="Prueba a quitar filtros o crea una tarjeta nueva desde el boton superior."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="bg-canvas text-ink-500 text-[11.5px] tracking-wide uppercase">
                  <th className="px-4 py-2.5 font-semibold">Video</th>
                  <th className="px-4 py-2.5 font-semibold">Canal</th>
                  <th className="px-4 py-2.5 font-semibold">Etapa</th>
                  <th className="px-4 py-2.5 font-semibold">Prioridad</th>
                  <th className="px-4 py-2.5 font-semibold">Equipo</th>
                  <th className="px-4 py-2.5 font-semibold">Progreso</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Limite</th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {rows.map((video) => {
                  const channel = channelById(video.channel_id);
                  const stageInfo = stageById(video.stage_id);
                  const priority = priorityMeta(video.priority);
                  const due = dueLabel(video.due_date);
                  const people = video.video_assignees
                    .map((assignee) => memberById(assignee.user_id))
                    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));

                  return (
                    <tr key={video.id} className="hover:bg-canvas/70 transition">
                      <td className="px-4 py-3">
                        <Link
                          href={`/videos/${video.id}`}
                          className="hover:text-brand-600 text-ink-900 block max-w-xs truncate text-[13px] font-medium"
                        >
                          {video.title}
                        </Link>
                        <span className="text-ink-400 text-[11px]">{video.ref}</span>
                      </td>
                      <td className="px-4 py-3">
                        {channel ? (
                          <span className="text-ink-700 flex items-center gap-1.5 text-[12.5px]">
                            <Dot color={channel.color} />
                            {channel.name}
                          </span>
                        ) : (
                          <span className="text-ink-400 text-[12.5px]">Sin canal</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {stageInfo ? (
                          <Badge className="bg-column text-ink-700" dotColor={stageInfo.color}>
                            {stageInfo.name}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={priority.chip}>{priority.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {people.length > 0 ? (
                          <AvatarStack
                            people={people.map((person) => ({
                              id: person.id,
                              full_name: person.full_name,
                              avatar_url: person.avatar_url,
                            }))}
                            size="sm"
                          />
                        ) : (
                          <span className="text-ink-400 text-[12px]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-ink-600 text-[12px]">{progressOf(video)}%</span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right text-[12.5px] font-medium",
                          isOverdue(video.due_date) ? "text-red-600" : "text-ink-600",
                        )}
                      >
                        {due ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
