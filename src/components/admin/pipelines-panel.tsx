"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { STAGE_KINDS } from "@/lib/domain/pipeline";
import {
  createPipelineAction,
  createStageAction,
  deletePipelineAction,
  deleteStageAction,
  moveStageAction,
  updatePipelineAction,
  updateStageAction,
} from "@/server/actions/pipelines";
import type { Pipeline, Stage } from "@/types/database";

const STAGE_COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#d946ef",
  "#8b5cf6",
  "#22c55e",
  "#0d9488",
];

export function PipelinesPanel() {
  const { pipelines, allStagesOf, can } = useWorkspace();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Pipeline | null>(null);
  const [stageOf, setStageOf] = React.useState<{ pipeline: Pipeline; stage: Stage | null } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  if (!can("pipeline.manage")) return null;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink-900 text-[15px] font-semibold">Pipelines</h2>
          <p className="text-ink-500 mt-0.5 text-[12.5px]">
            Cada flujo tiene sus propias etapas. Un canal o un video usa el que le corresponda.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" aria-hidden />
          Nuevo pipeline
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {pipelines.map((pipeline) => {
          const stages = allStagesOf(pipeline.id);

          return (
            <div key={pipeline.id} className="ring-line rounded-xl ring-1">
              <header className="border-line flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
                <h3 className="text-ink-900 text-[13.5px] font-semibold">{pipeline.name}</h3>
                {pipeline.is_default ? (
                  <span className="bg-brand-50 text-brand-700 rounded-full px-2 py-0.5 text-[10.5px] font-medium">
                    Por defecto
                  </span>
                ) : null}
                <span className="text-ink-400 text-[11.5px]">{stages.length} etapas</span>

                <span className="flex-1" />

                <button
                  type="button"
                  onClick={() => setEditing(pipeline)}
                  aria-label={`Editar ${pipeline.name}`}
                  className="text-ink-400 hover:bg-canvas hover:text-ink-900 rounded-lg p-1.5 transition"
                >
                  <Pencil className="size-3.5" />
                </button>

                {!pipeline.is_default ? (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Eliminar ${pipeline.name}`}
                    className="text-ink-400 rounded-lg p-1.5 transition hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      if (!window.confirm(`Eliminar el pipeline ${pipeline.name}?`)) return;
                      startTransition(async () => {
                        const result = await deletePipelineAction(pipeline.id);
                        if (!result.ok) toast.error(result.error);
                        else toast.success("Pipeline eliminado");
                      });
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </header>

              <ul className="divide-line divide-y">
                {stages.map((stage, index) => (
                  <li key={stage.id} className="flex items-center gap-2.5 px-3 py-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-900 block truncate text-[13px]">{stage.name}</span>
                      <span className="text-ink-400 text-[11px]">
                        {STAGE_KINDS.find((kind) => kind.value === stage.kind)?.label}
                      </span>
                    </span>

                    <button
                      type="button"
                      disabled={index === 0 || pending}
                      aria-label="Subir etapa"
                      className="text-ink-400 hover:text-ink-900 rounded-md p-1 transition disabled:opacity-30"
                      onClick={() =>
                        startTransition(async () => {
                          const result = await moveStageAction(stage.id, "up");
                          if (!result.ok) toast.error(result.error);
                        })
                      }
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === stages.length - 1 || pending}
                      aria-label="Bajar etapa"
                      className="text-ink-400 hover:text-ink-900 rounded-md p-1 transition disabled:opacity-30"
                      onClick={() =>
                        startTransition(async () => {
                          const result = await moveStageAction(stage.id, "down");
                          if (!result.ok) toast.error(result.error);
                        })
                      }
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Editar ${stage.name}`}
                      className="text-ink-400 hover:text-ink-900 rounded-md p-1 transition"
                      onClick={() => setStageOf({ pipeline, stage })}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`Eliminar ${stage.name}`}
                      className="text-ink-400 rounded-md p-1 transition hover:text-red-600"
                      onClick={() => {
                        if (!window.confirm(`Eliminar la etapa ${stage.name}?`)) return;
                        startTransition(async () => {
                          const result = await deleteStageAction(stage.id);
                          if (!result.ok) toast.error(result.error);
                          else toast.success("Etapa eliminada");
                        });
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => setStageOf({ pipeline, stage: null })}
                  className="text-ink-500 hover:text-brand-600 inline-flex items-center gap-1.5 text-[12.5px] transition"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Anadir etapa
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <PipelineDialog open={creating} onOpenChange={setCreating} />
      <PipelineDialog
        key={editing?.id ?? "edit-pipeline"}
        open={Boolean(editing)}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        pipeline={editing}
      />
      <StageDialog
        key={`${stageOf?.pipeline.id ?? "none"}-${stageOf?.stage?.id ?? "new"}`}
        open={Boolean(stageOf)}
        onOpenChange={(open) => (open ? null : setStageOf(null))}
        pipeline={stageOf?.pipeline ?? null}
        stage={stageOf?.stage ?? null}
      />
    </Card>
  );
}

function PipelineDialog({
  open,
  onOpenChange,
  pipeline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline?: Pipeline | null;
}) {
  const action = pipeline ? updatePipelineAction : createPipelineAction;
  const [state, formAction, pending] = useActionState(action, null);

  React.useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={pipeline ? `Editar ${pipeline.name}` : "Nuevo pipeline"}
      description="Un flujo nuevo arranca con tres etapas basicas que luego puedes ajustar."
    >
      <form action={formAction} className="space-y-4" noValidate>
        {pipeline ? <input type="hidden" name="id" value={pipeline.id} /> : null}

        {state && !state.ok ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}

        <Field label="Nombre" htmlFor="pipeline-name">
          <Input
            id="pipeline-name"
            name="name"
            defaultValue={pipeline?.name}
            required
            placeholder="Shorts"
          />
        </Field>

        <Field label="Descripcion" htmlFor="pipeline-description">
          <Textarea
            id="pipeline-description"
            name="description"
            rows={2}
            className="min-h-16"
            defaultValue={pipeline?.description ?? ""}
            placeholder="Videos verticales de menos de un minuto"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {pipeline ? "Guardar" : "Crear pipeline"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function StageDialog({
  open,
  onOpenChange,
  pipeline,
  stage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline | null;
  stage: Stage | null;
}) {
  const action = stage ? updateStageAction : createStageAction;
  const [state, formAction, pending] = useActionState(action, null);
  const [color, setColor] = React.useState(stage?.color ?? STAGE_COLORS[1]);

  React.useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={stage ? `Editar ${stage.name}` : "Nueva etapa"}
      description="El nombre lo eliges tu; el tipo le dice al sistema como tratarla."
    >
      <form action={formAction} className="space-y-4" noValidate>
        {stage ? <input type="hidden" name="id" value={stage.id} /> : null}
        {pipeline ? <input type="hidden" name="pipeline_id" value={pipeline.id} /> : null}
        <input type="hidden" name="color" value={color} />

        {state && !state.ok ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}

        <Field label="Nombre" htmlFor="stage-name">
          <Input
            id="stage-name"
            name="name"
            defaultValue={stage?.name}
            required
            placeholder="Guion"
          />
        </Field>

        <Field
          label="Tipo"
          htmlFor="stage-kind"
          hint="Publicado sella la fecha de publicacion. Archivado saca la tarjeta del tablero."
        >
          <Select id="stage-kind" name="kind" defaultValue={stage?.kind ?? "work"}>
            {STAGE_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label} — {kind.description}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {STAGE_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setColor(value)}
                aria-label={`Color ${value}`}
                aria-pressed={color === value}
                className="size-7 rounded-full transition"
                style={{
                  backgroundColor: value,
                  boxShadow: color === value ? `0 0 0 2px #fff, 0 0 0 4px ${value}` : undefined,
                }}
              />
            ))}
          </div>
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {stage ? "Guardar" : "Crear etapa"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
