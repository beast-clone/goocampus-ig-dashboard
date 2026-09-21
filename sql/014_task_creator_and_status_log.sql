-- Who created a task, and every status change it goes through.
--
-- Nandu (and others) create tasks — e.g. 12th Plus carousels — that then move to
-- someone else (design → Praveen). They need to follow what they created: its stage
-- and when it's published.
--
-- 1) mh_posts.created_by — the creator's username, set once when the task is made
--    (dashboard: from the session; Sync from Airtable: Airtable's "Created by").
--    Never changed afterwards, whoever owns the task.
-- 2) mh_status_log — one row per status change, written by the DATABASE, so it
--    catches every writer (the dashboard, Sync from Airtable, n8n, direct edits).
--    The dashboard's own activity log only saw changes made in the dashboard, so it
--    missed most "Published" moves. Feeds "your task is now Published" notifications.
--
-- Additive only. Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

alter table mh_posts add column if not exists created_by text;
create index if not exists mh_posts_created_by_idx on mh_posts (created_by);

create table if not exists mh_status_log (
  id          bigint generated always as identity primary key,
  post_id     uuid not null,
  from_status text,
  to_status   text,
  changed_at  timestamptz not null default now()
);
create index if not exists mh_status_log_post_idx on mh_status_log (post_id);
create index if not exists mh_status_log_changed_idx on mh_status_log (changed_at desc);
alter table mh_status_log enable row level security;

create or replace function mh_log_status_change() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into mh_status_log (post_id, from_status, to_status) values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists mh_status_log_trg on mh_posts;
create trigger mh_status_log_trg
  after update of status on mh_posts
  for each row execute function mh_log_status_change();
