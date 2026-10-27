-- 040 — dead database parts out; the old owner rules read the one type list (27 Oct).
-- Wiring audit (docs/WIRING_AUDIT.md) items C and D. Safe to run twice.

-- D1. mh_slack_queue: a trigger queued a Slack line on every owner change, and nothing
-- ever sent them (no app code, no n8n). Stop queueing. The table and its rows stay
-- until Praveen says they can go (never delete data without asking).
drop trigger if exists mh_trg_slack_queue on mh_posts;
drop function if exists mh_fn_queue_slack();

-- D2. Two functions no trigger calls: the old Rules-page owner reader (replaced by the
-- rules engine, sql/037) and the auto-thumbnail spawner (thumbnails are asked for in
-- the New task form / on claim instead).
drop function if exists mh_enforce_owner_rules();
drop function if exists mh_fn_spawn_thumbnail();

-- C1. The live design-owner trigger kept its OWN video list and named the editors and
-- the designer. It now reads mh_content_types (mh_kind_of) and Team page roles
-- (mh_team_members.role), the same as the app. Same behaviour with today's data.
create or replace function mh_designer_key() returns text language sql stable as $$
  select coalesce((select key from mh_team_members where role = 'designer' and active is not false order by key limit 1), 'praveen');
$$;
create or replace function mh_writer_key() returns text language sql stable as $$
  select coalesce((select key from mh_team_members where role = 'writer' and active is not false order by key limit 1), 'manya');
$$;

create or replace function mh_enforce_design_owner() returns trigger language plpgsql as $function$
declare
  designer text := mh_designer_key();
  wanted text;
begin
  if mh_engine_on(new) then return new; end if;
  if new.type is not null
     and new.status in ('Content - Approved', 'Output - In Progress', 'Output - Ready', 'Ready to Publish')
     and mh_kind_of(new.type) <> 'video'
     and coalesce(new.owner_key, '') <> designer
     and not (coalesce(new.custom ->> 'thumbnail_for', '') <> '') then
    if mh_role_of(new.owner_key) = 'editor' then
      new.custom := coalesce(new.custom, '{}'::jsonb) || jsonb_build_object('intended_owner', lower(new.owner_key));
    end if;
    new.owner_key := designer;
  end if;
  if tg_op = 'UPDATE'
     and mh_kind_of(new.type) = 'video'
     and old.type is not null and mh_kind_of(old.type) <> 'video'
     and new.status in ('Content - Approved', 'Output - In Progress')
     and coalesce(new.owner_key, '') = designer then
    wanted := new.custom ->> 'intended_owner';
    if mh_role_of(wanted) = 'editor' then
      new.owner_key := wanted;
    else
      new.owner_key := null;
      new.status := 'Content - Approved';
    end if;
  end if;
  if new.custom ? 'intended_owner' and (mh_kind_of(new.type) = 'video' or coalesce(new.owner_key, '') <> designer) then
    new.custom := new.custom - 'intended_owner';
  end if;
  return new;
end $function$;

create or replace function mh_fn_add_writer_collaborator() returns trigger language plpgsql as $function$
begin
  if mh_engine_on(new) then return null; end if;
  if new.owner_key is not null
     and (old.owner_key is distinct from new.owner_key)
     and new.status = 'Content - Approved' then
    insert into mh_post_collaborators (post_id, member_key)
      values (new.id, mh_writer_key())
      on conflict do nothing;
  end if;
  return null;
end $function$;

-- C2. Which page each brand posts to lives with the brand (was a list in lib/sbu-pages.ts,
-- so a new brand silently went to GooCampus Main). 'none' = not posted on our pages.
alter table mh_sbus add column if not exists page text not null default 'GooCampus Main'
  check (page in ('GooCampus Main', 'GooCampus World', '12Plus / GC India', 'none'));
update mh_sbus set page = 'GooCampus World' where name = 'Mentorship Platform' and page = 'GooCampus Main';
update mh_sbus set page = '12Plus / GC India' where name in ('12thPlus.com', 'India NEET UG Consulting') and page = 'GooCampus Main';
update mh_sbus set page = 'none' where name = 'Samvaya' and page = 'GooCampus Main';
