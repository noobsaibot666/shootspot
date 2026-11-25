-- Phase 1.5D: Smart Projects (target shoot date and private per-spot production notes).

alter table projects
  add column if not exists shoot_date date;

alter table project_items
  add column if not exists note text check (note is null or char_length(note) <= 300);
