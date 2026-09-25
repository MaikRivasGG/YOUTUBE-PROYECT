-- ===========================================================================
-- La plantilla de checklist es del equipo, no del canal
--
-- La migracion anterior (20250101002000) atava la plantilla a un canal, pero
-- el proceso que describe (ideas, guion, audio, imagenes, video, musica,
-- edicion, revision, publicar...) es el mismo para todos los canales del
-- equipo: no tiene sentido guardarla una vez por canal. Se funde en una sola
-- plantilla por equipo:
--
--   - Un video nuevo, tenga canal o no, nace con el checklist de la
--     plantilla del equipo ya puesto.
--   - "Guardar como plantilla" reemplaza la plantilla del equipo por el
--     checklist del video actual.
--   - "Aplicar plantilla" la vuelve a poner en un video que nacio antes de
--     que existiera (o al que le borraron el checklist), sin duplicar los
--     pasos que ya tenga por titulo.
--
-- Verla es cosa de cualquier miembro del equipo; guardarla, aplicarla o
-- tocarla a mano sigue pidiendo 'checklist.manage', el mismo permiso que ya
-- manda sobre anadir, reordenar o borrar pasos del checklist de una tarjeta.
-- ===========================================================================

drop trigger if exists videos_apply_checklist_template on public.videos;
drop function if exists public.apply_channel_checklist_template();
drop function if exists public.save_checklist_as_template(uuid);
drop table if exists public.channel_checklist_templates;

create table public.checklist_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title        text not null check (char_length(trim(title)) between 1 and 200),
  role_id      uuid references public.roles (id) on delete set null,
  position     double precision not null default 1000,
  created_at   timestamptz not null default now()
);

create index checklist_templates_workspace_idx on public.checklist_templates (workspace_id, position);
create index checklist_templates_role_idx on public.checklist_templates (role_id);

alter table public.checklist_templates enable row level security;

create policy "plantilla de checklist: ver la del equipo"
  on public.checklist_templates for select to authenticated
  using (public.is_member(workspace_id));

create policy "plantilla de checklist: crear con permiso"
  on public.checklist_templates for insert to authenticated
  with check (public.has_permission(workspace_id, 'checklist.manage'));

create policy "plantilla de checklist: editar con permiso"
  on public.checklist_templates for update to authenticated
  using (public.has_permission(workspace_id, 'checklist.manage'))
  with check (public.has_permission(workspace_id, 'checklist.manage'));

create policy "plantilla de checklist: borrar con permiso"
  on public.checklist_templates for delete to authenticated
  using (public.has_permission(workspace_id, 'checklist.manage'));

-- Un video nuevo, de cualquier canal o sin canal, copia la plantilla del
-- equipo.
create or replace function public.apply_checklist_template_on_create()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.checklist_items (video_id, title, role_id, position, created_by)
  select new.id, t.title, t.role_id, t.position, new.created_by
  from public.checklist_templates t
  where t.workspace_id = new.workspace_id
  order by t.position;

  return new;
end;
$$;

create trigger videos_apply_checklist_template
  after insert on public.videos
  for each row execute function public.apply_checklist_template_on_create();

-- Copiar el checklist de un video a la plantilla del equipo.
create or replace function public.save_checklist_as_template(p_video uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace uuid;
  v_count     integer;
begin
  select workspace_id into v_workspace from public.videos where id = p_video;

  if v_workspace is null then
    raise exception 'VIDEO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_workspace, 'checklist.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.checklist_templates where workspace_id = v_workspace;

  insert into public.checklist_templates (workspace_id, title, role_id, position)
  select v_workspace, c.title, c.role_id, c.position
  from public.checklist_items c
  where c.video_id = p_video;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Aplicar la plantilla a mano: anade lo que falte por titulo, sin tocar ni
-- duplicar lo que el video ya tenga.
create or replace function public.apply_checklist_template(p_video uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace uuid;
  v_base      double precision;
  v_count     integer;
begin
  select workspace_id into v_workspace from public.videos where id = p_video;

  if v_workspace is null or not public.can_view_video(p_video) then
    raise exception 'VIDEO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_workspace, 'checklist.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(max(position), 0) into v_base
  from public.checklist_items where video_id = p_video;

  insert into public.checklist_items (video_id, title, role_id, position, created_by)
  select
    p_video, t.title, t.role_id,
    v_base + row_number() over (order by t.position) * 1000,
    (select auth.uid())
  from public.checklist_templates t
  where t.workspace_id = v_workspace
    and not exists (
      select 1 from public.checklist_items c
      where c.video_id = p_video
        and lower(trim(c.title)) = lower(trim(t.title))
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.apply_checklist_template_on_create() from public, anon, authenticated;
revoke all on function public.save_checklist_as_template(uuid)     from public, anon;
revoke all on function public.apply_checklist_template(uuid)       from public, anon;
grant execute on function public.save_checklist_as_template(uuid) to authenticated;
grant execute on function public.apply_checklist_template(uuid)   to authenticated;
