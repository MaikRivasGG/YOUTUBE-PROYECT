-- ===========================================================================
-- Framehouse · instalacion completa en un solo paso
--
-- Pega este fichero entero en el SQL Editor de tu proyecto de Supabase
-- (Dashboard -> SQL Editor -> New query) y pulsa Run. Equivale a aplicar las
-- migraciones de supabase/migrations/ en orden.
--
-- Se puede ejecutar una sola vez sobre un proyecto nuevo y vacio.
-- Generado desde supabase/migrations/ — no editar a mano: si cambias el
-- esquema, regenera con  npm run db:bundle
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 20250101000000_init_schema.sql
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 20250101000100_functions.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Funciones, triggers y RPCs
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Utilidades genericas
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at   before update on public.profiles   for each row execute function public.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger channels_set_updated_at   before update on public.channels   for each row execute function public.set_updated_at();
create trigger videos_set_updated_at     before update on public.videos     for each row execute function public.set_updated_at();
create trigger comments_set_updated_at   before update on public.comments   for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sincronizacion de perfiles con auth.users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'usuario'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Membresia y permisos
--
-- Estas funciones son SECURITY DEFINER para poder leer workspace_members sin
-- disparar recursion infinita en las politicas RLS que dependen de ellas.
-- ---------------------------------------------------------------------------
create or replace function public.current_member_role(p_workspace uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace
    and m.user_id = auth.uid();
$$;

create or replace function public.is_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
  );
$$;

-- Matriz de permisos. Es la fuente de verdad del backend; el cliente replica
-- la misma matriz en src/lib/domain/roles.ts unicamente para pintar la UI.
create or replace function public.has_permission(p_workspace uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case p_permission
      when 'workspace.manage' then r in ('owner', 'admin')
      when 'workspace.delete' then r = 'owner'
      when 'member.manage'    then r in ('owner', 'admin')
      when 'channel.manage'   then r in ('owner', 'admin', 'producer')
      when 'video.create'     then r in ('owner', 'admin', 'producer', 'writer')
      when 'video.delete'     then r in ('owner', 'admin', 'producer')
      when 'video.edit'       then r <> 'viewer'
      when 'video.assign'     then r in ('owner', 'admin', 'producer')
      when 'video.move.any'   then r in ('owner', 'admin', 'producer')
      when 'comment.write'    then r <> 'viewer'
      else false
    end,
    false
  )
  from (select public.current_member_role(p_workspace) as r) as s;
$$;

-- Rol responsable de cada etapa del pipeline.
create or replace function public.stage_role(p_status public.video_status)
returns public.workspace_role
language sql
immutable
as $$
  select case p_status
    when 'idea'      then 'producer'
    when 'script'    then 'writer'
    when 'voiceover' then 'voice'
    when 'editing'   then 'editor'
    when 'thumbnail' then 'designer'
    when 'review'    then 'producer'
    when 'scheduled' then 'publisher'
    when 'published' then 'publisher'
    else 'producer'
  end::public.workspace_role;
$$;

create or replace function public.workspace_of_video(p_video uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.workspace_id from public.videos v where v.id = p_video;
$$;

-- Un miembro puede mover una tarjeta si es productor/admin/owner, si esta
-- asignado al video, o si su rol es responsable de la etapa origen o destino.
create or replace function public.can_move_video(p_video uuid, p_status public.video_status)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_current   public.video_status;
  v_role      public.workspace_role;
begin
  select workspace_id, status into v_workspace, v_current
  from public.videos where id = p_video;

  if v_workspace is null then
    return false;
  end if;

  v_role := public.current_member_role(v_workspace);

  if v_role is null or v_role = 'viewer' then
    return false;
  end if;

  if public.has_permission(v_workspace, 'video.move.any') then
    return true;
  end if;

  if exists (
    select 1 from public.video_assignees a
    where a.video_id = p_video and a.user_id = auth.uid()
  ) then
    return true;
  end if;

  return v_role in (public.stage_role(v_current), public.stage_role(p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- Registro de actividad
-- ---------------------------------------------------------------------------
create or replace function public.log_activity(
  p_workspace uuid,
  p_video uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity (workspace_id, video_id, actor_id, type, payload)
  values (p_workspace, p_video, auth.uid(), p_type, coalesce(p_payload, '{}'::jsonb));
$$;

create or replace function public.videos_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(
      new.workspace_id, new.id, 'video.created',
      jsonb_build_object('title', new.title, 'status', new.status)
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.log_activity(
      new.workspace_id, new.id, 'video.moved',
      jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status)
    );
  elsif tg_op = 'UPDATE' and new.title is distinct from old.title then
    perform public.log_activity(
      new.workspace_id, new.id, 'video.renamed',
      jsonb_build_object('from', old.title, 'to', new.title)
    );
  end if;
  return new;
end;
$$;

create trigger videos_activity
  after insert or update on public.videos
  for each row execute function public.videos_activity_trigger();

create or replace function public.comments_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
begin
  select workspace_id into v_workspace from public.videos where id = new.video_id;
  perform public.log_activity(
    v_workspace, new.video_id, 'comment.created',
    jsonb_build_object('excerpt', left(new.body, 140))
  );
  return new;
end;
$$;

create trigger comments_activity
  after insert on public.comments
  for each row execute function public.comments_activity_trigger();

-- ---------------------------------------------------------------------------
-- Referencia legible por video (VID-0001) y marcas de publicacion
-- ---------------------------------------------------------------------------
create or replace function public.videos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counter integer;
begin
  update public.workspaces
    set video_counter = video_counter + 1
    where id = new.workspace_id
    returning video_counter into v_counter;

  new.ref := 'VID-' || lpad(coalesce(v_counter, 1)::text, 4, '0');
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger videos_set_ref
  before insert on public.videos
  for each row execute function public.videos_before_insert();

-- Guardian del pipeline: se aplica tanto a un UPDATE directo como al RPC
-- move_video, porque auth.uid() sigue siendo el del usuario que llama.
create or replace function public.videos_guard_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and not public.can_move_video(old.id, new.status) then
    raise exception 'FORBIDDEN_STAGE_MOVE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger videos_guard_stage
  before update on public.videos
  for each row execute function public.videos_guard_stage_change();

create or replace function public.videos_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and old.status <> 'published' then
    new.published_at := coalesce(new.published_at, now());
  elsif new.status <> 'published' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger videos_publish_stamp
  before update on public.videos
  for each row execute function public.videos_before_update();

create or replace function public.checklist_done_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.is_done and not coalesce(old.is_done, false) then
    new.done_at := now();
  elsif not new.is_done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger checklist_items_done_stamp
  before insert or update on public.checklist_items
  for each row execute function public.checklist_done_stamp();

-- ---------------------------------------------------------------------------
-- RPCs de aplicacion
-- ---------------------------------------------------------------------------

-- Crea un workspace y deja al creador como owner en una sola transaccion.
create or replace function public.create_workspace(p_name text, p_slug text)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces;
  v_slug text := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 2 then
    v_slug := 'equipo-' || substr(gen_random_uuid()::text, 1, 6);
  end if;

  if exists (select 1 from public.workspaces where slug = v_slug) then
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 4);
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (trim(p_name), v_slug, auth.uid())
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, auth.uid(), 'owner');

  perform public.log_activity(
    v_workspace.id, null, 'workspace.created',
    jsonb_build_object('name', v_workspace.name)
  );

  return v_workspace;
end;
$$;

-- Mueve una tarjeta de columna/posicion validando permisos de etapa.
create or replace function public.move_video(
  p_video uuid,
  p_status public.video_status,
  p_position double precision
)
returns public.videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video public.videos;
begin
  if not public.can_move_video(p_video, p_status) then
    raise exception 'FORBIDDEN_STAGE_MOVE' using errcode = '42501';
  end if;

  update public.videos
    set status = p_status,
        position = p_position
    where id = p_video
    returning * into v_video;

  return v_video;
end;
$$;

-- Acepta una invitacion a partir de su token.
create or replace function public.accept_invitation(p_token text)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.invitations;
  v_workspace  public.workspaces;
  v_email      text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  select * into v_invitation
  from public.invitations
  where token = p_token and status = 'pending'
  for update;

  if v_invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_invitation.expires_at < now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0002';
  end if;

  if lower(v_invitation.email) <> lower(coalesce(v_email, '')) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = v_invitation.id;

  select * into v_workspace from public.workspaces where id = v_invitation.workspace_id;

  perform public.log_activity(
    v_workspace.id, null, 'member.joined',
    jsonb_build_object('role', v_invitation.role)
  );

  return v_workspace;
end;
$$;

-- Detalle de una invitacion por token, sin exponer el resto de la tabla.
create or replace function public.invitation_preview(p_token text)
returns table (workspace_name text, role public.workspace_role, email text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select w.name, i.role, i.email, i.expires_at
  from public.invitations i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token and i.status = 'pending';
$$;

-- Metricas agregadas del dashboard, calculadas en la base de datos.
create or replace function public.workspace_stats(p_workspace uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_member(p_workspace) then '{}'::jsonb
    else jsonb_build_object(
      'total', (select count(*) from public.videos where workspace_id = p_workspace and status <> 'archived'),
      'in_progress', (select count(*) from public.videos where workspace_id = p_workspace and status in ('script','voiceover','editing','thumbnail','review')),
      'published_this_month', (select count(*) from public.videos where workspace_id = p_workspace and status = 'published' and published_at >= date_trunc('month', now())),
      'scheduled', (select count(*) from public.videos where workspace_id = p_workspace and status = 'scheduled'),
      'overdue', (select count(*) from public.videos where workspace_id = p_workspace and due_date < current_date and status not in ('published','archived')),
      'members', (select count(*) from public.workspace_members where workspace_id = p_workspace),
      'channels', (select count(*) from public.channels where workspace_id = p_workspace and is_archived = false),
      'by_status', (
        select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
        from (
          select status::text as status, count(*) as total
          from public.videos
          where workspace_id = p_workspace and status <> 'archived'
          group by status
        ) s
      )
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 20250101000200_rls.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Row Level Security
-- Regla general: todo dato pertenece a un workspace y solo lo ven sus miembros.
-- La escritura se valida con public.has_permission(workspace, permiso).
-- ===========================================================================

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations       enable row level security;
alter table public.channels          enable row level security;
alter table public.videos            enable row level security;
alter table public.video_assignees   enable row level security;
alter table public.checklist_items   enable row level security;
alter table public.comments          enable row level security;
alter table public.assets            enable row level security;
alter table public.activity          enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: ver companeros de equipo"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid() and theirs.user_id = public.profiles.id
    )
  );

create policy "profiles: editar el propio"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create policy "workspaces: ver los propios"
  on public.workspaces for select
  to authenticated
  using (public.is_member(id));

create policy "workspaces: crear"
  on public.workspaces for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "workspaces: editar con permiso"
  on public.workspaces for update
  to authenticated
  using (public.has_permission(id, 'workspace.manage'))
  with check (public.has_permission(id, 'workspace.manage'));

create policy "workspaces: eliminar solo owner"
  on public.workspaces for delete
  to authenticated
  using (public.has_permission(id, 'workspace.delete'));

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------
create policy "miembros: ver los del equipo"
  on public.workspace_members for select
  to authenticated
  using (public.is_member(workspace_id));

create policy "miembros: alta con permiso"
  on public.workspace_members for insert
  to authenticated
  with check (public.has_permission(workspace_id, 'member.manage'));

-- Nadie puede auto-promoverse: cambiar roles exige permiso y no se permite
-- modificar al owner salvo que quien actua sea el propio owner.
create policy "miembros: cambiar rol con permiso"
  on public.workspace_members for update
  to authenticated
  using (
    public.has_permission(workspace_id, 'member.manage')
    and (role <> 'owner' or public.current_member_role(workspace_id) = 'owner')
  )
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and user_id <> auth.uid()
  );

create policy "miembros: baja con permiso o salir del equipo"
  on public.workspace_members for delete
  to authenticated
  using (
    (user_id = auth.uid() and role <> 'owner')
    or (
      public.has_permission(workspace_id, 'member.manage')
      and role <> 'owner'
      and user_id <> auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
create policy "invitaciones: ver con permiso"
  on public.invitations for select
  to authenticated
  using (public.has_permission(workspace_id, 'member.manage'));

create policy "invitaciones: crear con permiso"
  on public.invitations for insert
  to authenticated
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and invited_by = auth.uid()
    and role <> 'owner'
  );

create policy "invitaciones: revocar con permiso"
  on public.invitations for update
  to authenticated
  using (public.has_permission(workspace_id, 'member.manage'))
  with check (public.has_permission(workspace_id, 'member.manage'));

create policy "invitaciones: eliminar con permiso"
  on public.invitations for delete
  to authenticated
  using (public.has_permission(workspace_id, 'member.manage'));

-- ---------------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------------
create policy "canales: ver los del equipo"
  on public.channels for select
  to authenticated
  using (public.is_member(workspace_id));

create policy "canales: crear con permiso"
  on public.channels for insert
  to authenticated
  with check (public.has_permission(workspace_id, 'channel.manage'));

create policy "canales: editar con permiso"
  on public.channels for update
  to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'))
  with check (public.has_permission(workspace_id, 'channel.manage'));

create policy "canales: eliminar con permiso"
  on public.channels for delete
  to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'));

-- ---------------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------------
create policy "videos: ver los del equipo"
  on public.videos for select
  to authenticated
  using (public.is_member(workspace_id));

create policy "videos: crear con permiso"
  on public.videos for insert
  to authenticated
  with check (public.has_permission(workspace_id, 'video.create'));

-- Editar campos exige permiso de edicion. El cambio de etapa lleva ademas su
-- propia validacion por rol, en el trigger videos_guard_stage_change: asi un
-- editor puede corregir la miniatura de una tarjeta que esta en guion, pero no
-- puede saltarsela de etapa.
create policy "videos: editar con permiso"
  on public.videos for update
  to authenticated
  using (public.has_permission(workspace_id, 'video.edit'))
  with check (public.has_permission(workspace_id, 'video.edit'));

create policy "videos: eliminar con permiso"
  on public.videos for delete
  to authenticated
  using (public.has_permission(workspace_id, 'video.delete'));

-- ---------------------------------------------------------------------------
-- video_assignees
-- ---------------------------------------------------------------------------
create policy "asignaciones: ver las del equipo"
  on public.video_assignees for select
  to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "asignaciones: crear con permiso"
  on public.video_assignees for insert
  to authenticated
  with check (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = auth.uid()
  );

create policy "asignaciones: eliminar con permiso"
  on public.video_assignees for delete
  to authenticated
  using (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- checklist_items
-- ---------------------------------------------------------------------------
create policy "checklist: ver las del equipo"
  on public.checklist_items for select
  to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "checklist: crear con permiso"
  on public.checklist_items for insert
  to authenticated
  with check (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

create policy "checklist: editar con permiso"
  on public.checklist_items for update
  to authenticated
  using (public.has_permission(public.workspace_of_video(video_id), 'video.edit'))
  with check (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

create policy "checklist: eliminar con permiso"
  on public.checklist_items for delete
  to authenticated
  using (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create policy "comentarios: ver los del equipo"
  on public.comments for select
  to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "comentarios: escribir"
  on public.comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.has_permission(public.workspace_of_video(video_id), 'comment.write')
  );

create policy "comentarios: editar el propio"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "comentarios: borrar el propio o moderar"
  on public.comments for delete
  to authenticated
  using (
    author_id = auth.uid()
    or public.has_permission(public.workspace_of_video(video_id), 'workspace.manage')
  );

-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------
create policy "assets: ver los del equipo"
  on public.assets for select
  to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "assets: crear con permiso"
  on public.assets for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

create policy "assets: eliminar con permiso"
  on public.assets for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.has_permission(public.workspace_of_video(video_id), 'video.delete')
  );

-- ---------------------------------------------------------------------------
-- activity (solo lectura para la app; se escribe via SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create policy "actividad: ver la del equipo"
  on public.activity for select
  to authenticated
  using (public.is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 20250101000300_realtime.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Realtime: replicacion de los cambios del tablero a los clientes conectados.
-- Con REPLICA IDENTITY FULL los eventos UPDATE/DELETE llegan con la fila
-- completa, necesario para que el tablero se reconcilie sin refetch.
-- ===========================================================================

alter table public.videos          replica identity full;
alter table public.video_assignees replica identity full;
alter table public.checklist_items replica identity full;
alter table public.comments        replica identity full;
alter table public.channels        replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table public.videos;
alter publication supabase_realtime add table public.video_assignees;
alter publication supabase_realtime add table public.checklist_items;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.activity;

-- ---------------------------------------------------------------------------
-- 20250101000400_demo_seed.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Datos de demostracion.
-- Funcion invocable desde el onboarding para crear un equipo completo con
-- canales, videos, checklists y comentarios de ejemplo.
-- ===========================================================================

create or replace function public.seed_demo_workspace()
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws       public.workspaces;
  v_tech     uuid;
  v_curiosa  uuid;
  v_local    uuid;
  v_mesa     uuid;
  v_video    uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_ws := public.create_workspace('Equipo principal', 'equipo-principal');

  insert into public.channels (workspace_id, name, handle, niche, color, target_per_week, created_by)
  values
    (v_ws.id, 'Pulso Tech',    '@pulsotech',    'Tecnología',  '#3b82f6', 3, auth.uid()),
    (v_ws.id, 'Mente Curiosa', '@mentecuriosa', 'Divulgación', '#8b5cf6', 2, auth.uid()),
    (v_ws.id, 'Ruta Local',    '@rutalocal',    'Viajes',      '#22c55e', 2, auth.uid()),
    (v_ws.id, 'Mesa Abierta',  '@mesaabierta',  'Cocina',      '#f59e0b', 3, auth.uid());

  select id into v_tech    from public.channels where workspace_id = v_ws.id and name = 'Pulso Tech';
  select id into v_curiosa from public.channels where workspace_id = v_ws.id and name = 'Mente Curiosa';
  select id into v_local   from public.channels where workspace_id = v_ws.id and name = 'Ruta Local';
  select id into v_mesa    from public.channels where workspace_id = v_ws.id and name = 'Mesa Abierta';

  insert into public.videos
    (workspace_id, channel_id, title, hook, status, priority, position, due_date, created_by, tags)
  values
    (v_ws.id, v_tech,    '¿Por qué fallan las baterías?',   'El 80% de las baterías mueren por una sola razón', 'idea',      'normal', 1000, current_date + 6, auth.uid(), '{tecnologia}'),
    (v_ws.id, v_local,   'Mercados secretos de Madrid',   'Tres mercados que ningun turista conoce',          'idea',      'low',    2000, current_date + 9, auth.uid(), '{viajes}'),
    (v_ws.id, v_curiosa, 'La paradoja del tiempo',        'Por qué el tiempo pasa más rápido al envejecer',   'script',    'high',   1000, current_date + 2, auth.uid(), '{divulgacion}'),
    (v_ws.id, v_mesa,    'El café perfecto en casa',      'El error que arruina tu café cada mañana',         'script',    'normal', 2000, current_date + 5, auth.uid(), '{cocina}'),
    (v_ws.id, v_local,   'Un día con una paramédica',     '12 horas dentro de una ambulancia',                'voiceover', 'high',   1000, current_date,     auth.uid(), '{documental}'),
    (v_ws.id, v_tech,    'Probamos el móvil más fino',    'Tan fino que casi se dobla solo',                  'editing',   'urgent', 1000, current_date,     auth.uid(), '{reviews}'),
    (v_ws.id, v_mesa,    '5 cenas por menos de 3€',  'Cenar bien gastando menos que un café',            'editing',   'high',   2000, current_date + 3, auth.uid(), '{cocina}'),
    (v_ws.id, v_curiosa, 'Dormir 8 horas no basta',       'La ciencia del sueño que nadie te cuenta',         'review',    'high',   1000, current_date + 1, auth.uid(), '{salud}'),
    (v_ws.id, v_tech,    'La IA que ya usas sin saberlo', 'La usas 40 veces al día sin darte cuenta',         'scheduled', 'normal', 1000, current_date + 1, auth.uid(), '{ia}'),
    (v_ws.id, v_local,   '24 horas en Toledo',            'Toledo en un día, sin colas y sin gastar',         'scheduled', 'normal', 2000, current_date + 4, auth.uid(), '{viajes}');

  update public.videos
    set publish_at = (current_date + 1)::timestamptz + interval '18 hours'
    where workspace_id = v_ws.id and status = 'scheduled';

  -- Todo el equipo demo es el propio usuario: se asigna a si mismo.
  insert into public.video_assignees (video_id, user_id)
  select id, auth.uid() from public.videos where workspace_id = v_ws.id;

  for v_video in select id from public.videos where workspace_id = v_ws.id loop
    insert into public.checklist_items (video_id, title, stage, assignee_id, is_done, position, created_by)
    values
      (v_video, 'Investigación y fuentes', 'idea',      auth.uid(), true,  1000, auth.uid()),
      (v_video, 'Guion aprobado',          'script',    auth.uid(), false, 2000, auth.uid()),
      (v_video, 'Voz en off grabada',      'voiceover', auth.uid(), false, 3000, auth.uid()),
      (v_video, 'Miniatura A/B',           'thumbnail', auth.uid(), false, 4000, auth.uid());
  end loop;

  insert into public.comments (video_id, author_id, body)
  select id, auth.uid(), 'Subo el feedback del guion antes de las 18:00.'
  from public.videos where workspace_id = v_ws.id and status = 'review';

  return v_ws;
end;
$$;

-- ---------------------------------------------------------------------------
-- 20250101000500_harden_grants.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Endurecimiento de permisos sobre las funciones
--
-- PostgreSQL concede EXECUTE a PUBLIC por defecto y Supabase ademas lo concede
-- a los roles anon y authenticated. Como PostgREST publica cualquier funcion de
-- `public` en /rest/v1/rpc/, eso dejaba expuestas funciones internas.
--
-- El caso grave era log_activity(): SECURITY DEFINER y sin comprobar membresia,
-- asi que cualquier usuario con sesion podia escribir actividad inventada en el
-- feed de un equipo ajeno. Aqui se cierra todo y se vuelve a abrir solo lo que
-- la aplicacion necesita.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. search_path fijo en las funciones que no lo tenian
-- ---------------------------------------------------------------------------
alter function public.set_updated_at()        set search_path = public;
alter function public.stage_role(public.video_status) set search_path = public;
alter function public.videos_before_update()  set search_path = public;
alter function public.checklist_done_stamp()  set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Funciones internas: fuera de la API
--
-- Las funciones de trigger las invoca el propio motor, que comprueba el
-- permiso al crear el trigger y no en cada fila, asi que revocarlas no afecta
-- al funcionamiento (verificado en supabase/tests/01_policies.sql).
-- ---------------------------------------------------------------------------
revoke all on function public.set_updated_at()             from public, anon, authenticated;
revoke all on function public.handle_new_user()            from public, anon, authenticated;
revoke all on function public.videos_activity_trigger()    from public, anon, authenticated;
revoke all on function public.comments_activity_trigger()  from public, anon, authenticated;
revoke all on function public.videos_before_insert()       from public, anon, authenticated;
revoke all on function public.videos_before_update()       from public, anon, authenticated;
revoke all on function public.videos_guard_stage_change()  from public, anon, authenticated;
revoke all on function public.checklist_done_stamp()       from public, anon, authenticated;
revoke all on function public.stage_role(public.video_status) from public, anon, authenticated;

-- Escribe en `activity` saltandose RLS: solo puede llamarla el codigo del
-- servidor, nunca un cliente.
revoke all on function public.log_activity(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

-- can_move_video solo se usa dentro del trigger guardian y del RPC move_video.
revoke all on function public.can_move_video(uuid, public.video_status)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ayudantes de permisos: los necesitan las politicas RLS, que se evaluan
--    con el rol de quien consulta.
-- ---------------------------------------------------------------------------
revoke all on function public.is_member(uuid)                  from public, anon;
revoke all on function public.current_member_role(uuid)        from public, anon;
revoke all on function public.has_permission(uuid, text)       from public, anon;
revoke all on function public.workspace_of_video(uuid)         from public, anon;

grant execute on function public.is_member(uuid)            to authenticated;
grant execute on function public.current_member_role(uuid)  to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.workspace_of_video(uuid)   to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPCs de la aplicacion: solo con sesion iniciada
-- ---------------------------------------------------------------------------
revoke all on function public.create_workspace(text, text)                          from public, anon;
revoke all on function public.seed_demo_workspace()                                 from public, anon;
revoke all on function public.move_video(uuid, public.video_status, double precision) from public, anon;
revoke all on function public.accept_invitation(text)                               from public, anon;
revoke all on function public.workspace_stats(uuid)                                 from public, anon;

grant execute on function public.create_workspace(text, text)                          to authenticated;
grant execute on function public.seed_demo_workspace()                                 to authenticated;
grant execute on function public.move_video(uuid, public.video_status, double precision) to authenticated;
grant execute on function public.accept_invitation(text)                               to authenticated;
grant execute on function public.workspace_stats(uuid)                                 to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Excepcion: la vista previa de una invitacion la abre alguien que todavia
--    no ha iniciado sesion. Devuelve solo el equipo y el rol de ese token.
-- ---------------------------------------------------------------------------
revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 20250101000600_performance.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Rendimiento
--
-- 1. auth.uid() dentro de una politica se reevalua por cada fila. Envuelto en
--    (select auth.uid()) Postgres lo calcula una vez por consulta (InitPlan).
--    Es la recomendacion del linter de Supabase y se nota en tablas grandes.
-- 2. Indices en las claves foraneas que no los tenian: sin ellos, borrar un
--    perfil o un workspace obliga a recorrer la tabla hija entera.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Politicas reescritas con (select auth.uid())
-- ---------------------------------------------------------------------------
drop policy "profiles: ver companeros de equipo" on public.profiles;
create policy "profiles: ver companeros de equipo"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = public.profiles.id
    )
  );

drop policy "profiles: editar el propio" on public.profiles;
create policy "profiles: editar el propio"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy "workspaces: crear" on public.workspaces;
create policy "workspaces: crear"
  on public.workspaces for insert
  to authenticated
  with check (created_by = (select auth.uid()));

drop policy "miembros: cambiar rol con permiso" on public.workspace_members;
create policy "miembros: cambiar rol con permiso"
  on public.workspace_members for update
  to authenticated
  using (
    public.has_permission(workspace_id, 'member.manage')
    and (role <> 'owner' or public.current_member_role(workspace_id) = 'owner')
  )
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and user_id <> (select auth.uid())
  );

drop policy "miembros: baja con permiso o salir del equipo" on public.workspace_members;
create policy "miembros: baja con permiso o salir del equipo"
  on public.workspace_members for delete
  to authenticated
  using (
    (user_id = (select auth.uid()) and role <> 'owner')
    or (
      public.has_permission(workspace_id, 'member.manage')
      and role <> 'owner'
      and user_id <> (select auth.uid())
    )
  );

drop policy "invitaciones: crear con permiso" on public.invitations;
create policy "invitaciones: crear con permiso"
  on public.invitations for insert
  to authenticated
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and invited_by = (select auth.uid())
    and role <> 'owner'
  );

drop policy "asignaciones: crear con permiso" on public.video_assignees;
create policy "asignaciones: crear con permiso"
  on public.video_assignees for insert
  to authenticated
  with check (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = (select auth.uid())
  );

drop policy "asignaciones: eliminar con permiso" on public.video_assignees;
create policy "asignaciones: eliminar con permiso"
  on public.video_assignees for delete
  to authenticated
  using (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = (select auth.uid())
  );

drop policy "comentarios: escribir" on public.comments;
create policy "comentarios: escribir"
  on public.comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.has_permission(public.workspace_of_video(video_id), 'comment.write')
  );

drop policy "comentarios: editar el propio" on public.comments;
create policy "comentarios: editar el propio"
  on public.comments for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy "comentarios: borrar el propio o moderar" on public.comments;
create policy "comentarios: borrar el propio o moderar"
  on public.comments for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.has_permission(public.workspace_of_video(video_id), 'workspace.manage')
  );

drop policy "assets: crear con permiso" on public.assets;
create policy "assets: crear con permiso"
  on public.assets for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "assets: eliminar con permiso" on public.assets;
create policy "assets: eliminar con permiso"
  on public.assets for delete
  to authenticated
  using (
    created_by = (select auth.uid())
    or public.has_permission(public.workspace_of_video(video_id), 'video.delete')
  );

-- ---------------------------------------------------------------------------
-- 2. Indices en claves foraneas sin cobertura
-- ---------------------------------------------------------------------------
create index if not exists workspaces_created_by_idx      on public.workspaces (created_by);
create index if not exists channels_created_by_idx        on public.channels (created_by);
create index if not exists videos_created_by_idx          on public.videos (created_by);
create index if not exists invitations_invited_by_idx     on public.invitations (invited_by);
create index if not exists checklist_items_assignee_idx   on public.checklist_items (assignee_id);
create index if not exists checklist_items_created_by_idx on public.checklist_items (created_by);
create index if not exists comments_author_idx            on public.comments (author_id);
create index if not exists assets_created_by_idx          on public.assets (created_by);
create index if not exists activity_actor_idx             on public.activity (actor_id);

-- ---------------------------------------------------------------------------
-- 20250101000700_configurable_model.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- v2 · Pipelines, etapas y roles configurables por equipo
--
-- Hasta aqui las etapas del tablero y los roles del equipo eran enums de
-- Postgres escritos a fuego. Ahora son datos: cada equipo define sus propios
-- pipelines (varios), sus etapas y sus roles, y que etapas gestiona cada rol.
--
-- Lo unico que sigue siendo un enum es `stage_kind`: no es el nombre de la
-- columna (ese lo pone el usuario) sino lo que la etapa SIGNIFICA para el
-- sistema, para saber cuando sellar la fecha de publicacion o que columnas
-- quedan fuera del tablero.
-- ===========================================================================

create type public.stage_kind as enum (
  'backlog',    -- ideas sin empezar
  'work',       -- trabajo en curso
  'review',     -- control de calidad
  'scheduled',  -- listo y con fecha
  'done',       -- publicado: sella published_at
  'archived'    -- fuera del tablero
);

-- ---------------------------------------------------------------------------
-- Pipelines: un equipo puede tener varios flujos con nombre
-- ---------------------------------------------------------------------------
create table public.pipelines (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 2 and 60),
  description  text,
  is_default   boolean not null default false,
  position     double precision not null default 1000,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index pipelines_workspace_idx on public.pipelines (workspace_id, position);

-- Un solo pipeline por defecto en cada equipo.
create unique index pipelines_single_default
  on public.pipelines (workspace_id)
  where is_default;

-- ---------------------------------------------------------------------------
-- Etapas: las columnas del tablero
-- ---------------------------------------------------------------------------
create table public.stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 40),
  slug        text not null check (slug ~ '^[a-z0-9-]{1,40}$'),
  color       text not null default '#94a3b8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  kind        public.stage_kind not null default 'work',
  position    double precision not null default 1000,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pipeline_id, slug)
);

create index stages_pipeline_idx on public.stages (pipeline_id, position);

-- ---------------------------------------------------------------------------
-- Roles: nombre y permisos definidos por el equipo
-- ---------------------------------------------------------------------------
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 2 and 40),
  color        text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- 'owner' y 'admin' son roles de sistema: no se borran ni pierden permisos.
  key          text check (key in ('owner', 'admin')),
  is_system    boolean not null default false,
  position     double precision not null default 1000,

  -- Permisos generales del rol
  manage_workspace boolean not null default false,
  manage_members   boolean not null default false,
  manage_channels  boolean not null default false,
  manage_pipelines boolean not null default false,
  create_videos    boolean not null default false,
  delete_videos    boolean not null default false,
  edit_videos      boolean not null default true,
  assign_videos    boolean not null default false,
  move_any_stage   boolean not null default false,
  write_comments   boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index roles_workspace_idx on public.roles (workspace_id, position);

create unique index roles_system_key_unique
  on public.roles (workspace_id, key)
  where key is not null;

-- Que etapas gestiona cada rol.
create table public.role_stages (
  role_id  uuid not null references public.roles (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  primary key (role_id, stage_id)
);

create index role_stages_stage_idx on public.role_stages (stage_id);

-- Un miembro puede llevar varios roles a la vez.
create table public.member_roles (
  workspace_id uuid not null,
  user_id      uuid not null,
  role_id      uuid not null references public.roles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id, role_id),
  foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

create index member_roles_user_idx on public.member_roles (workspace_id, user_id);
create index member_roles_role_idx on public.member_roles (role_id);

-- ---------------------------------------------------------------------------
-- Columnas nuevas en las tablas existentes
-- ---------------------------------------------------------------------------
alter table public.channels
  add column pipeline_id uuid references public.pipelines (id) on delete set null,
  add column image_url   text check (image_url is null or image_url ~* '^https?://');

alter table public.videos
  add column pipeline_id uuid references public.pipelines (id) on delete restrict,
  add column stage_id    uuid references public.stages (id) on delete restrict;

alter table public.checklist_items
  add column stage_id     uuid references public.stages (id) on delete set null,
  add column role_id      uuid references public.roles (id) on delete set null,
  add column completed_by uuid references public.profiles (id) on delete set null;

-- Varios responsables por paso de la checklist, o ninguno (paso abierto).
create table public.checklist_assignees (
  item_id    uuid not null references public.checklist_items (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create index checklist_assignees_user_idx on public.checklist_assignees (user_id);

-- ---------------------------------------------------------------------------
-- Plantilla por defecto
--
-- Todo equipo nuevo arranca con el pipeline y los roles que hasta ahora
-- estaban escritos a fuego. La diferencia es que ahora son editables.
-- ---------------------------------------------------------------------------
create or replace function public.seed_workspace_defaults(p_workspace uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline uuid;
  v_role     uuid;
begin
  insert into public.pipelines (workspace_id, name, description, is_default, position)
  values (p_workspace, 'Produccion', 'Flujo principal de video', true, 1000)
  returning id into v_pipeline;

  insert into public.stages (pipeline_id, slug, name, color, kind, position) values
    (v_pipeline, 'idea',      'Ideas',      '#94a3b8', 'backlog',   1000),
    (v_pipeline, 'script',    'Guion',      '#3b82f6', 'work',      2000),
    (v_pipeline, 'voiceover', 'Grabacion',  '#ef4444', 'work',      3000),
    (v_pipeline, 'editing',   'Edicion',    '#f59e0b', 'work',      4000),
    (v_pipeline, 'thumbnail', 'Miniatura',  '#d946ef', 'work',      5000),
    (v_pipeline, 'review',    'Revision',   '#8b5cf6', 'review',    6000),
    (v_pipeline, 'scheduled', 'Programado', '#22c55e', 'scheduled', 7000),
    (v_pipeline, 'published', 'Publicado',  '#0d9488', 'done',      8000),
    (v_pipeline, 'archived',  'Archivado',  '#cbd5e1', 'archived',  9000);

  -- Roles de sistema: no se borran ni se les quitan permisos.
  insert into public.roles (
    workspace_id, name, color, key, is_system, position,
    manage_workspace, manage_members, manage_channels, manage_pipelines,
    create_videos, delete_videos, edit_videos, assign_videos, move_any_stage, write_comments
  ) values
    (p_workspace, 'Propietario',   '#f59e0b', 'owner', true, 1000,
     true, true, true, true, true, true, true, true, true, true),
    (p_workspace, 'Administrador', '#ef4444', 'admin', true, 2000,
     true, true, true, true, true, true, true, true, true, true);

  -- Productor: lleva la produccion entera pero no toca la configuracion.
  insert into public.roles (
    workspace_id, name, color, position,
    manage_channels, create_videos, delete_videos, assign_videos, move_any_stage
  ) values (p_workspace, 'Productor', '#f97316', 3000, true, true, true, true, true)
  returning id into v_role;

  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages
  where pipeline_id = v_pipeline and slug in ('idea', 'review');

  -- Roles de linea: cada uno manda en su etapa.
  insert into public.roles (workspace_id, name, color, position, create_videos)
  values (p_workspace, 'Guionista', '#3b82f6', 4000, true)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages where pipeline_id = v_pipeline and slug = 'script';

  insert into public.roles (workspace_id, name, color, position)
  values (p_workspace, 'Locutor', '#ef4444', 5000)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages where pipeline_id = v_pipeline and slug = 'voiceover';

  insert into public.roles (workspace_id, name, color, position)
  values (p_workspace, 'Editor', '#8b5cf6', 6000)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages where pipeline_id = v_pipeline and slug = 'editing';

  insert into public.roles (workspace_id, name, color, position)
  values (p_workspace, 'Disenador', '#d946ef', 7000)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages where pipeline_id = v_pipeline and slug = 'thumbnail';

  insert into public.roles (workspace_id, name, color, position)
  values (p_workspace, 'Publicador', '#22c55e', 8000)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages
  where pipeline_id = v_pipeline and slug in ('scheduled', 'published');

  -- Observador: solo mira.
  insert into public.roles (workspace_id, name, color, position, edit_videos, write_comments)
  values (p_workspace, 'Observador', '#94a3b8', 9000, false, false);

  return v_pipeline;
end;
$$;

-- ---------------------------------------------------------------------------
-- Traspaso de los datos que ya existen
-- ---------------------------------------------------------------------------
do $$
declare
  v_ws       record;
  v_pipeline uuid;
begin
  for v_ws in select id from public.workspaces loop
    v_pipeline := public.seed_workspace_defaults(v_ws.id);

    -- Cada miembro conserva su rol, ahora como fila de member_roles.
    insert into public.member_roles (workspace_id, user_id, role_id)
    select m.workspace_id, m.user_id, r.id
    from public.workspace_members m
    join public.roles r
      on r.workspace_id = m.workspace_id
     and r.name = case m.role
           when 'owner'     then 'Propietario'
           when 'admin'     then 'Administrador'
           when 'producer'  then 'Productor'
           when 'writer'    then 'Guionista'
           when 'voice'     then 'Locutor'
           when 'editor'    then 'Editor'
           when 'designer'  then 'Disenador'
           when 'publisher' then 'Publicador'
           else 'Observador'
         end
    where m.workspace_id = v_ws.id
    on conflict do nothing;

    -- Los canales heredan el pipeline por defecto.
    update public.channels set pipeline_id = v_pipeline where workspace_id = v_ws.id;

    -- Cada video aterriza en la etapa con el mismo identificador que su
    -- antiguo estado.
    update public.videos v
      set pipeline_id = v_pipeline,
          stage_id = s.id
    from public.stages s
    where s.pipeline_id = v_pipeline
      and s.slug = v.status::text
      and v.workspace_id = v_ws.id;

    update public.checklist_items c
      set stage_id = s.id
    from public.stages s, public.videos v
    where v.id = c.video_id
      and v.workspace_id = v_ws.id
      and s.pipeline_id = v_pipeline
      and s.slug = c.stage::text;
  end loop;
end;
$$;

-- Los responsables sueltos de la checklist pasan a la tabla de varios.
insert into public.checklist_assignees (item_id, user_id)
select id, assignee_id from public.checklist_items where assignee_id is not null
on conflict do nothing;

-- Las invitaciones tambien pasan a apuntar a un rol concreto del equipo.
alter table public.invitations
  add column role_id uuid references public.roles (id) on delete cascade;

update public.invitations i
  set role_id = r.id
from public.roles r
where r.workspace_id = i.workspace_id
  and r.name = case i.role
        when 'admin'     then 'Administrador'
        when 'producer'  then 'Productor'
        when 'writer'    then 'Guionista'
        when 'voice'     then 'Locutor'
        when 'editor'    then 'Editor'
        when 'designer'  then 'Disenador'
        when 'publisher' then 'Publicador'
        else 'Observador'
      end;

-- ---------------------------------------------------------------------------
-- Retirada del modelo antiguo
--
-- Las politicas y las funciones que hablaban de los enums se eliminan aqui y
-- se rehacen enteras en la migracion siguiente, ya sobre roles y etapas. Se
-- borran todas de golpe para no dejar ninguna huerfana apuntando a una funcion
-- que ya no existe.
-- ---------------------------------------------------------------------------
do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format(
      'drop policy %I on %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename
    );
  end loop;
end;
$$;

drop function if exists public.stage_role(public.video_status) cascade;
drop function if exists public.can_move_video(uuid, public.video_status) cascade;
drop function if exists public.move_video(uuid, public.video_status, double precision) cascade;
drop function if exists public.videos_guard_stage_change() cascade;
drop function if exists public.videos_before_update() cascade;
drop function if exists public.videos_activity_trigger() cascade;
drop function if exists public.workspace_stats(uuid) cascade;
drop function if exists public.has_permission(uuid, text) cascade;
drop function if exists public.current_member_role(uuid) cascade;
drop function if exists public.create_workspace(text, text) cascade;
drop function if exists public.accept_invitation(text) cascade;
drop function if exists public.invitation_preview(text) cascade;
drop function if exists public.seed_demo_workspace() cascade;

alter table public.videos          drop column status;
alter table public.checklist_items drop column stage, drop column assignee_id;
alter table public.workspace_members drop column role;
alter table public.invitations     drop column role;

drop type public.video_status;
drop type public.workspace_role;

-- Ya sin datos antiguos que respetar: un video siempre vive en una etapa.
alter table public.videos
  alter column pipeline_id set not null,
  alter column stage_id    set not null;

alter table public.invitations
  alter column role_id set not null;

create index videos_stage_idx on public.videos (workspace_id, stage_id, position);
create index videos_pipeline_idx on public.videos (pipeline_id);

create trigger pipelines_set_updated_at before update on public.pipelines
  for each row execute function public.set_updated_at();
create trigger stages_set_updated_at before update on public.stages
  for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 20250101000800_permissions_v2.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- v2 · Permisos, pipeline y RPCs sobre roles y etapas configurables
--
-- Un miembro puede llevar varios roles: un permiso se concede si CUALQUIERA de
-- sus roles lo concede. Mover una tarjeta depende de que etapas gestiona cada
-- rol (role_stages), que es tambien lo que decide a quien se avisa.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Consultas de apoyo
-- ---------------------------------------------------------------------------
create or replace function public.is_owner(p_workspace uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.member_roles mr
    join public.roles r on r.id = mr.role_id
    where mr.workspace_id = p_workspace
      and mr.user_id = auth.uid()
      and r.key = 'owner'
  );
$$;

-- Suma de los permisos de todos los roles del miembro.
create or replace function public.has_permission(p_workspace uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    bool_or(
      case p_permission
        when 'workspace.manage' then r.manage_workspace
        when 'workspace.delete' then r.key = 'owner'
        when 'member.manage'    then r.manage_members
        when 'channel.manage'   then r.manage_channels
        when 'pipeline.manage'  then r.manage_pipelines
        when 'video.create'     then r.create_videos
        when 'video.delete'     then r.delete_videos
        when 'video.edit'       then r.edit_videos
        when 'video.assign'     then r.assign_videos
        when 'video.move.any'   then r.move_any_stage
        when 'comment.write'    then r.write_comments
        else false
      end
    ),
    false
  )
  from public.member_roles mr
  join public.roles r on r.id = mr.role_id
  where mr.workspace_id = p_workspace and mr.user_id = auth.uid();
$$;

create or replace function public.workspace_of_pipeline(p_pipeline uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select workspace_id from public.pipelines where id = p_pipeline;
$$;

create or replace function public.workspace_of_stage(p_stage uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select p.workspace_id
  from public.stages s
  join public.pipelines p on p.id = s.pipeline_id
  where s.id = p_stage;
$$;

create or replace function public.workspace_of_role(p_role uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select workspace_id from public.roles where id = p_role;
$$;

-- Etapas que gestiona el usuario actual, por cualquiera de sus roles.
create or replace function public.manages_stage(p_stage uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.role_stages rs
    join public.member_roles mr on mr.role_id = rs.role_id
    where rs.stage_id = p_stage
      and mr.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Quien puede mover una tarjeta
-- ---------------------------------------------------------------------------
create or replace function public.can_move_video(p_video uuid, p_stage uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_workspace       uuid;
  v_current_stage   uuid;
  v_pipeline        uuid;
  v_target_pipeline uuid;
begin
  select workspace_id, stage_id, pipeline_id
    into v_workspace, v_current_stage, v_pipeline
  from public.videos where id = p_video;

  if v_workspace is null then
    return false;
  end if;

  -- La etapa de destino tiene que pertenecer al pipeline del video.
  select pipeline_id into v_target_pipeline from public.stages where id = p_stage;
  if v_target_pipeline is distinct from v_pipeline then
    return false;
  end if;

  if not public.has_permission(v_workspace, 'video.edit') then
    return false;
  end if;

  if public.has_permission(v_workspace, 'video.move.any') then
    return true;
  end if;

  if exists (
    select 1 from public.video_assignees a
    where a.video_id = p_video and a.user_id = auth.uid()
  ) then
    return true;
  end if;

  -- Responsable de la etapa de origen o de la de destino.
  return public.manages_stage(v_current_stage) or public.manages_stage(p_stage);
end;
$$;

create or replace function public.videos_guard_stage_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.stage_id is distinct from old.stage_id
     and not public.can_move_video(old.id, new.stage_id) then
    raise exception 'FORBIDDEN_STAGE_MOVE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger videos_guard_stage
  before update on public.videos
  for each row execute function public.videos_guard_stage_change();

-- Coherencia: la etapa siempre pertenece al pipeline del video.
create or replace function public.videos_check_stage_pipeline()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_pipeline uuid;
begin
  select pipeline_id into v_pipeline from public.stages where id = new.stage_id;

  if v_pipeline is null then
    raise exception 'STAGE_NOT_FOUND' using errcode = '23503';
  end if;

  -- Al crear se deduce el pipeline de la etapa; al mover entre pipelines se
  -- exige que ambos campos viajen juntos.
  if new.pipeline_id is null then
    new.pipeline_id := v_pipeline;
  elsif new.pipeline_id <> v_pipeline then
    raise exception 'STAGE_PIPELINE_MISMATCH' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger videos_stage_pipeline_check
  before insert or update of stage_id, pipeline_id on public.videos
  for each row execute function public.videos_check_stage_pipeline();

-- Sella la fecha de publicacion al entrar en una etapa de tipo 'done'.
create or replace function public.videos_publish_stamp_fn()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_kind public.stage_kind;
begin
  select kind into v_kind from public.stages where id = new.stage_id;

  if v_kind = 'done' then
    new.published_at := coalesce(new.published_at, now());
  else
    new.published_at := null;
  end if;

  return new;
end;
$$;

create trigger videos_publish_stamp
  before insert or update on public.videos
  for each row execute function public.videos_publish_stamp_fn();

-- Actividad, ahora con los nombres de etapa que haya puesto el equipo.
create or replace function public.videos_activity_trigger()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_from text;
  v_to   text;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(
      new.workspace_id, new.id, 'video.created',
      jsonb_build_object('title', new.title)
    );
  elsif tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    select name into v_from from public.stages where id = old.stage_id;
    select name into v_to   from public.stages where id = new.stage_id;
    perform public.log_activity(
      new.workspace_id, new.id, 'video.moved',
      jsonb_build_object('title', new.title, 'from', v_from, 'to', v_to)
    );
  elsif tg_op = 'UPDATE' and new.title is distinct from old.title then
    perform public.log_activity(
      new.workspace_id, new.id, 'video.renamed',
      jsonb_build_object('from', old.title, 'to', new.title)
    );
  end if;
  return new;
end;
$$;

create trigger videos_activity
  after insert or update on public.videos
  for each row execute function public.videos_activity_trigger();

-- La checklist guarda quien marco cada paso.
create or replace function public.checklist_done_stamp()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.is_done and not coalesce(old.is_done, false) then
    new.done_at := now();
    new.completed_by := coalesce(new.completed_by, auth.uid());
  elsif not new.is_done then
    new.done_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Un equipo nunca se queda sin propietario
-- ---------------------------------------------------------------------------
create or replace function public.protect_last_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_is_owner boolean;
  v_left     integer;
begin
  select r.key = 'owner' into v_is_owner from public.roles r where r.id = old.role_id;

  if coalesce(v_is_owner, false) then
    select count(*) into v_left
    from public.member_roles mr
    join public.roles r on r.id = mr.role_id
    where mr.workspace_id = old.workspace_id
      and r.key = 'owner'
      and mr.user_id <> old.user_id;

    if v_left = 0 then
      raise exception 'LAST_OWNER' using errcode = '23514';
    end if;
  end if;

  return old;
end;
$$;

create trigger member_roles_protect_last_owner
  before delete on public.member_roles
  for each row execute function public.protect_last_owner();

-- ---------------------------------------------------------------------------
-- RPCs de aplicacion
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace(p_name text, p_slug text)
returns public.workspaces
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace public.workspaces;
  v_slug text := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 2 then
    v_slug := 'equipo-' || substr(gen_random_uuid()::text, 1, 6);
  end if;

  if exists (select 1 from public.workspaces where slug = v_slug) then
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 4);
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (trim(p_name), v_slug, auth.uid())
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id)
  values (v_workspace.id, auth.uid());

  perform public.seed_workspace_defaults(v_workspace.id);

  insert into public.member_roles (workspace_id, user_id, role_id)
  select v_workspace.id, auth.uid(), id
  from public.roles where workspace_id = v_workspace.id and key = 'owner';

  perform public.log_activity(
    v_workspace.id, null, 'workspace.created',
    jsonb_build_object('name', v_workspace.name)
  );

  return v_workspace;
end;
$$;

create or replace function public.move_video(
  p_video uuid,
  p_stage uuid,
  p_position double precision
)
returns public.videos
language plpgsql security definer set search_path = public
as $$
declare
  v_video public.videos;
begin
  if not public.can_move_video(p_video, p_stage) then
    raise exception 'FORBIDDEN_STAGE_MOVE' using errcode = '42501';
  end if;

  update public.videos
    set stage_id = p_stage,
        position = p_position
    where id = p_video
    returning * into v_video;

  return v_video;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns public.workspaces
language plpgsql security definer set search_path = public
as $$
declare
  v_invitation public.invitations;
  v_workspace  public.workspaces;
  v_email      text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  select * into v_invitation
  from public.invitations
  where token = p_token and status = 'pending'
  for update;

  if v_invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_invitation.expires_at < now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0002';
  end if;

  if lower(v_invitation.email) <> lower(coalesce(v_email, '')) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id)
  values (v_invitation.workspace_id, auth.uid())
  on conflict (workspace_id, user_id) do nothing;

  insert into public.member_roles (workspace_id, user_id, role_id)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role_id)
  on conflict do nothing;

  update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = v_invitation.id;

  select * into v_workspace from public.workspaces where id = v_invitation.workspace_id;

  perform public.log_activity(v_workspace.id, null, 'member.joined', '{}'::jsonb);

  return v_workspace;
end;
$$;

create or replace function public.invitation_preview(p_token text)
returns table (workspace_name text, role_name text, email text, expires_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select w.name, r.name, i.email, i.expires_at
  from public.invitations i
  join public.workspaces w on w.id = i.workspace_id
  join public.roles r on r.id = i.role_id
  where i.token = p_token and i.status = 'pending';
$$;

-- Metricas del dashboard, ahora agrupadas por el tipo de cada etapa.
create or replace function public.workspace_stats(p_workspace uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with v as (
    select vi.*, st.kind, st.id as stage
    from public.videos vi
    join public.stages st on st.id = vi.stage_id
    where vi.workspace_id = p_workspace
  )
  select case
    when not public.is_member(p_workspace) then '{}'::jsonb
    else jsonb_build_object(
      'total', (select count(*) from v where kind <> 'archived'),
      'in_progress', (select count(*) from v where kind in ('work', 'review')),
      'published_this_month', (
        select count(*) from v where kind = 'done' and published_at >= date_trunc('month', now())
      ),
      'scheduled', (select count(*) from v where kind = 'scheduled'),
      'overdue', (
        select count(*) from v where due_date < current_date and kind not in ('done', 'archived')
      ),
      'members', (select count(*) from public.workspace_members where workspace_id = p_workspace),
      'channels', (
        select count(*) from public.channels
        where workspace_id = p_workspace and is_archived = false
      ),
      'pipelines', (select count(*) from public.pipelines where workspace_id = p_workspace),
      'by_stage', (
        select coalesce(jsonb_object_agg(stage, total), '{}'::jsonb)
        from (select stage, count(*) as total from v where kind <> 'archived' group by stage) s
      )
    )
  end;
$$;

-- Equipo de demostracion sobre el modelo nuevo.
create or replace function public.seed_demo_workspace()
returns public.workspaces
language plpgsql security definer set search_path = public
as $$
declare
  v_ws       public.workspaces;
  v_pipeline uuid;
  v_video    uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_ws := public.create_workspace('Equipo principal', 'equipo-principal');
  select id into v_pipeline from public.pipelines where workspace_id = v_ws.id and is_default;

  insert into public.channels (workspace_id, pipeline_id, name, handle, niche, color, target_per_week, created_by)
  values
    (v_ws.id, v_pipeline, 'Pulso Tech',    '@pulsotech',    'Tecnologia',  '#3b82f6', 3, auth.uid()),
    (v_ws.id, v_pipeline, 'Mente Curiosa', '@mentecuriosa', 'Divulgacion', '#8b5cf6', 2, auth.uid()),
    (v_ws.id, v_pipeline, 'Ruta Local',    '@rutalocal',    'Viajes',      '#22c55e', 2, auth.uid()),
    (v_ws.id, v_pipeline, 'Mesa Abierta',  '@mesaabierta',  'Cocina',      '#f59e0b', 3, auth.uid());

  insert into public.videos
    (workspace_id, pipeline_id, stage_id, channel_id, title, hook, priority, position, due_date, created_by)
  select
    v_ws.id, v_pipeline, s.id, c.id, d.title, d.hook, d.priority::public.video_priority,
    d.position, current_date + d.due_offset, auth.uid()
  from (values
    ('idea',      'Pulso Tech',    'Por que fallan las baterias',   'El 80% mueren por una sola razon',        'normal', 1000, 6),
    ('idea',      'Ruta Local',    'Mercados secretos de Madrid',   'Tres que ningun turista conoce',          'low',    2000, 9),
    ('script',    'Mente Curiosa', 'La paradoja del tiempo',        'Por que pasa mas rapido al envejecer',    'high',   1000, 2),
    ('script',    'Mesa Abierta',  'El cafe perfecto en casa',      'El error que lo arruina cada manana',     'normal', 2000, 5),
    ('voiceover', 'Ruta Local',    'Un dia con una paramedica',     '12 horas dentro de una ambulancia',       'high',   1000, 0),
    ('editing',   'Pulso Tech',    'Probamos el movil mas fino',    'Tan fino que casi se dobla solo',         'urgent', 1000, 0),
    ('editing',   'Mesa Abierta',  '5 cenas por menos de 3 euros',  'Cenar bien gastando menos que un cafe',   'high',   2000, 3),
    ('review',    'Mente Curiosa', 'Dormir 8 horas no basta',       'La ciencia del sueno que nadie cuenta',   'high',   1000, 1),
    ('scheduled', 'Pulso Tech',    'La IA que ya usas sin saberlo', 'La usas 40 veces al dia sin notarlo',     'normal', 1000, 1),
    ('scheduled', 'Ruta Local',    '24 horas en Toledo',            'Toledo en un dia, sin colas',             'normal', 2000, 4)
  ) as d(slug, channel, title, hook, priority, position, due_offset)
  join public.stages s on s.pipeline_id = v_pipeline and s.slug = d.slug
  join public.channels c on c.workspace_id = v_ws.id and c.name = d.channel;

  update public.videos v
    set publish_at = (current_date + 1)::timestamptz + interval '18 hours'
  from public.stages s
  where s.id = v.stage_id and s.kind = 'scheduled' and v.workspace_id = v_ws.id;

  insert into public.video_assignees (video_id, user_id)
  select id, auth.uid() from public.videos where workspace_id = v_ws.id;

  for v_video in select id from public.videos where workspace_id = v_ws.id loop
    insert into public.checklist_items (video_id, title, stage_id, role_id, is_done, position, created_by)
    select
      v_video, d.title, s.id, r.id, d.done, d.position, auth.uid()
    from (values
      ('Investigacion y fuentes', 'idea',      'Productor',  true,  1000),
      ('Guion aprobado',          'script',    'Guionista',  false, 2000),
      ('Voz en off grabada',      'voiceover', 'Locutor',    false, 3000),
      ('Miniatura A/B',           'thumbnail', 'Disenador',  false, 4000)
    ) as d(title, slug, role_name, done, position)
    join public.stages s on s.pipeline_id = v_pipeline and s.slug = d.slug
    join public.roles r on r.workspace_id = v_ws.id and r.name = d.role_name;
  end loop;

  insert into public.comments (video_id, author_id, body)
  select v.id, auth.uid(), 'Subo el feedback del guion antes de las 18:00.'
  from public.videos v
  join public.stages s on s.id = v.stage_id
  where v.workspace_id = v_ws.id and s.kind = 'review';

  return v_ws;
end;
$$;

-- ===========================================================================
-- Politicas RLS (todas rehechas sobre el modelo nuevo)
-- ===========================================================================
alter table public.pipelines           enable row level security;
alter table public.stages              enable row level security;
alter table public.roles               enable row level security;
alter table public.role_stages         enable row level security;
alter table public.member_roles        enable row level security;
alter table public.checklist_assignees enable row level security;

-- profiles -------------------------------------------------------------
create policy "profiles: ver companeros de equipo"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = public.profiles.id
    )
  );

create policy "profiles: editar el propio"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces -----------------------------------------------------------
create policy "workspaces: ver los propios"
  on public.workspaces for select to authenticated using (public.is_member(id));

create policy "workspaces: crear"
  on public.workspaces for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "workspaces: editar con permiso"
  on public.workspaces for update to authenticated
  using (public.has_permission(id, 'workspace.manage'))
  with check (public.has_permission(id, 'workspace.manage'));

create policy "workspaces: eliminar solo propietario"
  on public.workspaces for delete to authenticated using (public.is_owner(id));

-- workspace_members ----------------------------------------------------
create policy "miembros: ver los del equipo"
  on public.workspace_members for select to authenticated using (public.is_member(workspace_id));

create policy "miembros: alta con permiso"
  on public.workspace_members for insert to authenticated
  with check (public.has_permission(workspace_id, 'member.manage'));

create policy "miembros: baja con permiso o salir del equipo"
  on public.workspace_members for delete to authenticated
  using (
    (user_id = (select auth.uid()) and not public.is_owner(workspace_id))
    or (
      public.has_permission(workspace_id, 'member.manage')
      and user_id <> (select auth.uid())
    )
  );

-- member_roles ---------------------------------------------------------
create policy "roles de miembro: ver los del equipo"
  on public.member_roles for select to authenticated using (public.is_member(workspace_id));

-- Nadie se concede el rol de propietario: eso solo lo hace otro propietario.
create policy "roles de miembro: asignar con permiso"
  on public.member_roles for insert to authenticated
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and (
      public.is_owner(workspace_id)
      or not exists (select 1 from public.roles r where r.id = role_id and r.key = 'owner')
    )
  );

create policy "roles de miembro: retirar con permiso"
  on public.member_roles for delete to authenticated
  using (
    public.has_permission(workspace_id, 'member.manage')
    and (
      public.is_owner(workspace_id)
      or not exists (select 1 from public.roles r where r.id = role_id and r.key = 'owner')
    )
  );

-- roles ----------------------------------------------------------------
create policy "roles: ver los del equipo"
  on public.roles for select to authenticated using (public.is_member(workspace_id));

create policy "roles: crear con permiso"
  on public.roles for insert to authenticated
  with check (
    public.has_permission(workspace_id, 'workspace.manage')
    and is_system = false and key is null
  );

-- Los roles de sistema (Propietario y Administrador) no se tocan.
create policy "roles: editar los personalizados"
  on public.roles for update to authenticated
  using (public.has_permission(workspace_id, 'workspace.manage') and is_system = false)
  with check (
    public.has_permission(workspace_id, 'workspace.manage')
    and is_system = false and key is null
  );

create policy "roles: eliminar los personalizados"
  on public.roles for delete to authenticated
  using (public.has_permission(workspace_id, 'workspace.manage') and is_system = false);

-- pipelines y etapas ---------------------------------------------------
create policy "pipelines: ver los del equipo"
  on public.pipelines for select to authenticated using (public.is_member(workspace_id));

create policy "pipelines: gestionar con permiso"
  on public.pipelines for all to authenticated
  using (public.has_permission(workspace_id, 'pipeline.manage'))
  with check (public.has_permission(workspace_id, 'pipeline.manage'));

create policy "etapas: ver las del equipo"
  on public.stages for select to authenticated
  using (public.is_member(public.workspace_of_pipeline(pipeline_id)));

create policy "etapas: gestionar con permiso"
  on public.stages for all to authenticated
  using (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'))
  with check (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'));

create policy "etapas por rol: ver las del equipo"
  on public.role_stages for select to authenticated
  using (public.is_member(public.workspace_of_role(role_id)));

create policy "etapas por rol: gestionar con permiso"
  on public.role_stages for all to authenticated
  using (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'))
  with check (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'));

-- invitations ----------------------------------------------------------
create policy "invitaciones: ver con permiso"
  on public.invitations for select to authenticated
  using (public.has_permission(workspace_id, 'member.manage'));

create policy "invitaciones: crear con permiso"
  on public.invitations for insert to authenticated
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and invited_by = (select auth.uid())
    and not exists (select 1 from public.roles r where r.id = role_id and r.key = 'owner')
  );

create policy "invitaciones: revocar con permiso"
  on public.invitations for update to authenticated
  using (public.has_permission(workspace_id, 'member.manage'))
  with check (public.has_permission(workspace_id, 'member.manage'));

create policy "invitaciones: eliminar con permiso"
  on public.invitations for delete to authenticated
  using (public.has_permission(workspace_id, 'member.manage'));

-- channels -------------------------------------------------------------
create policy "canales: ver los del equipo"
  on public.channels for select to authenticated using (public.is_member(workspace_id));

create policy "canales: gestionar con permiso"
  on public.channels for all to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'))
  with check (public.has_permission(workspace_id, 'channel.manage'));

-- videos ---------------------------------------------------------------
create policy "videos: ver los del equipo"
  on public.videos for select to authenticated using (public.is_member(workspace_id));

create policy "videos: crear con permiso"
  on public.videos for insert to authenticated
  with check (public.has_permission(workspace_id, 'video.create'));

create policy "videos: editar con permiso"
  on public.videos for update to authenticated
  using (public.has_permission(workspace_id, 'video.edit'))
  with check (public.has_permission(workspace_id, 'video.edit'));

create policy "videos: eliminar con permiso"
  on public.videos for delete to authenticated
  using (public.has_permission(workspace_id, 'video.delete'));

-- video_assignees ------------------------------------------------------
create policy "asignaciones: ver las del equipo"
  on public.video_assignees for select to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "asignaciones: crear con permiso"
  on public.video_assignees for insert to authenticated
  with check (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = (select auth.uid())
  );

create policy "asignaciones: eliminar con permiso"
  on public.video_assignees for delete to authenticated
  using (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = (select auth.uid())
  );

-- checklist ------------------------------------------------------------
create policy "checklist: ver las del equipo"
  on public.checklist_items for select to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "checklist: crear con permiso"
  on public.checklist_items for insert to authenticated
  with check (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

-- Un paso con rol asignado solo lo marca quien lleva ese rol (o quien puede
-- mover cualquier tarjeta).
create policy "checklist: editar segun el rol del paso"
  on public.checklist_items for update to authenticated
  using (
    public.has_permission(public.workspace_of_video(video_id), 'video.edit')
    and (
      role_id is null
      or public.has_permission(public.workspace_of_video(video_id), 'video.move.any')
      or exists (
        select 1 from public.member_roles mr
        where mr.role_id = public.checklist_items.role_id
          and mr.user_id = (select auth.uid())
      )
    )
  )
  with check (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

create policy "checklist: eliminar con permiso"
  on public.checklist_items for delete to authenticated
  using (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

create policy "responsables de paso: ver los del equipo"
  on public.checklist_assignees for select to authenticated
  using (
    exists (
      select 1 from public.checklist_items c
      where c.id = item_id and public.is_member(public.workspace_of_video(c.video_id))
    )
  );

create policy "responsables de paso: gestionar con permiso"
  on public.checklist_assignees for all to authenticated
  using (
    exists (
      select 1 from public.checklist_items c
      where c.id = item_id
        and public.has_permission(public.workspace_of_video(c.video_id), 'video.edit')
    )
  )
  with check (
    exists (
      select 1 from public.checklist_items c
      where c.id = item_id
        and public.has_permission(public.workspace_of_video(c.video_id), 'video.edit')
    )
  );

-- comments y assets ----------------------------------------------------
create policy "comentarios: ver los del equipo"
  on public.comments for select to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "comentarios: escribir"
  on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.has_permission(public.workspace_of_video(video_id), 'comment.write')
  );

create policy "comentarios: editar el propio"
  on public.comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

create policy "comentarios: borrar el propio o moderar"
  on public.comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.has_permission(public.workspace_of_video(video_id), 'workspace.manage')
  );

create policy "assets: ver los del equipo"
  on public.assets for select to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "assets: crear con permiso"
  on public.assets for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

create policy "assets: eliminar con permiso"
  on public.assets for delete to authenticated
  using (
    created_by = (select auth.uid())
    or public.has_permission(public.workspace_of_video(video_id), 'video.delete')
  );

-- activity -------------------------------------------------------------
create policy "actividad: ver la del equipo"
  on public.activity for select to authenticated using (public.is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 20250101000900_notifications.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- v2 · Notificaciones en vivo
--
-- Cuando una tarjeta entra en una etapa, se avisa a quien tiene un rol que
-- gestiona esa etapa (role_stages) y a quien este asignado a la tarjeta.
-- Tambien se avisa al asignar a alguien y al recibir un comentario.
-- Las filas las escriben triggers: el cliente solo lee y marca como leidas.
-- ===========================================================================

create table public.notifications (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  video_id     uuid references public.videos (id) on delete cascade,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_inbox_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_workspace_idx on public.notifications (workspace_id);

alter table public.notifications enable row level security;

create policy "avisos: ver solo los propios"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "avisos: marcar como leidos los propios"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "avisos: borrar los propios"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Reparto de avisos
-- ---------------------------------------------------------------------------
create or replace function public.notify_users(
  p_workspace uuid,
  p_users uuid[],
  p_type text,
  p_video uuid,
  p_payload jsonb
)
returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (workspace_id, user_id, actor_id, video_id, type, payload)
  select p_workspace, u, auth.uid(), p_video, p_type, coalesce(p_payload, '{}'::jsonb)
  from unnest(p_users) as u
  where u is distinct from auth.uid();
$$;

-- Al cambiar de etapa: responsables de la etapa nueva + asignados a la tarjeta.
create or replace function public.notify_stage_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_stage_name text;
  v_users      uuid[];
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select name into v_stage_name from public.stages where id = new.stage_id;

  select array_agg(distinct u) into v_users
  from (
    -- Quien gestiona la etapa de destino por alguno de sus roles
    select mr.user_id as u
    from public.role_stages rs
    join public.member_roles mr on mr.role_id = rs.role_id
    where rs.stage_id = new.stage_id and mr.workspace_id = new.workspace_id
    union
    -- Y quien tenga la tarjeta asignada
    select a.user_id from public.video_assignees a where a.video_id = new.id
  ) s;

  if v_users is null then
    return new;
  end if;

  perform public.notify_users(
    new.workspace_id, v_users, 'stage.entered', new.id,
    jsonb_build_object('title', new.title, 'stage', v_stage_name)
  );

  return new;
end;
$$;

create trigger videos_notify_stage
  after update of stage_id on public.videos
  for each row execute function public.notify_stage_change();

-- Al asignar a alguien una tarjeta.
create or replace function public.notify_assignment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_video public.videos;
begin
  select * into v_video from public.videos where id = new.video_id;

  perform public.notify_users(
    v_video.workspace_id, array[new.user_id], 'video.assigned', new.video_id,
    jsonb_build_object('title', v_video.title)
  );

  return new;
end;
$$;

create trigger video_assignees_notify
  after insert on public.video_assignees
  for each row execute function public.notify_assignment();

-- Al comentar: se avisa a los asignados y a quien creo la tarjeta.
create or replace function public.notify_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_video public.videos;
  v_users uuid[];
begin
  select * into v_video from public.videos where id = new.video_id;

  select array_agg(distinct u) into v_users
  from (
    select a.user_id as u from public.video_assignees a where a.video_id = new.video_id
    union
    select v_video.created_by
  ) s
  where u is not null;

  if v_users is null then
    return new;
  end if;

  perform public.notify_users(
    v_video.workspace_id, v_users, 'comment.created', new.video_id,
    jsonb_build_object('title', v_video.title, 'excerpt', left(new.body, 140))
  );

  return new;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_comment();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter table public.notifications replica identity full;
alter table public.stages        replica identity full;
alter table public.pipelines     replica identity full;

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.stages;
alter publication supabase_realtime add table public.pipelines;
alter publication supabase_realtime add table public.checklist_assignees;
alter publication supabase_realtime add table public.member_roles;

-- ---------------------------------------------------------------------------
-- 20250101001000_grants_and_storage.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- v2 · Permisos de ejecucion y almacenamiento de imagenes
--
-- Las funciones que se recrearon en la migracion anterior vuelven a nacer con
-- EXECUTE abierto a PUBLIC, asi que hay que cerrarlas otra vez. Misma regla
-- que antes: fuera de la API todo lo interno, y dentro solo lo que la
-- aplicacion llama de verdad.
-- ===========================================================================

-- Convierte texto en uuid solo si lo es; evita romper una politica cuando
-- llega una ruta con un nombre de carpeta inesperado.
create or replace function public.safe_uuid(p_value text)
returns uuid
language plpgsql immutable
set search_path = public
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones internas: fuera de la API
-- ---------------------------------------------------------------------------
revoke all on function public.seed_workspace_defaults(uuid)          from public, anon, authenticated;
revoke all on function public.videos_guard_stage_change()            from public, anon, authenticated;
revoke all on function public.videos_check_stage_pipeline()          from public, anon, authenticated;
revoke all on function public.videos_publish_stamp_fn()              from public, anon, authenticated;
revoke all on function public.videos_activity_trigger()              from public, anon, authenticated;
revoke all on function public.checklist_done_stamp()                 from public, anon, authenticated;
revoke all on function public.protect_last_owner()                   from public, anon, authenticated;
revoke all on function public.can_move_video(uuid, uuid)             from public, anon, authenticated;
revoke all on function public.notify_users(uuid, uuid[], text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.notify_stage_change()                  from public, anon, authenticated;
revoke all on function public.notify_assignment()                    from public, anon, authenticated;
revoke all on function public.notify_comment()                       from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ayudantes que necesitan las politicas RLS (se evaluan con el rol de quien
-- consulta, asi que authenticated tiene que poder ejecutarlos)
-- ---------------------------------------------------------------------------
revoke all on function public.has_permission(uuid, text)     from public, anon;
revoke all on function public.is_owner(uuid)                 from public, anon;
revoke all on function public.manages_stage(uuid)            from public, anon;
revoke all on function public.workspace_of_pipeline(uuid)    from public, anon;
revoke all on function public.workspace_of_stage(uuid)       from public, anon;
revoke all on function public.workspace_of_role(uuid)        from public, anon;
revoke all on function public.safe_uuid(text)                from public, anon;

grant execute on function public.has_permission(uuid, text)  to authenticated;
grant execute on function public.is_owner(uuid)              to authenticated;
grant execute on function public.manages_stage(uuid)         to authenticated;
grant execute on function public.workspace_of_pipeline(uuid) to authenticated;
grant execute on function public.workspace_of_stage(uuid)    to authenticated;
grant execute on function public.workspace_of_role(uuid)     to authenticated;
grant execute on function public.safe_uuid(text)             to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de la aplicacion: solo con sesion iniciada
-- ---------------------------------------------------------------------------
revoke all on function public.create_workspace(text, text)                from public, anon;
revoke all on function public.seed_demo_workspace()                       from public, anon;
revoke all on function public.move_video(uuid, uuid, double precision)    from public, anon;
revoke all on function public.accept_invitation(text)                     from public, anon;
revoke all on function public.workspace_stats(uuid)                       from public, anon;

grant execute on function public.create_workspace(text, text)             to authenticated;
grant execute on function public.seed_demo_workspace()                    to authenticated;
grant execute on function public.move_video(uuid, uuid, double precision) to authenticated;
grant execute on function public.accept_invitation(text)                  to authenticated;
grant execute on function public.workspace_stats(uuid)                    to authenticated;

-- La vista previa de la invitacion la abre alguien sin sesion.
revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ===========================================================================
-- Almacenamiento de imagenes
--
-- Dos cubos publicos de lectura (las imagenes se sirven por CDN) pero con la
-- escritura acotada: cada quien manda en su carpeta.
--   avatars/<user_id>/...        foto de perfil
--   channels/<workspace_id>/...  miniatura del canal
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',  'avatars',  true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('channels', 'channels', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "avatares: lectura publica"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatares: cada quien sube el suyo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatares: cada quien reemplaza el suyo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatares: cada quien borra el suyo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "canales: lectura publica"
  on storage.objects for select
  using (bucket_id = 'channels');

create policy "canales: subir con permiso sobre el equipo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channels'
    and public.has_permission(
      public.safe_uuid((storage.foldername(name))[1]), 'channel.manage'
    )
  );

create policy "canales: reemplazar con permiso sobre el equipo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'channels'
    and public.has_permission(
      public.safe_uuid((storage.foldername(name))[1]), 'channel.manage'
    )
  );

create policy "canales: borrar con permiso sobre el equipo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'channels'
    and public.has_permission(
      public.safe_uuid((storage.foldername(name))[1]), 'channel.manage'
    )
  );

-- ---------------------------------------------------------------------------
-- 20250101001100_perf_v2.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- v2 · Afinado de rendimiento del modelo configurable
--
-- Dos avisos del linter de Supabase sobre las tablas nuevas:
--
-- 1. Claves foraneas sin indice. Postgres no indexa el lado que apunta, asi
--    que cada borrado en el lado referenciado obliga a un recorrido completo
--    de la tabla hija (y los filtros por esa columna tambien).
--
-- 2. Dos politicas permisivas de SELECT sobre la misma tabla y el mismo rol.
--    Una politica `for all` tambien cubre SELECT, asi que en cada lectura se
--    evaluaban las dos: la de ver y la de gestionar. Se parte la de gestionar
--    en INSERT / UPDATE / DELETE, que es lo unico que tenia que decir; asi
--    cada lectura evalua una sola condicion y las reglas quedan iguales.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Indices de las claves foraneas nuevas
-- ---------------------------------------------------------------------------
create index if not exists channels_pipeline_idx
  on public.channels (pipeline_id);

create index if not exists checklist_items_stage_idx
  on public.checklist_items (stage_id);

create index if not exists checklist_items_role_idx
  on public.checklist_items (role_id);

create index if not exists checklist_items_completed_by_idx
  on public.checklist_items (completed_by);

create index if not exists invitations_role_idx
  on public.invitations (role_id);

create index if not exists notifications_actor_idx
  on public.notifications (actor_id);

create index if not exists notifications_video_idx
  on public.notifications (video_id);

create index if not exists videos_stage_fk_idx
  on public.videos (stage_id);

-- ---------------------------------------------------------------------------
-- 2. Una sola politica permisiva por lectura
-- ---------------------------------------------------------------------------

-- pipelines ------------------------------------------------------------
drop policy "pipelines: gestionar con permiso" on public.pipelines;

create policy "pipelines: crear con permiso"
  on public.pipelines for insert to authenticated
  with check (public.has_permission(workspace_id, 'pipeline.manage'));

create policy "pipelines: editar con permiso"
  on public.pipelines for update to authenticated
  using (public.has_permission(workspace_id, 'pipeline.manage'))
  with check (public.has_permission(workspace_id, 'pipeline.manage'));

create policy "pipelines: borrar con permiso"
  on public.pipelines for delete to authenticated
  using (public.has_permission(workspace_id, 'pipeline.manage'));

-- stages ---------------------------------------------------------------
drop policy "etapas: gestionar con permiso" on public.stages;

create policy "etapas: crear con permiso"
  on public.stages for insert to authenticated
  with check (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'));

create policy "etapas: editar con permiso"
  on public.stages for update to authenticated
  using (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'))
  with check (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'));

create policy "etapas: borrar con permiso"
  on public.stages for delete to authenticated
  using (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'));

-- role_stages ----------------------------------------------------------
drop policy "etapas por rol: gestionar con permiso" on public.role_stages;

create policy "etapas por rol: crear con permiso"
  on public.role_stages for insert to authenticated
  with check (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'));

create policy "etapas por rol: editar con permiso"
  on public.role_stages for update to authenticated
  using (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'))
  with check (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'));

create policy "etapas por rol: borrar con permiso"
  on public.role_stages for delete to authenticated
  using (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'));

-- channels -------------------------------------------------------------
drop policy "canales: gestionar con permiso" on public.channels;

create policy "canales: crear con permiso"
  on public.channels for insert to authenticated
  with check (public.has_permission(workspace_id, 'channel.manage'));

create policy "canales: editar con permiso"
  on public.channels for update to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'))
  with check (public.has_permission(workspace_id, 'channel.manage'));

create policy "canales: borrar con permiso"
  on public.channels for delete to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'));

-- checklist_assignees --------------------------------------------------
drop policy "responsables de paso: gestionar con permiso" on public.checklist_assignees;

create policy "responsables de paso: crear con permiso"
  on public.checklist_assignees for insert to authenticated
  with check (
    exists (
      select 1 from public.checklist_items c
      where c.id = item_id
        and public.has_permission(public.workspace_of_video(c.video_id), 'video.edit')
    )
  );

create policy "responsables de paso: borrar con permiso"
  on public.checklist_assignees for delete to authenticated
  using (
    exists (
      select 1 from public.checklist_items c
      where c.id = item_id
        and public.has_permission(public.workspace_of_video(c.video_id), 'video.edit')
    )
  );
