-- Up Migration
-- Gallery import (D-28): pins may come from an imported photo's GPS, and records remember
-- whether the photo was taken in the app or imported.
alter table locations drop constraint if exists locations_pin_source_check;
alter table locations add constraint locations_pin_source_check
  check (pin_source in ('gps', 'photo', 'manual', 'search'));
alter table locations add column capture_origin text not null default 'camera'
  check (capture_origin in ('camera', 'import'));

-- Down Migration
alter table locations drop column capture_origin;
alter table locations drop constraint locations_pin_source_check;
alter table locations add constraint locations_pin_source_check
  check (pin_source in ('gps', 'manual', 'search'));
