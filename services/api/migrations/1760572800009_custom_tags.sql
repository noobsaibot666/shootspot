-- Up Migration
-- Personal tags (D-39): a member may type their own Good for / Best light tags. They live on the
-- record only (shown on its page, not in filters). A record needs at least one tag of each kind,
-- listed or personal.
alter table locations
  add column good_for_custom text[] not null default '{}'
    check (cardinality(good_for_custom) <= 3),
  add column best_light_custom text[] not null default '{}'
    check (cardinality(best_light_custom) <= 3);

alter table locations drop constraint if exists locations_good_for_check;
alter table locations drop constraint if exists locations_best_light_check;
alter table locations
  add constraint locations_good_for_count
    check (cardinality(good_for) <= 8 and cardinality(good_for) + cardinality(good_for_custom) >= 1),
  add constraint locations_best_light_count
    check (cardinality(best_light) + cardinality(best_light_custom) >= 1);

-- Down Migration
alter table locations drop constraint if exists locations_good_for_count;
alter table locations drop constraint if exists locations_best_light_count;
alter table locations drop column if exists good_for_custom;
alter table locations drop column if exists best_light_custom;
alter table locations add constraint locations_good_for_check
  check (cardinality(good_for) between 1 and 8);
alter table locations add constraint locations_best_light_check
  check (cardinality(best_light) >= 1);
