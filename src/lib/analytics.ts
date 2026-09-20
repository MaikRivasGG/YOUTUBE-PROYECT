import type { AnalyticsVideo } from "@/server/queries";
import type { Stage, StageKind } from "@/types/database";

export interface MonthlyPoint {
  key: string;
  label: string;
  published: number;
}

/** Indice etapa -> tipo, para saber que cuenta como cerrado o publicado. */
export function stageKindMap(stages: Stage[]): Map<string, StageKind> {
  return new Map(stages.map((stage) => [stage.id, stage.kind]));
}

/** Publicaciones por mes en los ultimos `months` meses, incluido el actual. */
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
 * Tiempo medio de ciclo en dias: de la creacion de la tarjeta a su publicacion.
 * Devuelve null si todavia no hay ningun video publicado.
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

const CLOSED: StageKind[] = ["done", "archived"];

/** Cuantas tarjetas vivas tiene cada persona asignada. */
export function workloadByMember(
  videos: AnalyticsVideo[],
  kinds: Map<string, StageKind>,
): Map<string, number> {
  const load = new Map<string, number>();

  for (const video of videos) {
    const kind = kinds.get(video.stage_id);
    if (kind && CLOSED.includes(kind)) continue;
    for (const assignee of video.video_assignees) {
      load.set(assignee.user_id, (load.get(assignee.user_id) ?? 0) + 1);
    }
  }

  return load;
}

/** Reparto de videos por canal, separando los vivos de los publicados. */
export function byChannel(
  videos: AnalyticsVideo[],
  kinds: Map<string, StageKind>,
): Map<string, { active: number; published: number }> {
  const result = new Map<string, { active: number; published: number }>();

  for (const video of videos) {
    const key = video.channel_id ?? "sin-canal";
    const kind = kinds.get(video.stage_id);
    const entry = result.get(key) ?? { active: 0, published: 0 };

    if (kind === "done") entry.published += 1;
    else if (kind !== "archived") entry.active += 1;

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

export interface StageBottleneck {
  stageId: string;
  name: string;
  color: string;
  /** Tiempo medio que pasa una tarjeta en la etapa, en horas. */
  hours: number;
  /** Cuantos pasos por la etapa sostienen la media. */
  samples: number;
}

/** Formatea horas como "3 h" o "2,5 d", que es como lo lee una persona. */
export function formatDuration(hours: number): string {
  if (hours < 1) return "menos de 1 h";
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = hours / 24;
  return `${days.toFixed(1).replace(".", ",")} d`;
}

/**
 * Cuello de botella: donde se queda parada la produccion.
 *
 * Cruza los tiempos medidos en la base con las etapas del pipeline para poder
 * pintarlas con su nombre y su color, y las ordena de mas lenta a mas rapida.
 * Se descartan las etapas terminales: que una tarjeta lleve un mes en
 * "Publicado" no es un atasco.
 */
export function stageBottlenecks(
  durations: { stage_id: string; avg_hours: number; samples: number }[],
  stages: Stage[],
): StageBottleneck[] {
  const index = new Map(stages.map((stage) => [stage.id, stage]));

  return durations
    .flatMap((row) => {
      const stage = index.get(row.stage_id);
      if (!stage || CLOSED.includes(stage.kind)) return [];
      return [
        {
          stageId: stage.id,
          name: stage.name,
          color: stage.color,
          hours: Number(row.avg_hours) || 0,
          samples: Number(row.samples) || 0,
        },
      ];
    })
    .sort((a, b) => b.hours - a.hours);
}
