import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import type {
  Activity,
  Channel,
  Invitation,
  Notification,
  Pipeline,
  Profile,
  Role,
  RoleStage,
  Stage,
  Video,
  WorkspaceStats,
} from "@/types/database";

/** Video tal y como lo consume el tablero, con asignados y checklist embebidos. */
export interface BoardVideo extends Video {
  video_assignees: { user_id: string }[];
  checklist_items: { id: string; is_done: boolean }[];
}

export interface TeamMember {
  user_id: string;
  created_at: string;
  profile: Profile;
  roles: Role[];
}

/** Todo lo que define como funciona un equipo: flujos, etapas y roles. */
export interface WorkspaceConfig {
  pipelines: Pipeline[];
  stages: Stage[];
  roles: Role[];
  roleStages: RoleStage[];
  members: TeamMember[];
  myRoles: Role[];
  /** Etapas que gestionan los roles del usuario actual. */
  managedStageIds: string[];
}

const BOARD_SELECT = "*, video_assignees(user_id), checklist_items(id, is_done)";

export async function getWorkspaceConfig(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceConfig> {
  const supabase = await supabaseServer();

  const [pipelines, stages, roles, roleStages, members, memberRoles] = await Promise.all([
    supabase.from("pipelines").select("*").eq("workspace_id", workspaceId).order("position"),
    supabase
      .from("stages")
      .select("*, pipelines!inner(workspace_id)")
      .eq("pipelines.workspace_id", workspaceId)
      .order("position"),
    supabase.from("roles").select("*").eq("workspace_id", workspaceId).order("position"),
    supabase
      .from("role_stages")
      .select("*, roles!inner(workspace_id)")
      .eq("roles.workspace_id", workspaceId),
    supabase
      .from("workspace_members")
      .select("user_id, created_at, profiles(*)")
      .eq("workspace_id", workspaceId),
    supabase.from("member_roles").select("user_id, role_id").eq("workspace_id", workspaceId),
  ]);

  const roleList = (roles.data ?? []) as Role[];
  const roleById = new Map(roleList.map((role) => [role.id, role]));
  const rolesByUser = new Map<string, Role[]>();

  for (const link of memberRoles.data ?? []) {
    const role = roleById.get(link.role_id);
    if (!role) continue;
    const list = rolesByUser.get(link.user_id);
    if (list) list.push(role);
    else rolesByUser.set(link.user_id, [role]);
  }

  const team: TeamMember[] = (members.data ?? [])
    .flatMap((member) => {
      const profile = member.profiles as unknown as Profile | null;
      if (!profile) return [];
      return [
        {
          user_id: member.user_id,
          created_at: member.created_at,
          profile,
          roles: (rolesByUser.get(member.user_id) ?? []).sort((a, b) => a.position - b.position),
        },
      ];
    })
    .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name));

  const myRoles = rolesByUser.get(userId) ?? [];
  const myRoleIds = new Set(myRoles.map((role) => role.id));
  const links = (roleStages.data ?? []) as RoleStage[];

  return {
    pipelines: (pipelines.data ?? []) as Pipeline[],
    stages: (stages.data ?? []) as Stage[],
    roles: roleList,
    roleStages: links,
    members: team,
    myRoles,
    managedStageIds: [
      ...new Set(links.filter((link) => myRoleIds.has(link.role_id)).map((l) => l.stage_id)),
    ],
  };
}

export async function getBoardVideos(workspaceId: string): Promise<BoardVideo[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select(BOARD_SELECT)
    .eq("workspace_id", workspaceId)
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
      pipelines: 0,
      by_stage: {},
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

export async function getNotifications(workspaceId: string, limit = 20): Promise<Notification[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

/** Proximos vencimientos: lo que no esta publicado y tiene fecha. */
export async function getUpcoming(workspaceId: string, limit = 6) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, ref, title, priority, due_date, publish_at, channel_id, stage_id, stages!inner(kind)",
    )
    .eq("workspace_id", workspaceId)
    .not("due_date", "is", null)
    .not("stages.kind", "in", "(done,archived)")
    .order("due_date", { ascending: true })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as {
    id: string;
    ref: string;
    title: string;
    priority: Video["priority"];
    due_date: string | null;
    publish_at: string | null;
    channel_id: string | null;
    stage_id: string;
  }[];
}

export interface VideoDetail extends Video {
  video_assignees: { user_id: string }[];
  checklist_items: {
    id: string;
    title: string;
    role_id: string | null;
    is_done: boolean;
    done_at: string | null;
    completed_by: string | null;
    position: number;
    checklist_assignees: { user_id: string }[];
  }[];
  /** Los enlaces entregados por etapa: el checklist "de verdad", el que bloquea avanzar. */
  video_stage_links: {
    stage_id: string;
    url: string;
    completed_by: string | null;
    completed_at: string;
  }[];
  comments: {
    id: string;
    body: string;
    author_id: string | null;
    mentions: string[];
    created_at: string;
  }[];
  assets: { id: string; kind: string; label: string; url: string; created_at: string }[];
}

export async function getVideoDetail(id: string): Promise<VideoDetail | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "*, video_assignees(user_id), checklist_items(id, title, role_id, is_done, done_at, completed_by, position, checklist_assignees(user_id)), video_stage_links(stage_id, url, completed_by, completed_at), comments(id, body, author_id, mentions, created_at), assets(id, kind, label, url, created_at)",
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
    .select(`${BOARD_SELECT}, assigned:video_assignees!inner(user_id), stages!inner(kind)`)
    .eq("workspace_id", workspaceId)
    .eq("assigned.user_id", userId)
    .not("stages.kind", "in", "(done,archived)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(20);

  if (error) return [];
  return (data ?? []) as unknown as BoardVideo[];
}

export interface AnalyticsVideo {
  id: string;
  channel_id: string | null;
  stage_id: string;
  created_at: string;
  published_at: string | null;
  due_date: string | null;
  video_assignees: { user_id: string }[];
}

/** Datos crudos para la pantalla de analiticas. */
export async function getAnalyticsVideos(workspaceId: string): Promise<AnalyticsVideo[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, channel_id, stage_id, created_at, published_at, due_date, video_assignees(user_id)",
    )
    .eq("workspace_id", workspaceId);

  if (error) return [];
  return (data ?? []) as unknown as AnalyticsVideo[];
}

export interface StageDuration {
  stage_id: string;
  avg_hours: number;
  samples: number;
}

/**
 * Tiempo medio que pasa una tarjeta en cada etapa, en horas.
 *
 * Sale del registro de transiciones, no de la fecha de creacion del video, asi
 * que responde a "donde se atasca" y no solo a "cuanto tarda en total".
 */
export async function getStageDurations(workspaceId: string, days = 90): Promise<StageDuration[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("stage_durations", {
    p_workspace: workspaceId,
    p_days: days,
  });

  if (error) return [];
  return data ?? [];
}
