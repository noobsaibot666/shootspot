-- Up Migration
-- Face blur (D-45): when the worker last checked a photo for faces, and how many it blurred.
-- Photos published before face blur have no check yet; the worker's backfill picks them up.
alter table media
  add column faces_checked_at timestamptz,
  add column faces_blurred integer not null default 0;

-- Down Migration
alter table media drop column faces_checked_at, drop column faces_blurred;
