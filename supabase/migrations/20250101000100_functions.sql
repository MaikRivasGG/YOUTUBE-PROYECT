-- ===========================================================================
-- Funciones, triggers y RPCs
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Utilidades genericas
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at   before update on public.profiles   for each row execute function public.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger channels_set_updated_at   before update on public.channels   for each row execute function public.set_updated_at();
create trigger videos_set_updated_at     before update on public.videos     for each row execute function public.set_updated_at();
create trigger comments_set_updated_at   before update on public.comments   for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sincronizacion de perfiles con auth.users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'usuario'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Membresia y permisos
--
-- Estas funciones son SECURITY DEFINER para poder leer workspace_members sin
-- disparar recursion infinita en las politicas RLS que dependen de ellas.
-- ---------------------------------------------------------------------------
create or replace function public.current_member_role(p_workspace uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace
    and m.user_id = auth.uid();
$$;

create or replace function public.is_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
  );
$$;

-- Matriz de permisos. Es la fuente de verdad del backend; el cliente replica
-- la misma matriz en src/lib/domain/roles.ts unicamente para pintar la UI.
create or replace function public.has_permission(p_workspace uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case p_permission
      when 'workspace.manage' then r in ('owner', 'admin')
      when 'workspace.delete' then r = 'owner'
      when 'member.manage'    then r in ('owner', 'admin')
      when 'channel.manage'   then r in ('owner', 'admin', 'producer')
      when 'video.create'     then r in ('owner', 'admin', 'producer', 'writer')
      when 'video.delete'     then r in ('owner', 'admin', 'producer')
      when 'video.edit'       then r <> 'viewer'
      when 'video.assign'     then r in ('owner', 'admin', 'producer')
      when 'video.move.any'   then r in ('owner', 'admin', 'producer')
      when 'comment.write'    then r <> 'viewer'
      else false
    end,
    false
  )
  from (select public.current_member_role(p_workspace) as r) as s;
$$;

-- Rol responsable de cada etapa del pipeline.
create or replace function public.stage_role(p_status public.video_status)
returns public.workspace_role
language sql
immutable
as $$
  select case p_status
    when 'idea'      then 'producer'
    when 'script'    then 'writer'
    when 'voiceover' then 'voice'
    when 'editing'   then 'editor'
    when 'thumbnail' then 'designer'
    when 'review'    then 'producer'
    when 'scheduled' then 'publisher'
    when 'published' then 'publisher'
    else 'producer'
  end::public.workspace_role;
$$;

create or replace function public.workspace_of_video(p_video uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.workspace_id from public.videos v where v.id = p_video;
$$;

-- Un miembro puede mover una tarjeta si es productor/admin/owner, si esta
-- asignado al video, o si su rol es responsable de la etapa origen o destino.
create or replace function public.can_move_video(p_video uuid, p_status public.video_status)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_current   public.video_status;
  v_role      public.workspace_role;
begin
  select workspace_id, status into v_workspace, v_current
  from public.videos where id = p_video;

  if v_workspace is null then
    return false;
  end if;

  v_role := public.current_member_role(v_workspace);

  if v_role is null or v_role = 'viewer' then
    return false;
  end if;

  if public.has_permission(v_workspace, 'video.move.any') then
    return true;
  end if;

  if exists (
    select 1 from public.video_assignees a
    where a.video_id = p_video and a.user_id = auth.uid()
  ) then
    return true;
  end if;

  return v_role in (public.stage_role(v_current), public.stage_role(p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- Registro de actividad
-- ---------------------------------------------------------------------------
create or replace function public.log_activity(
  p_workspace uuid,
  p_video uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity (workspace_id, video_id, actor_id, type, payload)
  values (p_workspace, p_video, auth.uid(), p_type, coalesce(p_payload, '{}'::jsonb));
$$;

create or replace function public.videos_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(
      new.workspace_id, new.id, 'video.created',
      jsonb_build_object('title', new.title, 'status', new.status)
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.log_activity(
      new.workspace_id, new.id, 'video.moved',
      jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status)
    );
  elsif tg_op = 'UPDATE' and new.title is distinct from old.title then
    perform public.log_activity(
      new.workspace_id, new.id, 'video.renamed',
      jsonb_build_object('from', old.title, 'to', new.title)
    );
  end if;
  return new;
end;
$$;

create trigger videos_activity
  after insert or update on public.videos
  for each row execute function public.videos_activity_trigger();

create or replace function public.comments_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
begin
  select workspace_id into v_workspace from public.videos where id = new.video_id;
  perform public.log_activity(
    v_workspace, new.video_id, 'comment.created',
    jsonb_build_object('excerpt', left(new.body, 140))
  );
  return new;
end;
$$;

create trigger comments_activity
  after insert on public.comments
  for each row execute function public.comments_activity_trigger();

-- ---------------------------------------------------------------------------
-- Referencia legible por video (VID-0001) y marcas de publicacion
-- ---------------------------------------------------------------------------
create or replace function public.videos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counter integer;
begin
  update public.workspaces
    set video_counter = video_counter + 1
    where id = new.workspace_id
    returning video_counter into v_counter;

  new.ref := 'VID-' || lpad(coalesce(v_counter, 1)::text, 4, '0');
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger videos_set_ref
  before insert on public.videos
  for each row execute function public.videos_before_insert();

-- Guardian del pipeline: se aplica tanto a un UPDATE directo como al RPC
-- move_video, porque auth.uid() sigue siendo el del usuario que llama.
create or replace function public.videos_guard_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and not public.can_move_video(old.id, new.status) then
    raise exception 'FORBIDDEN_STAGE_MOVE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger videos_guard_stage
  before update on public.videos
  for each row execute function public.videos_guard_stage_change();

create or replace function public.videos_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and old.status <> 'published' then
    new.published_at := coalesce(new.published_at, now());
  elsif new.status <> 'published' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger videos_publish_stamp
  before update on public.videos
  for each row execute function public.videos_before_update();

create or replace function public.checklist_done_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.is_done and not coalesce(old.is_done, false) then
    new.done_at := now();
  elsif not new.is_done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger checklist_items_done_stamp
  before insert or update on public.checklist_items
  for each row execute function public.checklist_done_stamp();

-- ---------------------------------------------------------------------------
-- RPCs de aplicacion
-- ---------------------------------------------------------------------------

-- Crea un workspace y deja al creador como owner en una sola transaccion.
create or replace function public.create_workspace(p_name text, p_slug text)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces;
  v_slug text := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 2 then
    v_slug := 'equipo-' || substr(gen_random_uuid()::text, 1, 6);
  end if;

  if exists (select 1 from public.workspaces where slug = v_slug) then
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 4);
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (trim(p_name), v_slug, auth.uid())
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, auth.uid(), 'owner');

  perform public.log_activity(
    v_workspace.id, null, 'workspace.created',
    jsonb_build_object('name', v_workspace.name)
  );

  return v_workspace;
end;
$$;

-- Mueve una tarjeta de columna/posicion validando permisos de etapa.
create or replace function public.move_video(
  p_video uuid,
  p_status public.video_status,
  p_position double precision
)
returns public.videos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video public.videos;
begin
  if not public.can_move_video(p_video, p_status) then
    raise exception 'FORBIDDEN_STAGE_MOVE' using errcode = '42501';
  end if;

  update public.videos
    set status = p_status,
        position = p_position
    where id = p_video
    returning * into v_video;

  return v_video;
end;
$$;

-- Acepta una invitacion a partir de su token.
create or replace function public.accept_invitation(p_token text)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.invitations;
  v_workspace  public.workspaces;
  v_email      text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  select * into v_invitation
  from public.invitations
  where token = p_token and status = 'pending'
  for update;

  if v_invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_invitation.expires_at < now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0002';
  end if;

  if lower(v_invitation.email) <> lower(coalesce(v_email, '')) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = v_invitation.id;

  select * into v_workspace from public.workspaces where id = v_invitation.workspace_id;

  perform public.log_activity(
    v_workspace.id, null, 'member.joined',
    jsonb_build_object('role', v_invitation.role)
  );

  return v_workspace;
end;
$$;

-- Detalle de una invitacion por token, sin exponer el resto de la tabla.
create or replace function public.invitation_preview(p_token text)
returns table (workspace_name text, role public.workspace_role, email text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select w.name, i.role, i.email, i.expires_at
  from public.invitations i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token and i.status = 'pending';
$$;

-- Metricas agregadas del dashboard, calculadas en la base de datos.
create or replace function public.workspace_stats(p_workspace uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_member(p_workspace) then '{}'::jsonb
    else jsonb_build_object(
      'total', (select count(*) from public.videos where workspace_id = p_workspace and status <> 'archived'),
      'in_progress', (select count(*) from public.videos where workspace_id = p_workspace and status in ('script','voiceover','editing','thumbnail','review')),
      'published_this_month', (select count(*) from public.videos where workspace_id = p_workspace and status = 'published' and published_at >= date_trunc('month', now())),
      'scheduled', (select count(*) from public.videos where workspace_id = p_workspace and status = 'scheduled'),
      'overdue', (select count(*) from public.videos where workspace_id = p_workspace and due_date < current_date and status not in ('published','archived')),
      'members', (select count(*) from public.workspace_members where workspace_id = p_workspace),
      'channels', (select count(*) from public.channels where workspace_id = p_workspace and is_archived = false),
      'by_status', (
        select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
        from (
          select status::text as status, count(*) as total
          from public.videos
          where workspace_id = p_workspace and status <> 'archived'
          group by status
        ) s
      )
    )
  end;
$$;
