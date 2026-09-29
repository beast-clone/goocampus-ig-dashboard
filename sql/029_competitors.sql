-- 029 — tracked competitors become rows, not browser storage
--
-- Nandu, 26 Sept: "I've added 2-3; now it's not there."
--
-- They were kept in localStorage (`bm-tracked-<account>`), which is per browser and
-- per device: what he added existed only in the browser he added it in, and nobody
-- else on the team could ever see it. Competitors are team data, so they belong here.
--
-- Two more comments need the same table, which is why it carries these columns:
--   · platform — Manya, 28 Sept: filter competitors by Instagram / YouTube
--   · sbu      — Manya, 28 Sept: "add a filter for me to select which primary
--                interest when I am adding the competitor name"
-- And Nandu, 28 Sept, wants the tracked list on the Briefing page — which a server
-- can only do if the list lives on the server.
--
-- RUN IN THE SUPABASE SQL EDITOR (project wlhbmzaernchwebapszq). Safe to run twice.

create table if not exists mh_competitors (
  id          uuid primary key default gen_random_uuid(),
  -- Which brand's board this competitor belongs to (goocampus, goocampusworld, …).
  account_id  text not null,
  platform    text not null default 'instagram',
  handle      text not null,
  -- The existing free-text grouping ("niche"/category) shown as a chip.
  category    text,
  -- Primary interest / SBU. Free text on purpose: Manya asked for "just a box I
  -- will fill up by myself", and pinning it to mh_sbus would reject anything new.
  sbu         text,
  -- Their YouTube channel (UC…), so the profile can show uploads beside Instagram.
  -- Optional: plenty of competitors have no channel, and the panel is simply absent.
  youtube_channel text,
  -- Days of history to compare over (30 / 60 / 90).
  period      int  not null default 30,
  -- Display name ("Hello Mentor") and real website, for the Briefing tabs and the
  -- website watcher (Praveen, 29 Sep — docs/COMPETITOR_RADAR_SPEC.md). The website is
  -- entered, never guessed from the handle: "academically.global" is not a domain.
  name        text,
  website     text,
  added_by    text,
  created_at  timestamptz not null default now()
);

-- One row per handle per platform per brand. The app upserts on this, so adding a
-- competitor twice updates it rather than duplicating. On the plain column (the app
-- stores handles lower-cased): an index on lower(handle) can't be named in an upsert's
-- ON CONFLICT, so every save would have failed.
create unique index if not exists mh_competitors_unique
  on mh_competitors (account_id, platform, handle);

create index if not exists mh_competitors_account on mh_competitors (account_id);

alter table mh_competitors enable row level security;
-- No policies: the dashboard reads and writes with the service-role key, which
-- bypasses RLS. Adding an anon policy would expose the table to the public key.

-- The three competitors the team named (Praveen, 29 Sep), as ordinary rows anyone can
-- edit or remove — they used to be hard-coded in competitors.json and
-- competitor-youtube.json, so removing them never stuck.
insert into mh_competitors (account_id, platform, handle, name, website, youtube_channel, added_by) values
  ('goocampus', 'instagram', 'hellomentor.in', 'Hello Mentor', 'https://hellomentor.in', 'UCq7ajE4W-30sHRGzaGlMMfg', 'praveen'),
  ('goocampus', 'instagram', 'academically.global', 'Academically', null, 'UCkl1L4K6CFZCfgXREYploRw', 'praveen'),
  ('goocampus', 'instagram', 'moksh_academy', 'Moksh Academy', null, null, 'praveen')
on conflict (account_id, platform, handle) do nothing;

-- Check: select account_id, platform, handle, name, website from mh_competitors order by created_at;
