"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createVideo, nextPositionFor } from "@/lib/api/board";
import { PIPELINE, PRIORITIES } from "@/lib/domain/pipeline";
import { createVideoSchema } from "@/lib/domain/validators";
import { errorMessage } from "@/lib/utils";
import type { VideoStatus } from "@/types/database";

export function CreateVideoDialog({
  open,
  onOpenChange,
  defaultStatus = "idea",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatus?: VideoStatus;
  onCreated?: (id: string) => void;
}) {
  const { workspaceId, channels } = useWorkspace();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const parsed = createVideoSchema.safeParse({
      title: form.get("title"),
      channel_id: form.get("channel_id") || null,
      status: form.get("status"),
      priority: form.get("priority"),
      hook: form.get("hook"),
      due_date: form.get("due_date") || null,
    });

    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        map[issue.path.join(".")] = issue.message;
      }
      setErrors(map);
      return;
    }

    setErrors({});
    setPending(true);

    try {
      const position = await nextPositionFor(workspaceId, parsed.data.status);
      const video = await createVideo({
        workspace_id: workspaceId,
        title: parsed.data.title,
        status: parsed.data.status,
        position,
        channel_id: parsed.data.channel_id ?? null,
        priority: parsed.data.priority,
        hook: parsed.data.hook ?? null,
        due_date: parsed.data.due_date ?? null,
      });

      toast.success(`${video.ref} creado`);
      onOpenChange(false);
      onCreated?.(video.id);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "No hemos podido crear el video"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Crear tarea o video"
      description="Entra directo al pipeline, en la etapa que elijas."
    >
      <form id="create-video" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Título de trabajo" htmlFor="title" error={errors.title}>
          <Input
            id="title"
            name="title"
            placeholder="Por qué fallan las baterías"
            required
            maxLength={160}
          />
        </Field>

        <Field label="Hook" htmlFor="hook" hint="La primera frase que retiene al espectador.">
          <Textarea
            id="hook"
            name="hook"
            rows={2}
            className="min-h-16"
            placeholder="El 80% de las baterías mueren por una sola razón"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Canal" htmlFor="channel_id">
            <Select id="channel_id" name="channel_id" defaultValue="">
              <option value="">Sin canal</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Etapa" htmlFor="status">
            <Select id="status" name="status" defaultValue={defaultStatus}>
              {PIPELINE.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prioridad" htmlFor="priority">
            <Select id="priority" name="priority" defaultValue="normal">
              {PRIORITIES.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Fecha limite" htmlFor="due_date" error={errors.due_date}>
            <Input id="due_date" name="due_date" type="date" />
          </Field>
        </div>
      </form>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" form="create-video" loading={pending}>
          Crear
        </Button>
      </div>
    </Dialog>
  );
}
