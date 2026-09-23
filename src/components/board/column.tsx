"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import * as React from "react";

import { SortableVideoCard } from "@/components/board/video-card";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { CreateVideoDialog } from "@/components/video/create-video-dialog";
import { cn } from "@/lib/utils";
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
  const { can } = useWorkspace();
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${stage.id}`,
    data: { type: "column", stageId: stage.id },
  });

  const [adding, setAdding] = React.useState(false);

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
            onClick={() => setAdding(true)}
            aria-label={`Anadir tarea en ${stage.name}`}
            className="text-ink-400 hover:bg-surface hover:text-ink-900 rounded-md p-1 transition"
          >
            <Plus className="size-3.5" />
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

        {can("video.create") ? (
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

      <CreateVideoDialog
        open={adding}
        onOpenChange={setAdding}
        defaultPipelineId={pipelineId}
        defaultStageId={stage.id}
      />
    </section>
  );
}
