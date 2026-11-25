-- Phase 1.5B: Location freshness verification and advanced scout filter indexes.

alter table locations
  add column if not exists last_verified_at timestamptz,
  add column if not exists change_flag text;

create table if not exists location_verifications (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  user_id uuid not null references auth_users (id) on delete cascade,
  status text not null check (status in ('accurate', 'changed')),
  reason text,
  created_at timestamptz not null default now(),
  unique (location_id, user_id)
);

create index if not exists idx_locations_advanced_gin on locations using gin (advanced);
create index if not exists idx_locations_focal_length on locations (focal_length_35mm)
  where focal_length_35mm is not null;
