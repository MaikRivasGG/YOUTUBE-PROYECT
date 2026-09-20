import type { VideoPriority, VideoStatus } from "@/types/database";

export interface StageMeta {
  id: VideoStatus;
  label: string;
  description: string;
  /** Color del punto de la cabecera de columna. */
  dot: string;
  /** Color de acento suave para la columna. */
  accent: string;
}

/** Columnas visibles del tablero, en orden de producción. */
export const PIPELINE: StageMeta[] = [
  {
    id: "idea",
    label: "Ideas",
    description: "Backlog de temas validados y pendientes de guion.",
    dot: "bg-slate-400",
    accent: "text-slate-500",
  },
  {
    id: "script",
    label: "Guion",
    description: "Escritura, hook y estructura del video.",
    dot: "bg-blue-500",
    accent: "text-blue-600",
  },
  {
    id: "voiceover",
    label: "Grabación",
    description: "Voz en off y captura de material.",
    dot: "bg-red-500",
    accent: "text-red-600",
  },
  {
    id: "editing",
    label: "Edición",
    description: "Montaje, subtitulos y musica.",
    dot: "bg-orange-500",
    accent: "text-orange-600",
  },
  {
    id: "thumbnail",
    label: "Miniatura",
    description: "Diseño de miniatura y título final.",
    dot: "bg-fuchsia-500",
    accent: "text-fuchsia-600",
  },
  {
    id: "review",
    label: "Revisión",
    description: "Control de calidad antes de publicar.",
    dot: "bg-violet-500",
    accent: "text-violet-600",
  },
  {
    id: "scheduled",
    label: "Programado",
    description: "Subido a YouTube y con fecha de publicación.",
    dot: "bg-emerald-500",
    accent: "text-emerald-600",
  },
  {
    id: "published",
    label: "Publicado",
    description: "En el aire.",
    dot: "bg-teal-600",
    accent: "text-teal-700",
  },
];

export const STAGE_IDS = PIPELINE.map((stage) => stage.id);

const STAGE_MAP = new Map(PIPELINE.map((stage) => [stage.id, stage]));

export const ARCHIVED_STAGE: StageMeta = {
  id: "archived",
  label: "Archivado",
  description: "Descartado o pausado.",
  dot: "bg-slate-300",
  accent: "text-slate-400",
};

export function stageMeta(status: VideoStatus): StageMeta {
  return STAGE_MAP.get(status) ?? ARCHIVED_STAGE;
}

export function isBoardStage(status: VideoStatus): boolean {
  return STAGE_MAP.has(status);
}

export interface PriorityMeta {
  value: VideoPriority;
  label: string;
  chip: string;
}

export const PRIORITIES: PriorityMeta[] = [
  { value: "low", label: "Baja", chip: "bg-slate-100 text-slate-500" },
  { value: "normal", label: "Media", chip: "bg-slate-100 text-slate-600" },
  { value: "high", label: "Alta", chip: "bg-amber-100 text-amber-700" },
  { value: "urgent", label: "Urgente", chip: "bg-red-100 text-red-600" },
];

const PRIORITY_MAP = new Map(PRIORITIES.map((priority) => [priority.value, priority]));

export function priorityMeta(value: VideoPriority): PriorityMeta {
  return PRIORITY_MAP.get(value) ?? PRIORITIES[1];
}

/** Separacion entre tarjetas consecutivas al crear posiciones nuevas. */
export const POSITION_STEP = 1000;

/**
 * Calcula la posicion de una tarjeta soltada entre `before` y `after`.
 *
 * Se usan huecos de 1000 y punto medio para reordenar sin reescribir toda la
 * columna: un movimiento = un UPDATE de una sola fila.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return POSITION_STEP;
  if (before === null) return (after as number) - POSITION_STEP;
  if (after === null) return before + POSITION_STEP;
  return (before + after) / 2;
}

/**
 * Posicion para insertar en `index` dentro de una columna ya ordenada.
 * `positions` debe venir ordenada de forma ascendente.
 */
export function positionForIndex(positions: number[], index: number): number {
  const before = index > 0 ? (positions[index - 1] ?? null) : null;
  const after = index < positions.length ? (positions[index] ?? null) : null;
  return positionBetween(before, after);
}

/**
 * Indica si dos posiciones consecutivas se han acercado tanto que conviene
 * renumerar la columna (los dobles pierden precision tras muchos reordenados).
 */
export function needsRebalance(a: number, b: number): boolean {
  return Math.abs(b - a) < 0.0001;
}
