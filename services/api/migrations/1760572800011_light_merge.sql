-- Up Migration
-- Best light without near-duplicates (D-42): golden hour is Sunrise / Sunset, and blue hour is one
-- tag. Keys never change (D-25), so golden_am / golden_pm / blue_hour_am only get new labels;
-- blue_hour_pm is retired and records carrying it move to blue_hour_am.
update locations
   set best_light = array(select distinct unnest(array_replace(best_light, 'blue_hour_pm', 'blue_hour_am')))
 where 'blue_hour_pm' = any(best_light);

update vocabulary set active = false, label = 'Blue hour (PM)', updated_at = now()
 where kind = 'best_light' and key = 'blue_hour_pm';

update vocabulary v set label = x.label, position = x.position, updated_at = now()
  from (values
    ('golden_am', 'Sunrise', 0),
    ('morning', 'Morning', 1),
    ('midday', 'Midday', 2),
    ('afternoon', 'Afternoon', 3),
    ('golden_pm', 'Sunset', 4),
    ('blue_hour_am', 'Blue hour', 5),
    ('night', 'Night', 6),
    ('overcast', 'Overcast-friendly', 7)
  ) as x (key, label, position)
 where v.kind = 'best_light' and v.key = x.key;

-- Down Migration
-- Restores the labels and the PM tag; records merged into blue_hour_am stay merged.
update vocabulary v set label = x.label, position = x.position, active = true, updated_at = now()
  from (values
    ('blue_hour_am', 'Blue hour (AM)', 0),
    ('golden_am', 'Sunrise / golden (AM)', 1),
    ('morning', 'Morning', 2),
    ('midday', 'Midday', 3),
    ('afternoon', 'Afternoon', 4),
    ('golden_pm', 'Golden / sunset (PM)', 5),
    ('blue_hour_pm', 'Blue hour (PM)', 6),
    ('night', 'Night', 7),
    ('overcast', 'Overcast-friendly', 8)
  ) as x (key, label, position)
 where v.kind = 'best_light' and v.key = x.key;
