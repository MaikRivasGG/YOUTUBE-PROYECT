-- ===========================================================================
-- v2 · Notificaciones en vivo
--
-- Cuando una tarjeta entra en una etapa, se avisa a quien tiene un rol que
-- gestiona esa etapa (role_stages) y a quien este asignado a la tarjeta.
-- Tambien se avisa al asignar a alguien y al recibir un comentario.
-- Las filas las escriben triggers: el cliente solo lee y marca como leidas.
-- ===========================================================================

create table public.notifications (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  video_id     uuid references public.videos (id) on delete cascade,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_inbox_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_workspace_idx on public.notifications (workspace_id);

alter table public.notifications enable row level security;

create policy "avisos: ver solo los propios"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "avisos: marcar como leidos los propios"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "avisos: borrar los propios"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Reparto de avisos
-- ---------------------------------------------------------------------------
create or replace function public.notify_users(
  p_workspace uuid,
  p_users uuid[],
  p_type text,
  p_video uuid,
  p_payload jsonb
)
returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (workspace_id, user_id, actor_id, video_id, type, payload)
  select p_workspace, u, auth.uid(), p_video, p_type, coalesce(p_payload, '{}'::jsonb)
  from unnest(p_users) as u
  where u is distinct from auth.uid();
$$;

-- Al cambiar de etapa: responsables de la etapa nueva + asignados a la tarjeta.
create or replace function public.notify_stage_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_stage_name text;
  v_users      uuid[];
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select name into v_stage_name from public.stages where id = new.stage_id;

  select array_agg(distinct u) into v_users
  from (
    -- Quien gestiona la etapa de destino por alguno de sus roles
    select mr.user_id as u
    from public.role_stages rs
    join public.member_roles mr on mr.role_id = rs.role_id
    where rs.stage_id = new.stage_id and mr.workspace_id = new.workspace_id
    union
    -- Y quien tenga la tarjeta asignada
    select a.user_id from public.video_assignees a where a.video_id = new.id
  ) s;

  if v_users is null then
    return new;
  end if;

  perform public.notify_users(
    new.workspace_id, v_users, 'stage.entered', new.id,
    jsonb_build_object('title', new.title, 'stage', v_stage_name)
  );

  return new;
end;
$$;

create trigger videos_notify_stage
  after update of stage_id on public.videos
  for each row execute function public.notify_stage_change();

-- Al asignar a alguien una tarjeta.
create or replace function public.notify_assignment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_video public.videos;
begin
  select * into v_video from public.videos where id = new.video_id;

  perform public.notify_users(
    v_video.workspace_id, array[new.user_id], 'video.assigned', new.video_id,
    jsonb_build_object('title', v_video.title)
  );

  return new;
end;
$$;

create trigger video_assignees_notify
  after insert on public.video_assignees
  for each row execute function public.notify_assignment();

-- Al comentar: se avisa a los asignados y a quien creo la tarjeta.
create or replace function public.notify_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_video public.videos;
  v_users uuid[];
begin
  select * into v_video from public.videos where id = new.video_id;

  select array_agg(distinct u) into v_users
  from (
    select a.user_id as u from public.video_assignees a where a.video_id = new.video_id
    union
    select v_video.created_by
  ) s
  where u is not null;

  if v_users is null then
    return new;
  end if;

  perform public.notify_users(
    v_video.workspace_id, v_users, 'comment.created', new.video_id,
    jsonb_build_object('title', v_video.title, 'excerpt', left(new.body, 140))
  );

  return new;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_comment();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter table public.notifications replica identity full;
alter table public.stages        replica identity full;
alter table public.pipelines     replica identity full;

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.stages;
alter publication supabase_realtime add table public.pipelines;
alter publication supabase_realtime add table public.checklist_assignees;
alter publication supabase_realtime add table public.member_roles;
