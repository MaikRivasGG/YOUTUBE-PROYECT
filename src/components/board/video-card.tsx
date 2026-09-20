"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, CheckSquare } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge, Dot } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { progressOf } from "@/lib/board-state";
import { dueLabel, isOverdue } from "@/lib/dates";
import { priorityMeta } from "@/lib/domain/pipeline";
import { cn } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";

export function VideoCard({
  video,
  dragging,
  draggable = true,
}: {
  video: BoardVideo;
  dragging?: boolean;
  draggable?: boolean;
}) {
  const { channelById, memberById } = useWorkspace();
  const channel = channelById(video.channel_id);
  const priority = priorityMeta(video.priority);
  const progress = progressOf(video);
  const due = dueLabel(video.due_date);
  const late = isOverdue(video.due_date);

  const people = video.video_assignees
    .map((assignee) => memberById(assignee.user_id))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));

  const readyToPublish = video.status === "scheduled" || video.status === "published";

  return (
    <article
      className={cn(
        "bg-surface card-shadow group ring-line rounded-xl ring-1 transition",
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        dragging ? "rotate-1 opacity-90 shadow-lg" : "hover:ring-ink-400/40",
      )}
    >
      {video.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniaturas externas arbitrarias
        <img
          src={video.thumbnail_url}
          alt=""
          className="aspect-video w-full rounded-t-xl object-cover"
          loading="lazy"
        />
      ) : null}

      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            {channel ? <Dot color={channel.color} /> : null}
            <span
              className="truncate text-[11px] font-medium"
              style={{ color: channel?.color ?? "var(--color-ink-400)" }}
            >
              {channel?.name ?? "Sin canal"}
            </span>
          </span>

          {readyToPublish ? (
            <Badge className="bg-emerald-50 text-emerald-700">Listo</Badge>
          ) : (
            <Badge className={priority.chip}>{priority.label}</Badge>
          )}
        </div>

        <Link
          href={`/videos/${video.id}`}
          onClick={(event) => event.stopPropagation()}
          className="hover:text-brand-600 text-ink-900 block text-[13.5px] leading-snug font-semibold transition"
        >
          <span className="line-clamp-2">{video.title}</span>
        </Link>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          {people.length > 0 ? (
            <AvatarStack
              people={people.map((person) => ({
                id: person.id,
                full_name: person.full_name,
                avatar_url: person.avatar_url,
              }))}
              size="sm"
            />
          ) : (
            <span className="text-ink-400 text-[11px]">Sin asignar</span>
          )}

          <div className="text-ink-400 flex items-center gap-2 text-[11px]">
            {video.checklist_items.length > 0 ? (
              <span className="flex items-center gap-1" title="Checklist">
                <CheckSquare className="size-3" aria-hidden />
                {video.checklist_items.filter((item) => item.is_done).length}/
                {video.checklist_items.length}
              </span>
            ) : null}

            {due ? (
              <span
                className={cn(
                  "flex items-center gap-1 font-medium",
                  late ? "text-red-600" : due === "Hoy" ? "text-brand-600" : "text-ink-500",
                )}
              >
                <CalendarDays className="size-3" aria-hidden />
                {due}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {progress > 0 ? (
        <Progress value={progress} color={channel?.color} className="rounded-t-none" />
      ) : null}
    </article>
  );
}

/** Tarjeta arrastrable: envuelve VideoCard con los sensores de dnd-kit. */
export function SortableVideoCard({ video, disabled }: { video: BoardVideo; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
    data: { type: "card", status: video.status },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <VideoCard video={video} draggable={!disabled} />
    </div>
  );
}
