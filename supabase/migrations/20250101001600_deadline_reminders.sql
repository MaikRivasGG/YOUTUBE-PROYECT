-- ===========================================================================
-- Aviso de vencimiento: 1 dia antes de la fecha limite
--
-- pg_cron ejecuta a diario remind_upcoming_deadlines(), que reutiliza
-- notify_users() (visto en 20250101000900_notifications.sql) para avisar a
-- los asignados de cada tarjeta cuyo due_date es manana. Se deja constancia
-- del aviso en el propio payload para no duplicarlo si el job corre mas de
-- una vez para la misma fecha.
--
-- pg_cron no esta disponible en el Postgres local efimero de pruebas
-- (scripts/db-test.sh): la creacion de la extension y el registro del job se
-- omiten con cuidado si no existe, para no romper esa bateria de pruebas.
-- ===========================================================================

do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema extensions';
  else
    raise notice 'pg_cron no disponible en este Postgres; se omite (normal en pruebas locales)';
  end if;
end
$outer$;

create or replace function public.remind_upcoming_deadlines()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_video   record;
  v_users   uuid[];
begin
  for v_video in
    select v.id, v.workspace_id, v.title, v.due_date, v.created_by
    from public.videos v
    join public.stages s on s.id = v.stage_id
    where v.due_date = (current_date + 1)
      and s.kind not in ('done', 'archived')
      and not exists (
        select 1 from public.notifications n
        where n.video_id = v.id
          and n.type = 'video.due_soon'
          and (n.payload ->> 'due_date') = v.due_date::text
      )
  loop
    select array_agg(distinct u) into v_users
    from (
      select a.user_id as u from public.video_assignees a where a.video_id = v_video.id
      union
      select v_video.created_by
    ) s
    where u is not null;

    if v_users is null then
      continue;
    end if;

    perform public.notify_users(
      v_video.workspace_id, v_users, 'video.due_soon', v_video.id,
      jsonb_build_object('title', v_video.title, 'due_date', v_video.due_date::text)
    );
  end loop;
end;
$$;

revoke all on function public.remind_upcoming_deadlines() from public, anon, authenticated;

do $outer$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule(
      'remind-upcoming-deadlines',
      '0 8 * * *',
      $job$select public.remind_upcoming_deadlines();$job$
    );
  else
    raise notice 'Esquema cron no disponible; el job no queda programado (normal en pruebas locales)';
  end if;
end
$outer$;
