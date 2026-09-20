"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { SortableVideoCard } from "@/components/board/video-card";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Input } from "@/components/ui/field";
import { createVideo, nextPositionFor } from "@/lib/api/board";
import { cn, errorMessage } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";
import type { Stage } from "@/types/database";

export function BoardColumn({
  stage,
  pipelineId,
  videos,
  canDrag,
}: {
  stage: Stage;
  pipelineId: string;
  videos: BoardVideo[];
  canDrag: (video: BoardVideo) => boolean;
}) {
  const { workspaceId, can } = useWorkspace();
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${stage.id}`,
    data: { type: "column", stageId: stage.id },
  });

  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function quickAdd(event: React.FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (clean.length < 2) return;

    setSaving(true);
    try {
      const position = await nextPositionFor(workspaceId, stage.id);
      await createVideo({
        workspace_id: workspaceId,
        pipeline_id: pipelineId,
        stage_id: stage.id,
        title: clean,
        position,
      });
      setTitle("");
      // Se mantiene abierto para encadenar varias ideas seguidas.
    } catch (error) {
      toast.error(errorMessage(error, "No hemos podido crear la tarjeta"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="bg-column flex w-[268px] shrink-0 flex-col rounded-xl"
      aria-label={`${stage.name}, ${videos.length} tarjetas`}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: stage.color }}
          aria-hidden
        />
        <h3 className="text-ink-900 text-[13px] font-semibold">{stage.name}</h3>
        <span className="text-ink-400 text-[12px]">{videos.length}</span>
        <span className="flex-1" />
        {can("video.create") ? (
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            aria-label={`Anadir tarea en ${stage.name}`}
            className="text-ink-400 hover:bg-surface hover:text-ink-900 rounded-md p-1 transition"
          >
            {adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          </button>
        ) : null}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "scrollbar-slim flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 transition-colors",
          isOver && "bg-brand-50/70 rounded-b-xl",
        )}
      >
        <SortableContext
          items={videos.map((video) => video.id)}
          strategy={verticalListSortingStrategy}
        >
          {videos.map((video) => (
            <SortableVideoCard key={video.id} video={video} disabled={!canDrag(video)} />
          ))}
        </SortableContext>

        {adding ? (
          <form onSubmit={quickAdd} className="pt-0.5">
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (!title.trim()) setAdding(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setAdding(false);
              }}
              placeholder="Titulo de la tarjeta"
              disabled={saving}
              maxLength={160}
              className="bg-surface text-[13px]"
            />
            <p className="text-ink-400 mt-1 px-1 text-[11px]">Enter para crear, Esc para cerrar</p>
          </form>
        ) : can("video.create") ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-ink-400 hover:bg-surface hover:text-ink-700 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] transition"
          >
            <Plus className="size-3.5" aria-hidden />
            Anadir tarea
          </button>
        ) : null}
      </div>
    </section>
  );
}
