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
