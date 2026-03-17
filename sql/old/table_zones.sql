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
