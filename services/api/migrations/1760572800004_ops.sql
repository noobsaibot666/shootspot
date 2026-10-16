-- Up Migration
-- Operations: heartbeats written by jobs that run outside the API (backups), and alert
-- de-duplication so owners get one email per problem, not one per check.
create table ops_heartbeats (
  name text primary key,
  ok_at timestamptz not null,
  detail text
);

create table ops_alerts (
  key text primary key,
  last_sent_at timestamptz not null,
  last_detail text
);

-- Down Migration
drop table if exists ops_alerts;
drop table if exists ops_heartbeats;
