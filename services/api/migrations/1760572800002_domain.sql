-- Up Migration
-- Domain schema. Privacy rule (docs/phase-0/03 §2, §5): the creator of a location is stored
-- ONLY in record_ownership. Deleting an account cascades that link away and the record stays
-- anonymous. Public ids are random UUIDs, never sequential.

create table profiles (
  user_id uuid primary key references auth_users (id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  display_name text check (char_length(display_name) <= 60),
  bio text check (char_length(bio) <= 300),
  portfolio_url text check (char_length(portfolio_url) <= 300),
  social_handle text check (char_length(social_handle) <= 60),
  age_confirmed_at timestamptz,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Versioned consent evidence. Kept (with user_id nulled) after account deletion.
create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth_users (id) on delete set null,
  kind text not null check (kind in ('terms', 'privacy', 'image_license', 'age_16', 'attribution_notice')),
  version text not null,
  accepted_at timestamptz not null default now()
);
create index consents_user_idx on consents (user_id);

create table locations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_media'
    check (status in ('pending_media', 'processing', 'published', 'rejected', 'hidden', 'removed')),
  point geography(Point, 4326) not null,
  accuracy_m real check (accuracy_m >= 0),
  pin_source text not null check (pin_source in ('gps', 'manual', 'search')),
  label text not null check (char_length(label) between 1 and 120),
  framing text not null check (framing in ('16:9', '1:1')),
  good_for text[] not null check (cardinality(good_for) between 1 and 8),
  good_for_note text check (char_length(good_for_note) <= 200),
  best_light text[] not null check (cardinality(best_light) >= 1),
  best_light_note text check (char_length(best_light_note) <= 200),
  bearing_deg real not null check (bearing_deg >= 0 and bearing_deg < 360),
  advanced jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null,
  altitude_m real,
  focal_length_35mm real,
  heading_deg real,
  sun_azimuth_deg real,
  sun_elevation_deg real,
  attributed boolean not null default false,
  moderation_reason text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create index locations_point_gix on locations using gist (point);
create index locations_feed_idx on locations (published_at desc, id desc) where status = 'published';
create index locations_good_for_gin on locations using gin (good_for);
create index locations_best_light_gin on locations using gin (best_light);

-- The ONLY link between a person and a place. Never exposed by public endpoints.
create table record_ownership (
  location_id uuid primary key references locations (id) on delete cascade,
  user_id uuid not null references auth_users (id) on delete cascade,
  draft_id uuid not null unique,
  created_at timestamptz not null default now()
);
create index record_ownership_user_idx on record_ownership (user_id);

create table media (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations (id) on delete cascade,
  state text not null default 'awaiting_upload'
    check (state in ('awaiting_upload', 'queued', 'processing', 'ready', 'rejected', 'failed', 'purged')),
  original_key text not null unique,
  width int,
  height int,
  framing text check (framing in ('16:9', '1:1')),
  derivatives jsonb not null default '[]'::jsonb,
  license_version text not null,
  reject_reason text,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_location_idx on media (location_id);
create index media_state_idx on media (state) where state not in ('ready', 'purged');

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth_users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on projects (user_id, position);

create table project_items (
  project_id uuid not null references projects (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  position int not null default 0,
  added_at timestamptz not null default now(),
  primary key (project_id, location_id)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations (id) on delete cascade,
  reporter_user_id uuid references auth_users (id) on delete set null,
  reason text not null check (reason in (
    'private_property', 'unsafe_access', 'wrong_location', 'inappropriate_image',
    'copyright', 'person_identifiable', 'spam_duplicate', 'other')),
  note text check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth_users (id) on delete set null,
  resolution_note text check (char_length(resolution_note) <= 500)
);
create index reports_status_idx on reports (status, created_at);
create unique index reports_one_open_per_reporter on reports (location_id, reporter_user_id) where status = 'open';

-- Every admin action and every admin view of a creator link (threat model, asset 1).
create table admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth_users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text check (char_length(reason) <= 500),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on admin_audit_events (created_at desc);
create index admin_audit_target_idx on admin_audit_events (target_type, target_id);

-- Admin TOTP (ADR 0005). Secret is AES-256-GCM encrypted with a key derived from AUTH_SECRET.
create table admin_mfa (
  user_id uuid primary key references auth_users (id) on delete cascade,
  secret_enc text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  -- Replay protection: a code accepted once cannot be used again within its validity window.
  last_code text,
  last_code_at timestamptz
);

-- A session counts as MFA-verified only after a TOTP check bound to that session.
create table admin_mfa_sessions (
  session_id uuid primary key references auth_sessions (id) on delete cascade,
  user_id uuid not null references auth_users (id) on delete cascade,
  verified_at timestamptz not null default now()
);

create table account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth_users (id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  requested_at timestamptz not null default now(),
  execute_after timestamptz not null,
  completed_at timestamptz
);
create unique index account_deletions_one_active on account_deletions (user_id) where status = 'scheduled';

create table data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth_users (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'ready', 'failed', 'expired')),
  object_key text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz
);

-- Down Migration
drop table if exists data_exports;
drop table if exists account_deletions;
drop table if exists admin_mfa_sessions;
drop table if exists admin_mfa;
drop table if exists admin_audit_events;
drop table if exists reports;
drop table if exists project_items;
drop table if exists projects;
drop table if exists media;
drop table if exists record_ownership;
drop table if exists locations;
drop table if exists consents;
drop table if exists profiles;
