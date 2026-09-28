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
  -- Days of history to compare over (30 / 60 / 90).
  period      int  not null default 30,
  added_by    text,
  created_at  timestamptz not null default now()
);

-- One row per handle per platform per brand. The app upserts on this, so adding a
-- competitor twice updates it rather than duplicating.
create unique index if not exists mh_competitors_unique
  on mh_competitors (account_id, platform, lower(handle));

create index if not exists mh_competitors_account on mh_competitors (account_id);

alter table mh_competitors enable row level security;
-- No policies: the dashboard reads and writes with the service-role key, which
-- bypasses RLS. Adding an anon policy would expose the table to the public key.

-- Check: select account_id, platform, handle, sbu from mh_competitors order by created_at;
