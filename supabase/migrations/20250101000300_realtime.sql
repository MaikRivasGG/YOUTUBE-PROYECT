-- ===========================================================================
-- Realtime: replicacion de los cambios del tablero a los clientes conectados.
-- Con REPLICA IDENTITY FULL los eventos UPDATE/DELETE llegan con la fila
-- completa, necesario para que el tablero se reconcilie sin refetch.
-- ===========================================================================

alter table public.videos          replica identity full;
alter table public.video_assignees replica identity full;
alter table public.checklist_items replica identity full;
alter table public.comments        replica identity full;
alter table public.channels        replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table public.videos;
alter publication supabase_realtime add table public.video_assignees;
alter publication supabase_realtime add table public.checklist_items;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.activity;
