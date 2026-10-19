-- Up Migration
-- Stepped scouting notes (D-38): the camera direction is no longer asked, so a record without a
-- compass reading publishes without one. "Sports" joins the Good for list.
alter table locations alter column bearing_deg drop not null;

insert into vocabulary (kind, key, label, position)
values ('good_for', 'sports', 'Sports',
        coalesce((select max(position) + 1 from vocabulary where kind = 'good_for'), 0))
on conflict do nothing;

-- Down Migration
delete from vocabulary v where v.kind = 'good_for' and v.key = 'sports'
  and not exists (select 1 from locations l where 'sports' = any(l.good_for));
update locations set bearing_deg = 0 where bearing_deg is null;
alter table locations alter column bearing_deg set not null;
