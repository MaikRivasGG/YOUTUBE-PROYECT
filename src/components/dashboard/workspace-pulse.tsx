"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Lightbulb,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Dot } from "@/components/ui/badge";
import { ChannelMark } from "@/components/ui/channel-mark";
import { Card, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";
import type { Stage, StageKind } from "@/types/database";

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

const KIND_ICONS: Record<StageKind, LucideIcon> = {
  backlog: Lightbulb,
  work: Wrench,
  review: Eye,
  scheduled: CalendarClock,
  done: CheckCircle2,
  archived: CheckCircle2,
};

/** Cuánto tarda cada canal en pantalla antes de pasar al siguiente. */
const AUTOPLAY_MS = 5000;

/**
 * Reemplaza el antiguo "Carga por etapa" global: desde que cada canal puede
 * tener su propio pipeline, una sola barra por etapa ya no representa nada
 * comparable entre canales. Se muestra un canal a la vez, en un carrusel
 * automatico, y el resto de pestañas son listas rapidas por tipo de etapa.
 */
export function WorkspacePulse({ videos }: { videos: BoardVideo[] }) {
  const { channels, stagesOf, channelById, stageById } = useWorkspace();
  const [tab, setTab] = React.useState<TabKey>("carga");
  const [channelIndex, setChannelIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const activeChannels = React.useMemo(
    () => channels.filter((channel) => !channel.is_archived),
    [channels],
  );
  const index =
    activeChannels.length > 0
      ? ((channelIndex % activeChannels.length) + activeChannels.length) % activeChannels.length
      : 0;
  const channel = activeChannels[index];

  React.useEffect(() => {
    if (tab !== "carga" || paused || activeChannels.length < 2) return;
    const timer = setInterval(() => setChannelIndex((value) => value + 1), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [tab, paused, activeChannels.length]);

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
              tab === item.key
                ? "bg-brand-50 text-brand-700 dark:text-brand-500"
                : "text-ink-500 hover:bg-canvas",
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
          <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <div className="mb-3.5 flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-2.5">
                <ChannelMark
                  name={channel.name}
                  color={channel.color}
                  imageUrl={channel.image_url}
                  size="sm"
                />
                <span className="min-w-0">
                  <span className="text-ink-900 block truncate text-[13.5px] font-semibold">
                    {channel.name}
                  </span>
                  <span className="text-ink-400 block text-[11px]">
                    {channel.handle ?? channel.niche ?? "Canal"}
                  </span>
                </span>
              </span>

              {activeChannels.length > 1 ? (
                <div className="flex shrink-0 items-center gap-1">
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

            <ChannelStageFunnel
              key={channel.id}
              videos={videos}
              channelId={channel.id}
              stages={stagesOf(channel.pipeline_id ?? "")}
            />

            {activeChannels.length > 1 ? (
              <div className="mt-3.5 flex justify-center gap-1.5">
                {activeChannels.map((item, dotIndex) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setChannelIndex(dotIndex)}
                    aria-label={`Ver ${item.name}`}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      dotIndex === index ? "bg-brand-500 w-4" : "bg-line w-1.5",
                    )}
                  />
                ))}
              </div>
            ) : null}
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

/**
 * Embudo del canal: de sus videos activos, cuantos ya alcanzaron cada etapa
 * (o una posterior). A diferencia de "cuantos hay ahora mismo en cada
 * columna", esto se lee de un vistazo como el avance real de la produccion.
 */
function ChannelStageFunnel({
  videos,
  channelId,
  stages,
}: {
  videos: BoardVideo[];
  channelId: string;
  stages: Stage[];
}) {
  if (stages.length === 0) {
    return <EmptyState title="Este canal no tiene pipeline" className="border-0 py-6" />;
  }

  const rankByStage = new Map(stages.map((stage, rank) => [stage.id, rank]));
  const countAtRank = new Array<number>(stages.length).fill(0);
  let total = 0;

  for (const video of videos) {
    if (video.channel_id !== channelId) continue;
    const rank = rankByStage.get(video.stage_id);
    if (rank === undefined) continue;
    countAtRank[rank] += 1;
    total += 1;
  }

  const reachedAtRank = new Array<number>(stages.length).fill(0);
  let running = 0;
  for (let rank = stages.length - 1; rank >= 0; rank -= 1) {
    running += countAtRank[rank];
    reachedAtRank[rank] = running;
  }

  return (
    <ul className="space-y-3">
      {stages.map((stage, rank) => {
        const reached = reachedAtRank[rank];
        const Icon = KIND_ICONS[stage.kind];
        return (
          <li key={stage.id} className="flex items-center gap-3">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-md"
              style={{ backgroundColor: `${stage.color}22`, color: stage.color }}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span className="text-ink-600 w-24 shrink-0 truncate text-[12.5px]">{stage.name}</span>
            <span className="bg-column h-2 flex-1 overflow-hidden rounded-full">
              <span
                className="block h-full rounded-full transition-[width] duration-500"
                style={{
                  width: total > 0 ? `${(reached / total) * 100}%` : "0%",
                  backgroundColor: stage.color,
                }}
              />
            </span>
            <span className="text-ink-500 w-10 shrink-0 text-right text-[12px] font-medium tabular-nums">
              {reached}/{total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
