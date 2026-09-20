import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import type {
  Activity,
  Channel,
  Invitation,
  Profile,
  Video,
  WorkspaceRole,
  WorkspaceStats,
} from "@/types/database";

/** Video tal y como lo consume el tablero, con asignados y checklist embebidos. */
export interface BoardVideo extends Video {
  video_assignees: { user_id: string }[];
  checklist_items: { id: string; is_done: boolean }[];
}

export interface TeamMember {
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  profile: Profile;
}

const BOARD_SELECT = "*, video_assignees(user_id), checklist_items(id, is_done)";

export async function getBoardVideos(workspaceId: string): Promise<BoardVideo[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select(BOARD_SELECT)
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as BoardVideo[];
}

export async function getChannels(
  workspaceId: string,
  includeArchived = false,
): Promise<Channel[]> {
  const supabase = await supabaseServer();
  let query = supabase.from("channels").select("*").eq("workspace_id", workspaceId);
  if (!includeArchived) query = query.eq("is_archived", false);

  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTeamMembers(workspaceId: string): Promise<TeamMember[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, created_at, profiles(*)")
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .flatMap((member) => {
      const profile = member.profiles as unknown as Profile | null;
      if (!profile) return [];
      return [
        { user_id: member.user_id, role: member.role, created_at: member.created_at, profile },
      ];
    })
    .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name));
}

export async function getPendingInvitations(workspaceId: string): Promise<Invitation[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return [];
  return data ?? [];
}

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("workspace_stats", { p_workspace: workspaceId });

  if (error || !data) {
    return {
      total: 0,
      in_progress: 0,
      published_this_month: 0,
      scheduled: 0,
      overdue: 0,
      members: 0,
      channels: 0,
      by_status: {},
    };
  }

  return data as WorkspaceStats;
}

export interface ActivityEntry extends Activity {
  actor: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export async function getActivity(workspaceId: string, limit = 12): Promise<ActivityEntry[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("activity")
    .select("*, profiles(id, full_name, avatar_url)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  return (data ?? []).map((entry) => ({
    ...(entry as unknown as Activity),
    actor: (entry as unknown as { profiles: ActivityEntry["actor"] }).profiles,
  }));
}

/** Próximos vencimientos: lo que no esta publicado y tiene fecha. */
export async function getUpcoming(workspaceId: string, limit = 6) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select("id, ref, title, status, priority, due_date, publish_at, channel_id")
    .eq("workspace_id", workspaceId)
    .not("due_date", "is", null)
    .not("status", "in", "(published,archived)")
    .order("due_date", { ascending: true })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

export interface VideoDetail extends Video {
  video_assignees: { user_id: string }[];
  checklist_items: {
    id: string;
    title: string;
    stage: Video["status"] | null;
    assignee_id: string | null;
    is_done: boolean;
    position: number;
  }[];
  comments: { id: string; body: string; author_id: string | null; created_at: string }[];
  assets: { id: string; kind: string; label: string; url: string; created_at: string }[];
}

export async function getVideoDetail(id: string): Promise<VideoDetail | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "*, video_assignees(user_id), checklist_items(id, title, stage, assignee_id, is_done, position), comments(id, body, author_id, created_at), assets(id, kind, label, url, created_at)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as VideoDetail;
}

/** Tareas del usuario: videos donde esta asignado y siguen vivos. */
export async function getMyWork(workspaceId: string, userId: string): Promise<BoardVideo[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select(`${BOARD_SELECT}, assigned:video_assignees!inner(user_id)`)
    .eq("workspace_id", workspaceId)
    .eq("assigned.user_id", userId)
    .not("status", "in", "(published,archived)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(20);

  if (error) return [];
  return (data ?? []) as unknown as BoardVideo[];
}

export interface AnalyticsVideo {
  id: string;
  channel_id: string | null;
  status: Video["status"];
  created_at: string;
  published_at: string | null;
  due_date: string | null;
  video_assignees: { user_id: string }[];
}

/** Datos crudos para la pantalla de analíticas (incluye publicados y archivados). */
export async function getAnalyticsVideos(workspaceId: string): Promise<AnalyticsVideo[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select("id, channel_id, status, created_at, published_at, due_date, video_assignees(user_id)")
    .eq("workspace_id", workspaceId);

  if (error) return [];
  return (data ?? []) as unknown as AnalyticsVideo[];
}
