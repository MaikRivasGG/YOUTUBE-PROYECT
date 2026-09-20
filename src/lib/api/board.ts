"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { BoardVideo } from "@/server/queries";
import type { AssetKind, Video, VideoPriority, VideoStatus } from "@/types/database";

/**
 * Mutaciones del tablero ejecutadas directamente contra Supabase desde el
 * navegador.
 *
 * Se hacen aquí y no en server actions a proposito: el tablero necesita
 * latencia minima y los cambios llegan al resto del equipo por Realtime. La
 * seguridad no depende del cliente, la aplican las politicas RLS y el RPC
 * move_video (que valida quién puede mover cada etapa).
 */

export async function moveVideo(id: string, status: VideoStatus, position: number) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase.rpc("move_video", {
    p_video: id,
    p_status: status,
    p_position: position,
  });
  if (error) throw error;
  return data;
}

export interface CreateVideoPayload {
  workspace_id: string;
  title: string;
  status: VideoStatus;
  position: number;
  channel_id?: string | null;
  priority?: VideoPriority;
  hook?: string | null;
  due_date?: string | null;
}

export async function createVideo(payload: CreateVideoPayload) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from("videos")
    .insert(payload)
    .select("*, video_assignees(user_id), checklist_items(id, is_done)")
    .single();

  if (error) throw error;
  return data as unknown as BoardVideo;
}

export async function updateVideo(id: string, patch: Partial<Video>) {
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("videos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function archiveVideo(id: string) {
  const supabase = supabaseBrowser();
  const { error } = await supabase.rpc("move_video", {
    p_video: id,
    p_status: "archived",
    p_position: 0,
  });
  if (error) throw error;
}

export async function deleteVideo(id: string) {
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleAssignee(videoId: string, userId: string, assigned: boolean) {
  const supabase = supabaseBrowser();
  if (assigned) {
    const { error } = await supabase
      .from("video_assignees")
      .insert({ video_id: videoId, user_id: userId });
    if (error && error.code !== "23505") throw error;
    return;
  }
  const { error } = await supabase
    .from("video_assignees")
    .delete()
    .eq("video_id", videoId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function addChecklistItem(videoId: string, title: string, position: number) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from("checklist_items")
    .insert({ video_id: videoId, title, position })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function setChecklistDone(id: string, done: boolean) {
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("checklist_items").update({ is_done: done }).eq("id", id);
  if (error) throw error;
}

export async function deleteChecklistItem(id: string) {
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("checklist_items").delete().eq("id", id);
  if (error) throw error;
}

export async function addComment(videoId: string, authorId: string, body: string) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from("comments")
    .insert({ video_id: videoId, author_id: authorId, body })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function addAsset(payload: {
  video_id: string;
  kind: AssetKind;
  label: string;
  url: string;
  created_by: string;
}) {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase.from("assets").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteAsset(id: string) {
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw error;
}

/** Posicion siguiente al final de una columna, en una sola consulta. */
export async function nextPositionFor(workspaceId: string, status: VideoStatus): Promise<number> {
  const supabase = supabaseBrowser();
  const { data } = await supabase
    .from("videos")
    .select("position")
    .eq("workspace_id", workspaceId)
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.position ?? 0) + 1000;
}
