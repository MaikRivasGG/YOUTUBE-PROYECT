-- ===========================================================================
-- v4 · La etapa ES el paso del checklist
--
-- La plantilla de canal (`channel_template_items`) vivia separada de las
-- etapas del pipeline y no se hablaban entre si: cambiar una no actualizaba
-- la otra, y una tarjeta podia tener pasos sin ninguna correlacion visible con
-- por donde iba en el tablero. Se funden en una sola cosa:
--
--   - Cada etapa puede pedir un enlace con nombre propio (`deliverable_label`,
--     ej. "Enlace del guion"). Guardarlo es lo que deja avanzar la tarjeta.
--     Ya no hay plantilla aparte: editar el pipeline en Ajustes ES editar el
--     checklist.
--   - Para que un canal tenga su propio checklist sin arrastrar a los demas,
--     `duplicate_pipeline()` le da su propio pipeline (copiando etapas,
--     requisitos y quien las gestiona) partiendo de uno existente.
--   - El checklist libre de la tarjeta (`checklist_items`) se queda, pero
--     pierde su enlace a una etapa: es explicitamente lo independiente, lo
--     que no encaja en el pipeline. `require_checklist` desaparece porque ya
--     no hay pasos-de-plantilla que atar a una etapa.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Fuera lo que se sustituye
-- ---------------------------------------------------------------------------
drop trigger if exists videos_apply_template on public.videos;
drop function if exists public.apply_channel_template();
drop function if exists public.save_template_from_video(uuid);
drop table if exists public.channel_template_items;

-- ---------------------------------------------------------------------------
-- 2. La etapa gana un enlace propio
-- ---------------------------------------------------------------------------
alter table public.stages
  add column deliverable_label text;

alter table public.stages
  add constraint stages_deliverable_label_length check (
    deliverable_label is null
    or char_length(trim(deliverable_label)) between 1 and 60
  );

-- `stage_exit_blockers` deja de mirar checklist_items (ya no hay pasos atados
-- a una etapa) y en su lugar exige el enlace de video_stage_links.
create or replace function public.stage_exit_blockers(p_video uuid, p_stage uuid)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_video    public.videos;
  v_stage    public.stages;
  v_missing  text[] := '{}';
  v_field    text;
  v_empty    boolean;
begin
  select * into v_video from public.videos where id = p_video;
  select * into v_stage from public.stages where id = p_stage;

  if v_video.id is null or v_stage.id is null then
    return v_missing;
  end if;

  if v_stage.deliverable_label is not null
     and not exists (
       select 1 from public.video_stage_links l
       where l.video_id = p_video and l.stage_id = p_stage
     )
  then
    v_missing := v_missing || format('el enlace de %s', v_stage.deliverable_label);
  end if;

  foreach v_field in array v_stage.required_fields loop
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

-- Ya no hay pasos-de-plantilla que atar a una etapa: el checklist libre
-- (checklist_items) queda fuera del pipeline a proposito.
alter table public.checklist_items
  drop column stage_id;

alter table public.stages
  drop column require_checklist;

-- ---------------------------------------------------------------------------
-- 3. El enlace entregado en cada etapa
-- ---------------------------------------------------------------------------
create table public.video_stage_links (
  video_id     uuid not null references public.videos (id) on delete cascade,
  stage_id     uuid not null references public.stages (id) on delete cascade,
  url          text not null check (url ~* '^https?://'),
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz not null default now(),
  primary key (video_id, stage_id)
);

create index video_stage_links_stage_idx on public.video_stage_links (stage_id);
create index video_stage_links_completed_by_idx on public.video_stage_links (completed_by);

alter table public.video_stage_links enable row level security;

create policy "enlaces de etapa: ver los del equipo"
  on public.video_stage_links for select to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "enlaces de etapa: crear con permiso"
  on public.video_stage_links for insert to authenticated
  with check (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

create policy "enlaces de etapa: editar con permiso"
  on public.video_stage_links for update to authenticated
  using (public.has_permission(public.workspace_of_video(video_id), 'video.edit'))
  with check (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

create policy "enlaces de etapa: borrar con permiso"
  on public.video_stage_links for delete to authenticated
  using (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

-- Quien guardo el enlace y cuando lo pone la base, nunca el cliente; y de
-- paso se comprueba que la etapa sea del mismo pipeline que el video (igual
-- que videos_check_stage_pipeline hace para videos.stage_id).
create or replace function public.video_stage_links_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_video_pipeline uuid;
  v_stage_pipeline uuid;
begin
  select pipeline_id into v_video_pipeline from public.videos where id = new.video_id;
  select pipeline_id into v_stage_pipeline from public.stages where id = new.stage_id;

  if v_video_pipeline is null or v_stage_pipeline is null then
    raise exception 'VIDEO_OR_STAGE_NOT_FOUND' using errcode = '02000';
  end if;

  if v_stage_pipeline <> v_video_pipeline then
    raise exception 'STAGE_PIPELINE_MISMATCH' using errcode = '23514';
  end if;

  new.completed_by := auth.uid();
  new.completed_at := now();

  return new;
end;
$$;

create trigger video_stage_links_guard_trigger
  before insert or update on public.video_stage_links
  for each row execute function public.video_stage_links_guard();

revoke all on function public.video_stage_links_guard() from public, anon, authenticated;

alter table public.video_stage_links replica identity full;
alter publication supabase_realtime add table public.video_stage_links;

-- ---------------------------------------------------------------------------
-- 4. Duplicar un pipeline entero
--
-- Asi un canal consigue su propio checklist (sus propias etapas, requisitos y
-- enlaces) sin arrastrar a los demas canales que siguen en el pipeline
-- original. Copia tambien quien gestiona cada etapa.
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_pipeline(p_pipeline uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace    uuid;
  v_new_pipeline uuid;
  r              record;
  v_new_stage    uuid;
  v_stage_map    jsonb := '{}'::jsonb;
begin
  select workspace_id into v_workspace from public.pipelines where id = p_pipeline;
  if v_workspace is null then
    raise exception 'PIPELINE_NOT_FOUND' using errcode = '02000';
  end if;

  if not public.has_permission(v_workspace, 'pipeline.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.pipelines (workspace_id, name, description, is_default, position)
  select v_workspace, p_name, description, false,
    coalesce((select max(position) from public.pipelines where workspace_id = v_workspace), 0) + 1000
  from public.pipelines
  where id = p_pipeline
  returning id into v_new_pipeline;

  for r in select * from public.stages where pipeline_id = p_pipeline order by position loop
    insert into public.stages
      (pipeline_id, slug, name, color, kind, position, required_fields, deliverable_label)
    values
      (v_new_pipeline, r.slug, r.name, r.color, r.kind, r.position, r.required_fields, r.deliverable_label)
    returning id into v_new_stage;

    v_stage_map := v_stage_map || jsonb_build_object(r.id::text, v_new_stage::text);
  end loop;

  insert into public.role_stages (role_id, stage_id)
  select rs.role_id, (v_stage_map ->> rs.stage_id::text)::uuid
  from public.role_stages rs
  join public.stages s on s.id = rs.stage_id
  where s.pipeline_id = p_pipeline;

  return v_new_pipeline;
end;
$$;

revoke all on function public.duplicate_pipeline(uuid, text) from public, anon;
grant execute on function public.duplicate_pipeline(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. El sembrador de equipos nuevos deja de sembrar require_checklist
--
-- Sin esto, un equipo nuevo rompe al crearse: la funcion seguia insertando en
-- una columna que esta misma migracion acaba de borrar. Ningun canal nace con
-- un enlace exigido de fabrica -el propietario lo decide el mismo desde
-- Ajustes-, igual que ya se hizo con el guion obligatorio.
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
    manage_checklist, write_comments
  ) values
    (p_workspace, 'Propietario',   '#f59e0b', 'owner', true, 1000,
     true, true, true, true, true, true, true, true, true, true, true),
    (p_workspace, 'Administrador', '#ef4444', 'admin', true, 2000,
     true, true, true, true, true, true, true, true, true, true, true);

  insert into public.roles (
    workspace_id, name, color, position,
    manage_channels, create_videos, delete_videos, assign_videos, move_any_stage,
    manage_checklist
  ) values (p_workspace, 'Productor', '#f97316', 3000, true, true, true, true, true, true)
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

revoke all on function public.seed_workspace_defaults(uuid) from public, anon, authenticated;

-- Los datos de muestra ("Probar con datos de muestra") tenian el mismo
-- problema: sembraban checklist_items con la columna stage_id que se acaba
-- de borrar. El paso deja de apuntar a una etapa; sigue llevando su rol.
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
    insert into public.checklist_items (video_id, title, role_id, is_done, position, created_by)
    select
      v_video, d.title, r.id, d.done, d.position, auth.uid()
    from (values
      ('Investigacion y fuentes', 'Productor',  true,  1000),
      ('Guion aprobado',          'Guionista',  false, 2000),
      ('Voz en off grabada',      'Locutor',    false, 3000),
      ('Miniatura A/B',           'Disenador',  false, 4000)
    ) as d(title, role_name, done, position)
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

revoke all on function public.seed_demo_workspace() from public, anon, authenticated;
grant execute on function public.seed_demo_workspace() to authenticated;
