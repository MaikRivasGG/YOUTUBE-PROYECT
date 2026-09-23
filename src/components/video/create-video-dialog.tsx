"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { createVideo, nextPositionFor } from "@/lib/api/board";
import { PRIORITIES } from "@/lib/domain/pipeline";
import { createVideoSchema } from "@/lib/domain/validators";
import { errorMessage } from "@/lib/utils";
import { extractYouTubeId, youtubeThumbnailUrl } from "@/lib/youtube";

export function CreateVideoDialog({
  open,
  onOpenChange,
  defaultPipelineId,
  defaultStageId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPipelineId?: string;
  defaultStageId?: string;
  onCreated?: (id: string) => void;
}) {
  const { workspaceId, channels, pipelines, defaultPipeline, stagesOf } = useWorkspace();
  const router = useRouter();

  const [pipelineId, setPipelineId] = React.useState(
    () => defaultPipelineId ?? defaultPipeline?.id ?? pipelines[0]?.id ?? "",
  );
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [referenceUrl, setReferenceUrl] = React.useState("");

  const stages = stagesOf(pipelineId);
  const referenceId = extractYouTubeId(referenceUrl);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const parsed = createVideoSchema.safeParse({
      title: form.get("title"),
      channel_id: form.get("channel_id") || null,
      pipeline_id: pipelineId,
      stage_id: form.get("stage_id"),
      priority: form.get("priority"),
      reference_url: referenceUrl,
      due_date: form.get("due_date") || null,
    });

    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[issue.path.join(".")] = issue.message;
      setErrors(map);
      return;
    }

    setErrors({});
    setPending(true);

    try {
      const position = await nextPositionFor(workspaceId, parsed.data.stage_id);
      const video = await createVideo({
        workspace_id: workspaceId,
        pipeline_id: parsed.data.pipeline_id,
        stage_id: parsed.data.stage_id,
        title: parsed.data.title,
        position,
        channel_id: parsed.data.channel_id ?? null,
        priority: parsed.data.priority,
        reference_url: parsed.data.reference_url ?? null,
        due_date: parsed.data.due_date ?? null,
      });

      toast.success(`${video.ref} creado`);
      setReferenceUrl("");
      onOpenChange(false);
      onCreated?.(video.id);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "No hemos podido crear el video"));
    } finally {
      setPending(false);
    }
  }

  /** Al elegir canal se adopta su pipeline, que es el que le corresponde. */
  function handleChannelChange(channelId: string) {
    const channel = channels.find((item) => item.id === channelId);
    if (channel?.pipeline_id) setPipelineId(channel.pipeline_id);
  }

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Crear tarea o video"
      description="Entra directo al pipeline, en la etapa que elijas."
    >
      <form id="create-video" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Titulo de trabajo" htmlFor="title" error={errors.title}>
          <Input
            id="title"
            name="title"
            placeholder="Por que fallan las baterias"
            required
            maxLength={160}
          />
        </Field>

        <Field
          label="Miniatura de referencia"
          htmlFor="reference_url"
          hint="Pega el link de un video de YouTube que sirva de referencia visual."
          error={errors.reference_url}
        >
          <div className="flex gap-3">
            {referenceId ? (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura publica de YouTube
              <img
                src={youtubeThumbnailUrl(referenceId)}
                alt=""
                className="bg-column h-14 w-24 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="bg-column text-ink-400 grid h-14 w-24 shrink-0 place-items-center rounded-md text-[10px]">
                Sin link
              </div>
            )}
            <Input
              id="reference_url"
              value={referenceUrl}
              onChange={(event) => setReferenceUrl(event.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1"
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Canal" htmlFor="channel_id">
            <Select
              id="channel_id"
              name="channel_id"
              defaultValue=""
              onChange={(event) => handleChannelChange(event.target.value)}
            >
              <option value="">Sin canal</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Etapa" htmlFor="stage_id" error={errors.stage_id}>
            <Select
              id="stage_id"
              name="stage_id"
              key={pipelineId}
              defaultValue={defaultStageId ?? stages[0]?.id}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
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
