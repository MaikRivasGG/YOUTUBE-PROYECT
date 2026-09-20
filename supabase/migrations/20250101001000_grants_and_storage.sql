-- ===========================================================================
-- v2 · Permisos de ejecucion y almacenamiento de imagenes
--
-- Las funciones que se recrearon en la migracion anterior vuelven a nacer con
-- EXECUTE abierto a PUBLIC, asi que hay que cerrarlas otra vez. Misma regla
-- que antes: fuera de la API todo lo interno, y dentro solo lo que la
-- aplicacion llama de verdad.
-- ===========================================================================

-- Convierte texto en uuid solo si lo es; evita romper una politica cuando
-- llega una ruta con un nombre de carpeta inesperado.
create or replace function public.safe_uuid(p_value text)
returns uuid
language plpgsql immutable
set search_path = public
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones internas: fuera de la API
-- ---------------------------------------------------------------------------
revoke all on function public.seed_workspace_defaults(uuid)          from public, anon, authenticated;
revoke all on function public.videos_guard_stage_change()            from public, anon, authenticated;
revoke all on function public.videos_check_stage_pipeline()          from public, anon, authenticated;
revoke all on function public.videos_publish_stamp_fn()              from public, anon, authenticated;
revoke all on function public.videos_activity_trigger()              from public, anon, authenticated;
revoke all on function public.checklist_done_stamp()                 from public, anon, authenticated;
revoke all on function public.protect_last_owner()                   from public, anon, authenticated;
revoke all on function public.can_move_video(uuid, uuid)             from public, anon, authenticated;
revoke all on function public.notify_users(uuid, uuid[], text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.notify_stage_change()                  from public, anon, authenticated;
revoke all on function public.notify_assignment()                    from public, anon, authenticated;
revoke all on function public.notify_comment()                       from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ayudantes que necesitan las politicas RLS (se evaluan con el rol de quien
-- consulta, asi que authenticated tiene que poder ejecutarlos)
-- ---------------------------------------------------------------------------
revoke all on function public.has_permission(uuid, text)     from public, anon;
revoke all on function public.is_owner(uuid)                 from public, anon;
revoke all on function public.manages_stage(uuid)            from public, anon;
revoke all on function public.workspace_of_pipeline(uuid)    from public, anon;
revoke all on function public.workspace_of_stage(uuid)       from public, anon;
revoke all on function public.workspace_of_role(uuid)        from public, anon;
revoke all on function public.safe_uuid(text)                from public, anon;

grant execute on function public.has_permission(uuid, text)  to authenticated;
grant execute on function public.is_owner(uuid)              to authenticated;
grant execute on function public.manages_stage(uuid)         to authenticated;
grant execute on function public.workspace_of_pipeline(uuid) to authenticated;
grant execute on function public.workspace_of_stage(uuid)    to authenticated;
grant execute on function public.workspace_of_role(uuid)     to authenticated;
grant execute on function public.safe_uuid(text)             to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de la aplicacion: solo con sesion iniciada
-- ---------------------------------------------------------------------------
revoke all on function public.create_workspace(text, text)                from public, anon;
revoke all on function public.seed_demo_workspace()                       from public, anon;
revoke all on function public.move_video(uuid, uuid, double precision)    from public, anon;
revoke all on function public.accept_invitation(text)                     from public, anon;
revoke all on function public.workspace_stats(uuid)                       from public, anon;

grant execute on function public.create_workspace(text, text)             to authenticated;
grant execute on function public.seed_demo_workspace()                    to authenticated;
grant execute on function public.move_video(uuid, uuid, double precision) to authenticated;
grant execute on function public.accept_invitation(text)                  to authenticated;
grant execute on function public.workspace_stats(uuid)                    to authenticated;

-- La vista previa de la invitacion la abre alguien sin sesion.
revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ===========================================================================
-- Almacenamiento de imagenes
--
-- Dos cubos publicos de lectura (las imagenes se sirven por CDN) pero con la
-- escritura acotada: cada quien manda en su carpeta.
--   avatars/<user_id>/...        foto de perfil
--   channels/<workspace_id>/...  miniatura del canal
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',  'avatars',  true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('channels', 'channels', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "avatares: lectura publica"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatares: cada quien sube el suyo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatares: cada quien reemplaza el suyo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatares: cada quien borra el suyo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "canales: lectura publica"
  on storage.objects for select
  using (bucket_id = 'channels');

create policy "canales: subir con permiso sobre el equipo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channels'
    and public.has_permission(
      public.safe_uuid((storage.foldername(name))[1]), 'channel.manage'
    )
  );

create policy "canales: reemplazar con permiso sobre el equipo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'channels'
    and public.has_permission(
      public.safe_uuid((storage.foldername(name))[1]), 'channel.manage'
    )
  );

create policy "canales: borrar con permiso sobre el equipo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'channels'
    and public.has_permission(
      public.safe_uuid((storage.foldername(name))[1]), 'channel.manage'
    )
  );
