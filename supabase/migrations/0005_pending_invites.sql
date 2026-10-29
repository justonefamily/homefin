-- Invites find their person by email: when someone signs in (Google or otherwise) and an unaccepted invite exists for
-- their address, they join that home automatically — no link to click.
create or replace function public.accept_pending_invites(p_display_name text default null)
returns setof uuid language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  for inv in select * from home_invites where accepted_at is null and lower(email) = lower(auth.email()) loop
    insert into home_members (home_id, user_id, role, display_name) values (inv.home_id, auth.uid(), inv.role, p_display_name)
      on conflict (home_id, user_id) do nothing;
    update home_invites set accepted_at = now() where id = inv.id;
    return next inv.home_id;
  end loop;
end $$;
revoke all on function public.accept_pending_invites(text) from public, anon;
grant execute on function public.accept_pending_invites(text) to authenticated;
