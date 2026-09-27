-- Content Radar: the daily loop.
--
-- The radar showed things and nothing recorded whether anybody did anything about
-- them. A time-sensitive story could sit there all day, be scrolled past, and leave no
-- trace — so there was no way to tell "we decided not to post that" apart from "nobody
-- looked". Agreed with Praveen L on 27 Sep 2026; see the flow in the Content Radar
-- section of the dashboard docs.
--
-- The loop: an item appears on the Radar → anyone can write it, or mark it useful /
-- not useful in one tap → at 11:59 PM it leaves the Radar and is written into the day's
-- log with whatever happened to it, including nothing → next morning the briefing shows
-- the time-sensitive ones that got nothing, once.
--
-- TWO tables on purpose. Actions are live and belong to a person; the log is a frozen
-- record of a day. Keeping them apart means a late thumbs-up cannot silently rewrite
-- last week's report, and the report stays readable without recomputing anything.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

-- ---------------------------------------------------------------------------
-- 1. What a person did about a radar item.
-- ---------------------------------------------------------------------------
-- item_key is a stable identity for the thing that was shown, whatever kind it is:
--   news     → the content_alert_items id
--   mention  → the thread URL
--   search   → the search term, lower-cased
-- Not a foreign key, because two of the three kinds are not rows in this database —
-- a Reddit thread and a Google Trends term are only ever passing through.
create table if not exists radar_actions (
  id           uuid primary key default gen_random_uuid(),
  item_key     text        not null,
  item_kind    text        not null check (item_kind in ('news', 'mention', 'search')),
  action       text        not null check (action in ('written', 'useful', 'not_useful')),
  actor_key    text,
  -- Set when the action was 'written', so the report can link to the task that came
  -- out of it rather than just claiming one was made.
  task_id      uuid,
  created_at   timestamptz not null default now(),
  -- One standing answer per item per person. Changing your mind updates the row rather
  -- than leaving both answers in the log for the report to pick between.
  unique (item_key, actor_key)
);
create index if not exists radar_actions_item on radar_actions (item_key);
create index if not exists radar_actions_created on radar_actions (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. The day's log — the report.
-- ---------------------------------------------------------------------------
-- Written once a night by api/cron/radar-rolloff. Carries its own copy of the title,
-- source and url: the report has to stay readable years later, and the news feed is
-- pruned. A report that goes blank because the source row was cleaned up is not a
-- report.
--
-- action NULL is the point of the whole table — it means shown and nothing was done.
create table if not exists radar_day_log (
  id             uuid primary key default gen_random_uuid(),
  day            date        not null,
  item_key       text        not null,
  item_kind      text        not null,
  title          text        not null,
  source         text,
  url            text,
  interest       text,
  -- Whether it was flagged "act now" while it was on the radar. The briefing only
  -- chases these, so it has to be remembered rather than recomputed from an age that
  -- keeps growing.
  time_sensitive boolean     not null default false,
  action         text,
  actor_key      text,
  task_id        uuid,
  created_at     timestamptz not null default now(),
  -- A day can only log an item once, so the roll-off can be safely re-run.
  unique (day, item_key)
);
create index if not exists radar_day_log_day on radar_day_log (day desc);
-- The briefing's only question: what was urgent yesterday and got nothing?
create index if not exists radar_day_log_missed on radar_day_log (day desc) where action is null and time_sensitive;
