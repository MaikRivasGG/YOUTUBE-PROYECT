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
