-- ===========================================================================
-- Hook, descripcion y guion dejan de ser requisitos de etapa
--
-- Esos tres campos ya no tienen editor en la ficha del video (el equipo no
-- los usa: lo importante ahora es el enlace propio de cada etapa del
-- pipeline). Se retiran de la lista cerrada de campos que una etapa puede
-- exigir, para que no se puedan volver a marcar como requisito desde
-- Ajustes -> Pipelines. Ninguna etapa los exigia ya (comprobado antes de
-- este cambio), asi que no hace falta migrar datos.
-- ===========================================================================

alter table public.stages
  drop constraint stages_required_fields_known;

alter table public.stages
  add constraint stages_required_fields_known check (
    required_fields <@ array[
      'due_date', 'publish_at',
      'youtube_url', 'thumbnail_url', 'channel_id', 'assignee', 'asset'
    ]::text[]
  );

create or replace function public.stage_exit_blockers(p_video uuid, p_stage uuid)
returns text[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_video    public.videos;
  v_stage    public.stages;
  v_missing  text[] := '{}';
  v_field    text;
  v_empty    boolean;
begin
  select * into v_video from public.videos where id = p_video;
  select * into v_stage from public.stages where id = p_stage;

  if v_video.id is null or v_stage.id is null then
    return v_missing;
  end if;

  if v_stage.deliverable_label is not null
     and not exists (
       select 1 from public.video_stage_links l
       where l.video_id = p_video and l.stage_id = p_stage
     )
  then
    v_missing := v_missing || format('el enlace de %s', v_stage.deliverable_label);
  end if;

  foreach v_field in array v_stage.required_fields loop
    v_empty := case v_field
      when 'due_date'      then v_video.due_date is null
      when 'publish_at'    then v_video.publish_at is null
      when 'youtube_url'   then v_video.youtube_url is null
      when 'thumbnail_url' then v_video.thumbnail_url is null
      when 'channel_id'    then v_video.channel_id is null
      when 'assignee'      then not exists (
                                  select 1 from public.video_assignees a
                                  where a.video_id = p_video
                                )
      when 'asset'         then not exists (
                                  select 1 from public.assets a
                                  where a.video_id = p_video
                                )
      else false
    end;

    if v_empty then
      v_missing := v_missing || case v_field
        when 'due_date'      then 'la fecha limite'
        when 'publish_at'    then 'la fecha de publicacion'
        when 'youtube_url'   then 'el enlace de YouTube'
        when 'thumbnail_url' then 'la miniatura'
        when 'channel_id'    then 'el canal'
        when 'assignee'      then 'alguien asignado'
        when 'asset'         then 'al menos un archivo'
        else v_field
      end;
    end if;
  end loop;

  return v_missing;
end;
$$;
