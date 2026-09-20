import type { AnalyticsVideo } from "@/server/queries";
import type { VideoStatus } from "@/types/database";

export interface MonthlyPoint {
  key: string;
  label: string;
  published: number;
}

/** Publicaciones por mes en los últimos `months` meses, incluido el actual. */
export function publicationsByMonth(
  videos: AnalyticsVideo[],
  months = 6,
  now = new Date(),
): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  const formatter = new Intl.DateTimeFormat("es-ES", { month: "short" });

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    points.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: formatter.format(date),
      published: 0,
    });
  }

  const index = new Map(points.map((point) => [point.key, point]));

  for (const video of videos) {
    if (!video.published_at) continue;
    const date = new Date(video.published_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const point = index.get(key);
    if (point) point.published += 1;
  }

  return points;
}

/**
 * Tiempo medio de ciclo en días: de la creación de la tarjeta a su publicación.
 * Devuelve null si todavía no hay ningun video publicado.
 */
export function averageCycleDays(videos: AnalyticsVideo[]): number | null {
  const durations = videos
    .filter((video) => video.published_at)
    .map(
      (video) =>
        (new Date(video.published_at as string).getTime() - new Date(video.created_at).getTime()) /
        86_400_000,
    )
    .filter((days) => Number.isFinite(days) && days >= 0);

  if (durations.length === 0) return null;
  const total = durations.reduce((sum, days) => sum + days, 0);
  return Math.round((total / durations.length) * 10) / 10;
}

/** Cuantas tarjetas vivas tiene cada persona asignada. */
export function workloadByMember(videos: AnalyticsVideo[]): Map<string, number> {
  const load = new Map<string, number>();
  const closed: VideoStatus[] = ["published", "archived"];

  for (const video of videos) {
    if (closed.includes(video.status)) continue;
    for (const assignee of video.video_assignees) {
      load.set(assignee.user_id, (load.get(assignee.user_id) ?? 0) + 1);
    }
  }

  return load;
}

/** Reparto de videos por canal, separando los vivos de los publicados. */
export function byChannel(
  videos: AnalyticsVideo[],
): Map<string, { active: number; published: number }> {
  const result = new Map<string, { active: number; published: number }>();

  for (const video of videos) {
    const key = video.channel_id ?? "sin-canal";
    const entry = result.get(key) ?? { active: 0, published: 0 };
    if (video.status === "published") entry.published += 1;
    else if (video.status !== "archived") entry.active += 1;
    result.set(key, entry);
  }

  return result;
}

/** Porcentaje de videos publicados dentro de su fecha limite. */
export function onTimeRate(videos: AnalyticsVideo[]): number | null {
  const withDeadline = videos.filter((video) => video.published_at && video.due_date);
  if (withDeadline.length === 0) return null;

  const onTime = withDeadline.filter(
    (video) => (video.published_at as string).slice(0, 10) <= (video.due_date as string),
  ).length;

  return Math.round((onTime / withDeadline.length) * 100);
}
