"use client";

import { Archive, ArchiveRestore, Pencil, Plus, MonitorPlay } from "lucide-react";
import * as React from "react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Card, EmptyState, Progress } from "@/components/ui/misc";
import {
  createChannelAction,
  setChannelArchivedAction,
  updateChannelAction,
} from "@/server/actions/channels";
import type { Channel } from "@/types/database";

export interface ChannelStats {
  active: number;
  publishedThisMonth: number;
}

const PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#6366f1",
];

export function ChannelsPanel({
  channels,
  stats,
}: {
  channels: Channel[];
  stats: Record<string, ChannelStats>;
}) {
  const { can } = useWorkspace();
  const [editing, setEditing] = React.useState<Channel | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [pending, startTransition] = useTransition();

  const manage = can("channel.manage");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-ink-500 text-[13px]">
          Cada canal tiene su propio color, ritmo objetivo y cola de producción.
        </p>
        {manage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Nuevo canal
          </Button>
        ) : null}
      </div>

      {channels.length === 0 ? (
        <EmptyState
          icon={<MonitorPlay className="size-6" />}
          title="Todavía no hay canales"
          description="Crea tu primer canal faceless para empezar a repartir videos entre el equipo."
          action={
            manage ? <Button onClick={() => setCreating(true)}>Crear canal</Button> : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => {
            const channelStats = stats[channel.id] ?? { active: 0, publishedThisMonth: 0 };
            const target = channel.target_per_week * 4;
            const progress = target > 0 ? (channelStats.publishedThisMonth / target) * 100 : 0;

            return (
              <Card key={channel.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl text-[13px] font-bold text-white"
                    style={{ backgroundColor: channel.image_url ? undefined : channel.color }}
                  >
                    {channel.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- imagen subida por el equipo
                      <img src={channel.image_url} alt="" className="size-full object-cover" />
                    ) : (
                      channel.name.slice(0, 2).toUpperCase()
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-ink-900 truncate text-[14px] font-semibold">
                      {channel.name}
                    </p>
                    <p className="text-ink-400 truncate text-[12px]">
                      {channel.handle ?? "sin handle"} - {channel.niche ?? "sin nicho"}
                    </p>
                  </div>

                  {manage ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(channel)}
                        aria-label={`Editar ${channel.name}`}
                        className="text-ink-400 hover:bg-canvas hover:text-ink-900 rounded-lg p-1.5 transition"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={channel.is_archived ? "Restaurar canal" : "Archivar canal"}
                        className="text-ink-400 hover:bg-canvas hover:text-ink-900 rounded-lg p-1.5 transition"
                        onClick={() =>
                          startTransition(async () => {
                            const result = await setChannelArchivedAction(
                              channel.id,
                              !channel.is_archived,
                            );
                            if (!result.ok) toast.error(result.error);
                            else
                              toast.success(
                                channel.is_archived ? "Canal restaurado" : "Canal archivado",
                              );
                          })
                        }
                      >
                        {channel.is_archived ? (
                          <ArchiveRestore className="size-3.5" />
                        ) : (
                          <Archive className="size-3.5" />
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-ink-400 text-[11.5px]">En producción</dt>
                    <dd className="text-ink-900 text-[19px] font-semibold">
                      {channelStats.active}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-400 text-[11.5px]">Publicados este mes</dt>
                    <dd className="text-ink-900 text-[19px] font-semibold">
                      {channelStats.publishedThisMonth}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11.5px]">
                    <span className="text-ink-500">Ritmo objetivo</span>
                    <span className="text-ink-400">
                      {channelStats.publishedThisMonth}/{target} al mes
                    </span>
                  </div>
                  <Progress value={progress} color={channel.color} />
                </div>

                {channel.is_archived ? (
                  <p className="text-ink-400 mt-3 text-[11.5px]">Canal archivado</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <ChannelDialog open={creating} onOpenChange={setCreating} />
      <ChannelDialog
        key={editing?.id ?? "edit"}
        open={Boolean(editing)}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        channel={editing}
      />
    </div>
  );
}

function ChannelDialog({
  open,
  onOpenChange,
  channel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel?: Channel | null;
}) {
  const { workspaceId, pipelines, defaultPipeline } = useWorkspace();
  const action = channel ? updateChannelAction : createChannelAction;
  const [state, formAction, pending] = useActionState(action, null);
  const [color, setColor] = React.useState(channel?.color ?? PALETTE[0]);
  const [imageUrl, setImageUrl] = React.useState<string | null>(channel?.image_url ?? null);

  React.useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={channel ? `Editar ${channel.name}` : "Nuevo canal"}
      description="El color identifica al canal en todo el tablero."
    >
      <form action={formAction} className="space-y-4" noValidate>
        {channel ? <input type="hidden" name="id" value={channel.id} /> : null}
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="image_url" value={imageUrl ?? ""} />

        <Field label="Miniatura del canal" hint="Se ve en cada tarjeta del tablero.">
          <ImageUpload
            bucket="channels"
            folder={workspaceId}
            value={imageUrl}
            onChange={setImageUrl}
            label="Subir miniatura"
            fallback={channel?.name ?? "Canal"}
            color={color}
            rounded="xl"
          />
        </Field>

        {state && !state.ok ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}

        <Field label="Nombre" htmlFor="channel-name" error={fieldErrors.name}>
          <Input
            id="channel-name"
            name="name"
            defaultValue={channel?.name}
            required
            placeholder="Pulso Tech"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Handle" htmlFor="channel-handle">
            <Input
              id="channel-handle"
              name="handle"
              defaultValue={channel?.handle ?? ""}
              placeholder="@pulsotech"
            />
          </Field>
          <Field label="Nicho" htmlFor="channel-niche">
            <Input
              id="channel-niche"
              name="niche"
              defaultValue={channel?.niche ?? ""}
              placeholder="Tecnología"
            />
          </Field>
        </div>

        <Field label="URL del canal" htmlFor="channel-url" error={fieldErrors.youtube_url}>
          <Input
            id="channel-url"
            name="youtube_url"
            type="url"
            defaultValue={channel?.youtube_url ?? ""}
            placeholder="https://youtube.com/@pulsotech"
          />
        </Field>

        <Field
          label="Pipeline"
          htmlFor="channel-pipeline"
          hint="El flujo que siguen los videos de este canal."
        >
          <Select
            id="channel-pipeline"
            name="pipeline_id"
            defaultValue={channel?.pipeline_id ?? defaultPipeline?.id ?? ""}
          >
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Videos por semana (objetivo)" htmlFor="channel-target">
          <Select
            id="channel-target"
            name="target_per_week"
            defaultValue={String(channel?.target_per_week ?? 3)}
          >
            {[0, 1, 2, 3, 4, 5, 7, 10].map((value) => (
              <option key={value} value={value}>
                {value} por semana
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setColor(value)}
                aria-label={`Color ${value}`}
                aria-pressed={color === value}
                className="size-7 rounded-full ring-offset-2 transition"
                style={{
                  backgroundColor: value,
                  boxShadow: color === value ? `0 0 0 2px #fff, 0 0 0 4px ${value}` : undefined,
                }}
              />
            ))}
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {channel ? "Guardar cambios" : "Crear canal"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
