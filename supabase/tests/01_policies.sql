-- ===========================================================================
-- Prueba de extremo a extremo de las politicas RLS y las reglas del pipeline.
--
-- Se ejecuta sobre una base recien migrada (ver scripts/db-test.sh). Cada
-- bloque imprime lo que se espera; los ERROR marcados como "debe fallar" son
-- el resultado correcto.
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
select name, slug from public.seed_demo_workspace();
select (select count(*) from public.videos) as videos,
       (select count(*) from public.channels) as canales;

\echo ''
\echo '## 3 · Las referencias VID-000x se generan solas'
select ref, title from public.videos order by ref limit 3;

\echo ''
\echo '## 4 · Quien no es miembro no ve nada'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select count(*) as videos_visibles_para_bruno from public.videos;

\echo ''
\echo '## 5 · Y tampoco puede darse de alta por su cuenta (0 filas)'
insert into public.workspace_members (workspace_id, user_id, role)
  select id, '22222222-2222-2222-2222-222222222222', 'admin' from public.workspaces;

\echo ''
\echo '## 6 · Ana da de alta a Bruno (disenador) y Carla (observadora)'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.workspace_members (workspace_id, user_id, role)
  select id, '22222222-2222-2222-2222-222222222222', 'designer' from public.workspaces;
insert into public.workspace_members (workspace_id, user_id, role)
  select id, '33333333-3333-3333-3333-333333333333', 'viewer' from public.workspaces;

\echo ''
\echo '## 7 · Bruno mueve de GUION a GRABACION -> debe fallar (no es su etapa)'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.move_video(
  (select id from public.videos where status = 'script' order by ref limit 1), 'voiceover', 1500);

\echo ''
\echo '## 8 · Bruno mueve de EDICION a MINIATURA -> permitido'
select ref, status from public.move_video(
  (select id from public.videos where status = 'editing' order by ref limit 1), 'thumbnail', 1000);

\echo ''
\echo '## 9 · Bruno edita un campo de una tarjeta en GUION -> permitido'
update public.videos set thumbnail_url = 'https://cdn.test/a.jpg'
  where id = (select id from public.videos where status = 'script' order by ref limit 1);

\echo ''
\echo '## 10 · Un UPDATE directo que cambie la etapa -> debe fallar (trigger)'
update public.videos set status = 'published'
  where id = (select id from public.videos where status = 'script' order by ref limit 1);

\echo ''
\echo '## 11 · La observadora no comenta -> debe fallar'
reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
insert into public.comments (video_id, author_id, body)
  values ((select id from public.videos order by ref limit 1),
          '33333333-3333-3333-3333-333333333333', 'Hola');

\echo ''
\echo '## 12 · ...ni mueve tarjetas -> debe fallar'
select public.move_video(
  (select id from public.videos where status = 'idea' order by ref limit 1), 'script', 500);

\echo ''
\echo '## 13 · ...pero si lee el tablero completo'
select count(*) as videos_visibles_para_carla from public.videos;

\echo ''
\echo '## 14 · La propietaria publica y se sella published_at'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select ref, status, published_at is not null as sellado
from public.move_video(
  (select id from public.videos where status = 'scheduled' order by ref limit 1), 'published', 1000);

\echo ''
\echo '## 15 · El feed de actividad registra cada movimiento'
select type, payload->>'from' as de, payload->>'to' as a
from public.activity where type = 'video.moved' order by created_at desc limit 3;

\echo ''
\echo '## 16 · Invitar exige permiso: Bruno no puede -> debe fallar'
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
insert into public.invitations (workspace_id, email, role, invited_by)
  select id, 'nuria@estudio.com', 'editor', '22222222-2222-2222-2222-222222222222'
  from public.workspaces;

\echo ''
\echo '## 17 · Ana invita a una editora; nadie puede invitar como propietario'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.invitations (workspace_id, email, role, invited_by)
  select id, 'nuria@estudio.com', 'editor', '11111111-1111-1111-1111-111111111111'
  from public.workspaces;
insert into public.invitations (workspace_id, email, role, invited_by)
  select id, 'otro@estudio.com', 'owner', '11111111-1111-1111-1111-111111111111'
  from public.workspaces;

-- El token viaja en la URL del enlace; aqui se lee como superusuario.
reset role;
select token as tok from public.invitations where email = 'nuria@estudio.com' \gset

\echo ''
\echo '## 18 · Aceptar con otro email -> debe fallar'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.accept_invitation(:'tok');

\echo ''
\echo '## 19 · La destinataria la acepta y entra con su rol'
reset role;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
select name from public.accept_invitation(:'tok');
select role as rol_de_nuria from public.workspace_members
where user_id = '44444444-4444-4444-4444-444444444444';

\echo ''
\echo '## 20 · El enlace no sirve dos veces -> debe fallar'
select public.accept_invitation(:'tok');

\echo ''
\echo '## 21 · Nadie se sube el rol a si mismo (0 filas)'
update public.workspace_members set role = 'admin'
where user_id = '44444444-4444-4444-4444-444444444444';
select role as rol_tras_el_intento from public.workspace_members
where user_id = '44444444-4444-4444-4444-444444444444';

\echo ''
\echo '## 22 · La editora mueve de GRABACION a EDICION -> permitido'
select ref, status from public.move_video(
  (select id from public.videos where status = 'voiceover' order by ref limit 1), 'editing', 1500);

\echo ''
\echo '## 23 · Nadie puede echar al propietario (0 filas)'
delete from public.workspace_members where role = 'owner';
select count(*) as propietarios from public.workspace_members where role = 'owner';

\echo ''
\echo '## 24 · Borrar un video arrastra su checklist (cascada)'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select count(*) as checklist_antes from public.checklist_items;
delete from public.videos where ref = 'VID-0001';
select count(*) as checklist_despues from public.checklist_items;

\echo ''
\echo '## 25 · Las metricas del dashboard responden'
select jsonb_pretty(public.workspace_stats((select id from public.workspaces limit 1)));

\echo ''
\echo '## 26 · Un enlace javascript: no entra en la base de datos -> debe fallar'
update public.videos set youtube_url = 'javascript:alert(1)'
  where ref = 'VID-0002';

\echo ''
\echo '## 27 · Un enlace https si entra'
update public.videos set youtube_url = 'https://youtu.be/abc123'
  where ref = 'VID-0002';
select ref, youtube_url from public.videos where ref = 'VID-0002';

\echo ''
\echo '## 28 · Un cliente no puede inyectar actividad falsa -> debe fallar'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.log_activity(
  (select id from public.workspaces limit 1), null, 'video.moved', '{"title":"falso"}'::jsonb);

\echo ''
\echo '## 29 · Los triggers siguen funcionando pese a revocar sus funciones'
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.videos (workspace_id, title, status)
  values ((select id from public.workspaces limit 1), 'Prueba de triggers', 'idea');
select ref, created_by is not null as autor_sellado
from public.videos where title = 'Prueba de triggers';
select count(*) as actividad_registrada from public.activity
where type = 'video.created' and payload->>'title' = 'Prueba de triggers';
