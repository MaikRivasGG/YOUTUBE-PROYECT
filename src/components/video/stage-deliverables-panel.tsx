"use client";

import { Check, ExternalLink, Pencil, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { deleteStageLink, saveStageLink } from "@/lib/api/board";
import { relative } from "@/lib/dates";
import { isSafeHttpUrl } from "@/lib/utils";

export interface StageLinkRow {
  stage_id: string;
  url: string;
  completed_by: string | null;
  completed_at: string;
}

/**
 * El checklist "de verdad" de la tarjeta: una fila por cada etapa del
 * pipeline que pide un entregable, en el orden en que se pasan.
 *
 * No es una plantilla aparte -son las propias etapas del pipeline del canal-,
 * asi que editar el pipeline en Ajustes es editar este checklist. Guardar el
 * enlace es lo que satisface el requisito de la etapa para poder avanzar la
 * tarjeta (public.stage_exit_blockers en la base aplica la misma regla).
 */
export function StageDeliverablesPanel({
  videoId,
  pipelineId,
  currentStageId,
  initial,
}: {
  videoId: string;
  pipelineId: string;
  currentStageId: string;
  initial: StageLinkRow[];
}) {
  const { can, allStagesOf, memberById } = useWorkspace();
  const [links, setLinks] = React.useState<Map<string, StageLinkRow>>(
    () => new Map(initial.map((link) => [link.stage_id, link])),
  );
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState<string | null>(null);

  const editable = can("video.edit");
  const stages = allStagesOf(pipelineId).filter(
    (stage) => stage.deliverable_label && stage.kind !== "archived",
  );

  if (stages.length === 0) return null;

  function startEdit(stageId: string, current?: StageLinkRow) {
    setEditing(stageId);
    setDraft(current?.url ?? "");
  }

  async function save(stageId: string) {
    const url = draft.trim();
    if (!isSafeHttpUrl(url)) {
      toast.error("El enlace debe empezar por http:// o https://");
      return;
    }

    setSaving(stageId);
    try {
      const saved = await saveStageLink(videoId, stageId, url);
      setLinks((current) => {
        const next = new Map(current);
        next.set(stageId, saved as StageLinkRow);
        return next;
      });
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No hemos podido guardar el enlace");
    } finally {
      setSaving(null);
    }
  }

  async function remove(stageId: string) {
    setSaving(stageId);
    try {
      await deleteStageLink(videoId, stageId);
      setLinks((current) => {
        const next = new Map(current);
        next.delete(stageId);
        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No hemos podido quitar el enlace");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section>
      <h2 className="text-ink-900 mb-1 text-[14px] font-semibold">Checklist de producción</h2>
      <p className="text-ink-400 mb-3 text-[12px]">
        Cada etapa del pipeline con su enlace. Guardarlo es lo que deja avanzar la tarjeta.
      </p>

      <ul className="divide-line divide-y">
        {stages.map((stage) => {
          const link = links.get(stage.id);
          const completer = link?.completed_by ? memberById(link.completed_by) : undefined;
          const isCurrent = stage.id === currentStageId;
          const isEditing = editing === stage.id;

          return (
            <li key={stage.id} className="py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color }}
                  aria-hidden
                />
                <span className="text-ink-900 text-[13px] font-medium">{stage.name}</span>
                <span className="text-ink-400 text-[11.5px]">· {stage.deliverable_label}</span>
                {isCurrent ? (
                  <span className="bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                    etapa actual
                  </span>
                ) : null}
                {link ? <Check className="ml-auto size-3.5 text-emerald-600" aria-hidden /> : null}
              </div>

              {isEditing ? (
                <div className="mt-1.5 flex items-center gap-1.5 pl-4">
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") save(stage.id);
                      if (event.key === "Escape") setEditing(null);
                    }}
                    placeholder={`https://... (${stage.deliverable_label})`}
                    className="h-8 flex-1 text-[12.5px]"
                  />
                  <Button
                    size="sm"
                    loading={saving === stage.id}
                    onClick={() => save(stage.id)}
                    disabled={!draft.trim()}
                  >
                    Guardar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : link ? (
                <div className="mt-1 flex items-center gap-2 pl-4">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 flex min-w-0 items-center gap-1 truncate text-[12.5px] hover:underline"
                  >
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{link.url}</span>
                  </a>
                  <span className="text-ink-400 shrink-0 text-[11px]">
                    {completer ? `${completer.full_name.split(" ")[0]} · ` : ""}
                    {relative(link.completed_at)}
                  </span>
                  {editable ? (
                    <div className="ml-auto flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label="Editar enlace"
                        onClick={() => startEdit(stage.id, link)}
                        className="text-ink-400 hover:text-ink-900 rounded-md p-1 transition"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Quitar enlace"
                        disabled={saving === stage.id}
                        onClick={() => remove(stage.id)}
                        className="text-ink-400 rounded-md p-1 transition hover:text-red-600"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : editable ? (
                <button
                  type="button"
                  onClick={() => startEdit(stage.id)}
                  className="text-ink-400 hover:text-brand-700 mt-1 pl-4 text-[12.5px] transition hover:underline"
                >
                  Pegar el enlace...
                </button>
              ) : (
                <p className="text-ink-400 mt-1 pl-4 text-[12px]">Todavía sin enlace</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
