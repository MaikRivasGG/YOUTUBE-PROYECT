-- ===========================================================================
-- v2 · Afinado de rendimiento del modelo configurable
--
-- Dos avisos del linter de Supabase sobre las tablas nuevas:
--
-- 1. Claves foraneas sin indice. Postgres no indexa el lado que apunta, asi
--    que cada borrado en el lado referenciado obliga a un recorrido completo
--    de la tabla hija (y los filtros por esa columna tambien).
--
-- 2. Dos politicas permisivas de SELECT sobre la misma tabla y el mismo rol.
--    Una politica `for all` tambien cubre SELECT, asi que en cada lectura se
--    evaluaban las dos: la de ver y la de gestionar. Se parte la de gestionar
--    en INSERT / UPDATE / DELETE, que es lo unico que tenia que decir; asi
--    cada lectura evalua una sola condicion y las reglas quedan iguales.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Indices de las claves foraneas nuevas
-- ---------------------------------------------------------------------------
create index if not exists channels_pipeline_idx
  on public.channels (pipeline_id);

create index if not exists checklist_items_stage_idx
  on public.checklist_items (stage_id);

create index if not exists checklist_items_role_idx
  on public.checklist_items (role_id);

create index if not exists checklist_items_completed_by_idx
  on public.checklist_items (completed_by);

create index if not exists invitations_role_idx
  on public.invitations (role_id);

create index if not exists notifications_actor_idx
  on public.notifications (actor_id);

create index if not exists notifications_video_idx
  on public.notifications (video_id);

create index if not exists videos_stage_fk_idx
  on public.videos (stage_id);

-- ---------------------------------------------------------------------------
-- 2. Una sola politica permisiva por lectura
-- ---------------------------------------------------------------------------

-- pipelines ------------------------------------------------------------
drop policy "pipelines: gestionar con permiso" on public.pipelines;

create policy "pipelines: crear con permiso"
  on public.pipelines for insert to authenticated
  with check (public.has_permission(workspace_id, 'pipeline.manage'));

create policy "pipelines: editar con permiso"
  on public.pipelines for update to authenticated
  using (public.has_permission(workspace_id, 'pipeline.manage'))
  with check (public.has_permission(workspace_id, 'pipeline.manage'));

create policy "pipelines: borrar con permiso"
  on public.pipelines for delete to authenticated
  using (public.has_permission(workspace_id, 'pipeline.manage'));

-- stages ---------------------------------------------------------------
drop policy "etapas: gestionar con permiso" on public.stages;

create policy "etapas: crear con permiso"
  on public.stages for insert to authenticated
  with check (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'));

create policy "etapas: editar con permiso"
  on public.stages for update to authenticated
  using (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'))
  with check (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'));

create policy "etapas: borrar con permiso"
  on public.stages for delete to authenticated
  using (public.has_permission(public.workspace_of_pipeline(pipeline_id), 'pipeline.manage'));

-- role_stages ----------------------------------------------------------
drop policy "etapas por rol: gestionar con permiso" on public.role_stages;

create policy "etapas por rol: crear con permiso"
  on public.role_stages for insert to authenticated
  with check (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'));

create policy "etapas por rol: editar con permiso"
  on public.role_stages for update to authenticated
  using (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'))
  with check (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'));

create policy "etapas por rol: borrar con permiso"
  on public.role_stages for delete to authenticated
  using (public.has_permission(public.workspace_of_role(role_id), 'workspace.manage'));

-- channels -------------------------------------------------------------
drop policy "canales: gestionar con permiso" on public.channels;

create policy "canales: crear con permiso"
  on public.channels for insert to authenticated
  with check (public.has_permission(workspace_id, 'channel.manage'));

create policy "canales: editar con permiso"
  on public.channels for update to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'))
  with check (public.has_permission(workspace_id, 'channel.manage'));

create policy "canales: borrar con permiso"
  on public.channels for delete to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'));

-- checklist_assignees --------------------------------------------------
drop policy "responsables de paso: gestionar con permiso" on public.checklist_assignees;

create policy "responsables de paso: crear con permiso"
  on public.checklist_assignees for insert to authenticated
  with check (
    exists (
      select 1 from public.checklist_items c
      where c.id = item_id
        and public.has_permission(public.workspace_of_video(c.video_id), 'video.edit')
    )
  );

create policy "responsables de paso: borrar con permiso"
  on public.checklist_assignees for delete to authenticated
  using (
    exists (
      select 1 from public.checklist_items c
      where c.id = item_id
        and public.has_permission(public.workspace_of_video(c.video_id), 'video.edit')
    )
  );
