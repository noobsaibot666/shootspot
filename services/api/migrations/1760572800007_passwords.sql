-- Up Migration
-- Optional passwords (ADR 0005 amendment): sessions created by email + password sign-in. The admin
-- web accepts only these (plus TOTP); email-code sessions can't reach administration.
create table auth_password_sessions (
  session_id uuid primary key references auth_sessions (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Down Migration
drop table auth_password_sessions;
