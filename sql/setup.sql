-- =============================================================
-- Queuo — full database setup
-- Run this once in the Supabase SQL Editor to create all tables and policies.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE throughout).
-- =============================================================

-- ── 1. tables ─────────────────────────────────────────────────
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity integer not null default 4,
  status text not null default 'free' check (status in ('free', 'occupied', 'reserved')),
  seated_at timestamptz
);

-- ── 2. table_zones ────────────────────────────────────────────
create table if not exists public.table_zones (
  id uuid primary key,
  camera_id text not null,
  name text not null,
  capacity integer not null check (capacity > 0),
  x double precision not null check (x >= 0 and x <= 1),
  y double precision not null check (y >= 0 and y <= 1),
  w double precision not null check (w > 0 and w <= 1),
  h double precision not null check (h > 0 and h <= 1),
  color text,
  status text not null default 'free' check (status in ('free', 'occupied')),
  seated_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (camera_id, name)
);

create index if not exists idx_table_zones_camera_id on public.table_zones(camera_id);

-- ── 3. waitlist ───────────────────────────────────────────────
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null default 'Guest',
  party_size integer not null check (party_size > 0),
  email text not null,
  joined_at timestamptz not null default now(),
  notified_at timestamptz
);

create index if not exists idx_waitlist_joined_at on public.waitlist(joined_at);
create index if not exists idx_waitlist_notified_at on public.waitlist(notified_at);

-- ── 4. profiles (RBAC) ────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- To promote a user to admin:
-- update public.profiles set role = 'admin' where email = 'you@example.com';

-- ── 5. RLS policies (table-level access control) ──────────────
-- Restricts tables / table_zones / waitlist to admin-role users.
-- Kiosk insert on waitlist is allowed for any authenticated user.

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- tables
alter table public.tables enable row level security;

drop policy if exists "Admins can read tables" on public.tables;
create policy "Admins can read tables"
  on public.tables for select
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can insert tables" on public.tables;
create policy "Admins can insert tables"
  on public.tables for insert
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can update tables" on public.tables;
create policy "Admins can update tables"
  on public.tables for update
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can delete tables" on public.tables;
create policy "Admins can delete tables"
  on public.tables for delete
  using (public.current_user_role() = 'admin');

-- table_zones
alter table public.table_zones enable row level security;

drop policy if exists "Admins can read table_zones" on public.table_zones;
create policy "Admins can read table_zones"
  on public.table_zones for select
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can insert table_zones" on public.table_zones;
create policy "Admins can insert table_zones"
  on public.table_zones for insert
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can update table_zones" on public.table_zones;
create policy "Admins can update table_zones"
  on public.table_zones for update
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can delete table_zones" on public.table_zones;
create policy "Admins can delete table_zones"
  on public.table_zones for delete
  using (public.current_user_role() = 'admin');

-- waitlist
alter table public.waitlist enable row level security;

drop policy if exists "Admins can read waitlist" on public.waitlist;
create policy "Admins can read waitlist"
  on public.waitlist for select
  using (public.current_user_role() = 'admin');

drop policy if exists "Authenticated users can join waitlist" on public.waitlist;
create policy "Authenticated users can join waitlist"
  on public.waitlist for insert
  with check (auth.role() = 'authenticated');
