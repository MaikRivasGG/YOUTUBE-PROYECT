-- ===========================================================================
-- Faceless Studio - Esquema inicial
-- Gestion de produccion de videos de YouTube faceless para equipos.
-- ===========================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

-- Roles dentro de un espacio de trabajo. El orden importa: define la jerarquia
-- usada por las funciones de permisos.
create type public.workspace_role as enum (
  'owner',      -- dueno de la cuenta, control total
  'admin',      -- administrador, control total salvo eliminar el workspace
  'producer',   -- productor / project manager: crea videos y mueve todo
  'writer',     -- guionista
  'voice',      -- locutor / voz en off
  'editor',     -- editor de video
  'designer',   -- disenador de miniaturas
  'publisher',  -- encargado de subir y programar
  'viewer'      -- solo lectura (cliente, observador)
);

-- Etapas del pipeline de produccion (columnas del tablero).
create type public.video_status as enum (
  'idea',       -- Ideas / backlog
  'script',     -- Guion
  'voiceover',  -- Voz en off
  'editing',    -- Edicion
  'thumbnail',  -- Miniatura
  'review',     -- Revision / QA
  'scheduled',  -- Programado
  'published',  -- Publicado
  'archived'    -- Archivado / descartado
);

create type public.video_priority as enum ('low', 'normal', 'high', 'urgent');

create type public.asset_kind as enum (
  'script', 'voiceover', 'footage', 'thumbnail', 'music', 'other'
);

create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

-- ---------------------------------------------------------------------------
-- Perfiles (espejo de auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Datos publicos del usuario, sincronizados desde auth.users.';

-- ---------------------------------------------------------------------------
-- Workspaces (equipos)
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(trim(name)) between 2 and 60),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  created_by    uuid not null references public.profiles (id) on delete restrict,
  video_counter integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.workspace_role not null default 'viewer',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null check (position('@' in email) > 1),
  role         public.workspace_role not null default 'viewer',
  token        text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status       public.invitation_status not null default 'pending',
  invited_by   uuid not null references public.profiles (id) on delete cascade,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- Una sola invitacion viva por email y equipo. El email se guarda siempre en
-- minusculas desde la aplicacion.
create unique index invitations_pending_unique
  on public.invitations (workspace_id, email)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Canales faceless
-- ---------------------------------------------------------------------------
create table public.channels (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 2 and 80),
  handle          text,
  niche           text,
  color           text not null default '#ef4444' check (color ~ '^#[0-9a-fA-F]{6}$'),
  youtube_url     text check (youtube_url is null or youtube_url ~* '^https?://'),
  target_per_week smallint not null default 3 check (target_per_week between 0 and 100),
  is_archived     boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index channels_workspace_idx on public.channels (workspace_id) where is_archived = false;

-- ---------------------------------------------------------------------------
-- Videos (tarjetas del tablero)
-- ---------------------------------------------------------------------------
create table public.videos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  channel_id    uuid references public.channels (id) on delete set null,
  ref           text not null,
  title         text not null check (char_length(trim(title)) between 2 and 160),
  hook          text,
  description   text,
  script_body   text,
  status        public.video_status not null default 'idea',
  priority      public.video_priority not null default 'normal',
  position      double precision not null default 1000,
  tags          text[] not null default '{}',
  due_date      date,
  publish_at    timestamptz,
  published_at  timestamptz,
  youtube_url   text check (youtube_url is null or youtube_url ~* '^https?://'),
  thumbnail_url text check (thumbnail_url is null or thumbnail_url ~* '^https?://'),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, ref)
);

create index videos_board_idx on public.videos (workspace_id, status, position);
create index videos_channel_idx on public.videos (channel_id);
create index videos_due_idx on public.videos (workspace_id, due_date) where due_date is not null;

create table public.video_assignees (
  video_id   uuid not null references public.videos (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create index video_assignees_user_idx on public.video_assignees (user_id);

create table public.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references public.videos (id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 1 and 200),
  stage       public.video_status,
  assignee_id uuid references public.profiles (id) on delete set null,
  is_done     boolean not null default false,
  done_at     timestamptz,
  position    double precision not null default 1000,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index checklist_items_video_idx on public.checklist_items (video_id, position);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references public.videos (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_video_idx on public.comments (video_id, created_at);

create table public.assets (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references public.videos (id) on delete cascade,
  kind       public.asset_kind not null default 'other',
  label      text not null default '',
  url        text not null check (url ~* '^https?://'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index assets_video_idx on public.assets (video_id, created_at);

-- ---------------------------------------------------------------------------
-- Actividad (feed en tiempo real)
-- ---------------------------------------------------------------------------
create table public.activity (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  video_id     uuid references public.videos (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index activity_workspace_idx on public.activity (workspace_id, created_at desc);
create index activity_video_idx on public.activity (video_id, created_at desc);
