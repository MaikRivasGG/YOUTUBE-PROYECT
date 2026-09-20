-- ===========================================================================
-- Rendimiento
--
-- 1. auth.uid() dentro de una politica se reevalua por cada fila. Envuelto en
--    (select auth.uid()) Postgres lo calcula una vez por consulta (InitPlan).
--    Es la recomendacion del linter de Supabase y se nota en tablas grandes.
-- 2. Indices en las claves foraneas que no los tenian: sin ellos, borrar un
--    perfil o un workspace obliga a recorrer la tabla hija entera.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Politicas reescritas con (select auth.uid())
-- ---------------------------------------------------------------------------
drop policy "profiles: ver companeros de equipo" on public.profiles;
create policy "profiles: ver companeros de equipo"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = public.profiles.id
    )
  );

drop policy "profiles: editar el propio" on public.profiles;
create policy "profiles: editar el propio"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy "workspaces: crear" on public.workspaces;
create policy "workspaces: crear"
  on public.workspaces for insert
  to authenticated
  with check (created_by = (select auth.uid()));

drop policy "miembros: cambiar rol con permiso" on public.workspace_members;
create policy "miembros: cambiar rol con permiso"
  on public.workspace_members for update
  to authenticated
  using (
    public.has_permission(workspace_id, 'member.manage')
    and (role <> 'owner' or public.current_member_role(workspace_id) = 'owner')
  )
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and user_id <> (select auth.uid())
  );

drop policy "miembros: baja con permiso o salir del equipo" on public.workspace_members;
create policy "miembros: baja con permiso o salir del equipo"
  on public.workspace_members for delete
  to authenticated
  using (
    (user_id = (select auth.uid()) and role <> 'owner')
    or (
      public.has_permission(workspace_id, 'member.manage')
      and role <> 'owner'
      and user_id <> (select auth.uid())
    )
  );

drop policy "invitaciones: crear con permiso" on public.invitations;
create policy "invitaciones: crear con permiso"
  on public.invitations for insert
  to authenticated
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and invited_by = (select auth.uid())
    and role <> 'owner'
  );

drop policy "asignaciones: crear con permiso" on public.video_assignees;
create policy "asignaciones: crear con permiso"
  on public.video_assignees for insert
  to authenticated
  with check (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = (select auth.uid())
  );

drop policy "asignaciones: eliminar con permiso" on public.video_assignees;
create policy "asignaciones: eliminar con permiso"
  on public.video_assignees for delete
  to authenticated
  using (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = (select auth.uid())
  );

drop policy "comentarios: escribir" on public.comments;
create policy "comentarios: escribir"
  on public.comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.has_permission(public.workspace_of_video(video_id), 'comment.write')
  );

drop policy "comentarios: editar el propio" on public.comments;
create policy "comentarios: editar el propio"
  on public.comments for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy "comentarios: borrar el propio o moderar" on public.comments;
create policy "comentarios: borrar el propio o moderar"
  on public.comments for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.has_permission(public.workspace_of_video(video_id), 'workspace.manage')
  );

drop policy "assets: crear con permiso" on public.assets;
create policy "assets: crear con permiso"
  on public.assets for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

drop policy "assets: eliminar con permiso" on public.assets;
create policy "assets: eliminar con permiso"
  on public.assets for delete
  to authenticated
  using (
    created_by = (select auth.uid())
    or public.has_permission(public.workspace_of_video(video_id), 'video.delete')
  );

-- ---------------------------------------------------------------------------
-- 2. Indices en claves foraneas sin cobertura
-- ---------------------------------------------------------------------------
create index if not exists workspaces_created_by_idx      on public.workspaces (created_by);
create index if not exists channels_created_by_idx        on public.channels (created_by);
create index if not exists videos_created_by_idx          on public.videos (created_by);
create index if not exists invitations_invited_by_idx     on public.invitations (invited_by);
create index if not exists checklist_items_assignee_idx   on public.checklist_items (assignee_id);
create index if not exists checklist_items_created_by_idx on public.checklist_items (created_by);
create index if not exists comments_author_idx            on public.comments (author_id);
create index if not exists assets_created_by_idx          on public.assets (created_by);
create index if not exists activity_actor_idx             on public.activity (actor_id);
