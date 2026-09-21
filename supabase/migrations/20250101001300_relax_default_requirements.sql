-- ===========================================================================
-- v3.1 · La etapa de Guion ya no exige el guion por defecto
--
-- El requisito se puso como valor de partida sensato al lanzar "Requisitos de
-- salida", pero el equipo no lo pidio y genera confusion: Hook, Descripcion y
-- Guion son campos libres de la tarjeta, no algo que la etapa deba exigir sin
-- que el propietario lo decida el mismo. Se quita en las etapas existentes y
-- en el sembrador, para que un equipo nuevo tampoco lo traiga puesto.
--
-- Miniatura (thumbnail_url) y Programado (publish_at) no se tocan: ahi el
-- requisito es del propio tipo de etapa (no se programa sin fecha, no se
-- manda a revision sin miniatura) y nadie se ha quejado de esos.
-- ===========================================================================

update public.stages
set required_fields = array_remove(required_fields, 'script_body')
where name = 'Guion' or 'script_body' = any(required_fields);

create or replace function public.seed_workspace_defaults(p_workspace uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline uuid;
  v_role     uuid;
begin
  insert into public.pipelines (workspace_id, name, description, is_default, position)
  values (p_workspace, 'Produccion', 'Flujo principal de video', true, 1000)
  returning id into v_pipeline;

  insert into public.stages
    (pipeline_id, slug, name, color, kind, position, require_checklist, required_fields)
  values
    (v_pipeline, 'idea',      'Ideas',      '#94a3b8', 'backlog',   1000, false, '{}'),
    (v_pipeline, 'script',    'Guion',      '#3b82f6', 'work',      2000, false, '{}'),
    (v_pipeline, 'voiceover', 'Grabacion',  '#ef4444', 'work',      3000, false, '{}'),
    (v_pipeline, 'editing',   'Edicion',    '#f59e0b', 'work',      4000, false, '{}'),
    (v_pipeline, 'thumbnail', 'Miniatura',  '#d946ef', 'work',      5000, false, '{thumbnail_url}'),
    (v_pipeline, 'review',    'Revision',   '#8b5cf6', 'review',    6000, false, '{}'),
    (v_pipeline, 'scheduled', 'Programado', '#22c55e', 'scheduled', 7000, false, '{publish_at}'),
    (v_pipeline, 'published', 'Publicado',  '#0d9488', 'done',      8000, false, '{}'),
    (v_pipeline, 'archived',  'Archivado',  '#cbd5e1', 'archived',  9000, false, '{}');

  insert into public.roles (
    workspace_id, name, color, key, is_system, position,
    manage_workspace, manage_members, manage_channels, manage_pipelines,
    create_videos, delete_videos, edit_videos, assign_videos, move_any_stage,
    manage_checklist, write_comments
  ) values
    (p_workspace, 'Propietario',   '#f59e0b', 'owner', true, 1000,
     true, true, true, true, true, true, true, true, true, true, true),
    (p_workspace, 'Administrador', '#ef4444', 'admin', true, 2000,
     true, true, true, true, true, true, true, true, true, true, true);

  insert into public.roles (
    workspace_id, name, color, position,
    manage_channels, create_videos, delete_videos, assign_videos, move_any_stage,
    manage_checklist
  ) values (p_workspace, 'Productor', '#f97316', 3000, true, true, true, true, true, true)
  returning id into v_role;

  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages
  where pipeline_id = v_pipeline and slug in ('idea', 'review');

  insert into public.roles (workspace_id, name, color, position, create_videos)
  values (p_workspace, 'Guionista', '#3b82f6', 4000, true)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages where pipeline_id = v_pipeline and slug = 'script';

  insert into public.roles (workspace_id, name, color, position)
  values (p_workspace, 'Locutor', '#ef4444', 5000)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages where pipeline_id = v_pipeline and slug = 'voiceover';

  insert into public.roles (workspace_id, name, color, position)
  values (p_workspace, 'Editor', '#8b5cf6', 6000)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages where pipeline_id = v_pipeline and slug = 'editing';

  insert into public.roles (workspace_id, name, color, position)
  values (p_workspace, 'Disenador', '#d946ef', 7000)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages where pipeline_id = v_pipeline and slug = 'thumbnail';

  insert into public.roles (workspace_id, name, color, position)
  values (p_workspace, 'Publicador', '#22c55e', 8000)
  returning id into v_role;
  insert into public.role_stages (role_id, stage_id)
  select v_role, id from public.stages
  where pipeline_id = v_pipeline and slug in ('scheduled', 'published');

  insert into public.roles (workspace_id, name, color, position, edit_videos, write_comments)
  values (p_workspace, 'Observador', '#94a3b8', 9000, false, false);

  return v_pipeline;
end;
$$;

revoke all on function public.seed_workspace_defaults(uuid) from public, anon, authenticated;
