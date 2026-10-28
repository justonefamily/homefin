-- Deleting a home is a request, not an instant wipe: the home is hidden and held for 30 days, during which any owner
-- can restore it. A daily purge removes homes whose grace period has passed (and their Plaid links).
alter table public.homes add column if not exists deleted_at timestamptz;

create or replace function public.request_home_deletion(p_home uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  if not public.is_home_member(p_home, 'owner') then raise exception 'Only an owner can delete a home'; end if;
  update homes set deleted_at = now() where id = p_home;
  return now() + interval '30 days';
end $$;

create or replace function public.cancel_home_deletion(p_home uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_home_member(p_home, 'owner') then raise exception 'Only an owner can restore a home'; end if;
  update homes set deleted_at = null where id = p_home;
end $$;

revoke all on function public.request_home_deletion(uuid) from public, anon;
revoke all on function public.cancel_home_deletion(uuid) from public, anon;
grant execute on function public.request_home_deletion(uuid) to authenticated;
grant execute on function public.cancel_home_deletion(uuid) to authenticated;
