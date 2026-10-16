-- Up Migration
-- Admin-managed tag lists (D-25). Records store tag KEYS; keys are never renamed or deleted, only
-- relabelled, reordered or deactivated, so existing records never break. Inactive tags still
-- display on old records but can't be chosen for new ones.
create table vocabulary (
  kind text not null check (kind in ('good_for', 'best_light')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  label text not null check (char_length(label) between 1 and 60),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);

insert into vocabulary (kind, key, label, position) values
  ('good_for', 'portrait', 'Portrait', 0),
  ('good_for', 'fashion', 'Fashion', 1),
  ('good_for', 'landscape', 'Landscape', 2),
  ('good_for', 'architecture', 'Architecture', 3),
  ('good_for', 'street', 'Street', 4),
  ('good_for', 'urban', 'Urban', 5),
  ('good_for', 'nature', 'Nature', 6),
  ('good_for', 'seascape', 'Seascape', 7),
  ('good_for', 'night_astro', 'Night / astro', 8),
  ('good_for', 'product', 'Product', 9),
  ('good_for', 'wedding', 'Wedding', 10),
  ('good_for', 'music_video', 'Music video', 11),
  ('good_for', 'narrative_film', 'Narrative film', 12),
  ('good_for', 'commercial', 'Commercial', 13),
  ('good_for', 'drone', 'Drone (where legal)', 14),
  ('best_light', 'blue_hour_am', 'Blue hour (AM)', 0),
  ('best_light', 'golden_am', 'Sunrise / golden (AM)', 1),
  ('best_light', 'morning', 'Morning', 2),
  ('best_light', 'midday', 'Midday', 3),
  ('best_light', 'afternoon', 'Afternoon', 4),
  ('best_light', 'golden_pm', 'Golden / sunset (PM)', 5),
  ('best_light', 'blue_hour_pm', 'Blue hour (PM)', 6),
  ('best_light', 'night', 'Night', 7),
  ('best_light', 'overcast', 'Overcast-friendly', 8);

-- Down Migration
drop table if exists vocabulary;
