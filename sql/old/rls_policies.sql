-- =============================================================
-- RLS policies for table-level access control
-- Depends on: profiles table + handle_new_user trigger (profiles.sql)
-- Safe to re-run.
-- =============================================================

-- Helper: returns the role of the currently authenticated user.
-- Using security definer so it can read profiles bypassing RLS.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ── tables ────────────────────────────────────────────────────
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

-- ── table_zones ───────────────────────────────────────────────
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

-- ── waitlist ──────────────────────────────────────────────────
-- Admins can read the full waitlist; anyone authenticated can insert (kiosk)
alter table public.waitlist enable row level security;

drop policy if exists "Admins can read waitlist" on public.waitlist;
create policy "Admins can read waitlist"
  on public.waitlist for select
  using (public.current_user_role() = 'admin');

drop policy if exists "Authenticated users can join waitlist" on public.waitlist;
create policy "Authenticated users can join waitlist"
  on public.waitlist for insert
  with check (auth.role() = 'authenticated');
