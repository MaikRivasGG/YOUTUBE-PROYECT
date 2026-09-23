import type { Metadata } from "next";
import { CalendarClock, CheckCircle2, PlayCircle, TimerReset } from "lucide-react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { MyWork } from "@/components/dashboard/my-work";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpcomingCard } from "@/components/dashboard/upcoming";
import { WorkspacePulse } from "@/components/dashboard/workspace-pulse";
import { PageHeader } from "@/components/layout/page-header";
import { requireWorkspace } from "@/lib/session";
import {
  getActivity,
  getBoardVideos,
  getMyWork,
  getNotifications,
  getUpcoming,
  getWorkspaceStats,
} from "@/server/queries";

export const metadata: Metadata = { title: "Resumen" };

export default async function SummaryPage() {
  const { workspace, userId, profile } = await requireWorkspace();

  const [stats, myWork, boardVideos, upcoming, activity, notifications] = await Promise.all([
    getWorkspaceStats(workspace.id),
    getMyWork(workspace.id, userId),
    getBoardVideos(workspace.id),
    getUpcoming(workspace.id, 5),
    getActivity(workspace.id, 10),
    getNotifications(workspace.id),
  ]);

  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={`Hola, ${firstName}`}
        subtitle={`Esto es lo que se mueve en ${workspace.name}`}
        notifications={notifications}
      />

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Videos activos"
            value={stats.total}
            icon={PlayCircle}
            tone="brand"
            footnote={`${stats.in_progress} en producción ahora`}
          />
          <StatCard
            label="Publicados este mes"
            value={stats.published_this_month}
            icon={CheckCircle2}
            tone="emerald"
            footnote="Objetivo del mes en marcha"
            footnoteTone="positive"
          />
          <StatCard
            label="Programados"
            value={stats.scheduled}
            icon={CalendarClock}
            tone="violet"
            footnote="Listos y con fecha"
          />
          <StatCard
            label="Fuera de plazo"
            value={stats.overdue}
            icon={TimerReset}
            tone={stats.overdue > 0 ? "red" : "emerald"}
            footnote={stats.overdue > 0 ? "Necesitan atención hoy" : "Ninguno, buen trabajo"}
            footnoteTone={stats.overdue > 0 ? "danger" : "positive"}
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-4">
            <MyWork videos={myWork} />
            <WorkspacePulse videos={boardVideos} />
          </div>

          <div className="flex flex-col gap-4">
            <UpcomingCard items={upcoming} />
            <ActivityFeed initial={activity} limit={8} />
          </div>
        </div>
      </div>
    </div>
  );
}
