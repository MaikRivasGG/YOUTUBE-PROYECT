"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import * as React from "react";
import { toast } from "sonner";

import { BoardColumn } from "@/components/board/column";
import { BoardFiltersBar } from "@/components/board/board-filters";
import { VideoCard } from "@/components/board/video-card";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { useRealtimeBoard } from "@/hooks/use-realtime-board";
import { moveVideo } from "@/lib/api/board";
import {
  EMPTY_FILTERS,
  applyFilters,
  computeMove,
  groupByStage,
  type BoardFilters,
} from "@/lib/board-state";
import { PIPELINE } from "@/lib/domain/pipeline";
import { canMoveVideo } from "@/lib/domain/roles";
import { errorMessage } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";
import type { VideoStatus } from "@/types/database";

export function Board({
  initialVideos,
  initialChannelFilter,
}: {
  initialVideos: BoardVideo[];
  initialChannelFilter?: string | null;
}) {
  const { workspaceId, role, userId } = useWorkspace();
  const { videos, setVideos, connection } = useRealtimeBoard(workspaceId, initialVideos);
  const [filters, setFilters] = React.useState<BoardFilters>({
    ...EMPTY_FILTERS,
    channelId: initialChannelFilter ?? null,
  });
  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  const sensors = useSensors(
    // Un umbral pequeno evita que un click en el título inicie un arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = React.useMemo(() => applyFilters(videos, filters), [videos, filters]);
  const grouped = React.useMemo(() => groupByStage(visible), [visible]);
  const dragging = draggingId ? videos.find((video) => video.id === draggingId) : null;

  const allowedToMove = React.useCallback(
    (video: BoardVideo, to: VideoStatus) =>
      canMoveVideo({
        role,
        userId,
        assigneeIds: video.video_assignees.map((assignee) => assignee.user_id),
        from: video.status,
        to,
      }),
    [role, userId],
  );

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);
    if (!over) return;

    const activeId = String(active.id);
    const moving = videos.find((video) => video.id === activeId);
    if (!moving) return;

    const overId = String(over.id);
    const overData = over.data.current as { type?: string; status?: VideoStatus } | undefined;

    const targetStatus: VideoStatus =
      overData?.type === "column"
        ? (overData.status as VideoStatus)
        : ((videos.find((video) => video.id === overId)?.status ?? moving.status) as VideoStatus);

    if (!allowedToMove(moving, targetStatus)) {
      toast.error("Tu rol no puede mover esta tarjeta a esa etapa");
      return;
    }

    // Indice de destino dentro de la columna, ya sin la tarjeta que se mueve.
    const targetList = videos
      .filter((video) => video.status === targetStatus && video.id !== activeId)
      .sort((a, b) => a.position - b.position);

    const overIndex = targetList.findIndex((video) => video.id === overId);
    let index = overIndex === -1 ? targetList.length : overIndex;

    const sameColumn = moving.status === targetStatus;
    const overVideo = targetList[overIndex];
    if (sameColumn && overVideo && moving.position < overVideo.position) {
      index = overIndex + 1;
    }

    const result = computeMove(videos, activeId, targetStatus, index);
    if (!result) return;
    if (targetStatus === moving.status && result.position === moving.position) return;

    const snapshot = videos;
    setVideos(result.videos); // Optimista: la tarjeta se mueve al instante.

    try {
      await moveVideo(activeId, targetStatus, result.position);
    } catch (error) {
      setVideos(snapshot);
      toast.error(errorMessage(error, "No hemos podido mover la tarjeta"));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <BoardFiltersBar
        filters={filters}
        onChange={setFilters}
        total={videos.length}
        visible={visible.length}
        connection={connection}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        modifiers={[restrictToWindowEdges]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="scrollbar-slim flex flex-1 gap-3 overflow-x-auto pb-4">
          {PIPELINE.map((stage) => (
            <BoardColumn
              key={stage.id}
              stage={stage}
              videos={grouped.get(stage.id) ?? []}
              // Cualquier miembro puede arrastrar: el destino concreto se
              // valida al soltar y se avisa si su rol no lo permite.
              canDrag={() => role !== "viewer"}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
          {dragging ? (
            <div className="w-[252px]">
              <VideoCard video={dragging} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
