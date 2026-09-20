-- ===========================================================================
-- Prueba de extremo a extremo del modelo v2: pipelines, etapas y roles
-- configurables, notificaciones y almacenamiento.
--
-- Se ejecuta sobre una base recien migrada (scripts/db-test.sh). Los ERROR
-- marcados como "debe fallar" son el resultado correcto.
-- ===========================================================================

\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio.com',   '{"full_name":"Ana Cortes"}'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@estudio.com', '{"full_name":"Bruno Diaz"}'),
  ('33333333-3333-3333-3333-333333333333', 'carla@estudio.com', '{"full_name":"Carla Ruiz"}'),
  ('44444444-4444-4444-4444-444444444444', 'nuria@estudio.com', '{"full_name":"Nuria Gil"}');

\echo ''
\echo '## 1 · El alta en auth.users crea el perfil publico'
select count(*) as perfiles from public.profiles;

\echo ''
\echo '## 2 · Ana crea el equipo de demostracion'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select name from public.seed_demo_workspace();
select
  (select count(*) from public.videos) as videos,
  (select count(*) from public.channels) as canales,
  (select count(*) from public.pipelines) as pipelines,
  (select count(*) from public.stages) as etapas,
  (select count(*) from public.roles) as roles;

\echo ''
\echo '## 3 · El pipeline por defecto trae sus etapas en orden'
select slug, name, kind from public.stages order by position;

\echo ''
\echo '## 4 · Ana es propietaria por su rol, no por una columna'
select r.name as rol, r.key from public.member_roles mr
join public.roles r on r.id = mr.role_id
where mr.user_id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '## 5 · Quien no es miembro no ve nada'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select count(*) as videos_visibles_para_bruno from public.videos;

\echo ''
\echo '## 6 · Ana da de alta a Bruno (Disenador) y Carla (Observador)'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.workspace_members (workspace_id, user_id)
  select id, '22222222-2222-2222-2222-222222222222' from public.workspaces;
insert into public.member_roles (workspace_id, user_id, role_id)
  select w.id, '22222222-2222-2222-2222-222222222222', r.id
  from public.workspaces w join public.roles r on r.workspace_id = w.id
  where r.name = 'Disenador';
insert into public.workspace_members (workspace_id, user_id)
  select id, '33333333-3333-3333-3333-333333333333' from public.workspaces;
insert into public.member_roles (workspace_id, user_id, role_id)
  select w.id, '33333333-3333-3333-3333-333333333333', r.id
  from public.workspaces w join public.roles r on r.workspace_id = w.id
  where r.name = 'Observador';

\echo ''
\echo '## 7 · Bruno mueve de GUION a GRABACION -> debe fallar (no es su etapa)'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.move_video(
  (select v.id from public.videos v join public.stages s on s.id = v.stage_id
   where s.slug = 'script' order by v.ref limit 1),
  (select id from public.stages where slug = 'voiceover'),
  1500);

\echo ''
\echo '## 8 · Bruno mueve de EDICION a MINIATURA (su etapa) -> permitido'
select ref from public.move_video(
  (select v.id from public.videos v join public.stages s on s.id = v.stage_id
   where s.slug = 'editing' order by v.ref limit 1),
  (select id from public.stages where slug = 'thumbnail'),
  1000);

\echo ''
\echo '## 9 · Bruno edita un campo de una tarjeta que esta en GUION -> permitido'
update public.videos set thumbnail_url = 'https://cdn.test/a.jpg'
  where id = (select v.id from public.videos v join public.stages s on s.id = v.stage_id
              where s.slug = 'script' order by v.ref limit 1);

\echo ''
\echo '## 10 · Un UPDATE directo que cambie la etapa -> debe fallar (trigger)'
update public.videos set stage_id = (select id from public.stages where slug = 'published')
  where id = (select v.id from public.videos v join public.stages s on s.id = v.stage_id
              where s.slug = 'script' order by v.ref limit 1);

\echo ''
\echo '## 11 · Varios roles a la vez: Ana suma Locutor a Bruno'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.member_roles (workspace_id, user_id, role_id)
  select w.id, '22222222-2222-2222-2222-222222222222', r.id
  from public.workspaces w join public.roles r on r.workspace_id = w.id
  where r.name = 'Locutor';

\echo ''
\echo '## 12 · ...y ahora Bruno si mueve de GRABACION a EDICION'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select ref from public.move_video(
  (select v.id from public.videos v join public.stages s on s.id = v.stage_id
   where s.slug = 'voiceover' order by v.ref limit 1),
  (select id from public.stages where slug = 'editing'),
  3000);

\echo ''
\echo '## 13 · La observadora no comenta -> debe fallar'
reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
insert into public.comments (video_id, author_id, body)
  values ((select id from public.videos order by ref limit 1),
          '33333333-3333-3333-3333-333333333333', 'Hola');

\echo ''
\echo '## 14 · ...pero si lee el tablero entero'
select count(*) as videos_visibles_para_carla from public.videos;

\echo ''
\echo '## 15 · Publicar sella la fecha (etapa de tipo done)'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select ref, published_at is not null as sellado from public.move_video(
  (select v.id from public.videos v join public.stages s on s.id = v.stage_id
   where s.slug = 'scheduled' order by v.ref limit 1),
  (select id from public.stages where slug = 'published'),
  1000);

\echo ''
\echo '## 16 · La actividad guarda los nombres de etapa del equipo'
select payload->>'from' as de, payload->>'to' as a
from public.activity where type = 'video.moved' order by created_at desc limit 3;

\echo ''
\echo '## 17 · Notificaciones: a quien gestiona la etapa de destino'
select
  p.full_name as destinatario,
  n.type,
  n.payload->>'stage' as etapa
from public.notifications n
join public.profiles p on p.id = n.user_id
where n.type = 'stage.entered'
order by n.created_at desc limit 5;

\echo ''
\echo '## 18 · Invitar exige permiso: Bruno no puede -> debe fallar'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
insert into public.invitations (workspace_id, email, role_id, invited_by)
  select w.id, 'nuria@estudio.com', r.id, '22222222-2222-2222-2222-222222222222'
  from public.workspaces w join public.roles r on r.workspace_id = w.id
  where r.name = 'Editor';

\echo ''
\echo '## 19 · Ana invita a una editora; nadie invita como propietario'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.invitations (workspace_id, email, role_id, invited_by)
  select w.id, 'nuria@estudio.com', r.id, '11111111-1111-1111-1111-111111111111'
  from public.workspaces w join public.roles r on r.workspace_id = w.id
  where r.name = 'Editor';
insert into public.invitations (workspace_id, email, role_id, invited_by)
  select w.id, 'otro@estudio.com', r.id, '11111111-1111-1111-1111-111111111111'
  from public.workspaces w join public.roles r on r.workspace_id = w.id
  where r.key = 'owner';

reset role;
select token as tok from public.invitations where email = 'nuria@estudio.com' \gset

\echo ''
\echo '## 20 · Aceptar con otro email -> debe fallar'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.accept_invitation(:'tok');

\echo ''
\echo '## 21 · La destinataria la acepta y entra con su rol'
reset role;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
select name from public.accept_invitation(:'tok');
select r.name as rol_de_nuria from public.member_roles mr
join public.roles r on r.id = mr.role_id
where mr.user_id = '44444444-4444-4444-4444-444444444444';

\echo ''
\echo '## 22 · El enlace no sirve dos veces -> debe fallar'
select public.accept_invitation(:'tok');

\echo ''
\echo '## 23 · Nadie se concede el rol de propietario (0 filas)'
insert into public.member_roles (workspace_id, user_id, role_id)
  select w.id, '44444444-4444-4444-4444-444444444444', r.id
  from public.workspaces w join public.roles r on r.workspace_id = w.id
  where r.key = 'owner';

\echo ''
\echo '## 24 · Los roles de sistema no se editan ni se borran (0 filas)'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
update public.roles set name = 'Jefazo' where key = 'owner';
delete from public.roles where key = 'admin';
select count(*) as roles_de_sistema from public.roles where is_system;

\echo ''
\echo '## 25 · El propietario si renombra un rol propio y le cambia la etapa'
update public.roles set name = 'Montador' where name = 'Editor';
select name from public.roles where name = 'Montador';

\echo ''
\echo '## 26 · No se puede dejar al equipo sin propietario -> debe fallar'
delete from public.member_roles mr
using public.roles r
where r.id = mr.role_id and r.key = 'owner';

\echo ''
\echo '## 27 · Segundo pipeline: el equipo crea un flujo para Shorts'
insert into public.pipelines (workspace_id, name, position)
  select id, 'Shorts', 2000 from public.workspaces;
insert into public.stages (pipeline_id, slug, name, color, kind, position)
  select p.id, 'grabar', 'Grabar', '#ef4444', 'work', 1000 from public.pipelines p where p.name = 'Shorts';
insert into public.stages (pipeline_id, slug, name, color, kind, position)
  select p.id, 'subir', 'Subir', '#22c55e', 'done', 2000 from public.pipelines p where p.name = 'Shorts';
select p.name as pipeline, count(s.id) as etapas
from public.pipelines p left join public.stages s on s.pipeline_id = p.id
group by p.name order by p.name;

\echo ''
\echo '## 28 · Una tarjeta no puede saltar a la etapa de otro pipeline -> debe fallar'
select public.move_video(
  (select id from public.videos order by ref limit 1),
  (select id from public.stages where slug = 'subir'),
  1000);

\echo ''
\echo '## 29 · Un paso de checklist con rol solo lo marca ese rol (0 filas)'
-- Bruno es Disenador y Locutor, no Guionista: puede editar videos pero este
-- paso concreto no es suyo.
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
update public.checklist_items set is_done = true
  where id = (select c.id from public.checklist_items c
              join public.roles r on r.id = c.role_id
              where r.name = 'Guionista' limit 1);
select is_done as sigue_sin_marcar from public.checklist_items c
  join public.roles r on r.id = c.role_id
  where r.name = 'Guionista' limit 1;

\echo ''
\echo '## 30 · ...y al marcarlo quien toca, queda registrado quien fue'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
update public.checklist_items set is_done = true
  where id = (select c.id from public.checklist_items c
              join public.roles r on r.id = c.role_id
              where r.name = 'Guionista' limit 1);
select c.title, p.full_name as completado_por, c.done_at is not null as con_fecha
from public.checklist_items c
join public.profiles p on p.id = c.completed_by
limit 1;

\echo ''
\echo '## 31 · Varios responsables en un mismo paso'
insert into public.checklist_assignees (item_id, user_id)
  select c.id, '22222222-2222-2222-2222-222222222222'
  from public.checklist_items c limit 1;
insert into public.checklist_assignees (item_id, user_id)
  select c.id, '33333333-3333-3333-3333-333333333333'
  from public.checklist_items c limit 1;
select count(*) as responsables_del_paso from public.checklist_assignees;

\echo ''
\echo '## 32 · Imagenes: nadie sube un avatar en la carpeta de otro -> debe fallar'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
insert into storage.objects (bucket_id, name)
  values ('avatars', '11111111-1111-1111-1111-111111111111/foto.png');

\echo ''
\echo '## 33 · ...pero si en la suya'
insert into storage.objects (bucket_id, name)
  values ('avatars', '22222222-2222-2222-2222-222222222222/foto.png');

\echo ''
\echo '## 34 · La miniatura del canal exige permiso sobre canales -> debe fallar'
insert into storage.objects (bucket_id, name)
  select 'channels', w.id || '/logo.png' from public.workspaces w;

\echo ''
\echo '## 35 · ...y la propietaria si puede'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into storage.objects (bucket_id, name)
  select 'channels', w.id || '/logo.png' from public.workspaces w;

\echo ''
\echo '## 36 · Un cliente no puede inyectar avisos falsos -> debe fallar'
select public.notify_users(
  (select id from public.workspaces limit 1),
  array['33333333-3333-3333-3333-333333333333'::uuid],
  'stage.entered', null, '{}'::jsonb);

\echo ''
\echo '## 37 · Cada quien solo ve sus propios avisos'
select count(*) as avisos_de_ana from public.notifications;

\echo ''
\echo '## 38 · Las metricas responden sobre el modelo nuevo'
select jsonb_pretty(public.workspace_stats((select id from public.workspaces limit 1)));

-- ===========================================================================
-- v3 · Plantillas por canal, requisitos de etapa, menciones y tiempos
-- ===========================================================================

\echo ''
\echo '## 39 · La propietaria describe el proceso del canal una sola vez'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.channel_template_items (channel_id, title, stage_id, role_id, position)
select
  c.id,
  t.title,
  (select s.id from public.stages s
    where s.pipeline_id = c.pipeline_id and s.slug = t.slug),
  (select r.id from public.roles r
    where r.workspace_id = c.workspace_id and r.name = t.rol),
  t.pos
from public.channels c,
  (values
    ('Escribir el guion',   'script',    'Guionista', 1000.0),
    ('Grabar la voz',       'voiceover', 'Locutor',   2000.0),
    ('Montar el video',     'editing',   'Editor',    3000.0),
    ('Disenar la miniatura','thumbnail', 'Disenador', 4000.0)
  ) as t(title, slug, rol, pos)
where c.id = (select id from public.channels order by created_at limit 1);
select count(*) as pasos_de_plantilla from public.channel_template_items;

\echo ''
\echo '## 40 · Una tarjeta nueva del canal nace con el checklist puesto'
insert into public.videos (workspace_id, channel_id, pipeline_id, stage_id, ref, title, created_by)
select
  c.workspace_id, c.id, c.pipeline_id,
  (select s.id from public.stages s where s.pipeline_id = c.pipeline_id and s.slug = 'idea'),
  'TPL-001', 'Video con plantilla', '11111111-1111-1111-1111-111111111111'
from public.channels c
where c.id = (select channel_id from public.channel_template_items limit 1);

select c.title, s.slug as etapa, r.name as rol
from public.checklist_items c
left join public.stages s on s.id = c.stage_id
left join public.roles r on r.id = c.role_id
where c.video_id = (select id from public.videos where title = 'Video con plantilla')
order by c.position;

\echo ''
\echo '## 41 · Un rol de linea ya no reestructura el checklist ajeno -> debe fallar'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
insert into public.checklist_items (video_id, title)
select id, 'Paso colado' from public.videos where title = 'Video con plantilla';

\echo ''
\echo '## 42 · ...pero si puede marcar el paso de su rol'
select count(*) as pasos_visibles from public.checklist_items
where video_id = (select id from public.videos where title = 'Video con plantilla');

\echo ''
\echo '## 43 · La etapa de Guion exige guion antes de avanzar -> debe fallar'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
update public.stages set required_fields = '{script_body}'
where slug = 'script' and pipeline_id = (select pipeline_id from public.videos where title = 'Video con plantilla');

update public.videos
set stage_id = (select s.id from public.stages s
  where s.pipeline_id = videos.pipeline_id and s.slug = 'script')
where title = 'Video con plantilla';

update public.videos
set stage_id = (select s.id from public.stages s
  where s.pipeline_id = videos.pipeline_id and s.slug = 'voiceover')
where title = 'Video con plantilla';

\echo ''
\echo '## 44 · Que le falta exactamente'
select public.stage_exit_blockers(
  (select id from public.videos where title = 'Video con plantilla'),
  (select stage_id from public.videos where title = 'Video con plantilla')
) as le_falta;

\echo ''
\echo '## 45 · Con el guion escrito, la tarjeta pasa'
update public.videos set script_body = 'Hook, desarrollo y cierre.' where title = 'Video con plantilla';
update public.videos
set stage_id = (select s.id from public.stages s
  where s.pipeline_id = videos.pipeline_id and s.slug = 'voiceover')
where title = 'Video con plantilla';
select s.slug as etapa_actual from public.videos v
join public.stages s on s.id = v.stage_id where v.title = 'Video con plantilla';

\echo ''
\echo '## 46 · Retroceder nunca se bloquea, aunque falten requisitos'
update public.stages set required_fields = '{youtube_url}'
where slug = 'voiceover' and pipeline_id = (select pipeline_id from public.videos where title = 'Video con plantilla');
update public.videos
set stage_id = (select s.id from public.stages s
  where s.pipeline_id = videos.pipeline_id and s.slug = 'script')
where title = 'Video con plantilla';
select s.slug as etapa_actual from public.videos v
join public.stages s on s.id = v.stage_id where v.title = 'Video con plantilla';

\echo ''
\echo '## 47 · Una etapa puede exigir su checklist cerrado -> debe fallar'
update public.stages set require_checklist = true, required_fields = '{}'
where slug = 'script' and pipeline_id = (select pipeline_id from public.videos where title = 'Video con plantilla');
update public.videos
set stage_id = (select s.id from public.stages s
  where s.pipeline_id = videos.pipeline_id and s.slug = 'voiceover')
where title = 'Video con plantilla';

\echo ''
\echo '## 48 · Un campo inventado no puede convertirse en requisito -> debe fallar'
update public.stages set required_fields = '{campo_inventado}'
where slug = 'script' and pipeline_id = (select pipeline_id from public.videos where title = 'Video con plantilla');

\echo ''
\echo '## 49 · Mencionar a alguien le genera su propio aviso'
update public.stages set require_checklist = false where slug = 'script';
insert into public.comments (video_id, author_id, body, mentions)
select id, '11111111-1111-1111-1111-111111111111',
  'Ojo con el audio del minuto 2 @Bruno',
  array['22222222-2222-2222-2222-222222222222'::uuid]
from public.videos where title = 'Video con plantilla';

reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select type, count(*) from public.notifications
where type in ('comment.mention', 'comment.created') group by type order by type;

\echo ''
\echo '## 50 · Una mencion a alguien de fuera del equipo se descarta'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.comments (video_id, author_id, body, mentions)
select id, '11111111-1111-1111-1111-111111111111', 'Hola forastera',
  array['44444444-4444-4444-4444-444444444444'::uuid]
from public.videos where title = 'Video con plantilla';
select count(*) as avisos_a_nuria from public.notifications
where user_id = '44444444-4444-4444-4444-444444444444';

\echo ''
\echo '## 51 · Cada paso por una etapa queda registrado'
select count(*) as transiciones from public.stage_transitions
where video_id = (select id from public.videos where title = 'Video con plantilla');

\echo ''
\echo '## 52 · Y de ahi sale el tiempo medio por etapa'
select count(*) as etapas_medidas
from public.stage_durations((select id from public.workspaces limit 1), 90);

\echo ''
\echo '## 53 · El checklist de una tarjeta se guarda como plantilla del canal'
select public.save_template_from_video(
  (select id from public.videos where title = 'Video con plantilla')
) as pasos_guardados;
