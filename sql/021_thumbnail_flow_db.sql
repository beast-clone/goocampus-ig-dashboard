-- Make the database agree with the thumbnail flow (docs/THUMBNAIL_FLOW_SPEC.md).
--
-- Two separate database rules were quietly overriding the team's intent. Neither is
-- in this repo; both were found on 27 Sep 2026 by listing the triggers on mh_posts.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

-- ---------------------------------------------------------------------------
-- 1. Stop auto-spawning a thumbnail task onto Praveen.
-- ---------------------------------------------------------------------------
-- mh_trg_spawn_thumbnail fired AFTER INSERT on every 'Reel - Original', 'Reel - Cut',
-- 'YouTube Long-Form' and 'YouTube Shorts' and inserted a second task:
--
--     particulars → '<title> — Thumbnail'
--     owner_key   → 'praveen'          ← always, nobody was ever asked
--     content     → 'Auto-spawned thumbnail task for post: <title>'
--
-- This is why thumbnails kept landing on Praveen however the team actually wanted to
-- split the work, and it is the behaviour the new flow exists to replace. It fired on
-- EVERY insert, so it also hit rows arriving from the Airtable sync and from n8n, and
-- it had no dedup — one per video, forever.
--
-- The flow now asks at creation whether a thumbnail is needed and who should make it,
-- so this rule is not just duplicated, it contradicts the answer.
--
-- KNOWN CONSEQUENCE, and it is the point: a video only gets a thumbnail task when
-- someone ticks the box. Tasks created outside the dashboard (Airtable sync, n8n) will
-- no longer get one automatically — nothing else creates them.
--
-- The function is deliberately left in place, so this is one statement to undo:
--   create trigger mh_trg_spawn_thumbnail after insert on mh_posts
--     for each row execute function mh_fn_spawn_thumbnail();
drop trigger if exists mh_trg_spawn_thumbnail on mh_posts;

-- ---------------------------------------------------------------------------
-- 2. Don't hand a parked thumbnail to Praveen before anyone has been asked.
-- ---------------------------------------------------------------------------
-- mh_fn_assign_owner routes any task that reaches Content - Approved while
-- owner_key IS NULL, sending 'Reel Thumbnail' / 'YouTube Thumbnail' to Praveen.
--
-- That is right for a thumbnail nobody has claimed. It is wrong for one this flow
-- parked: there, a null owner does not mean "unset", it means "not decided yet — the
-- editor who claims the video gets to choose". Approving it early would silently
-- answer that question with "Praveen", which is the answer the flow exists to stop
-- being automatic.
--
-- Same narrow test as sql/020: only tasks carrying custom.thumbnail_for, which only
-- this flow sets. Every other owner-less task routes exactly as before.
create or replace function mh_fn_assign_owner() returns trigger
language plpgsql as $$
begin
  -- Only care when status just became Content - Approved
  if new.status = 'Content - Approved'
     and (old.status is distinct from 'Content - Approved')
     and new.owner_key is null
     -- NEW: a thumbnail parked by the thumbnail flow is waiting on a person, not on
     -- this rule. Leave it unowned so the claim screen can still ask.
     and coalesce(new.custom ->> 'thumbnail_for', '') = '' then
    -- Route by content type
    if new.type in ('Post','Carousel','Story (Image)','Reel Thumbnail','YouTube Thumbnail','Meta Ads') then
      new.owner_key := 'praveen';
    elsif new.type = 'YouTube Long-Form' then
      new.owner_key := 'nandu';
    elsif new.type in ('Reel - Original','Story (Video)','YouTube Shorts') then
      new.owner_key := 'nikhil';
    end if;
  end if;
  return new;
end;
$$;
