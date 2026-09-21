-- Design work always belongs to Praveen once content is approved.
--
-- The rule ("carousel / post / thumbnail… → Praveen; video → the editors") used to
-- live only in the dashboard's Content-Approved handoff (app/api/marketing-hub/
-- update). Anything that reached mh_posts another way — Sync from Airtable copying
-- Airtable's Owner, n8n, a direct edit — skipped it, so e.g. a carousel whose Airtable
-- owner was "Nandu C" sat in Nandu's My Day. This trigger enforces it in the database,
-- so it holds for every writer, forever.
--
-- Applies when a task is at Content - Approved, Output - In Progress, Output - Ready or
-- Ready to Publish and its type is NOT video. Incorporating Feedback is deliberately
-- left alone: that stage can be the writer's (content feedback) or the designer's.
-- Before approval the writer (Manya) owns it; published tasks are history.
--
-- The video list must match VIDEO_TYPES in lib/mh-content-types.ts.
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

create or replace function mh_enforce_design_owner() returns trigger
language plpgsql as $$
begin
  if new.type is not null
     and new.status in ('Content - Approved', 'Output - In Progress', 'Output - Ready', 'Ready to Publish')
     and new.type not in ('Reel - Original', 'Reel - Cut', 'YouTube Long-Form', 'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video')
     and coalesce(new.owner_key, '') <> 'praveen' then
    new.owner_key := 'praveen';
  end if;
  return new;
end;
$$;

drop trigger if exists mh_design_owner on mh_posts;
create trigger mh_design_owner
  before insert or update of status, type, owner_key on mh_posts
  for each row execute function mh_enforce_design_owner();

-- Fix the tasks that already break the rule (the trigger then keeps it that way).
update mh_posts set owner_key = 'praveen'
where type is not null
  and status in ('Content - Approved', 'Output - In Progress', 'Output - Ready', 'Ready to Publish')
  and type not in ('Reel - Original', 'Reel - Cut', 'YouTube Long-Form', 'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video')
  and coalesce(owner_key, '') <> 'praveen';
