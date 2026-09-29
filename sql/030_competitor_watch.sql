-- 030 — the competitor watcher's memory (docs/COMPETITOR_RADAR_SPEC.md, step 2)
--
-- Every few minutes the watcher reads each competitor's website sitemap, their
-- events/webinar pages, YouTube feed and Instagram. It has to remember what it has
-- already seen, so that only genuinely new things become events and notifications.
--
-- RUN IN THE SUPABASE SQL EDITOR (project wlhbmzaernchwebapszq). Safe to run twice.

-- Everything already seen, per competitor and source. The first time a source is
-- read, everything goes in here and NOTHING is announced — otherwise the first run
-- would announce Academically's 1,315 existing blog posts as new.
create table if not exists mh_competitor_seen (
  account_id  text not null,
  handle      text not null,
  source      text not null,          -- 'sitemap' | 'page:<url>' | 'youtube' | 'instagram'
  item_key    text not null,          -- a URL, video id or post id
  first_seen  timestamptz not null default now(),
  primary key (account_id, handle, source, item_key)
);

-- What was new: shown on the Briefing and Competitor Radar, and sent as notifications.
create table if not exists mh_competitor_events (
  id           uuid primary key default gen_random_uuid(),
  account_id   text not null,
  handle       text not null,
  kind         text not null,         -- 'blog' | 'event' | 'page' | 'youtube' | 'instagram'
  title        text,
  url          text,
  published_at timestamptz,
  detected_at  timestamptz not null default now(),
  unique (account_id, handle, kind, url)
);

create index if not exists mh_competitor_events_recent on mh_competitor_events (account_id, detected_at desc);
create index if not exists mh_competitor_events_handle on mh_competitor_events (account_id, handle, detected_at desc);

alter table mh_competitor_seen enable row level security;
alter table mh_competitor_events enable row level security;
-- No policies: the dashboard uses the service-role key.

-- Check: select handle, source, count(*) from mh_competitor_seen group by 1,2 order by 1,2;
