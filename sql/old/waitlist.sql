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
