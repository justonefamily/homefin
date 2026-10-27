-- HomeFin schema: homes, members, invites, one JSON document per home, 7-day snapshots, Plaid items.

create extension if not exists pgcrypto;

create table if not exists homes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists home_members (
  home_id uuid not null references homes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  display_name text,
  created_at timestamptz not null default now(),
  primary key (home_id, user_id)
);

create table if not exists home_invites (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('editor','viewer')),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- The whole home as one document. Simple, portable (same shape as the Drive/OneDrive/local file),
-- and rollback is trivial.
create table if not exists home_data (
  home_id uuid primary key references homes(id) on delete cascade,
  data jsonb not null,
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists home_snapshots (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  data jsonb not null,
  by_name text,
  note text,
  taken_at timestamptz not null default now()
);
create index if not exists home_snapshots_home_taken on home_snapshots(home_id, taken_at desc);

-- Plaid access tokens: server-only. No RLS policy grants client access on purpose.
create table if not exists plaid_items (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  item_id text not null unique,
  access_token text not null,
  institution text,
  cursor text,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------
-- Membership helper
------------------------------------------------------------------
create or replace function is_home_member(p_home uuid, p_min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from home_members m
    where m.home_id = p_home and m.user_id = auth.uid()
      and case p_min_role
        when 'owner' then m.role = 'owner'
        when 'editor' then m.role in ('owner','editor')
        else true end
  );
$$;

------------------------------------------------------------------
-- Snapshot on every save; keep a rolling 7 days
------------------------------------------------------------------
create or replace function home_data_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select coalesce(display_name, (select email from auth.users where id = old.updated_by))
    into v_name from home_members where home_id = old.home_id and user_id = old.updated_by;
  insert into home_snapshots (home_id, data, by_name, note, taken_at)
    values (old.home_id, old.data, coalesce(v_name, 'auto-save'), old.note, old.updated_at);
  delete from home_snapshots where home_id = old.home_id and taken_at < now() - interval '7 days';
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_home_data_snapshot on home_data;
create trigger trg_home_data_snapshot before update on home_data
  for each row when (old.data is distinct from new.data) execute function home_data_snapshot();

create or replace function restore_home_snapshot(p_snapshot_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s home_snapshots%rowtype;
begin
  select * into s from home_snapshots where id = p_snapshot_id;
  if s.id is null then raise exception 'snapshot not found'; end if;
  if not is_home_member(s.home_id, 'editor') then raise exception 'not allowed'; end if;
  update home_data set data = s.data, note = 'restored ' || to_char(s.taken_at, 'Mon DD HH24:MI'), updated_by = auth.uid()
    where home_id = s.home_id;
  return s.data;
end $$;

------------------------------------------------------------------
-- Create a home + make the caller its owner, in one call
------------------------------------------------------------------
create or replace function create_home(p_name text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
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
  select * into inv from home_invites where token = p_token and accepted_at is null;
  if inv.id is null then raise exception 'invite not found'; end if;
  insert into home_members (home_id, user_id, role, display_name) values (inv.home_id, auth.uid(), inv.role, p_display_name)
    on conflict (home_id, user_id) do nothing;
  update home_invites set accepted_at = now() where id = inv.id;
  return inv.home_id;
end $$;

------------------------------------------------------------------
-- Row-level security
------------------------------------------------------------------
alter table homes enable row level security;
alter table home_members enable row level security;
alter table home_invites enable row level security;
alter table home_data enable row level security;
alter table home_snapshots enable row level security;
alter table plaid_items enable row level security;

drop policy if exists homes_select on homes;
create policy homes_select on homes for select using (is_home_member(id));
drop policy if exists homes_update on homes;
create policy homes_update on homes for update using (is_home_member(id, 'owner'));
drop policy if exists homes_delete on homes;
create policy homes_delete on homes for delete using (is_home_member(id, 'owner'));

drop policy if exists members_select on home_members;
create policy members_select on home_members for select using (is_home_member(home_id));
drop policy if exists members_manage on home_members;
create policy members_manage on home_members for all using (is_home_member(home_id, 'owner'));

drop policy if exists invites_all on home_invites;
create policy invites_all on home_invites for all using (is_home_member(home_id, 'owner'));

drop policy if exists data_select on home_data;
create policy data_select on home_data for select using (is_home_member(home_id));
drop policy if exists data_write on home_data;
create policy data_write on home_data for update using (is_home_member(home_id, 'editor'));
drop policy if exists data_insert on home_data;
create policy data_insert on home_data for insert with check (is_home_member(home_id, 'editor'));

drop policy if exists snapshots_select on home_snapshots;
create policy snapshots_select on home_snapshots for select using (is_home_member(home_id));
-- plaid_items: no client policies; the service role key (server routes only) bypasses RLS.
