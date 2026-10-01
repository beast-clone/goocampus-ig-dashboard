-- 032 — Watchers: track web pages (KEA / MCC counselling notices, and anything else)
-- and tell people when something new is posted. Replaces n8n workflow
-- lhOaZp9S755bhEvT ("KEA UGNEET 2026 Notification Watcher").
--
-- RUN IN THE SUPABASE SQL EDITOR (project wlhbmzaernchwebapszq). Safe to run twice.

-- One row per watched link.
create table if not exists mh_watchers (
  id               uuid primary key default gen_random_uuid(),
  name             text,
  url              text not null unique,
  category         text,                       -- optional; used when a notice's own title doesn't say UG / PG
  auto_category    boolean not null default true,
  emails           text[] not null default '{}',
  telegram         boolean not null default false,
  telegram_chats   text[] not null default '{}',
  active           boolean not null default true,
  created_by       text,
  created_at       timestamptz not null default now(),
  last_checked_at  timestamptz,
  last_error       text,
  last_count       int
);

-- Every link found on a watched page. The first read is the baseline (already there,
-- never announced); after that a new row is a new notice.
create table if not exists mh_watcher_items (
  id           uuid primary key default gen_random_uuid(),
  watcher_id   uuid not null references mh_watchers(id) on delete cascade,
  item_url     text not null,
  title        text,
  grp          text,                           -- 'UG' | 'PG' | 'UG & PG' | category | 'Other'
  baseline     boolean not null default false,
  detected_at  timestamptz not null default now(),
  emailed_at   timestamptz,
  telegram_at  timestamptz,
  unique (watcher_id, item_url)
);
create index if not exists mh_watcher_items_recent on mh_watcher_items (baseline, detected_at desc);

-- People who pressed Start on the GooCampus Telegram bot (or groups it was added to).
create table if not exists mh_telegram_chats (
  chat_id    text primary key,
  name       text,
  username   text,
  kind       text,                             -- 'private' | 'group' | 'supergroup' | 'channel'
  added_at   timestamptz not null default now()
);

alter table mh_watchers enable row level security;
alter table mh_watcher_items enable row level security;
alter table mh_telegram_chats enable row level security;
-- No policies: the dashboard uses the service-role key.
