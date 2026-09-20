"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import * as React from "react";

import { applyAssigneeEvent, applyChecklistEvent, applyRealtimeEvent } from "@/lib/board-state";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BoardVideo } from "@/server/queries";

export type ConnectionState = "connecting" | "live" | "offline";

/**
 * Mantiene el tablero sincronizado con el resto del equipo.
 *
 * Escucha los cambios de `videos`, `video_assignees` y `checklist_items` del
 * workspace y los reconcilia con el estado local. Las politicas RLS también se
 * aplican a Realtime, así que solo llegan filas que el usuario puede ver.
 */
export function useRealtimeBoard(
  workspaceId: string,
  initial: BoardVideo[],
  /** Etapas que no se pintan en el tablero (las de tipo archivado). */
  hiddenStageIds: ReadonlySet<string> = new Set(),
): {
  videos: BoardVideo[];
  setVideos: React.Dispatch<React.SetStateAction<BoardVideo[]>>;
  connection: ConnectionState;
} {
  const [videos, setVideos] = React.useState<BoardVideo[]>(initial);
  const [connection, setConnection] = React.useState<ConnectionState>("connecting");
  const [seed, setSeed] = React.useState(initial);

  // Si el servidor reenvia datos nuevos (router.refresh) se adoptan. Ajustar el
  // estado en fase de render es el patron recomendado por React: evita el
  // render extra que provocaria hacerlo dentro de un efecto.
  if (seed !== initial) {
    setSeed(initial);
    setVideos(initial);
  }

  React.useEffect(() => {
    const supabase = supabaseBrowser();
    let channel: RealtimeChannel | null = null;

    channel = supabase
      .channel(`board:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "videos",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          setVideos((current) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string }).id;
              return id ? applyRealtimeEvent(current, { type: "DELETE", id }) : current;
            }

            const video = payload.new as BoardVideo;
            // Lo que cae en una etapa archivada desaparece del tablero.
            if (hiddenStageIds.has(video.stage_id)) {
              return applyRealtimeEvent(current, { type: "DELETE", id: video.id });
            }

            return applyRealtimeEvent(current, {
              type: payload.eventType === "INSERT" ? "INSERT" : "UPDATE",
              video,
            });
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_assignees" },
        (payload) => {
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as {
            video_id?: string;
            user_id?: string;
          };
          if (!row.video_id || !row.user_id) return;

          setVideos((current) =>
            applyAssigneeEvent(current, {
              type: payload.eventType === "DELETE" ? "DELETE" : "INSERT",
              videoId: row.video_id as string,
              userId: row.user_id as string,
            }),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checklist_items" },
        (payload) => {
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as {
            id?: string;
            video_id?: string;
            is_done?: boolean;
          };
          if (!row.id || !row.video_id) return;

          setVideos((current) =>
            applyChecklistEvent(current, {
              type: payload.eventType,
              videoId: row.video_id as string,
              id: row.id as string,
              isDone: Boolean(row.is_done),
            }),
          );
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("offline");
        else setConnection("connecting");
      });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [workspaceId, hiddenStageIds]);

  return { videos, setVideos, connection };
}
