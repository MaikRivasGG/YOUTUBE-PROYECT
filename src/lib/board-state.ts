import { positionForIndex } from "@/lib/domain/pipeline";
import type { BoardVideo } from "@/server/queries";

/** Filtros de la barra del tablero. */
export interface BoardFilters {
  channelId: string | null;
  assigneeId: string | null;
  due: "all" | "overdue" | "week" | "none";
  query: string;
}

/** Tarjetas de un pipeline concreto. */
export function videosOfPipeline(videos: BoardVideo[], pipelineId: string): BoardVideo[] {
  return videos.filter((video) => video.pipeline_id === pipelineId);
}

export const EMPTY_FILTERS: BoardFilters = {
  channelId: null,
  assigneeId: null,
  due: "all",
  query: "",
};

const byPosition = (a: BoardVideo, b: BoardVideo) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

/** Agrupa y ordena las tarjetas por columna. */
export function groupByStage(videos: BoardVideo[]): Map<string, BoardVideo[]> {
  const groups = new Map<string, BoardVideo[]>();
  for (const video of videos) {
    const list = groups.get(video.stage_id);
    if (list) list.push(video);
    else groups.set(video.stage_id, [video]);
  }
  for (const list of groups.values()) list.sort(byPosition);
  return groups;
}

/**
 * Agrupa por StageKind en vez de por etapa: lo que usa la Vista general para
 * mezclar tarjetas de pipelines distintos en las mismas columnas.
 */
export function groupByKind(
  videos: BoardVideo[],
  kindOf: (stageId: string) => string | undefined,
): Map<string, BoardVideo[]> {
  const groups = new Map<string, BoardVideo[]>();
  for (const video of videos) {
    const kind = kindOf(video.stage_id);
    if (!kind || kind === "archived") continue;
    const list = groups.get(kind);
    if (list) list.push(video);
    else groups.set(kind, [video]);
  }
  for (const list of groups.values()) list.sort(byPosition);
  return groups;
}

function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function matchesFilters(video: BoardVideo, filters: BoardFilters): boolean {
  if (filters.channelId && video.channel_id !== filters.channelId) return false;

  if (filters.assigneeId) {
    const assigned = video.video_assignees.some((a) => a.user_id === filters.assigneeId);
    if (!assigned) return false;
  }

  if (filters.due !== "all") {
    if (filters.due === "none" && video.due_date) return false;
    if (filters.due !== "none") {
      if (!video.due_date) return false;
      const days = daysUntil(video.due_date);
      if (filters.due === "overdue" && days >= 0) return false;
      if (filters.due === "week" && (days < 0 || days > 7)) return false;
    }
  }

  const query = filters.query.trim().toLowerCase();
  if (query) {
    const haystack = `${video.title} ${video.ref} ${video.hook ?? ""} ${video.tags.join(" ")}`;
    if (!haystack.toLowerCase().includes(query)) return false;
  }

  return true;
}

export function applyFilters(videos: BoardVideo[], filters: BoardFilters): BoardVideo[] {
  return videos.filter((video) => matchesFilters(video, filters));
}

/**
 * Calcula el resultado de soltar `videoId` en `toStage` a la altura `toIndex`.
 * Devuelve la nueva posicion y la lista ya reordenada para pintar al instante.
 */
export function computeMove(
  videos: BoardVideo[],
  videoId: string,
  toStageId: string,
  toIndex: number,
): { position: number; videos: BoardVideo[] } | null {
  const moving = videos.find((video) => video.id === videoId);
  if (!moving) return null;

  const target = videos
    .filter((video) => video.stage_id === toStageId && video.id !== videoId)
    .sort(byPosition);

  const index = Math.max(0, Math.min(toIndex, target.length));
  const position = positionForIndex(
    target.map((video) => video.position),
    index,
  );

  const next = videos.map((video) =>
    video.id === videoId ? { ...video, stage_id: toStageId, position } : video,
  );

  return { position, videos: next };
}

export type RealtimeEvent =
  { type: "INSERT" | "UPDATE"; video: BoardVideo } | { type: "DELETE"; id: string };

/**
 * Reconciliación de los eventos de Realtime con el estado local.
 *
 * Postgres solo envia las columnas de la tabla `videos`, así que al actualizar
 * se conservan las relaciones ya cargadas (asignados y checklist) salvo que el
 * evento las traiga.
 */
export function applyRealtimeEvent(videos: BoardVideo[], event: RealtimeEvent): BoardVideo[] {
  if (event.type === "DELETE") {
    return videos.filter((video) => video.id !== event.id);
  }

  const incoming = event.video;
  const existing = videos.find((video) => video.id === incoming.id);

  if (!existing) {
    return [
      ...videos,
      {
        ...incoming,
        video_assignees: incoming.video_assignees ?? [],
        checklist_items: incoming.checklist_items ?? [],
      },
    ];
  }

  // Los eventos fuera de orden no deben pisar un estado más reciente.
  if (existing.updated_at > incoming.updated_at) return videos;

  return videos.map((video) =>
    video.id === incoming.id
      ? {
          ...incoming,
          video_assignees: incoming.video_assignees ?? existing.video_assignees,
          checklist_items: incoming.checklist_items ?? existing.checklist_items,
        }
      : video,
  );
}

/** Actualiza la lista de asignados de una tarjeta a partir de un evento. */
export function applyAssigneeEvent(
  videos: BoardVideo[],
  event: { type: "INSERT" | "DELETE"; videoId: string; userId: string },
): BoardVideo[] {
  return videos.map((video) => {
    if (video.id !== event.videoId) return video;
    const current = video.video_assignees.filter((a) => a.user_id !== event.userId);
    return {
      ...video,
      video_assignees: event.type === "INSERT" ? [...current, { user_id: event.userId }] : current,
    };
  });
}

/** Actualiza el progreso de checklist de una tarjeta a partir de un evento. */
export function applyChecklistEvent(
  videos: BoardVideo[],
  event: { type: "INSERT" | "UPDATE" | "DELETE"; videoId: string; id: string; isDone: boolean },
): BoardVideo[] {
  return videos.map((video) => {
    if (video.id !== event.videoId) return video;
    const others = video.checklist_items.filter((item) => item.id !== event.id);
    return {
      ...video,
      checklist_items:
        event.type === "DELETE" ? others : [...others, { id: event.id, is_done: event.isDone }],
    };
  });
}

export function progressOf(video: BoardVideo): number {
  const total = video.checklist_items.length;
  if (total === 0) return 0;
  const done = video.checklist_items.filter((item) => item.is_done).length;
  return Math.round((done / total) * 100);
}
