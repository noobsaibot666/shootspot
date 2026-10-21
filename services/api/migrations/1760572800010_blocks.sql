-- Up Migration
-- App Review guideline 1.2 (D-41). A member blocks the author of a location: all of that author's
-- locations disappear from the blocker's feed, map and detail at once. The author stays anonymous
-- to the blocker (the client only sees the block id and the location it was made from). Every
-- block also files a 'blocked_user' report so moderators hear about it.
create table blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth_users (id) on delete cascade,
  blocked_user_id uuid not null references auth_users (id) on delete cascade,
  location_id uuid references locations (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

alter table reports drop constraint if exists reports_reason_check;
alter table reports add constraint reports_reason_check check (reason in (
  'private_property', 'unsafe_access', 'wrong_location', 'inappropriate_image',
  'copyright', 'person_identifiable', 'spam_duplicate', 'other', 'blocked_user'));

-- 18+ age gate (D-41 replaces D-02's 16+). Older 'age_16' rows stay as they were recorded.
alter table consents drop constraint if exists consents_kind_check;
alter table consents add constraint consents_kind_check
  check (kind in ('terms', 'privacy', 'image_license', 'age_16', 'age_18', 'attribution_notice'));

-- Down Migration
alter table consents drop constraint if exists consents_kind_check;
delete from consents where kind = 'age_18';
alter table consents add constraint consents_kind_check
  check (kind in ('terms', 'privacy', 'image_license', 'age_16', 'attribution_notice'));
alter table reports drop constraint if exists reports_reason_check;
delete from reports where reason = 'blocked_user';
alter table reports add constraint reports_reason_check check (reason in (
  'private_property', 'unsafe_access', 'wrong_location', 'inappropriate_image',
  'copyright', 'person_identifiable', 'spam_duplicate', 'other'));
drop table if exists blocks;
