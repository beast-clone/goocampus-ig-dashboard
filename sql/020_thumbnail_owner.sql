-- Let a thumbnail stay with the editor who chose to make it.
--
-- sql/013_design_work_owner.sql forces every NON-video task at Content - Approved or
-- later onto Praveen, because design work is his. A "Reel Thumbnail" / "YouTube
-- Thumbnail" is non-video, so that rule also caught thumbnails — which was correct
-- while Praveen made all of them.
--
-- He no longer does: the editor who cuts the reel usually makes its thumbnail too, so
-- the thumbnail flow (docs/THUMBNAIL_FLOW_SPEC.md) now asks who should make it and can
-- land it on Nikhil or Nandu. Without this change the trigger would take it straight
-- back off them the moment the task passed Content - Approved, and the answer they gave
-- on the claim screen would silently not stick.
--
-- The exception is narrow on purpose: it applies only to a task carrying
-- custom.thumbnail_for, which is set ONLY by that flow and means "a person was asked
-- who should own this, and answered". A thumbnail created any other way (Airtable sync,
-- n8n, a hand-made task) has no such key and is still forced to Praveen exactly as
-- before.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

create or replace function mh_enforce_design_owner() returns trigger
language plpgsql as $$
begin
  if new.type is not null
     and new.status in ('Content - Approved', 'Output - In Progress', 'Output - Ready', 'Ready to Publish')
     and new.type not in ('Reel - Original', 'Reel - Cut', 'YouTube Long-Form', 'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video')
     and coalesce(new.owner_key, '') <> 'praveen'
     -- NEW: a thumbnail whose owner this flow already settled is left alone.
     and not (coalesce(new.custom ->> 'thumbnail_for', '') <> '') then
    new.owner_key := 'praveen';
  end if;
  return new;
end;
$$;

-- The trigger itself is unchanged; it still fires on the same columns. `custom` is not
-- in its column list and does not need to be: thumbnail_for is written at INSERT (which
-- the trigger always fires on) and never changes afterwards.
drop trigger if exists mh_design_owner on mh_posts;
create trigger mh_design_owner
  before insert or update of status, type, owner_key on mh_posts
  for each row execute function mh_enforce_design_owner();
