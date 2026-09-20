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
