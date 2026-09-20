"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { addTemplateItemAction, deleteTemplateItemAction } from "@/server/actions/templates";
import type { Channel, ChannelTemplateItem } from "@/types/database";

/**
 * Plantilla de produccion de un canal.
 *
 * El proceso de un canal faceless es el mismo en cada video, asi que se
 * describe una vez aqui y cada tarjeta nueva del canal nace con el checklist
 * puesto y repartido por rol. Lo copia un trigger de la base, no el cliente.
 */
export function TemplateDialog({
  open,
  onOpenChange,
  channel,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: Channel | null;
  items: ChannelTemplateItem[];
}) {
  const { roles, allStagesOf, defaultPipeline } = useWorkspace();
  const [state, formAction, pending] = useActionState(addTemplateItemAction, null);
  const [deleting, startTransition] = useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  const pipelineId = channel?.pipeline_id ?? defaultPipeline?.id ?? null;
  const stages = pipelineId ? allStagesOf(pipelineId).filter((s) => s.kind !== "archived") : [];

  React.useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (!channel) return null;

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Plantilla de ${channel.name}`}
      description="Los pasos que se crean solos en cada video nuevo de este canal."
      size="lg"
    >
      <div className="space-y-4">
        {items.length === 0 ? (
          <p className="bg-canvas text-ink-500 rounded-xl px-3 py-6 text-center text-[12.5px]">
            Este canal todavia no tiene plantilla. Anade los pasos que se repiten en cada video y
            las tarjetas nuevas nacerán con ellos.
          </p>
        ) : (
          <ol className="ring-line divide-line divide-y rounded-xl ring-1">
            {items.map((item, index) => {
              const stage = stages.find((s) => s.id === item.stage_id);
              const role = roles.find((r) => r.id === item.role_id);

              return (
                <li key={item.id} className="flex items-center gap-2.5 px-3 py-2">
                  <GripVertical className="text-ink-300 size-3.5 shrink-0" aria-hidden />
                  <span className="text-ink-400 w-4 shrink-0 text-[11.5px]">{index + 1}</span>

                  <span className="min-w-0 flex-1">
                    <span className="text-ink-900 block truncate text-[13px]">{item.title}</span>
                    <span className="text-ink-400 text-[11px]">
                      {stage ? stage.name : "sin etapa"} ·{" "}
                      {role ? `lo cierra ${role.name}` : "lo cierra cualquiera"}
                    </span>
                  </span>

                  <button
                    type="button"
                    disabled={deleting}
                    aria-label={`Quitar ${item.title}`}
                    className="text-ink-400 rounded-md p-1 transition hover:text-red-600"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteTemplateItemAction(item.id);
                        if (!result.ok) toast.error(result.error);
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <form ref={formRef} action={formAction} className="space-y-3" noValidate>
          <input type="hidden" name="channel_id" value={channel.id} />

          {state && !state.ok ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
              {state.error}
            </p>
          ) : null}

          <Field label="Paso nuevo" htmlFor="template-title">
            <Input
              id="template-title"
              name="title"
              required
              maxLength={200}
              placeholder="Escribir el guion"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Etapa" htmlFor="template-stage" hint="En que columna aparece el paso.">
              <Select id="template-stage" name="stage_id" defaultValue="">
                <option value="">Sin etapa</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Rol que lo cierra" htmlFor="template-role" hint="Vacio: cualquiera.">
              <Select id="template-role" name="role_id" defaultValue="">
                <option value="">Cualquiera</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button type="submit" loading={pending}>
              <Plus className="size-3.5" aria-hidden />
              Anadir paso
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
