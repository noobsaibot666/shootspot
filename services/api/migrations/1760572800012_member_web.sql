-- Up Migration
-- Member web gallery (D-44): sessions signed in on the member web origin. They are the only
-- sessions /web/v1 accepts, and administration refuses them, so the two browser clients never mix.
create table member_web_sessions (
  session_id uuid primary key references auth_sessions (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Down Migration
drop table member_web_sessions;
