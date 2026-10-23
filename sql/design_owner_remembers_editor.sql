-- Ownership by type, both ways — and in either order (23 Oct 2026). Applied via migration.
-- Design work at Content Approved .. Ready to Publish belongs to Praveen. If someone
-- gives a design task to an EDITOR (Nikhil / Nandu) the task stays with Praveen for
-- now, but the editor is remembered (custom.intended_owner). When the task is then
-- switched to a video type, it goes straight to that editor. Switched to video with
-- no editor named: the editors' claim pool (unowned, Content - Approved).
create or replace function mh_enforce_design_owner() returns trigger
language plpgsql as $$
declare
  video_types text[] := array['Reel - Original', 'Reel - Cut', 'YouTube Long-Form', 'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video'];
  editors text[] := array['nikhil', 'nandu'];
  wanted text;
begin
  if new.type is not null
     and new.status in ('Content - Approved', 'Output - In Progress', 'Output - Ready', 'Ready to Publish')
     and not (new.type = any(video_types))
     and coalesce(new.owner_key, '') <> 'praveen'
     and not (coalesce(new.custom ->> 'thumbnail_for', '') <> '') then
    if lower(coalesce(new.owner_key, '')) = any(editors) then
      new.custom := coalesce(new.custom, '{}'::jsonb) || jsonb_build_object('intended_owner', lower(new.owner_key));
    end if;
    new.owner_key := 'praveen';
  end if;

  if tg_op = 'UPDATE'
     and new.type = any(video_types)
     and old.type is not null and not (old.type = any(video_types))
     and new.status in ('Content - Approved', 'Output - In Progress')
     and coalesce(new.owner_key, '') = 'praveen' then
    wanted := new.custom ->> 'intended_owner';
    if wanted = any(editors) then
      new.owner_key := wanted;                       -- the editor named earlier
    else
      new.owner_key := null;                         -- the editors' claim pool
      new.status := 'Content - Approved';
    end if;
  end if;
  if new.custom ? 'intended_owner' and (new.type = any(video_types) or coalesce(new.owner_key, '') <> 'praveen') then
    new.custom := new.custom - 'intended_owner';
  end if;
  return new;
end $$;
