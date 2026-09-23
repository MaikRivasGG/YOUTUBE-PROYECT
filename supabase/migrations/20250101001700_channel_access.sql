-- ===========================================================================
-- Acceso por canal
--
-- Hasta ahora cualquier miembro del equipo veia todos los canales: su
-- pipeline, sus tarjetas y sus estadisticas. A partir de aqui un canal solo
-- lo ve quien es "miembro participante" de ese canal (channel_members), salvo
-- que su rol tenga el permiso "Ver todos los canales" (channel.view_all) -
-- pensado para Propietario, Administrador y Productor, pero configurable
-- desde la Matriz de permisos como cualquier otro.
--
-- Se preserva el acceso actual: al activarse, cada miembro queda asignado a
-- todos los canales que ya podia ver hoy. Nadie pierde nada de golpe; a
-- partir de ahi el propietario decide a quien quitar de que canal.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Permiso nuevo: ver todos los canales
-- ---------------------------------------------------------------------------
alter table public.roles
  add column view_all_channels boolean not null default false;

update public.roles
set view_all_channels = true
where is_system or manage_channels or lower(trim(name)) = 'productor';

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
        when 'channel.view_all' then r.view_all_channels
        when 'pipeline.manage'  then r.manage_pipelines
        when 'video.create'     then r.create_videos
        when 'video.delete'     then r.delete_videos
        when 'video.edit'       then r.edit_videos
        when 'video.assign'     then r.assign_videos
        when 'video.move.any'   then r.move_any_stage
        when 'checklist.manage' then r.manage_checklist
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

-- ---------------------------------------------------------------------------
-- 2. Quien es "miembro participante" de un canal
-- ---------------------------------------------------------------------------
create table public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index channel_members_user_idx on public.channel_members (user_id);

alter table public.channel_members enable row level security;

create policy "miembros de canal: ver con permiso o lo propio"
  on public.channel_members for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = channel_members.channel_id
        and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

create policy "miembros de canal: anadir con permiso"
  on public.channel_members for insert to authenticated
  with check (
    exists (
      select 1 from public.channels c
      where c.id = channel_members.channel_id
        and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

create policy "miembros de canal: quitar con permiso"
  on public.channel_members for delete to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = channel_members.channel_id
        and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

-- Preserva el acceso actual: todo el mundo queda asignado a todos los
-- canales de su equipo, como ya podia verlos hasta ahora.
insert into public.channel_members (channel_id, user_id)
select c.id, wm.user_id
from public.channels c
join public.workspace_members wm on wm.workspace_id = c.workspace_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Ayudantes de visibilidad, para no repetir la misma condicion en cada
--    politica: un canal se ve con channel.manage, channel.view_all o siendo
--    miembro participante: un video "hereda" la visibilidad de su canal (o es
--    visible si no tiene canal asignado).
-- ---------------------------------------------------------------------------
create or replace function public.can_view_channel(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel
      and (
        public.has_permission(c.workspace_id, 'channel.manage')
        or public.has_permission(c.workspace_id, 'channel.view_all')
        or exists (
          select 1 from public.channel_members cm
          where cm.channel_id = c.id and cm.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_view_video(p_video uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.videos v
    where v.id = p_video
      and public.is_member(v.workspace_id)
      and (v.channel_id is null or public.can_view_channel(v.channel_id))
  );
$$;

revoke all on function public.can_view_channel(uuid) from public, anon;
revoke all on function public.can_view_video(uuid)   from public, anon;
grant execute on function public.can_view_channel(uuid) to authenticated;
grant execute on function public.can_view_video(uuid)   to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Politicas existentes: se les anade la visibilidad por canal
-- ---------------------------------------------------------------------------
drop policy "canales: ver los del equipo" on public.channels;
create policy "canales: ver los del equipo"
  on public.channels for select to authenticated
  using (public.is_member(workspace_id) and public.can_view_channel(id));

drop policy "videos: ver los del equipo" on public.videos;
create policy "videos: ver los del equipo"
  on public.videos for select to authenticated
  using (
    public.is_member(workspace_id)
    and (channel_id is null or public.can_view_channel(channel_id))
  );

drop policy "videos: crear con permiso" on public.videos;
create policy "videos: crear con permiso"
  on public.videos for insert to authenticated
  with check (
    public.has_permission(workspace_id, 'video.create')
    and (channel_id is null or public.can_view_channel(channel_id))
  );

drop policy "videos: editar con permiso" on public.videos;
create policy "videos: editar con permiso"
  on public.videos for update to authenticated
  using (
    public.has_permission(workspace_id, 'video.edit')
    and (channel_id is null or public.can_view_channel(channel_id))
  )
  with check (
    public.has_permission(workspace_id, 'video.edit')
    and (channel_id is null or public.can_view_channel(channel_id))
  );

drop policy "videos: eliminar con permiso" on public.videos;
create policy "videos: eliminar con permiso"
  on public.videos for delete to authenticated
  using (
    public.has_permission(workspace_id, 'video.delete')
    and (channel_id is null or public.can_view_channel(channel_id))
  );

drop policy "asignaciones: ver las del equipo" on public.video_assignees;
create policy "asignaciones: ver las del equipo"
  on public.video_assignees for select to authenticated
  using (public.can_view_video(video_id));

drop policy "asignaciones: crear con permiso" on public.video_assignees;
create policy "asignaciones: crear con permiso"
  on public.video_assignees for insert to authenticated
  with check (
    public.can_view_video(video_id)
    and (
      public.has_permission(public.workspace_of_video(video_id), 'video.assign')
      or user_id = auth.uid()
    )
  );

drop policy "asignaciones: eliminar con permiso" on public.video_assignees;
create policy "asignaciones: eliminar con permiso"
  on public.video_assignees for delete to authenticated
  using (
    public.can_view_video(video_id)
    and (
      public.has_permission(public.workspace_of_video(video_id), 'video.assign')
      or user_id = auth.uid()
    )
  );

drop policy "checklist: ver las del equipo" on public.checklist_items;
create policy "checklist: ver las del equipo"
  on public.checklist_items for select to authenticated
  using (public.can_view_video(video_id));

drop policy "checklist: crear con permiso" on public.checklist_items;
create policy "checklist: crear con permiso"
  on public.checklist_items for insert to authenticated
  with check (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'checklist.manage')
  );

-- Un paso con rol asignado solo lo marca quien lleva ese rol (o quien puede
-- mover cualquier tarjeta): logica sin tocar, solo se le anade la visibilidad.
drop policy "checklist: editar segun el rol del paso" on public.checklist_items;
create policy "checklist: editar segun el rol del paso"
  on public.checklist_items for update to authenticated
  using (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
    and (
      role_id is null
      or public.has_permission(public.workspace_of_video(video_id), 'video.move.any')
      or exists (
        select 1 from public.member_roles mr
        where mr.role_id = public.checklist_items.role_id
          and mr.user_id = auth.uid()
      )
    )
  )
  with check (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "checklist: eliminar con permiso" on public.checklist_items;
create policy "checklist: eliminar con permiso"
  on public.checklist_items for delete to authenticated
  using (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'checklist.manage')
  );

drop policy "comentarios: ver los del equipo" on public.comments;
create policy "comentarios: ver los del equipo"
  on public.comments for select to authenticated
  using (public.can_view_video(video_id));

drop policy "comentarios: escribir" on public.comments;
create policy "comentarios: escribir"
  on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'comment.write')
  );

drop policy "comentarios: borrar el propio o moderar" on public.comments;
create policy "comentarios: borrar el propio o moderar"
  on public.comments for delete to authenticated
  using (
    author_id = auth.uid()
    or (
      public.can_view_video(video_id)
      and public.has_permission(public.workspace_of_video(video_id), 'workspace.manage')
    )
  );

drop policy "assets: ver los del equipo" on public.assets;
create policy "assets: ver los del equipo"
  on public.assets for select to authenticated
  using (public.can_view_video(video_id));

drop policy "assets: crear con permiso" on public.assets;
create policy "assets: crear con permiso"
  on public.assets for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "assets: eliminar con permiso" on public.assets;
create policy "assets: eliminar con permiso"
  on public.assets for delete to authenticated
  using (
    created_by = auth.uid()
    or (
      public.can_view_video(video_id)
      and public.has_permission(public.workspace_of_video(video_id), 'video.delete')
    )
  );

drop policy "enlaces de etapa: ver los del equipo" on public.video_stage_links;
create policy "enlaces de etapa: ver los del equipo"
  on public.video_stage_links for select to authenticated
  using (public.can_view_video(video_id));

drop policy "enlaces de etapa: crear con permiso" on public.video_stage_links;
create policy "enlaces de etapa: crear con permiso"
  on public.video_stage_links for insert to authenticated
  with check (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "enlaces de etapa: editar con permiso" on public.video_stage_links;
create policy "enlaces de etapa: editar con permiso"
  on public.video_stage_links for update to authenticated
  using (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  )
  with check (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "enlaces de etapa: borrar con permiso" on public.video_stage_links;
create policy "enlaces de etapa: borrar con permiso"
  on public.video_stage_links for delete to authenticated
  using (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "transiciones: ver las del equipo" on public.stage_transitions;
create policy "transiciones: ver las del equipo"
  on public.stage_transitions for select to authenticated
  using (public.can_view_video(video_id));

drop policy "actividad: ver la del equipo" on public.activity;
create policy "actividad: ver la del equipo"
  on public.activity for select to authenticated
  using (
    public.is_member(workspace_id)
    and (video_id is null or public.can_view_video(video_id))
  );

-- ---------------------------------------------------------------------------
-- 5. RPCs que se saltan RLS a proposito (SECURITY DEFINER): se les repite la
--    misma condicion a mano, porque no pasan por las politicas de arriba.
-- ---------------------------------------------------------------------------
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
  if not public.can_view_video(p_video) or not public.can_move_video(p_video, p_stage) then
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

create or replace function public.workspace_stats(p_workspace uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with v as (
    select vi.*, st.kind, st.id as stage
    from public.videos vi
    join public.stages st on st.id = vi.stage_id
    where vi.workspace_id = p_workspace
      and (vi.channel_id is null or public.can_view_channel(vi.channel_id))
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
          and public.can_view_channel(id)
      ),
      'pipelines', (select count(*) from public.pipelines where workspace_id = p_workspace),
      'by_stage', (
        select coalesce(jsonb_object_agg(stage, total), '{}'::jsonb)
        from (select stage, count(*) as total from v where kind <> 'archived' group by stage) s
      )
    )
  end;
$$;

create or replace function public.stage_durations(p_workspace uuid, p_days integer default 90)
returns table (stage_id uuid, avg_hours numeric, samples bigint)
language sql stable security definer set search_path = public
as $$
  with spans as (
    select
      t.to_stage as stage_id,
      coalesce(
        lead(t.created_at) over (partition by t.video_id order by t.created_at),
        now()
      ) - t.created_at as span,
      lead(t.created_at) over (partition by t.video_id order by t.created_at) is not null as closed
    from public.stage_transitions t
    where t.workspace_id = p_workspace
      and t.created_at >= now() - make_interval(days => p_days)
      and public.is_member(p_workspace)
      and public.can_view_video(t.video_id)
  )
  select
    spans.stage_id,
    round(avg(extract(epoch from span) / 3600)::numeric, 1) as avg_hours,
    count(*) as samples
  from spans
  where closed
  group by spans.stage_id;
$$;

-- ---------------------------------------------------------------------------
-- 6. Equipos nuevos: Propietario, Administrador y Productor arrancan con la
--    vista general activada (view_all_channels). El resto de la funcion se
--    deja tal cual estaba en 20250101001400_pipeline_is_checklist.sql.
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

  insert into public.stages
    (pipeline_id, slug, name, color, kind, position, required_fields)
  values
    (v_pipeline, 'idea',      'Ideas',      '#94a3b8', 'backlog',   1000, '{}'),
    (v_pipeline, 'script',    'Guion',      '#3b82f6', 'work',      2000, '{}'),
    (v_pipeline, 'voiceover', 'Grabacion',  '#ef4444', 'work',      3000, '{}'),
    (v_pipeline, 'editing',   'Edicion',    '#f59e0b', 'work',      4000, '{}'),
    (v_pipeline, 'thumbnail', 'Miniatura',  '#d946ef', 'work',      5000, '{thumbnail_url}'),
    (v_pipeline, 'review',    'Revision',   '#8b5cf6', 'review',    6000, '{}'),
    (v_pipeline, 'scheduled', 'Programado', '#22c55e', 'scheduled', 7000, '{publish_at}'),
    (v_pipeline, 'published', 'Publicado',  '#0d9488', 'done',      8000, '{}'),
    (v_pipeline, 'archived',  'Archivado',  '#cbd5e1', 'archived',  9000, '{}');

  insert into public.roles (
    workspace_id, name, color, key, is_system, position,
    manage_workspace, manage_members, manage_channels, manage_pipelines,
    create_videos, delete_videos, edit_videos, assign_videos, move_any_stage,
    manage_checklist, write_comments, view_all_channels
  ) values
    (p_workspace, 'Propietario',   '#f59e0b', 'owner', true, 1000,
     true, true, true, true, true, true, true, true, true, true, true, true),
    (p_workspace, 'Administrador', '#ef4444', 'admin', true, 2000,
     true, true, true, true, true, true, true, true, true, true, true, true);

  insert into public.roles (
    workspace_id, name, color, position,
    manage_channels, create_videos, delete_videos, assign_videos, move_any_stage,
    manage_checklist, view_all_channels
  ) values (p_workspace, 'Productor', '#f97316', 3000, true, true, true, true, true, true, true)
  returning id into v_role;

  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages
  where pipeline_id = v_pipeline and slug in ('idea', 'review');

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

  insert into public.roles (workspace_id, name, color, position, edit_videos, write_comments)
  values (p_workspace, 'Observador', '#94a3b8', 9000, false, false);

  return v_pipeline;
end;
$$;
