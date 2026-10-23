-- Task ownership by type, both ways (23 Oct 2026). Applied via Supabase migration.
-- Design work (any non-video type) at Content Approved .. Ready to Publish belongs to
-- Praveen — as before. NEW: when a task in that stage changes from a design type to a
-- VIDEO type while it is still sitting with Praveen, it goes to the editors' claim
-- pool (unowned, Content - Approved) instead of staying on Praveen, so Nikhil / Nandu
-- see it. Naming an editor in the same change keeps that editor. Finished stages
-- (Output - Ready, Ready to Publish) keep their owner.
create or replace function mh_enforce_design_owner() returns trigger
language plpgsql as $$
declare
  video_types text[] := array['Reel - Original', 'Reel - Cut', 'YouTube Long-Form', 'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video'];
begin
  if new.type is not null
     and new.status in ('Content - Approved', 'Output - In Progress', 'Output - Ready', 'Ready to Publish')
     and not (new.type = any(video_types))
     and coalesce(new.owner_key, '') <> 'praveen'
     and not (coalesce(new.custom ->> 'thumbnail_for', '') <> '') then
    new.owner_key := 'praveen';
  end if;

  if tg_op = 'UPDATE'
     and new.type = any(video_types)
     and old.type is not null and not (old.type = any(video_types))
     and new.status in ('Content - Approved', 'Output - In Progress')
     and coalesce(new.owner_key, '') = 'praveen' then
    new.owner_key := null;
    new.status := 'Content - Approved';
  end if;
  return new;
end $$;
