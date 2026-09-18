-- Recycle bin for Marketing Hub tasks.
--
-- Deleting a task used to erase it outright. Now the task row and everything that
-- hangs off it move here as a snapshot, and leave mh_posts — so a deleted task drops
-- out of every screen that reads mh_posts without any of them needing a filter.
-- Restore writes the snapshot back under the same id. Only "Delete forever" in the
-- bin removes a row from here.
--
-- Additive only: a new table, nothing existing is altered.
-- RLS stays enabled; the app uses the service-role client, which bypasses it.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

create table if not exists mh_posts_trash (
  id                 uuid primary key,              -- the task's own id, reused on restore
  particulars        text,                          -- title, for listing the bin cheaply
  airtable_record_id text,                          -- so Sync from Airtable can skip it
  post               jsonb not null,                -- the full mh_posts row
  collaborators      jsonb not null default '[]',   -- mh_post_collaborators rows
  attachments        jsonb not null default '[]',   -- mh_attachments rows (files stay in storage)
  activity           jsonb not null default '[]',   -- mh_activity rows
  comments           jsonb not null default '[]',   -- mh_comments rows
  deleted_by         text,
  deleted_at         timestamptz not null default now()
);

create index if not exists mh_posts_trash_deleted_at_idx on mh_posts_trash (deleted_at desc);
create index if not exists mh_posts_trash_airtable_idx on mh_posts_trash (airtable_record_id);

alter table mh_posts_trash enable row level security;

comment on table mh_posts_trash is
  'Deleted Marketing Hub tasks, restorable. Written by the delete route, emptied only by Delete forever. Sync from Airtable skips any airtable_record_id found here, so a deleted task is not re-imported.';
