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
