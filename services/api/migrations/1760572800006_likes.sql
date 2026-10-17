-- Up Migration
-- Private likes (D-29): a member's own bookmark-style "heart" on locations. Never public, no
-- counts. Removed with the account (cascade) and with the location.
create table likes (
  user_id uuid not null references auth_users (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);
create index likes_user_created_idx on likes (user_id, created_at desc);

-- Down Migration
drop table likes;
