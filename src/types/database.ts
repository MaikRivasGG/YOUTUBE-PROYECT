/**
 * Tipos de la base de datos (modelo v2).
 *
 * Las etapas del tablero y los roles del equipo ya no son enums: son filas que
 * cada equipo configura. Lo unico que sigue siendo un enum es `stage_kind`,
 * que no es el nombre de la columna sino lo que significa para el sistema.
 *
 * Para regenerarlos desde el proyecto real:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type StageKind = "backlog" | "work" | "review" | "scheduled" | "done" | "archived";

export type VideoPriority = "low" | "normal" | "high" | "urgent";

export type AssetKind = "script" | "voiceover" | "footage" | "thumbnail" | "music" | "other";

export type InvitationStatus = "pending" | "accepted" | "revoked";

/** Clave de los roles que el sistema protege y no se pueden borrar. */
export type SystemRoleKey = "owner" | "admin";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  video_counter: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  created_at: string;
};

export type Pipeline = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

/** Campos del video que una etapa puede exigir antes de dejar pasar la tarjeta. */
export const REQUIRABLE_FIELDS = [
  "due_date",
  "publish_at",
  "youtube_url",
  "thumbnail_url",
  "channel_id",
  "assignee",
  "asset",
] as const;

export type RequirableField = (typeof REQUIRABLE_FIELDS)[number];

export type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  slug: string;
  color: string;
  kind: StageKind;
  position: number;
  /**
   * Nombre del enlace que esta etapa exige (p. ej. "Enlace del guion").
   * Null: la etapa no pide ningun entregable para dejar avanzar la tarjeta.
   * La etapa ES el paso del checklist: no hay una plantilla aparte.
   */
  deliverable_label: string | null;
  /** Campos del video que tienen que estar rellenos para avanzar. */
  required_fields: RequirableField[];
  created_at: string;
  updated_at: string;
};

export type Role = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  key: SystemRoleKey | null;
  is_system: boolean;
  position: number;
  manage_workspace: boolean;
  manage_members: boolean;
  manage_channels: boolean;
  manage_pipelines: boolean;
  create_videos: boolean;
  delete_videos: boolean;
  edit_videos: boolean;
  assign_videos: boolean;
  move_any_stage: boolean;
  manage_checklist: boolean;
  write_comments: boolean;
  /** Ve el pipeline y las estadisticas de todos los canales, sea o no miembro participante. */
  view_all_channels: boolean;
  created_at: string;
  updated_at: string;
};

export type RoleStage = {
  role_id: string;
  stage_id: string;
};

export type MemberRole = {
  workspace_id: string;
  user_id: string;
  role_id: string;
  created_at: string;
};

export type Invitation = {
  id: string;
  workspace_id: string;
  email: string;
  role_id: string;
  token: string;
  status: InvitationStatus;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type Channel = {
  id: string;
  workspace_id: string;
  pipeline_id: string | null;
  name: string;
  handle: string | null;
  niche: string | null;
  color: string;
  image_url: string | null;
  youtube_url: string | null;
  target_per_week: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Quien es "miembro participante" de un canal: sin esto no lo ve, salvo view_all_channels. */
export type ChannelMember = {
  channel_id: string;
  user_id: string;
  created_at: string;
};

export type Video = {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  stage_id: string;
  channel_id: string | null;
  ref: string;
  title: string;
  hook: string | null;
  description: string | null;
  script_body: string | null;
  priority: VideoPriority;
  position: number;
  tags: string[];
  due_date: string | null;
  publish_at: string | null;
  published_at: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  /** Link de YouTube ajeno usado como referencia visual al crear la tarjeta. */
  reference_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoAssignee = {
  video_id: string;
  user_id: string;
  created_at: string;
};

/**
 * Paso suelto de la tarjeta, sin relacion con el pipeline.
 *
 * El checklist "de verdad" -lo que bloquea avanzar de etapa- son las propias
 * etapas del pipeline con su `deliverable_label` (ver VideoStageLink). Esto es
 * la lista libre para lo que no encaja ahi: notas, subtareas puntuales.
 */
export type ChecklistItem = {
  id: string;
  video_id: string;
  title: string;
  role_id: string | null;
  is_done: boolean;
  done_at: string | null;
  completed_by: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
};

export type ChecklistAssignee = {
  item_id: string;
  user_id: string;
  created_at: string;
};

export type Comment = {
  id: string;
  video_id: string;
  author_id: string | null;
  body: string;
  /** Miembros mencionados con @; el trigger descarta a quien no es del equipo. */
  mentions: string[];
  created_at: string;
  updated_at: string;
};

/**
 * El enlace entregado en una etapa de una tarjeta (el guion, la miniatura...).
 *
 * Solo existe si la etapa pide uno (`stages.deliverable_label` no nulo).
 * Rellenarlo es lo que satisface el requisito de esa etapa para avanzar.
 */
export type VideoStageLink = {
  video_id: string;
  stage_id: string;
  url: string;
  completed_by: string | null;
  completed_at: string;
};

/** Entrada de una tarjeta en una etapa; de aqui salen los tiempos por etapa. */
export type StageTransition = {
  id: number;
  workspace_id: string;
  video_id: string;
  from_stage: string | null;
  to_stage: string;
  actor_id: string | null;
  created_at: string;
};

export type Asset = {
  id: string;
  video_id: string;
  kind: AssetKind;
  label: string;
  url: string;
  created_by: string | null;
  created_at: string;
};

export type Activity = {
  id: number;
  workspace_id: string;
  video_id: string | null;
  actor_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Notification = {
  id: number;
  workspace_id: string;
  user_id: string;
  actor_id: string | null;
  video_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type WorkspaceStats = {
  total: number;
  in_progress: number;
  published_this_month: number;
  scheduled: number;
  overdue: number;
  members: number;
  channels: number;
  pipelines: number;
  /** Numero de videos por id de etapa. */
  by_stage: Record<string, number>;
};

type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

type TableDef<R, I, U = Partial<I>> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: [];
};

type Timestamps = "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<Profile, Insert<Profile, Timestamps | "avatar_url">>;
      workspaces: TableDef<Workspace, Insert<Workspace, "id" | Timestamps | "video_counter">>;
      workspace_members: TableDef<WorkspaceMember, Insert<WorkspaceMember, "created_at">>;
      pipelines: TableDef<
        Pipeline,
        Insert<Pipeline, "id" | Timestamps | "description" | "is_default" | "position">
      >;
      stages: TableDef<
        Stage,
        Insert<
          Stage,
          | "id"
          | Timestamps
          | "color"
          | "kind"
          | "position"
          | "deliverable_label"
          | "required_fields"
        >
      >;
      roles: TableDef<
        Role,
        Insert<
          Role,
          | "id"
          | Timestamps
          | "color"
          | "key"
          | "is_system"
          | "position"
          | "manage_workspace"
          | "manage_members"
          | "manage_channels"
          | "manage_pipelines"
          | "create_videos"
          | "delete_videos"
          | "edit_videos"
          | "assign_videos"
          | "move_any_stage"
          | "manage_checklist"
          | "write_comments"
          | "view_all_channels"
        >
      >;
      role_stages: TableDef<RoleStage, RoleStage>;
      member_roles: TableDef<MemberRole, Insert<MemberRole, "created_at">>;
      invitations: TableDef<
        Invitation,
        Insert<Invitation, "id" | "token" | "status" | "expires_at" | "accepted_at" | "created_at">
      >;
      channels: TableDef<
        Channel,
        Insert<
          Channel,
          | "id"
          | Timestamps
          | "pipeline_id"
          | "handle"
          | "niche"
          | "color"
          | "image_url"
          | "youtube_url"
          | "target_per_week"
          | "is_archived"
          | "created_by"
        >
      >;
      channel_members: TableDef<ChannelMember, Insert<ChannelMember, "created_at">>;
      videos: TableDef<
        Video,
        Insert<
          Video,
          | "id"
          | Timestamps
          | "ref"
          | "pipeline_id"
          | "channel_id"
          | "hook"
          | "description"
          | "script_body"
          | "priority"
          | "position"
          | "tags"
          | "due_date"
          | "publish_at"
          | "published_at"
          | "youtube_url"
          | "thumbnail_url"
          | "reference_url"
          | "created_by"
        >
      >;
      video_assignees: TableDef<VideoAssignee, Insert<VideoAssignee, "created_at">>;
      checklist_items: TableDef<
        ChecklistItem,
        Insert<
          ChecklistItem,
          | "id"
          | "created_at"
          | "role_id"
          | "is_done"
          | "done_at"
          | "completed_by"
          | "position"
          | "created_by"
        >
      >;
      checklist_assignees: TableDef<ChecklistAssignee, Insert<ChecklistAssignee, "created_at">>;
      comments: TableDef<Comment, Insert<Comment, "id" | Timestamps | "mentions">>;
      video_stage_links: TableDef<
        VideoStageLink,
        Insert<VideoStageLink, "completed_by" | "completed_at">
      >;
      stage_transitions: TableDef<
        StageTransition,
        Insert<StageTransition, "id" | "created_at" | "from_stage" | "actor_id">
      >;
      assets: TableDef<Asset, Insert<Asset, "id" | "kind" | "label" | "created_by" | "created_at">>;
      activity: TableDef<Activity, Insert<Activity, "id" | "payload" | "created_at">>;
      notifications: TableDef<
        Notification,
        Insert<Notification, "id" | "payload" | "read_at" | "created_at" | "actor_id" | "video_id">
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_workspace: { Args: { p_name: string; p_slug: string }; Returns: Workspace };
      seed_demo_workspace: { Args: Record<string, never>; Returns: Workspace };
      seed_workspace_defaults: { Args: { p_workspace: string }; Returns: string };
      move_video: {
        Args: { p_video: string; p_stage: string; p_position: number };
        Returns: Video;
      };
      accept_invitation: { Args: { p_token: string }; Returns: Workspace };
      invitation_preview: {
        Args: { p_token: string };
        Returns: {
          workspace_name: string;
          role_name: string;
          email: string;
          expires_at: string;
        }[];
      };
      workspace_stats: { Args: { p_workspace: string }; Returns: WorkspaceStats };
      has_permission: { Args: { p_workspace: string; p_permission: string }; Returns: boolean };
      is_owner: { Args: { p_workspace: string }; Returns: boolean };
      stage_exit_blockers: { Args: { p_video: string; p_stage: string }; Returns: string[] };
      duplicate_pipeline: { Args: { p_pipeline: string; p_name: string }; Returns: string };
      stage_durations: {
        Args: { p_workspace: string; p_days?: number };
        Returns: { stage_id: string; avg_hours: number; samples: number }[];
      };
    };
    Enums: {
      stage_kind: StageKind;
      video_priority: VideoPriority;
      asset_kind: AssetKind;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
