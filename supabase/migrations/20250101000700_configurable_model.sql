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
