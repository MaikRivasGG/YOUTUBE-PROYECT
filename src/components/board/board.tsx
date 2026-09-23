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
import { BoardScope } from "@/components/board/board-scope";
import { VideoCard } from "@/components/board/video-card";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { useRealtimeBoard } from "@/hooks/use-realtime-board";
import { moveVideo } from "@/lib/api/board";
import {
  EMPTY_FILTERS,
  applyFilters,
  computeMove,
  groupByKind,
  groupByStage,
  videosOfPipeline,
  type BoardFilters,
} from "@/lib/board-state";
import { GENERAL_VIEW_PIPELINE_ID, generalViewStages } from "@/lib/domain/pipeline";
import { canMoveVideo } from "@/lib/domain/roles";
import { errorMessage } from "@/lib/utils";
import type { BoardVideo } from "@/server/queries";

export function Board({
  initialVideos,
  initialChannelFilter,
}: {
  initialVideos: BoardVideo[];
  initialChannelFilter?: string | null;
}) {
  const workspace = useWorkspace();
  const { workspaceId, myRoles, managedStages, userId, pipelines, defaultPipeline } = workspace;

  const [pipelineId, setPipelineId] = React.useState(
    () => defaultPipeline?.id ?? pipelines[0]?.id ?? "",
  );

  // Las etapas archivadas no se pintan: lo que cae ahi sale del tablero.
  const hiddenStageIds = React.useMemo(
    () =>
      new Set(
        pipelines.flatMap((pipeline) => {
          const archived = workspace.archivedStageOf(pipeline.id);
          return archived ? [archived.id] : [];
        }),
      ),
    [pipelines, workspace],
  );

  const { videos, setVideos, connection } = useRealtimeBoard(
    workspaceId,
    initialVideos,
    hiddenStageIds,
  );

  const [filters, setFilters] = React.useState<BoardFilters>({
    ...EMPTY_FILTERS,
    channelId: initialChannelFilter ?? null,
  });
  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  const sensors = useSensors(
    // Un umbral pequeno evita que un click en el titulo inicie un arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isGeneralView = pipelineId === GENERAL_VIEW_PIPELINE_ID;
  const stages = React.useMemo(
    () => (isGeneralView ? generalViewStages() : workspace.stagesOf(pipelineId)),
    [isGeneralView, pipelineId, workspace],
  );
  const inPipeline = React.useMemo(() => {
    const live = videos.filter((video) => !hiddenStageIds.has(video.stage_id));
    return isGeneralView ? live : videosOfPipeline(live, pipelineId);
  }, [videos, pipelineId, hiddenStageIds, isGeneralView]);
  const visible = React.useMemo(() => applyFilters(inPipeline, filters), [inPipeline, filters]);
  const grouped = React.useMemo(
    () =>
      isGeneralView
        ? groupByKind(visible, (stageId) => workspace.stageById(stageId)?.kind)
        : groupByStage(visible),
    [visible, isGeneralView, workspace],
  );
  const dragging = draggingId ? videos.find((video) => video.id === draggingId) : null;

  const allowedToMove = React.useCallback(
    (video: BoardVideo, toStageId: string) =>
      !isGeneralView &&
      canMoveVideo({
        roles: myRoles,
        managedStageIds: managedStages,
        userId,
        assigneeIds: video.video_assignees.map((assignee) => assignee.user_id),
        fromStageId: video.stage_id,
        toStageId,
      }),
    [myRoles, managedStages, userId, isGeneralView],
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
    const overData = over.data.current as { type?: string; stageId?: string } | undefined;

    const targetStageId =
      overData?.type === "column"
        ? (overData.stageId as string)
        : (videos.find((video) => video.id === overId)?.stage_id ?? moving.stage_id);

    if (!allowedToMove(moving, targetStageId)) {
      toast.error("Tu rol no puede mover esta tarjeta a esa etapa");
      return;
    }

    // Indice de destino dentro de la columna, ya sin la tarjeta que se mueve.
    const targetList = videos
      .filter((video) => video.stage_id === targetStageId && video.id !== activeId)
      .sort((a, b) => a.position - b.position);

    const overIndex = targetList.findIndex((video) => video.id === overId);
    let index = overIndex === -1 ? targetList.length : overIndex;

    const sameColumn = moving.stage_id === targetStageId;
    const overVideo = targetList[overIndex];
    if (sameColumn && overVideo && moving.position < overVideo.position) {
      index = overIndex + 1;
    }

    const result = computeMove(videos, activeId, targetStageId, index);
    if (!result) return;
    if (sameColumn && result.position === moving.position) return;

    const snapshot = videos;
    setVideos(result.videos); // Optimista: la tarjeta se mueve al instante.

    try {
      await moveVideo(activeId, targetStageId, result.position);
    } catch (error) {
      setVideos(snapshot);
      toast.error(errorMessage(error, "No hemos podido mover la tarjeta"));
    }
  }

  const pipeline = pipelines.find((item) => item.id === pipelineId);
  const channel = workspace.channelById(filters.channelId);
  const pipelineLabel = isGeneralView
    ? "Vista general (todos los canales)"
    : (pipeline?.name ?? null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Etiqueta fija: canal y pipeline no son lo mismo y aqui se ven los dos
          a la vez, para no confundir "que veo" con "por que flujo va". */}
      <BoardScope pipelineName={pipelineLabel} channel={channel ?? null} />

      <BoardFiltersBar
        filters={filters}
        onChange={setFilters}
        total={inPipeline.length}
        visible={visible.length}
        connection={connection}
        pipelineId={pipelineId}
        onPipelineChange={setPipelineId}
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
          {stages.length === 0 ? (
            <p className="text-ink-400 py-10 text-[13px]">
              Este pipeline no tiene etapas todavia. Anadelas desde Ajustes.
            </p>
          ) : null}

          {stages.map((stage) => (
            <BoardColumn
              key={stage.id}
              stage={stage}
              pipelineId={pipelineId}
              videos={grouped.get(stage.id) ?? []}
              // Cualquier miembro puede arrastrar: el destino concreto se
              // valida al soltar y se avisa si su rol no lo permite. En la
              // Vista general no se arrastra: mezcla tarjetas de pipelines
              // distintos y no hay una unica etapa de destino valida.
              canDrag={() => !isGeneralView && workspace.can("video.edit")}
              readOnly={isGeneralView}
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
