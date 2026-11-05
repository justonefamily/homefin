-- Saves were timing out: the snapshot trigger copies the whole home (≈400 KB) into home_snapshots on EVERY save and then
-- deletes everything older than 7 days inside the same statement. Once a week of edits had piled up (1,250 rows, 500 MB)
-- that delete alone blew the 8 s statement timeout, so no save — sync or otherwise — could land.
--
-- Fix: index the prune, prune a few rows per save instead of all of them, skip snapshots for the page-by-page sync saves
-- (they'd be dozens of near-identical copies), and never snapshot more than once a minute. Plus a one-time cleanup.

create index if not exists home_snapshots_home_taken_idx on home_snapshots (home_id, taken_at);

create or replace function public.home_data_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_last timestamptz;
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  -- Page-by-page sync saves don't deserve a version each; the finalize save ("synced accounts") does.
  if old.note like 'synced % transactions' or old.note like 'synced % accounts' then
    return new;
  end if;
  select max(taken_at) into v_last from home_snapshots where home_id = old.home_id;
  if v_last is not null and v_last > now() - interval '1 minute' then
    return new;
  end if;
  select coalesce(display_name, (select email from auth.users where id = old.updated_by))
    into v_name from home_members where home_id = old.home_id and user_id = old.updated_by;
  insert into home_snapshots (home_id, data, by_name, note, taken_at)
    values (old.home_id, old.data, coalesce(v_name, 'auto-save'), old.note, old.updated_at);
  -- Prune a handful of expired versions per save (cheap); the index above makes this instant.
  delete from home_snapshots where ctid in (
    select ctid from home_snapshots where home_id = old.home_id and taken_at < now() - interval '7 days' order by taken_at limit 25
  );
  return new;
end $$;

-- One-time cleanup of the backlog, in batches so it never holds a long lock.
do $$
declare n int;
begin
  loop
    delete from home_snapshots where ctid in (select ctid from home_snapshots where taken_at < now() - interval '7 days' limit 200);
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;
end $$;
