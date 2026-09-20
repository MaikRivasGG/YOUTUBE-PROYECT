-- ===========================================================================
-- v3 · Plantillas por canal, requisitos de etapa, menciones y tiempos
--
-- Cinco piezas que convierten el tablero en un sistema de produccion:
--
--   1. Plantillas por canal: cada canal define su checklist estandar y las
--      tarjetas nuevas nacen con los pasos puestos y repartidos por rol.
--   2. Requisitos de salida: una etapa puede exigir que su checklist este
--      cerrado y que ciertos campos esten rellenos antes de dejar salir la
--      tarjeta hacia adelante.
--   3. Permiso propio para la estructura del checklist, separado de editar
--      el contenido del video.
--   4. Menciones en comentarios, con su aviso.
--   5. Registro de entradas y salidas de etapa, para medir donde se atasca
--      la produccion.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Permiso nuevo: gestionar la estructura del checklist
--
-- Antes, cualquiera con 'video.edit' podia anadir, reordenar o borrar pasos
-- del checklist de cualquier tarjeta. Marcar un paso como hecho seguia atado
-- al rol del paso, pero la estructura estaba abierta. Se separa en su propio
-- permiso, que arranca concedido a quien ya manda sobre el flujo: propietario,
-- administrador y quien pueda mover cualquier etapa.
-- ---------------------------------------------------------------------------
alter table public.roles
  add column manage_checklist boolean not null default false;

update public.roles
set manage_checklist = true
where manage_workspace or move_any_stage;

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

-- La estructura del checklist pasa a pedir 'checklist.manage'. Marcar hecho
-- sigue rigiendose por el rol del paso (politica de UPDATE, sin tocar).
drop policy "checklist: crear con permiso" on public.checklist_items;
drop policy "checklist: eliminar con permiso" on public.checklist_items;

create policy "checklist: crear con permiso"
  on public.checklist_items for insert to authenticated
  with check (public.has_permission(public.workspace_of_video(video_id), 'checklist.manage'));

create policy "checklist: eliminar con permiso"
  on public.checklist_items for delete to authenticated
  using (public.has_permission(public.workspace_of_video(video_id), 'checklist.manage'));

-- ---------------------------------------------------------------------------
-- 2. Plantillas de produccion por canal
--
-- La produccion faceless repite el mismo proceso en cada video del canal, asi
-- que el proceso se describe una vez en el canal y cada tarjeta nueva nace con
-- el checklist entero puesto.
-- ---------------------------------------------------------------------------
create table public.channel_template_items (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 200),
  stage_id   uuid references public.stages (id) on delete set null,
  role_id    uuid references public.roles (id) on delete set null,
  position   double precision not null default 1000,
  created_at timestamptz not null default now()
);

create index channel_template_items_channel_idx
  on public.channel_template_items (channel_id, position);
create index channel_template_items_stage_idx on public.channel_template_items (stage_id);
create index channel_template_items_role_idx on public.channel_template_items (role_id);

alter table public.channel_template_items enable row level security;

create policy "plantillas: ver las del equipo"
  on public.channel_template_items for select to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = channel_id and public.is_member(c.workspace_id)
    )
  );

create policy "plantillas: crear con permiso"
  on public.channel_template_items for insert to authenticated
  with check (
    exists (
      select 1 from public.channels c
      where c.id = channel_id and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

create policy "plantillas: editar con permiso"
  on public.channel_template_items for update to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = channel_id and public.has_permission(c.workspace_id, 'channel.manage')
    )
  )
  with check (
    exists (
      select 1 from public.channels c
      where c.id = channel_id and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

create policy "plantillas: borrar con permiso"
  on public.channel_template_items for delete to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = channel_id and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

-- Una tarjeta nueva copia la plantilla de su canal. Se hace en un trigger y no
-- en el cliente para que valga igual si la tarjeta la crea la web, un import o
-- un script.
create or replace function public.apply_channel_template()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_pipeline uuid;
begin
  if new.channel_id is null then
    return new;
  end if;

  insert into public.checklist_items
    (video_id, title, stage_id, role_id, position, created_by)
  select
    new.id,
    t.title,
    -- Solo se copia la etapa si pertenece al pipeline de la tarjeta.
    case when s.pipeline_id = new.pipeline_id then t.stage_id else null end,
    t.role_id,
    t.position,
    new.created_by
  from public.channel_template_items t
  left join public.stages s on s.id = t.stage_id
  where t.channel_id = new.channel_id
  order by t.position;

  return new;
end;
$$;

create trigger videos_apply_template
  after insert on public.videos
  for each row execute function public.apply_channel_template();

-- Copiar el checklist de una tarjeta a la plantilla del canal: se describe el
-- proceso una vez trabajando, no rellenando un formulario en frio.
create or replace function public.save_template_from_video(p_video uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_channel uuid;
  v_count   integer;
begin
  select channel_id into v_channel from public.videos where id = p_video;

  if v_channel is null then
    raise exception 'VIDEO_WITHOUT_CHANNEL' using errcode = '23502';
  end if;

  if not public.has_permission(
    (select workspace_id from public.channels where id = v_channel), 'channel.manage'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.channel_template_items where channel_id = v_channel;

  insert into public.channel_template_items (channel_id, title, stage_id, role_id, position)
  select v_channel, c.title, c.stage_id, c.role_id, c.position
  from public.checklist_items c
  where c.video_id = p_video;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Requisitos de salida por etapa
--
-- Una etapa puede exigir dos cosas antes de dejar salir una tarjeta hacia
-- adelante: que sus pasos de checklist esten cerrados y que ciertos campos
-- esten rellenos. Volver hacia atras nunca se bloquea: si algo esta mal, la
-- tarjeta tiene que poder retroceder.
-- ---------------------------------------------------------------------------
alter table public.stages
  add column require_checklist boolean not null default false,
  add column required_fields   text[] not null default '{}';

-- Lista cerrada de campos exigibles, para que un nombre mal escrito no se
-- convierta en una etapa imposible de superar.
alter table public.stages
  add constraint stages_required_fields_known check (
    required_fields <@ array[
      'hook', 'description', 'script_body', 'due_date', 'publish_at',
      'youtube_url', 'thumbnail_url', 'channel_id', 'assignee', 'asset'
    ]::text[]
  );

-- Que le falta a una tarjeta para salir de una etapa. Devuelve las etiquetas
-- de lo que falta; vacio significa que puede pasar.
create or replace function public.stage_exit_blockers(p_video uuid, p_stage uuid)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_video    public.videos;
  v_stage    public.stages;
  v_missing  text[] := '{}';
  v_field    text;
  v_pending  integer;
  v_empty    boolean;
begin
  select * into v_video from public.videos where id = p_video;
  select * into v_stage from public.stages where id = p_stage;

  if v_video.id is null or v_stage.id is null then
    return v_missing;
  end if;

  if v_stage.require_checklist then
    select count(*) into v_pending
    from public.checklist_items c
    where c.video_id = p_video and c.stage_id = p_stage and not c.is_done;

    if v_pending > 0 then
      v_missing := v_missing || format('%s paso(s) del checklist sin cerrar', v_pending);
    end if;
  end if;

  foreach v_field in array v_stage.required_fields loop
    -- El CASE va a una variable y no dentro del IF: plpgsql cortaria la
    -- condicion del IF en el primer THEN del propio CASE.
    v_empty := case v_field
      when 'hook'          then v_video.hook is null or trim(v_video.hook) = ''
      when 'description'   then v_video.description is null or trim(v_video.description) = ''
      when 'script_body'   then v_video.script_body is null or trim(v_video.script_body) = ''
      when 'due_date'      then v_video.due_date is null
      when 'publish_at'    then v_video.publish_at is null
      when 'youtube_url'   then v_video.youtube_url is null
      when 'thumbnail_url' then v_video.thumbnail_url is null
      when 'channel_id'    then v_video.channel_id is null
      when 'assignee'      then not exists (
                                  select 1 from public.video_assignees a
                                  where a.video_id = p_video
                                )
      when 'asset'         then not exists (
                                  select 1 from public.assets a
                                  where a.video_id = p_video
                                )
      else false
    end;

    if v_empty then
      v_missing := v_missing || case v_field
        when 'hook'          then 'el hook'
        when 'description'   then 'la descripcion'
        when 'script_body'   then 'el guion'
        when 'due_date'      then 'la fecha limite'
        when 'publish_at'    then 'la fecha de publicacion'
        when 'youtube_url'   then 'el enlace de YouTube'
        when 'thumbnail_url' then 'la miniatura'
        when 'channel_id'    then 'el canal'
        when 'assignee'      then 'alguien asignado'
        when 'asset'         then 'al menos un archivo'
        else v_field
      end;
    end if;
  end loop;

  return v_missing;
end;
$$;

-- El guardian de los movimientos comprueba ahora dos cosas: quien mueve, y si
-- la etapa de origen deja salir la tarjeta.
create or replace function public.videos_guard_stage_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_from_pos double precision;
  v_to_pos   double precision;
  v_to_kind  public.stage_kind;
  v_missing  text[];
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  if not public.can_move_video(old.id, new.stage_id) then
    raise exception 'FORBIDDEN_STAGE_MOVE' using errcode = '42501';
  end if;

  select position into v_from_pos from public.stages where id = old.stage_id;
  select position, kind into v_to_pos, v_to_kind from public.stages where id = new.stage_id;

  -- Solo se exige al avanzar. Retroceder y archivar siempre estan permitidos.
  if v_to_kind <> 'archived' and v_to_pos > v_from_pos then
    v_missing := public.stage_exit_blockers(old.id, old.stage_id);

    if array_length(v_missing, 1) > 0 then
      raise exception 'STAGE_REQUIREMENTS_MISSING: %', array_to_string(v_missing, ', ')
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Menciones en comentarios
-- ---------------------------------------------------------------------------
alter table public.comments
  add column mentions uuid[] not null default '{}';

create or replace function public.notify_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_video    public.videos;
  v_mentions uuid[];
  v_users    uuid[];
begin
  select * into v_video from public.videos where id = new.video_id;

  -- Solo se avisa a quien es miembro del equipo, venga lo que venga en el array.
  select array_agg(distinct m.user_id) into v_mentions
  from public.workspace_members m
  where m.workspace_id = v_video.workspace_id
    and m.user_id = any (new.mentions);

  v_mentions := coalesce(v_mentions, '{}'::uuid[]);

  if array_length(v_mentions, 1) > 0 then
    perform public.notify_users(
      v_video.workspace_id, v_mentions, 'comment.mention', new.video_id,
      jsonb_build_object('title', v_video.title, 'excerpt', left(new.body, 140))
    );
  end if;

  -- Los asignados y quien creo la tarjeta, sin repetir a los mencionados.
  select array_agg(distinct u) into v_users
  from (
    select a.user_id as u from public.video_assignees a where a.video_id = new.video_id
    union
    select v_video.created_by
  ) s
  where u is not null and not (u = any (v_mentions));

  if array_length(v_users, 1) > 0 then
    perform public.notify_users(
      v_video.workspace_id, v_users, 'comment.created', new.video_id,
      jsonb_build_object('title', v_video.title, 'excerpt', left(new.body, 140))
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Entradas y salidas de etapa
--
-- Sin un registro de cuando entro y salio cada tarjeta de cada etapa no se
-- puede responder a "donde se atasca la produccion". Lo escribe un trigger, de
-- modo que el historial no depende de que el cliente se acuerde.
-- ---------------------------------------------------------------------------
create table public.stage_transitions (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  video_id     uuid not null references public.videos (id) on delete cascade,
  from_stage   uuid references public.stages (id) on delete set null,
  to_stage     uuid not null references public.stages (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index stage_transitions_video_idx on public.stage_transitions (video_id, created_at);
create index stage_transitions_workspace_idx on public.stage_transitions (workspace_id, created_at desc);
create index stage_transitions_from_idx on public.stage_transitions (from_stage);
create index stage_transitions_to_idx on public.stage_transitions (to_stage);
create index stage_transitions_actor_idx on public.stage_transitions (actor_id);

alter table public.stage_transitions enable row level security;

create policy "transiciones: ver las del equipo"
  on public.stage_transitions for select to authenticated
  using (public.is_member(workspace_id));

create or replace function public.record_stage_transition()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stage_transitions (workspace_id, video_id, to_stage, actor_id)
    values (new.workspace_id, new.id, new.stage_id, auth.uid());
  elsif new.stage_id is distinct from old.stage_id then
    insert into public.stage_transitions (workspace_id, video_id, from_stage, to_stage, actor_id)
    values (new.workspace_id, new.id, old.stage_id, new.stage_id, auth.uid());
  end if;

  return new;
end;
$$;

create trigger videos_record_transition_insert
  after insert on public.videos
  for each row execute function public.record_stage_transition();

create trigger videos_record_transition_update
  after update of stage_id on public.videos
  for each row execute function public.record_stage_transition();

-- Tiempo medio que pasa una tarjeta en cada etapa. Una etapa sin salida (la
-- tarjeta sigue ahi) cuenta hasta ahora, para que un atasco en curso se vea.
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
-- 6. Equipos nuevos: que nazcan ya con esto puesto
--
-- Se reescribe el sembrador para que los roles del sistema lleven el permiso
-- nuevo y para que tres etapas arranquen con el requisito evidente de su
-- oficio. Son un punto de partida: el propietario los quita o los cambia desde
-- Ajustes en un clic.
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
    (pipeline_id, slug, name, color, kind, position, require_checklist, required_fields)
  values
    (v_pipeline, 'idea',      'Ideas',      '#94a3b8', 'backlog',   1000, false, '{}'),
    (v_pipeline, 'script',    'Guion',      '#3b82f6', 'work',      2000, false, '{script_body}'),
    (v_pipeline, 'voiceover', 'Grabacion',  '#ef4444', 'work',      3000, false, '{}'),
    (v_pipeline, 'editing',   'Edicion',    '#f59e0b', 'work',      4000, false, '{}'),
    (v_pipeline, 'thumbnail', 'Miniatura',  '#d946ef', 'work',      5000, false, '{thumbnail_url}'),
    (v_pipeline, 'review',    'Revision',   '#8b5cf6', 'review',    6000, false, '{}'),
    (v_pipeline, 'scheduled', 'Programado', '#22c55e', 'scheduled', 7000, false, '{publish_at}'),
    (v_pipeline, 'published', 'Publicado',  '#0d9488', 'done',      8000, false, '{}'),
    (v_pipeline, 'archived',  'Archivado',  '#cbd5e1', 'archived',  9000, false, '{}');

  -- Roles de sistema: no se borran ni se les quitan permisos.
  insert into public.roles (
    workspace_id, name, color, key, is_system, position,
    manage_workspace, manage_members, manage_channels, manage_pipelines,
    create_videos, delete_videos, edit_videos, assign_videos, move_any_stage,
    manage_checklist, write_comments
  ) values
    (p_workspace, 'Propietario',   '#f59e0b', 'owner', true, 1000,
     true, true, true, true, true, true, true, true, true, true, true),
    (p_workspace, 'Administrador', '#ef4444', 'admin', true, 2000,
     true, true, true, true, true, true, true, true, true, true, true);

  -- Productor: lleva la produccion entera pero no toca la configuracion.
  insert into public.roles (
    workspace_id, name, color, position,
    manage_channels, create_videos, delete_videos, assign_videos, move_any_stage,
    manage_checklist
  ) values (p_workspace, 'Productor', '#f97316', 3000, true, true, true, true, true, true)
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
-- Permisos de ejecucion y realtime
-- ---------------------------------------------------------------------------
revoke all on function public.seed_workspace_defaults(uuid) from public, anon, authenticated;
revoke all on function public.apply_channel_template()     from public, anon, authenticated;
revoke all on function public.record_stage_transition()    from public, anon, authenticated;
revoke all on function public.videos_guard_stage_change()  from public, anon, authenticated;
revoke all on function public.notify_comment()             from public, anon, authenticated;

revoke all on function public.has_permission(uuid, text)               from public, anon;
revoke all on function public.stage_exit_blockers(uuid, uuid)          from public, anon;
revoke all on function public.save_template_from_video(uuid)           from public, anon;
revoke all on function public.stage_durations(uuid, integer)           from public, anon;

grant execute on function public.has_permission(uuid, text)            to authenticated;
grant execute on function public.stage_exit_blockers(uuid, uuid)       to authenticated;
grant execute on function public.save_template_from_video(uuid)        to authenticated;
grant execute on function public.stage_durations(uuid, integer)        to authenticated;

alter table public.channel_template_items replica identity full;
alter publication supabase_realtime add table public.channel_template_items;
