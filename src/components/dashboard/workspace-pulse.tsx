"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Dot } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";
import type { StageKind } from "@/types/database";

const TABS = [
  { key: "carga", label: "Carga por etapa" },
  { key: "publicar", label: "Videos listos para publicar" },
  { key: "ideas", label: "Ideas sin finalizar" },
  { key: "revision", label: "Videos listos para revisión" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const KIND_BY_TAB = {
  publicar: "scheduled",
  ideas: "backlog",
  revision: "review",
} satisfies Record<Exclude<TabKey, "carga">, StageKind>;

/**
 * Reemplaza el antiguo "Carga por etapa" global: desde que cada canal puede
 * tener su propio pipeline, una sola barra por etapa ya no representa nada
 * comparable entre canales. Se muestra un canal a la vez y se navega entre
 * ellos; el resto de pestañas son listas rapidas por tipo de etapa.
 */
export function WorkspacePulse({ videos }: { videos: BoardVideo[] }) {
  const { channels, stagesOf, channelById, stageById } = useWorkspace();
  const [tab, setTab] = React.useState<TabKey>("carga");
  const [channelIndex, setChannelIndex] = React.useState(0);

  const activeChannels = React.useMemo(
    () => channels.filter((channel) => !channel.is_archived),
    [channels],
  );
  const index =
    activeChannels.length > 0
      ? ((channelIndex % activeChannels.length) + activeChannels.length) % activeChannels.length
      : 0;
  const channel = activeChannels[index];

  const listVideos = React.useMemo(() => {
    if (tab === "carga") return [];
    const kind = KIND_BY_TAB[tab];
    return videos.filter((video) => stageById(video.stage_id)?.kind === kind).slice(0, 8);
  }, [tab, videos, stageById]);

  return (
    <Card className="p-4">
      <div className="border-line -mx-1 mb-3 flex gap-1 overflow-x-auto border-b px-1 pb-2.5 text-[12px]">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 font-medium whitespace-nowrap transition",
              tab === item.key ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:bg-canvas",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "carga" ? (
        activeChannels.length === 0 ? (
          <EmptyState title="Todavía no hay canales" className="border-0 py-6" />
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Dot color={channel.color} />
                <span className="text-ink-900 text-[13.5px] font-semibold">{channel.name}</span>
              </span>

              {activeChannels.length > 1 ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setChannelIndex((value) => value - 1)}
                    aria-label="Canal anterior"
                    className="text-ink-400 hover:bg-canvas hover:text-ink-900 rounded-md p-1 transition"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-ink-400 text-[11px] tabular-nums">
                    {index + 1}/{activeChannels.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setChannelIndex((value) => value + 1)}
                    aria-label="Canal siguiente"
                    className="text-ink-400 hover:bg-canvas hover:text-ink-900 rounded-md p-1 transition"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : null}
            </div>

            <ChannelStageBars
              videos={videos}
              channelId={channel.id}
              stages={stagesOf(channel.pipeline_id ?? "")}
            />
          </div>
        )
      ) : listVideos.length === 0 ? (
        <EmptyState title="Nada por aquí" className="border-0 py-6" />
      ) : (
        <ul className="divide-line divide-y">
          {listVideos.map((video) => {
            const videoChannel = channelById(video.channel_id);
            return (
              <li key={video.id}>
                <Link
                  href={`/videos/${video.id}`}
                  className="hover:bg-canvas -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 transition"
                >
                  <Dot color={videoChannel?.color ?? "#cbd5e1"} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-900 block truncate text-[13px] font-medium">
                      {video.title}
                    </span>
                    <span className="text-ink-400 text-[11.5px]">
                      {video.ref} - {videoChannel?.name ?? "Sin canal"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ChannelStageBars({
  videos,
  channelId,
  stages,
}: {
  videos: BoardVideo[];
  channelId: string;
  stages: import("@/types/database").Stage[];
}) {
  const byStage = new Map<string, number>();
  for (const video of videos) {
    if (video.channel_id !== channelId) continue;
    byStage.set(video.stage_id, (byStage.get(video.stage_id) ?? 0) + 1);
  }

  const max = Math.max(1, ...stages.map((stage) => byStage.get(stage.id) ?? 0));

  if (stages.length === 0) {
    return <EmptyState title="Este canal no tiene pipeline" className="border-0 py-6" />;
  }

  return (
    <ul className="space-y-2.5">
      {stages.map((stage) => {
        const value = byStage.get(stage.id) ?? 0;
        return (
          <li key={stage.id} className="flex items-center gap-3">
            <span className="text-ink-600 w-24 shrink-0 truncate text-[12.5px]">{stage.name}</span>
            <span className="bg-column h-2 flex-1 overflow-hidden rounded-full">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(value / max) * 100}%`, backgroundColor: stage.color }}
              />
            </span>
            <span className="text-ink-500 w-6 shrink-0 text-right text-[12px] font-medium">
              {value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
