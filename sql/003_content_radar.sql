-- Content Radar — Google Alerts RSS feed subscriptions + cached items.
--
-- content_alerts stores each Google Alerts RSS URL the user has pasted in, along
-- with the Primary Interest it maps to (so items surface in the right topic bucket
-- in the dashboard).
--
-- content_alert_items caches every entry pulled from those feeds, deduplicated by
-- feed_id + link. We keep 60 days of history and let items age out via a periodic
-- prune (delete-where-older-than).

create table if not exists content_alerts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- friendly label ("AMC registration updates")
  primary_interest text not null,                 -- Australia-PGCP, NEET PG, ALS, etc.
  feed_url      text not null unique,             -- https://www.google.com/alerts/feeds/.../.../
  active        boolean not null default true,
  last_fetched_at timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);

create index if not exists content_alerts_interest_idx on content_alerts (primary_interest);
create index if not exists content_alerts_active_idx on content_alerts (active);

create table if not exists content_alert_items (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid not null references content_alerts (id) on delete cascade,
  title         text not null,
  link          text not null,
  source        text,
  snippet       text,
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  -- deduplication key: same feed + same link = same item
  constraint content_alert_items_unique unique (alert_id, link)
);

create index if not exists content_alert_items_published_idx on content_alert_items (published_at desc);
create index if not exists content_alert_items_alert_idx on content_alert_items (alert_id);
