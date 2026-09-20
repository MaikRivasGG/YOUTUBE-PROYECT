import type { Metadata } from "next";
import { CalendarCheck, Gauge, Hourglass, Timer, TrendingUp } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Dot } from "@/components/ui/badge";
import { Card, EmptyState, Progress } from "@/components/ui/misc";
import {
  averageCycleDays,
  byChannel,
  formatDuration,
  onTimeRate,
  publicationsByMonth,
  stageBottlenecks,
  stageKindMap,
  workloadByMember,
} from "@/lib/analytics";
import { requireWorkspace } from "@/lib/session";
import {
  getAnalyticsVideos,
  getChannels,
  getStageDurations,
  getWorkspaceConfig,
  getWorkspaceStats,
  getNotifications,
} from "@/server/queries";

export const metadata: Metadata = { title: "Analíticas" };

export default async function AnalyticsPage() {
  const { workspace, userId } = await requireWorkspace();

  const [videos, channels, config, stats, notifications, durations] = await Promise.all([
    getAnalyticsVideos(workspace.id),
    getChannels(workspace.id, true),
    getWorkspaceConfig(workspace.id, userId),
    getWorkspaceStats(workspace.id),
    getNotifications(workspace.id),
    getStageDurations(workspace.id),
  ]);

  const members = config.members;
  const kinds = stageKindMap(config.stages);

  const monthly = publicationsByMonth(videos);
  const maxMonthly = Math.max(1, ...monthly.map((point) => point.published));
  const cycle = averageCycleDays(videos);
  const onTime = onTimeRate(videos);
  const workload = workloadByMember(videos, kinds);
  const perChannel = byChannel(videos, kinds);
  const maxLoad = Math.max(1, ...workload.values());

  const totalPublished = videos.filter((video) => video.published_at !== null).length;
  const bottlenecks = stageBottlenecks(durations, config.stages);
  const slowest = bottlenecks[0];
  const maxStageHours = Math.max(1, ...bottlenecks.map((entry) => entry.hours));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        notifications={notifications}
        title="Analíticas"
        subtitle="Ritmo de producción, cumplimiento y carga del equipo"
      />

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-7">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Publicados en total"
            value={totalPublished}
            icon={TrendingUp}
            tone="emerald"
            footnote={`${stats.published_this_month} este mes`}
          />
          <StatCard
            label="Tiempo medio de ciclo"
            value={cycle === null ? "-" : `${cycle} d`}
            icon={Timer}
            tone="violet"
            footnote="De la idea a la publicación"
          />
          <StatCard
            label="Entregas a tiempo"
            value={onTime === null ? "-" : `${onTime}%`}
            icon={CalendarCheck}
            tone={onTime !== null && onTime < 70 ? "amber" : "emerald"}
            footnote="Publicados dentro de su fecha limite"
          />
          <StatCard
            label="En producción ahora"
            value={stats.in_progress}
            icon={Gauge}
            tone="brand"
            footnote={`${stats.overdue} fuera de plazo`}
            footnoteTone={stats.overdue > 0 ? "danger" : "muted"}
          />
        </div>

        <div className="mt-3">
          <StatCard
            label="Etapa más lenta"
            value={slowest ? slowest.name : "-"}
            icon={Hourglass}
            tone="amber"
            footnote={
              slowest
                ? `${formatDuration(slowest.hours)} de media por tarjeta`
                : "Todavía no hay suficientes movimientos medidos"
            }
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card className="p-4">
            <h2 className="text-ink-900 mb-4 text-[15px] font-semibold">
              Publicaciones por mes
              <span className="text-ink-400 ml-2 text-[12px] font-normal">últimos 6 meses</span>
            </h2>

            <div className="flex h-44 items-end gap-3">
              {monthly.map((point) => (
                <div key={point.key} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-ink-600 text-[12px] font-semibold">{point.published}</span>
                  <div
                    className="bg-brand-500 w-full rounded-t-md transition-all"
                    style={{
                      height: `${Math.max(4, (point.published / maxMonthly) * 120)}px`,
                      opacity: point.published === 0 ? 0.25 : 1,
                    }}
                    role="img"
                    aria-label={`${point.published} publicaciones en ${point.label}`}
                  />
                  <span className="text-ink-400 text-[11px] capitalize">{point.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-ink-900 mb-4 text-[15px] font-semibold">Carga por persona</h2>

            {workload.size === 0 ? (
              <EmptyState
                title="Nadie tiene tarjetas asignadas"
                description="Asigna responsables desde la ficha de cada video."
                className="border-0"
              />
            ) : (
              <ul className="space-y-3">
                {members
                  .map((member) => ({ member, load: workload.get(member.user_id) ?? 0 }))
                  .sort((a, b) => b.load - a.load)
                  .map(({ member, load }) => (
                    <li key={member.user_id} className="flex items-center gap-3">
                      <Avatar
                        id={member.profile.id}
                        name={member.profile.full_name}
                        url={member.profile.avatar_url}
                        size="sm"
                      />
                      <span className="text-ink-700 w-28 shrink-0 truncate text-[12.5px]">
                        {member.profile.full_name}
                      </span>
                      <Progress value={(load / maxLoad) * 100} className="flex-1" />
                      <span className="text-ink-500 w-5 text-right text-[12px] font-medium">
                        {load}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="mt-4 p-4">
          <h2 className="text-ink-900 text-[15px] font-semibold">
            Dónde se atasca la producción
            <span className="text-ink-400 ml-2 text-[12px] font-normal">últimos 90 días</span>
          </h2>
          <p className="text-ink-500 mt-0.5 mb-4 text-[12.5px]">
            Tiempo medio que pasa una tarjeta en cada etapa, contado desde que entra hasta que sale.
            Las etapas de cierre no cuentan.
          </p>

          {bottlenecks.length === 0 ? (
            <EmptyState
              title="Todavía no hay suficientes datos"
              description="En cuanto las tarjetas empiecen a moverse entre etapas, aquí aparece el tiempo medio de cada una."
              className="border-0"
            />
          ) : (
            <ul className="space-y-3">
              {bottlenecks.map((entry) => (
                <li key={entry.stageId} className="flex items-center gap-3">
                  <span className="text-ink-700 w-28 shrink-0 truncate text-[12.5px]">
                    {entry.name}
                  </span>
                  <Progress
                    value={(entry.hours / maxStageHours) * 100}
                    color={entry.color}
                    className="flex-1"
                  />
                  <span className="text-ink-900 w-16 shrink-0 text-right text-[12px] font-medium">
                    {formatDuration(entry.hours)}
                  </span>
                  <span className="text-ink-400 w-20 shrink-0 text-right text-[11px]">
                    {entry.samples} paso{entry.samples === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-4 p-4">
          <h2 className="text-ink-900 mb-4 text-[15px] font-semibold">Rendimiento por canal</h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="text-ink-400 text-[11.5px] tracking-wide uppercase">
                  <th className="pb-2 font-semibold">Canal</th>
                  <th className="pb-2 font-semibold">En producción</th>
                  <th className="pb-2 font-semibold">Publicados</th>
                  <th className="pb-2 font-semibold">Objetivo semanal</th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {channels.map((channel) => {
                  const entry = perChannel.get(channel.id) ?? { active: 0, published: 0 };
                  return (
                    <tr key={channel.id}>
                      <td className="py-2.5">
                        <span className="text-ink-900 flex items-center gap-2 text-[13px]">
                          <Dot color={channel.color} />
                          {channel.name}
                        </span>
                      </td>
                      <td className="text-ink-700 py-2.5 text-[13px]">{entry.active}</td>
                      <td className="text-ink-700 py-2.5 text-[13px]">{entry.published}</td>
                      <td className="text-ink-500 py-2.5 text-[13px]">
                        {channel.target_per_week} / semana
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
