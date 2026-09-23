-- ===========================================================================
-- Afinado de rendimiento de 20250101001700_channel_access.sql
--
-- El advisor de Supabase senala 8 politicas nuevas que llaman a auth.uid()
-- sin envolverlo en (select ...): Postgres lo reevalua en cada fila en vez de
-- una vez por consulta. Se corrige sin tocar la logica, igual que ya hace el
-- resto de politicas del proyecto.
-- ===========================================================================

drop policy "miembros de canal: ver con permiso o lo propio" on public.channel_members;
create policy "miembros de canal: ver con permiso o lo propio"
  on public.channel_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.channels c
      where c.id = channel_members.channel_id
        and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

drop policy "asignaciones: crear con permiso" on public.video_assignees;
create policy "asignaciones: crear con permiso"
  on public.video_assignees for insert to authenticated
  with check (
    public.can_view_video(video_id)
    and (
      public.has_permission(public.workspace_of_video(video_id), 'video.assign')
      or user_id = (select auth.uid())
    )
  );

drop policy "asignaciones: eliminar con permiso" on public.video_assignees;
create policy "asignaciones: eliminar con permiso"
  on public.video_assignees for delete to authenticated
  using (
    public.can_view_video(video_id)
    and (
      public.has_permission(public.workspace_of_video(video_id), 'video.assign')
      or user_id = (select auth.uid())
    )
  );

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
          and mr.user_id = (select auth.uid())
      )
    )
  )
  with check (
    public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "comentarios: escribir" on public.comments;
create policy "comentarios: escribir"
  on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'comment.write')
  );

drop policy "comentarios: borrar el propio o moderar" on public.comments;
create policy "comentarios: borrar el propio o moderar"
  on public.comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (
      public.can_view_video(video_id)
      and public.has_permission(public.workspace_of_video(video_id), 'workspace.manage')
    )
  );

drop policy "assets: crear con permiso" on public.assets;
create policy "assets: crear con permiso"
  on public.assets for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_view_video(video_id)
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "assets: eliminar con permiso" on public.assets;
create policy "assets: eliminar con permiso"
  on public.assets for delete to authenticated
  using (
    created_by = (select auth.uid())
    or (
      public.can_view_video(video_id)
      and public.has_permission(public.workspace_of_video(video_id), 'video.delete')
    )
  );
