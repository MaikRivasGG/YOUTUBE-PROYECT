"use client";

import { ArrowLeft, Archive, MoreHorizontal, Trash2, MonitorPlay } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AssetsPanel, type AssetRow } from "@/components/video/assets-panel";
import { ChecklistPanel, type ChecklistRow } from "@/components/video/checklist-panel";
import { CommentsPanel, type CommentRow } from "@/components/video/comments-panel";
import {
  StageDeliverablesPanel,
  type StageLinkRow,
} from "@/components/video/stage-deliverables-panel";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Card } from "@/components/ui/misc";
import {
  archiveVideo,
  deleteVideo,
  moveVideo,
  nextPositionFor,
  toggleAssignee,
  updateVideo,
} from "@/lib/api/board";
import { toDateInput } from "@/lib/dates";
import { PRIORITIES, priorityMeta } from "@/lib/domain/pipeline";
import { canMoveVideo } from "@/lib/domain/roles";
import { cn, errorMessage, isSafeHttpUrl } from "@/lib/utils";
import type { VideoDetail as VideoDetailData } from "@/server/queries";
import type { Video } from "@/types/database";

/** Campos que se renderizan como enlace o imagen y exigen http(s). */
const URL_FIELDS = new Set<keyof Video>(["youtube_url", "thumbnail_url"]);

export function VideoDetailView({ video: initial }: { video: VideoDetailData }) {
  const workspace = useWorkspace();
  const { channels, members, can, myRoles, managedStages, userId, memberById } = workspace;
  const router = useRouter();

  const [video, setVideo] = React.useState(initial);
  const [assignees, setAssignees] = React.useState<string[]>(
    initial.video_assignees.map((assignee) => assignee.user_id),
  );
  const [savingField, setSavingField] = React.useState<string | null>(null);

  const editable = can("video.edit");
  const stage = workspace.stageById(video.stage_id);
  const stages = workspace.stagesOf(video.pipeline_id);
  const channel = channels.find((item) => item.id === video.channel_id);

  /** Guarda un campo suelto y revierte si el servidor lo rechaza. */
  const save = React.useCallback(
    async (field: keyof Video, value: string | null) => {
      const previous = video[field];
      if (previous === value) return;

      // Los campos de enlace acaban en un <a href> o un <img src>.
      if (URL_FIELDS.has(field) && value !== null && !isSafeHttpUrl(value)) {
        toast.error("El enlace debe empezar por http:// o https://");
        return;
      }

      setVideo((current) => ({ ...current, [field]: value }) as VideoDetailData);
      setSavingField(field);

      try {
        await updateVideo(video.id, { [field]: value } as Partial<Video>);
      } catch (error) {
        setVideo((current) => ({ ...current, [field]: previous }) as VideoDetailData);
        toast.error(errorMessage(error, "No hemos podido guardar el cambio"));
      } finally {
        setSavingField(null);
      }
    },
    [video],
  );

  async function changeStage(stageId: string) {
    const allowed = canMoveVideo({
      roles: myRoles,
      managedStageIds: managedStages,
      userId,
      assigneeIds: assignees,
      fromStageId: video.stage_id,
      toStageId: stageId,
    });

    if (!allowed) {
      toast.error("Tu rol no puede mover esta tarjeta a esa etapa");
      return;
    }

    const previous = video.stage_id;
    setVideo((current) => ({ ...current, stage_id: stageId }));

    try {
      const position = await nextPositionFor(video.workspace_id, stageId);
      await moveVideo(video.id, stageId, position);
      toast.success(`Movido a ${workspace.stageById(stageId)?.name ?? "otra etapa"}`);
    } catch (error) {
      setVideo((current) => ({ ...current, stage_id: previous }));
      toast.error(errorMessage(error));
    }
  }

  async function toggleMember(memberId: string) {
    const assigned = assignees.includes(memberId);
    setAssignees((current) =>
      assigned ? current.filter((id) => id !== memberId) : [...current, memberId],
    );

    try {
      await toggleAssignee(video.id, memberId, !assigned);
    } catch (error) {
      setAssignees((current) =>
        assigned ? [...current, memberId] : current.filter((id) => id !== memberId),
      );
      toast.error(errorMessage(error, "No tienes permiso para asignar"));
    }
  }

  return (
    <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-5 lg:px-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/produccion"
            className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5 text-[13px]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Volver al pipeline
          </Link>

          <div className="flex items-center gap-2">
            <Badge className="bg-column text-ink-600">{video.ref}</Badge>
            {video.youtube_url ? (
              <a
                href={video.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-500 inline-flex items-center gap-1 text-[12.5px] hover:text-red-600"
              >
                <MonitorPlay className="size-4" aria-hidden />
                Ver en YouTube
              </a>
            ) : null}

            {can("video.delete") ? (
              <Menu
                trigger={({ toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label="Más acciones"
                    className="text-ink-500 hover:bg-canvas rounded-lg p-1.5 transition"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                )}
              >
                {({ close }) => (
                  <>
                    <MenuItem
                      onClick={async () => {
                        close();
                        const archived = workspace.archivedStageOf(video.pipeline_id);
                        if (!archived) {
                          toast.error("Este pipeline no tiene etapa de archivado");
                          return;
                        }
                        try {
                          await archiveVideo(video.id, archived.id);
                          toast.success("Video archivado");
                          router.push("/produccion");
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      <Archive className="size-4" aria-hidden />
                      Archivar
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      destructive
                      onClick={async () => {
                        close();
                        if (!window.confirm("Eliminar este video y todo su historial?")) return;
                        try {
                          await deleteVideo(video.id);
                          toast.success("Video eliminado");
                          router.push("/produccion");
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Eliminar
                    </MenuItem>
                  </>
                )}
              </Menu>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          {/* Contenido */}
          <div className="space-y-5">
            <Card className="p-5">
              <input
                defaultValue={video.title}
                disabled={!editable}
                onBlur={(event) => save("title", event.target.value.trim() || video.title)}
                aria-label="Título del video"
                className="text-ink-900 w-full border-0 bg-transparent text-[22px] leading-tight font-semibold outline-none focus:ring-0 disabled:opacity-100"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {stage ? (
                  <Badge className="bg-column text-ink-700" dotColor={stage.color}>
                    {stage.name}
                  </Badge>
                ) : null}
                <Badge className={priorityMeta(video.priority).chip}>
                  {priorityMeta(video.priority).label}
                </Badge>
                {channel ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: `${channel.color}1a`, color: channel.color }}
                  >
                    {channel.name}
                  </span>
                ) : null}
                {savingField ? (
                  <span className="text-ink-400 text-[11px]">Guardando...</span>
                ) : null}
              </div>

              <div className="mt-5 space-y-4">
                <Field label="Hook" hint="Los primeros 5 segundos deciden la retencion.">
                  <Textarea
                    defaultValue={video.hook ?? ""}
                    disabled={!editable}
                    rows={2}
                    className="min-h-16"
                    onBlur={(event) => save("hook", event.target.value.trim() || null)}
                  />
                </Field>

                <Field label="Descripción / brief">
                  <Textarea
                    defaultValue={video.description ?? ""}
                    disabled={!editable}
                    rows={4}
                    onBlur={(event) => save("description", event.target.value.trim() || null)}
                  />
                </Field>

                <Field label="Guion">
                  <Textarea
                    defaultValue={video.script_body ?? ""}
                    disabled={!editable}
                    rows={12}
                    className="min-h-56 font-mono text-[12.5px] leading-relaxed"
                    placeholder="Escribe o pega aquí el guion completo..."
                    onBlur={(event) => save("script_body", event.target.value.trim() || null)}
                  />
                </Field>
              </div>
            </Card>

            <Card className="p-5">
              <CommentsPanel videoId={video.id} initial={video.comments as CommentRow[]} />
            </Card>
          </div>

          {/* Lateral */}
          <div className="space-y-4">
            <Card className="space-y-4 p-4">
              <Field label="Etapa">
                <Select
                  value={video.stage_id}
                  disabled={!editable}
                  onChange={(event) => changeStage(event.target.value)}
                >
                  {stages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Canal">
                <Select
                  value={video.channel_id ?? ""}
                  disabled={!editable}
                  onChange={(event) => save("channel_id", event.target.value || null)}
                >
                  <option value="">Sin canal</option>
                  {channels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Prioridad">
                <Select
                  value={video.priority}
                  disabled={!editable}
                  onChange={(event) => save("priority", event.target.value)}
                >
                  {PRIORITIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha limite">
                  <Input
                    type="date"
                    defaultValue={toDateInput(video.due_date)}
                    disabled={!editable}
                    onChange={(event) => save("due_date", event.target.value || null)}
                  />
                </Field>

                <Field label="Publicación">
                  <Input
                    type="datetime-local"
                    defaultValue={video.publish_at ? video.publish_at.slice(0, 16) : ""}
                    disabled={!editable}
                    onChange={(event) =>
                      save(
                        "publish_at",
                        event.target.value ? new Date(event.target.value).toISOString() : null,
                      )
                    }
                  />
                </Field>
              </div>

              <Field label="URL de YouTube">
                <Input
                  type="url"
                  defaultValue={video.youtube_url ?? ""}
                  disabled={!editable}
                  placeholder="https://youtu.be/..."
                  onBlur={(event) => save("youtube_url", event.target.value.trim() || null)}
                />
              </Field>

              <Field label="Miniatura (URL)">
                <Input
                  type="url"
                  defaultValue={video.thumbnail_url ?? ""}
                  disabled={!editable}
                  placeholder="https://..."
                  onBlur={(event) => save("thumbnail_url", event.target.value.trim() || null)}
                />
              </Field>
            </Card>

            <Card className="p-4">
              <h2 className="text-ink-900 mb-2.5 text-[14px] font-semibold">Equipo asignado</h2>
              <ul className="space-y-1">
                {members.map((member) => {
                  const assigned = assignees.includes(member.user_id);
                  const profile = memberById(member.user_id);
                  if (!profile) return null;

                  return (
                    <li key={member.user_id}>
                      <button
                        type="button"
                        disabled={!can("video.assign") && member.user_id !== userId}
                        onClick={() => toggleMember(member.user_id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition",
                          assigned ? "bg-brand-50" : "hover:bg-canvas",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                      >
                        <Avatar
                          id={profile.id}
                          name={profile.full_name}
                          url={profile.avatar_url}
                          size="sm"
                        />
                        <span className="text-ink-700 flex-1 truncate text-[12.5px]">
                          {profile.full_name}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] font-medium",
                            assigned ? "text-brand-600" : "text-ink-400",
                          )}
                        >
                          {assigned ? "Asignado" : "Asignar"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card className="p-4">
              <StageDeliverablesPanel
                videoId={video.id}
                pipelineId={video.pipeline_id}
                currentStageId={video.stage_id}
                initial={video.video_stage_links as StageLinkRow[]}
              />
            </Card>

            <Card className="p-4">
              <ChecklistPanel
                videoId={video.id}
                initial={video.checklist_items as ChecklistRow[]}
              />
            </Card>

            <Card className="p-4">
              <AssetsPanel videoId={video.id} initial={video.assets as AssetRow[]} />
            </Card>

            {!editable ? (
              <p className="text-ink-400 px-1 text-[12px]">
                Tu rol solo permite consultar este video.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VideoNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="text-ink-900 text-lg font-semibold">Ese video ya no existe</p>
      <p className="text-ink-500 text-[13px]">
        Puede que se haya eliminado o que pertenezca a otro equipo.
      </p>
      <Link
        href="/produccion"
        className="bg-brand-500 hover:bg-brand-600 rounded-lg px-4 py-2 text-sm font-medium text-white transition"
      >
        Volver al pipeline
      </Link>
    </div>
  );
}
