/**
 * Tipos de la base de datos.
 *
 * Se mantienen a mano y alineados con supabase/migrations. Para regenerarlos
 * desde el proyecto real:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "producer"
  | "writer"
  | "voice"
  | "editor"
  | "designer"
  | "publisher"
  | "viewer";

export type VideoStatus =
  | "idea"
  | "script"
  | "voiceover"
  | "editing"
  | "thumbnail"
  | "review"
  | "scheduled"
  | "published"
  | "archived";

export type VideoPriority = "low" | "normal" | "high" | "urgent";

export type AssetKind = "script" | "voiceover" | "footage" | "thumbnail" | "music" | "other";

export type InvitationStatus = "pending" | "accepted" | "revoked";

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
  role: WorkspaceRole;
  created_at: string;
};

export type Invitation = {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
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
  name: string;
  handle: string | null;
  niche: string | null;
  color: string;
  youtube_url: string | null;
  target_per_week: number;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Video = {
  id: string;
  workspace_id: string;
  channel_id: string | null;
  ref: string;
  title: string;
  hook: string | null;
  description: string | null;
  script_body: string | null;
  status: VideoStatus;
  priority: VideoPriority;
  position: number;
  tags: string[];
  due_date: string | null;
  publish_at: string | null;
  published_at: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoAssignee = {
  video_id: string;
  user_id: string;
  created_at: string;
};

export type ChecklistItem = {
  id: string;
  video_id: string;
  title: string;
  stage: VideoStatus | null;
  assignee_id: string | null;
  is_done: boolean;
  done_at: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
};

export type Comment = {
  id: string;
  video_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
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

export type WorkspaceStats = {
  total: number;
  in_progress: number;
  published_this_month: number;
  scheduled: number;
  overdue: number;
  members: number;
  channels: number;
  by_status: Partial<Record<VideoStatus, number>>;
};

type Row<T> = T;
type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

type TableDef<R, I, U = Partial<I>> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<Profile, Insert<Profile, "created_at" | "updated_at" | "avatar_url">>;
      workspaces: TableDef<
        Workspace,
        Insert<Workspace, "id" | "created_at" | "updated_at" | "video_counter">
      >;
      workspace_members: TableDef<WorkspaceMember, Insert<WorkspaceMember, "created_at">>;
      invitations: TableDef<
        Invitation,
        Insert<Invitation, "id" | "token" | "status" | "expires_at" | "accepted_at" | "created_at">
      >;
      channels: TableDef<
        Channel,
        Insert<
          Channel,
          | "id"
          | "handle"
          | "niche"
          | "color"
          | "youtube_url"
          | "target_per_week"
          | "is_archived"
          | "created_by"
          | "created_at"
          | "updated_at"
        >
      >;
      videos: TableDef<
        Video,
        Insert<
          Video,
          | "id"
          | "ref"
          | "channel_id"
          | "hook"
          | "description"
          | "script_body"
          | "status"
          | "priority"
          | "position"
          | "tags"
          | "due_date"
          | "publish_at"
          | "published_at"
          | "youtube_url"
          | "thumbnail_url"
          | "created_by"
          | "created_at"
          | "updated_at"
        >
      >;
      video_assignees: TableDef<VideoAssignee, Insert<VideoAssignee, "created_at">>;
      checklist_items: TableDef<
        ChecklistItem,
        Insert<
          ChecklistItem,
          | "id"
          | "stage"
          | "assignee_id"
          | "is_done"
          | "done_at"
          | "position"
          | "created_by"
          | "created_at"
        >
      >;
      comments: TableDef<Comment, Insert<Comment, "id" | "created_at" | "updated_at">>;
      assets: TableDef<Asset, Insert<Asset, "id" | "kind" | "label" | "created_by" | "created_at">>;
      activity: TableDef<Activity, Insert<Activity, "id" | "payload" | "created_at">>;
    };
    Views: Record<string, never>;
    Functions: {
      create_workspace: {
        Args: { p_name: string; p_slug: string };
        Returns: Row<Workspace>;
      };
      seed_demo_workspace: {
        Args: Record<string, never>;
        Returns: Row<Workspace>;
      };
      move_video: {
        Args: { p_video: string; p_status: VideoStatus; p_position: number };
        Returns: Row<Video>;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: Row<Workspace>;
      };
      invitation_preview: {
        Args: { p_token: string };
        Returns: {
          workspace_name: string;
          role: WorkspaceRole;
          email: string;
          expires_at: string;
        }[];
      };
      workspace_stats: {
        Args: { p_workspace: string };
        Returns: WorkspaceStats;
      };
      has_permission: {
        Args: { p_workspace: string; p_permission: string };
        Returns: boolean;
      };
    };
    Enums: {
      workspace_role: WorkspaceRole;
      video_status: VideoStatus;
      video_priority: VideoPriority;
      asset_kind: AssetKind;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
