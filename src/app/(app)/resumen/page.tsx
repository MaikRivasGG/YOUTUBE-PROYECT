import type { Metadata } from "next";
import { CalendarClock, CheckCircle2, PlayCircle, TimerReset } from "lucide-react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { InspireCard } from "@/components/dashboard/inspire-card";
import { MyWork } from "@/components/dashboard/my-work";
import { ProductivityCard } from "@/components/dashboard/productivity-card";
import { QuickActionsCard } from "@/components/dashboard/quick-actions";
import { QuoteCard } from "@/components/dashboard/quote-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpcomingCard } from "@/components/dashboard/upcoming";
import { WorkspacePulse } from "@/components/dashboard/workspace-pulse";
import { PageHeader } from "@/components/layout/page-header";
import { RoleBadge } from "@/components/layout/role-badge";
import { requireWorkspace } from "@/lib/session";
import {
  getActivity,
  getBoardVideos,
  getChannels,
  getMyWork,
  getNotifications,
  getUpcoming,
  getWeeklyProductivity,
  getWorkspaceStats,
} from "@/server/queries";

export const metadata: Metadata = { title: "Resumen" };

const WEEK_MS = 7 * 86_400_000;

export default async function SummaryPage() {
  const { workspace, userId, profile } = await requireWorkspace();

  const [stats, myWork, boardVideos, upcoming, activity, notifications, channels, productivity] =
    await Promise.all([
      getWorkspaceStats(workspace.id),
      getMyWork(workspace.id, userId),
      getBoardVideos(workspace.id),
      getUpcoming(workspace.id, 5),
      getActivity(workspace.id, 10),
      getNotifications(workspace.id),
      getChannels(workspace.id),
      getWeeklyProductivity(workspace.id),
    ]);

  const firstName = profile.full_name.split(" ")[0];

  const newThisWeek = boardVideos.filter(
    (video) => new Date(video.created_at).getTime() >= new Date().getTime() - WEEK_MS,
  ).length;

  const monthlyTarget = channels.reduce((sum, channel) => sum + channel.target_per_week * 4, 0);
  const publishProgress = monthlyTarget > 0 ? (stats.published_this_month / monthlyTarget) * 100 : 0;
  const scheduledProgress = stats.total > 0 ? (stats.scheduled / stats.total) * 100 : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={`Hola, ${firstName}`}
        titleBadge={<RoleBadge />}
        subtitle={`Esto es lo que se mueve en ${workspace.name}`}
        notifications={notifications}
      />

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Videos activos"
            value={stats.total}
            icon={PlayCircle}
            tone="brand"
            footnote={
              newThisWeek > 0 ? `↑ +${newThisWeek} esta semana` : `${stats.in_progress} en producción`
            }
            footnoteTone={newThisWeek > 0 ? "positive" : "muted"}
          />
          <StatCard
            label="Publicados este mes"
            value={stats.published_this_month}
            icon={CheckCircle2}
            tone="emerald"
            footnote={monthlyTarget > 0 ? `Objetivo: ${monthlyTarget}` : "Sin objetivo configurado"}
            footnoteTone="positive"
            progress={monthlyTarget > 0 ? publishProgress : undefined}
            href="/calendario"
          />
          <StatCard
            label="Programados"
            value={stats.scheduled}
            icon={CalendarClock}
            tone="violet"
            footnote="Listos y con fecha"
            progress={stats.total > 0 ? scheduledProgress : undefined}
            href="/produccion"
          />
          <StatCard
            label="Fuera de plazo"
            value={stats.overdue}
            icon={TimerReset}
            tone={stats.overdue > 0 ? "red" : "emerald"}
            footnote={stats.overdue > 0 ? "Revisar y publicar" : "Ninguno, buen trabajo"}
            footnoteTone={stats.overdue > 0 ? "danger" : "positive"}
          />
          <InspireCard />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1.05fr_0.85fr]">
          <div className="flex flex-col gap-4">
            <MyWork videos={myWork} />
            <WorkspacePulse videos={boardVideos} />
          </div>

          <div className="flex flex-col gap-4">
            <UpcomingCard items={upcoming} />
            <ActivityFeed initial={activity} limit={8} />
          </div>

          <div className="flex flex-col gap-4">
            <ProductivityCard completed={productivity.completed} total={productivity.total} />
            <QuoteCard />
            <QuickActionsCard />
          </div>
        </div>
      </div>
    </div>
  );
}
