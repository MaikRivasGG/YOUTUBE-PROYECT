import type { Metadata } from "next";
import { AlertTriangle, Eye, PlayCircle, Users } from "lucide-react";

import { Board } from "@/components/board/board";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { MiniCalendar } from "@/components/dashboard/mini-calendar";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpcomingCard } from "@/components/dashboard/upcoming";
import { PageHeader } from "@/components/layout/page-header";
import { requireWorkspace } from "@/lib/session";
import {
  getActivity,
  getBoardVideos,
  getNotifications,
  getUpcoming,
  getWorkspaceConfig,
  getWorkspaceStats,
} from "@/server/queries";

export const metadata: Metadata = { title: "Pipeline de producción" };

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string }>;
}) {
  const { workspace, userId } = await requireWorkspace();
  const { canal } = await searchParams;

  const [videos, stats, upcoming, activity, notifications, config] = await Promise.all([
    getBoardVideos(workspace.id),
    getWorkspaceStats(workspace.id),
    getUpcoming(workspace.id),
    getActivity(workspace.id, 8),
    getNotifications(workspace.id),
    getWorkspaceConfig(workspace.id, userId),
  ]);

  // Las tarjetas archivadas no cuentan como carga del equipo.
  const archivedStageIds = new Set(
    config.stages.filter((stage) => stage.kind === "archived").map((stage) => stage.id),
  );
  const liveVideos = videos.filter((video) => !archivedStageIds.has(video.stage_id));

  const teamLoad =
    stats.members > 0 ? Math.round((stats.in_progress / (stats.members * 3)) * 100) : 0;
  const publishDates = liveVideos
    .map((video) => video.publish_at ?? video.due_date)
    .filter((value): value is string => Boolean(value));

  const weekPublications = liveVideos.filter((video) => {
    if (!video.publish_at) return false;
    const date = new Date(video.publish_at);
    const now = new Date();
    const diff = (date.getTime() - now.getTime()) / 86_400_000;
    return diff >= -7 && diff <= 7;
  }).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Pipeline de producción" notifications={notifications} />

      <div className="scrollbar-slim flex min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4 lg:px-7 xl:overflow-hidden">
        {/* Columna principal */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 xl:overflow-hidden">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-ink-900 text-[15px] font-semibold">Resumen de carga</h2>
              <span className="text-ink-400 text-[11.5px]">Últimos 7 días</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Videos activos"
                value={stats.total}
                icon={PlayCircle}
                tone="brand"
                footnote={`${stats.in_progress} en producción`}
              />
              <StatCard
                label="Vencen pronto"
                value={stats.overdue}
                icon={AlertTriangle}
                tone="amber"
                footnote={stats.overdue > 0 ? `${stats.overdue} con riesgo` : "Todo al día"}
                footnoteTone={stats.overdue > 0 ? "danger" : "positive"}
              />
              <StatCard
                label="En producción"
                value={stats.in_progress}
                icon={Eye}
                tone="violet"
                footnote="Repartido entre etapas"
              />
              <StatCard
                label="Carga del equipo"
                value={`${Math.min(teamLoad, 999)}%`}
                icon={Users}
                tone="emerald"
                progress={Math.min(teamLoad, 100)}
                footnote={`${stats.members} personas en el equipo`}
              />
            </div>
          </section>

          <Board initialVideos={liveVideos} initialChannelFilter={canal ?? null} />
        </div>

        {/* Rail derecho */}
        <aside className="scrollbar-slim hidden w-[272px] shrink-0 flex-col gap-4 xl:flex xl:overflow-y-auto xl:pb-4">
          <UpcomingCard items={upcoming} />
          <MiniCalendar publishDates={publishDates} weekPublications={weekPublications} />
          <ActivityFeed initial={activity} limit={5} />
        </aside>
      </div>
    </div>
  );
}
