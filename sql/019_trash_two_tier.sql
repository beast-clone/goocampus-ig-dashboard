-- Two-tier recycle bin: nothing a person deletes is ever actually destroyed.
--
-- Before this, "Delete forever" in the recycle bin ran a real DELETE on
-- mh_posts_trash. The snapshot was gone, and no one — not even an admin — could get
-- the task back. That is the one irreversible button in the dashboard, and it was
-- one mis-click away from losing a task's whole history (row, collaborators,
-- attachments, activity and comments all travel in the snapshot).
--
-- Now "Delete forever" only STAMPS the row:
--   · purged_at IS NULL      → in the recycle bin, anyone with delete_tasks sees it
--   · purged_at IS NOT NULL  → archived, only an admin sees it, and can recover it
-- Recovering clears the stamp and the task is back in the bin, restorable as usual.
-- There is deliberately no hard-delete path left: a snapshot is a few KB, and the
-- point of the feature is that deletion is always undoable.
--
-- Additive only: two nullable columns and an index. Existing rows have purged_at
-- NULL, so every task currently in the bin stays exactly where it is.
-- RLS stays enabled; the app uses the service-role client, which bypasses it.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq — "Beast Clone").

alter table mh_posts_trash add column if not exists purged_at timestamptz;
alter table mh_posts_trash add column if not exists purged_by text;

-- The bin lists by deleted_at and the archive by purged_at; both filter on purged_at,
-- so index it. Partial index: the bin (purged_at IS NULL) is the hot path.
create index if not exists mh_posts_trash_purged_at_idx
  on mh_posts_trash (purged_at desc) where purged_at is not null;

comment on column mh_posts_trash.purged_at is
  'When this snapshot was deleted FROM the recycle bin. NULL = still in the bin. Set (not deleted) so an admin can always recover it — there is no hard delete.';
comment on column mh_posts_trash.purged_by is
  'Who pressed Delete forever in the recycle bin.';
