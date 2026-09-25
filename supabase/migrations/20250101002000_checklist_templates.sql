-- ===========================================================================
-- Plantilla de checklist por canal
--
-- El checklist libre de la tarjeta (checklist_items) es siempre el mismo
-- proceso repetido canal a canal (ideas, guion, audio, imagenes, video,
-- musica, edicion, revision, publicar...) y hasta ahora habia que
-- reescribirlo a mano en cada video nuevo. Se describe una vez por canal y:
--
--   - Cada video nuevo con canal nace con el checklist de su canal ya puesto
--     (trigger en el insert de videos, igual que el resto de automatismos:
--     vale igual si la tarjeta la crea la web, un import o un script).
--   - "Guardar como plantilla" en un video existente reemplaza la plantilla
--     del canal por el checklist de esa tarjeta: se describe el proceso una
--     vez trabajando, no rellenando un formulario en frio.
--
-- Quien administra el canal (permiso channel.manage) es quien administra su
-- plantilla, igual que ya administra las etapas del pipeline del canal.
-- ===========================================================================

create table public.channel_checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 200),
  role_id    uuid references public.roles (id) on delete set null,
  position   double precision not null default 1000,
  created_at timestamptz not null default now()
);

create index channel_checklist_templates_channel_idx
  on public.channel_checklist_templates (channel_id, position);
create index channel_checklist_templates_role_idx
  on public.channel_checklist_templates (role_id);

alter table public.channel_checklist_templates enable row level security;

create policy "plantillas de checklist: ver las del equipo"
  on public.channel_checklist_templates for select to authenticated
  using (public.can_view_channel(channel_id));

create policy "plantillas de checklist: crear con permiso"
  on public.channel_checklist_templates for insert to authenticated
  with check (
    exists (
      select 1 from public.channels c
      where c.id = channel_id
        and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

create policy "plantillas de checklist: editar con permiso"
  on public.channel_checklist_templates for update to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = channel_id
        and public.has_permission(c.workspace_id, 'channel.manage')
    )
  )
  with check (
    exists (
      select 1 from public.channels c
      where c.id = channel_id
        and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

create policy "plantillas de checklist: borrar con permiso"
  on public.channel_checklist_templates for delete to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = channel_id
        and public.has_permission(c.workspace_id, 'channel.manage')
    )
  );

-- Un video nuevo copia la plantilla de su canal.
create or replace function public.apply_channel_checklist_template()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.channel_id is null then
    return new;
  end if;

  insert into public.checklist_items (video_id, title, role_id, position, created_by)
  select new.id, t.title, t.role_id, t.position, new.created_by
  from public.channel_checklist_templates t
  where t.channel_id = new.channel_id
  order by t.position;

  return new;
end;
$$;

create trigger videos_apply_checklist_template
  after insert on public.videos
  for each row execute function public.apply_channel_checklist_template();

-- Copiar el checklist de un video a la plantilla de su canal.
create or replace function public.save_checklist_as_template(p_video uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_channel uuid;
  v_count   integer;
begin
  select channel_id into v_channel from public.videos where id = p_video;

  if v_channel is null then
    raise exception 'VIDEO_WITHOUT_CHANNEL' using errcode = '23502';
  end if;

  if not public.has_permission(
    (select workspace_id from public.channels where id = v_channel), 'channel.manage'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.channel_checklist_templates where channel_id = v_channel;

  insert into public.channel_checklist_templates (channel_id, title, role_id, position)
  select v_channel, c.title, c.role_id, c.position
  from public.checklist_items c
  where c.video_id = p_video;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.apply_channel_checklist_template() from public, anon, authenticated;
revoke all on function public.save_checklist_as_template(uuid)   from public, anon;
grant execute on function public.save_checklist_as_template(uuid) to authenticated;
