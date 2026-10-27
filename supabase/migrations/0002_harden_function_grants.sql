-- Only signed-in users may call the RPCs; the trigger function and membership helper are internal.
-- (Addresses Supabase security advisor: anon/authenticated can execute SECURITY DEFINER functions.)
revoke execute on function public.create_home(text, text) from public, anon;
revoke execute on function public.accept_invite(text, text) from public, anon;
revoke execute on function public.restore_home_snapshot(uuid) from public, anon;
-- is_home_member is called from RLS policies as the querying role, so it MUST stay executable by authenticated/anon.
revoke execute on function public.is_home_member(uuid, text) from public;
grant execute on function public.is_home_member(uuid, text) to authenticated, anon;
revoke execute on function public.home_data_snapshot() from public, anon, authenticated;
grant execute on function public.create_home(text, text) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.restore_home_snapshot(uuid) to authenticated;

-- Belt and braces: refuse to run without a signed-in user.
create or replace function create_home(p_name text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into homes (name, created_by) values (p_name, auth.uid()) returning id into v_id;
  insert into home_members (home_id, user_id, role, display_name) values (v_id, auth.uid(), 'owner', p_display_name);
  insert into home_data (home_id, data, updated_by) values (v_id, jsonb_build_object('version',1,'homeName',p_name,
    'pay', jsonb_build_object('monthlyIncome',0,'payDays',jsonb_build_array(1,16),'splitDay',15),
    'settings', jsonb_build_object('strategy','snowball','extraPayment',0,'reminderDays',3,'starterFundGoal',1000,'emergencyMonths',3,'everydaySpend',0),
    'accounts','[]'::jsonb,'bills','[]'::jsonb,'payments','[]'::jsonb,'budgets','[]'::jsonb,'transactions','[]'::jsonb), auth.uid());
  return v_id;
end $$;

create or replace function accept_invite(p_token text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv home_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from home_invites where token = p_token and accepted_at is null;
  if inv.id is null then raise exception 'invite not found'; end if;
  insert into home_members (home_id, user_id, role, display_name) values (inv.home_id, auth.uid(), inv.role, p_display_name)
    on conflict (home_id, user_id) do nothing;
  update home_invites set accepted_at = now() where id = inv.id;
  return inv.home_id;
end $$;
