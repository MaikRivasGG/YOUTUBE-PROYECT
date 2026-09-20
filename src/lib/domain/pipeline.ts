import type { RequirableField, Stage, StageKind, VideoPriority } from "@/types/database";

/**
 * Que significa cada tipo de etapa para el sistema. El nombre de la columna lo
 * pone el equipo; el tipo decide como se comporta.
 */
export const STAGE_KINDS: { value: StageKind; label: string; description: string }[] = [
  { value: "backlog", label: "Ideas", description: "Pendiente de empezar." },
  { value: "work", label: "En curso", description: "Trabajo de produccion." },
  { value: "review", label: "Revision", description: "Control de calidad." },
  { value: "scheduled", label: "Programado", description: "Listo y con fecha." },
  { value: "done", label: "Publicado", description: "Sella la fecha de publicacion." },
  { value: "archived", label: "Archivado", description: "Fuera del tablero." },
];

const STAGE_KIND_LABEL = new Map(STAGE_KINDS.map((kind) => [kind.value, kind.label]));

export function stageKindLabel(kind: StageKind): string {
  return STAGE_KIND_LABEL.get(kind) ?? kind;
}

export function sortStages(stages: Stage[]): Stage[] {
  return [...stages].sort((a, b) => a.position - b.position);
}

/** Columnas visibles del tablero: todo menos lo archivado. */
export function boardStages(stages: Stage[]): Stage[] {
  return sortStages(stages.filter((stage) => stage.kind !== "archived"));
}

export function archivedStage(stages: Stage[]): Stage | undefined {
  return stages.find((stage) => stage.kind === "archived");
}

export function stagesOfPipeline(stages: Stage[], pipelineId: string): Stage[] {
  return sortStages(stages.filter((stage) => stage.pipeline_id === pipelineId));
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

/** Color de fondo suave a partir del color de una etapa o canal. */
export function tint(color: string, alpha = "1a"): string {
  return `${color}${alpha}`;
}

/**
 * Campos que una etapa puede exigir antes de dejar avanzar una tarjeta.
 *
 * Espejo de la lista cerrada del CHECK `stages_required_fields_known` y del
 * CASE de `public.stage_exit_blockers()`. Si aqui aparece uno que alla no
 * existe, la base lo rechaza al guardar.
 */
export const REQUIRABLE_FIELD_LABELS: { value: RequirableField; label: string }[] = [
  { value: "script_body", label: "Guion" },
  { value: "hook", label: "Hook" },
  { value: "description", label: "Descripcion" },
  { value: "thumbnail_url", label: "Miniatura" },
  { value: "youtube_url", label: "Enlace de YouTube" },
  { value: "channel_id", label: "Canal" },
  { value: "due_date", label: "Fecha limite" },
  { value: "publish_at", label: "Fecha de publicacion" },
  { value: "assignee", label: "Alguien asignado" },
  { value: "asset", label: "Algun archivo" },
];

/** Resumen corto de los requisitos de una etapa, para listarla. */
export function stageRequirementsSummary(stage: Stage): string | null {
  const parts: string[] = [];

  if (stage.require_checklist) parts.push("checklist cerrado");

  for (const field of stage.required_fields ?? []) {
    const label = REQUIRABLE_FIELD_LABELS.find((item) => item.value === field)?.label;
    if (label) parts.push(label.toLowerCase());
  }

  return parts.length === 0 ? null : `Exige ${parts.join(", ")}`;
}
