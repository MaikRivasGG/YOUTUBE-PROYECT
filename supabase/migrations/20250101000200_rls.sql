-- ===========================================================================
-- Row Level Security
-- Regla general: todo dato pertenece a un workspace y solo lo ven sus miembros.
-- La escritura se valida con public.has_permission(workspace, permiso).
-- ===========================================================================

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invitations       enable row level security;
alter table public.channels          enable row level security;
alter table public.videos            enable row level security;
alter table public.video_assignees   enable row level security;
alter table public.checklist_items   enable row level security;
alter table public.comments          enable row level security;
alter table public.assets            enable row level security;
alter table public.activity          enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: ver companeros de equipo"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid() and theirs.user_id = public.profiles.id
    )
  );

create policy "profiles: editar el propio"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create policy "workspaces: ver los propios"
  on public.workspaces for select
  to authenticated
  using (public.is_member(id));

create policy "workspaces: crear"
  on public.workspaces for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "workspaces: editar con permiso"
  on public.workspaces for update
  to authenticated
  using (public.has_permission(id, 'workspace.manage'))
  with check (public.has_permission(id, 'workspace.manage'));

create policy "workspaces: eliminar solo owner"
  on public.workspaces for delete
  to authenticated
  using (public.has_permission(id, 'workspace.delete'));

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------
create policy "miembros: ver los del equipo"
  on public.workspace_members for select
  to authenticated
  using (public.is_member(workspace_id));

create policy "miembros: alta con permiso"
  on public.workspace_members for insert
  to authenticated
  with check (public.has_permission(workspace_id, 'member.manage'));

-- Nadie puede auto-promoverse: cambiar roles exige permiso y no se permite
-- modificar al owner salvo que quien actua sea el propio owner.
create policy "miembros: cambiar rol con permiso"
  on public.workspace_members for update
  to authenticated
  using (
    public.has_permission(workspace_id, 'member.manage')
    and (role <> 'owner' or public.current_member_role(workspace_id) = 'owner')
  )
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and user_id <> auth.uid()
  );

create policy "miembros: baja con permiso o salir del equipo"
  on public.workspace_members for delete
  to authenticated
  using (
    (user_id = auth.uid() and role <> 'owner')
    or (
      public.has_permission(workspace_id, 'member.manage')
      and role <> 'owner'
      and user_id <> auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
create policy "invitaciones: ver con permiso"
  on public.invitations for select
  to authenticated
  using (public.has_permission(workspace_id, 'member.manage'));

create policy "invitaciones: crear con permiso"
  on public.invitations for insert
  to authenticated
  with check (
    public.has_permission(workspace_id, 'member.manage')
    and invited_by = auth.uid()
    and role <> 'owner'
  );

create policy "invitaciones: revocar con permiso"
  on public.invitations for update
  to authenticated
  using (public.has_permission(workspace_id, 'member.manage'))
  with check (public.has_permission(workspace_id, 'member.manage'));

create policy "invitaciones: eliminar con permiso"
  on public.invitations for delete
  to authenticated
  using (public.has_permission(workspace_id, 'member.manage'));

-- ---------------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------------
create policy "canales: ver los del equipo"
  on public.channels for select
  to authenticated
  using (public.is_member(workspace_id));

create policy "canales: crear con permiso"
  on public.channels for insert
  to authenticated
  with check (public.has_permission(workspace_id, 'channel.manage'));

create policy "canales: editar con permiso"
  on public.channels for update
  to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'))
  with check (public.has_permission(workspace_id, 'channel.manage'));

create policy "canales: eliminar con permiso"
  on public.channels for delete
  to authenticated
  using (public.has_permission(workspace_id, 'channel.manage'));

-- ---------------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------------
create policy "videos: ver los del equipo"
  on public.videos for select
  to authenticated
  using (public.is_member(workspace_id));

create policy "videos: crear con permiso"
  on public.videos for insert
  to authenticated
  with check (public.has_permission(workspace_id, 'video.create'));

-- Editar campos exige permiso de edicion. El cambio de etapa lleva ademas su
-- propia validacion por rol, en el trigger videos_guard_stage_change: asi un
-- editor puede corregir la miniatura de una tarjeta que esta en guion, pero no
-- puede saltarsela de etapa.
create policy "videos: editar con permiso"
  on public.videos for update
  to authenticated
  using (public.has_permission(workspace_id, 'video.edit'))
  with check (public.has_permission(workspace_id, 'video.edit'));

create policy "videos: eliminar con permiso"
  on public.videos for delete
  to authenticated
  using (public.has_permission(workspace_id, 'video.delete'));

-- ---------------------------------------------------------------------------
-- video_assignees
-- ---------------------------------------------------------------------------
create policy "asignaciones: ver las del equipo"
  on public.video_assignees for select
  to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "asignaciones: crear con permiso"
  on public.video_assignees for insert
  to authenticated
  with check (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = auth.uid()
  );

create policy "asignaciones: eliminar con permiso"
  on public.video_assignees for delete
  to authenticated
  using (
    public.has_permission(public.workspace_of_video(video_id), 'video.assign')
    or user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- checklist_items
-- ---------------------------------------------------------------------------
create policy "checklist: ver las del equipo"
  on public.checklist_items for select
  to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "checklist: crear con permiso"
  on public.checklist_items for insert
  to authenticated
  with check (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

create policy "checklist: editar con permiso"
  on public.checklist_items for update
  to authenticated
  using (public.has_permission(public.workspace_of_video(video_id), 'video.edit'))
  with check (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

create policy "checklist: eliminar con permiso"
  on public.checklist_items for delete
  to authenticated
  using (public.has_permission(public.workspace_of_video(video_id), 'video.edit'));

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create policy "comentarios: ver los del equipo"
  on public.comments for select
  to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "comentarios: escribir"
  on public.comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.has_permission(public.workspace_of_video(video_id), 'comment.write')
  );

create policy "comentarios: editar el propio"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "comentarios: borrar el propio o moderar"
  on public.comments for delete
  to authenticated
  using (
    author_id = auth.uid()
    or public.has_permission(public.workspace_of_video(video_id), 'workspace.manage')
  );

-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------
create policy "assets: ver los del equipo"
  on public.assets for select
  to authenticated
  using (public.is_member(public.workspace_of_video(video_id)));

create policy "assets: crear con permiso"
  on public.assets for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.has_permission(public.workspace_of_video(video_id), 'video.edit')
  );

create policy "assets: eliminar con permiso"
  on public.assets for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.has_permission(public.workspace_of_video(video_id), 'video.delete')
  );

-- ---------------------------------------------------------------------------
-- activity (solo lectura para la app; se escribe via SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create policy "actividad: ver la del equipo"
  on public.activity for select
  to authenticated
  using (public.is_member(workspace_id));
