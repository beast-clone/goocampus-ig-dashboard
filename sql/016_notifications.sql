-- Stored notifications — one row per notification per recipient.
--
-- Notifications used to be recomputed on every poll from the last 3 days of
-- mh_activity, with dismissals kept only in the browser session, so nothing
-- could be marked read, nothing could "pop again if ignored", and anything older
-- than 3 days vanished. See docs/NOTIFICATIONS_SPEC.md.
--
-- They are still GENERATED from mh_activity by /api/my-day/notifications; this
-- table persists what that produces, keyed on (recipient_key, source_id) so each
-- event notifies each person exactly once, and holds the per-person state.
-- History is kept until the person deletes it (spec §4) — there is no expiry.
--
-- Additive only: a new table, nothing existing is altered.
-- RLS stays enabled with NO policies; the app uses the service-role client,
-- which bypasses it (project rule — never add anon policies to mh_* tables).
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

create table if not exists mh_notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_key   text not null,                 -- team key: manya / praveen / nikhil / nandu / maheen
  source_id       text not null,                 -- stable id of the event that produced it
  kind            text not null,                 -- existing kinds: claim / message / ...
  category        text not null,                 -- action | assigned | pool | progress | dates
  action_needed   boolean not null default false,
  emoji           text,
  title           text not null,
  sub             text,
  post_id         uuid,                          -- the task it is about (no FK: history outlives a deleted task)
  payload         jsonb not null default '{}',   -- e.g. swap candidates, accept flag
  created_at      timestamptz not null default now(),  -- when the underlying event happened
  read_at         timestamptz,                   -- "Go to notification center" / opened it
  dismissed_at    timestamptz,                   -- "Dismiss": stop popping, stays unread
  last_popped_at  timestamptz,                   -- re-pop scheduling, shared across open tabs
  done_at         timestamptz,                   -- action-needed item resolved; unpins it
  deleted_at      timestamptz,                   -- removed from the person's tab (soft)
  unique (recipient_key, source_id)
);

-- The tab: a person's live notifications, newest first.
create index if not exists mh_notifications_recipient_idx
  on mh_notifications (recipient_key, created_at desc)
  where deleted_at is null;

-- The pop-up / re-pop check: a person's open action items.
create index if not exists mh_notifications_open_action_idx
  on mh_notifications (recipient_key)
  where action_needed and done_at is null and deleted_at is null;

alter table mh_notifications enable row level security;

comment on table mh_notifications is
  'Per-person notifications with read / dismissed / done / deleted state. Generated from mh_activity by /api/my-day/notifications and persisted here; kept until the person deletes them. See docs/NOTIFICATIONS_SPEC.md.';
