-- The family app store: a catalog of apps shown on the hub. Members-only to read; home owners manage it.
create table if not exists public.hub_apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  url text not null,
  icon text not null default '🏠',          -- an emoji, or an https image URL
  color text not null default '#0e6b74',
  status text not null default 'live' check (status in ('live','beta','soon','hidden')),
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hub_apps enable row level security;

-- Anyone who belongs to a home (i.e. was invited) can see the catalog.
create policy "members read apps" on public.hub_apps for select to authenticated
  using (exists (select 1 from public.home_members m where m.user_id = auth.uid()));

-- Owners of a home curate it.
create policy "owners manage apps" on public.hub_apps for all to authenticated
  using (exists (select 1 from public.home_members m where m.user_id = auth.uid() and m.role = 'owner'))
  with check (exists (select 1 from public.home_members m where m.user_id = auth.uid() and m.role = 'owner'));

insert into public.hub_apps (slug, name, tagline, description, url, icon, color, status, sort) values
  ('homefin', 'HomeFin', 'Bills, budget, debt payoff & the home calendar', 'Every account in one place: what came in, what went out, what''s due, the plan to be debt-free, and the week''s meals and groceries.', 'https://homefin.justonefamily.app', '💸', '#0e6b74', 'live', 10)
on conflict (slug) do nothing;
