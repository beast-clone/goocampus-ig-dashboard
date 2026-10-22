-- Recycle bin for task files (creatives, references, attachments), 22 Oct 2026.
-- A removed file is MOVED here (its mh_attachments row as a snapshot); the file itself
-- stays in storage, so Restore puts it back exactly as it was. "Delete from bin" only
-- stamps purged_at — like the task bin, nothing is ever destroyed from the dashboard.
create table if not exists mh_attachments_trash (
  id uuid primary key,
  post_id uuid,
  post_title text,
  filename text,
  kind text,
  storage_path text,
  row jsonb not null,
  deleted_by text,
  deleted_at timestamptz not null default now(),
  purged_at timestamptz,
  purged_by text
);
create index if not exists mh_attachments_trash_deleted_at on mh_attachments_trash (deleted_at desc);
alter table mh_attachments_trash enable row level security;
