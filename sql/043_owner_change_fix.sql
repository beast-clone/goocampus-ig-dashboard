-- 043: owner changes stick, and the owner is never also a collaborator.
--
-- 1. The "design work goes to the designer" rule now fires only when a task
--    ENTERS Content - Approved (or later), or its type changes. Before, it fired
--    on every save, so picking a new owner on an approved design task was
--    silently undone and the old owner showed up as owner AND collaborator.
-- 2. Whoever owns a task is removed from (and can't be added to) its collaborators.

create or replace function public.mh_enforce_design_owner()
 returns trigger
 language plpgsql
as $function$
declare
  designer text := mh_designer_key();
  wanted text;
  approved_plus text[] := array['Content - Approved', 'Output - In Progress', 'Output - Ready', 'Ready to Publish'];
begin
  if mh_engine_on(new) then return new; end if;
  if new.type is not null
     and new.status::text = any(approved_plus)
     and (tg_op = 'INSERT'
          or not (old.status::text = any(approved_plus || 'Incorporating Feedback'::text))
          or old.type is distinct from new.type)
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

-- Owner changed → drop them from the collaborators.
create or replace function public.mh_drop_owner_collaborator()
 returns trigger
 language plpgsql
as $function$
begin
  if new.owner_key is not null then
    delete from mh_post_collaborators where post_id = new.id and member_key = new.owner_key;
  end if;
  return null;
end $function$;

drop trigger if exists mh_drop_owner_collaborator on public.mh_posts;
create trigger mh_drop_owner_collaborator
  after insert or update of owner_key on public.mh_posts
  for each row execute function mh_drop_owner_collaborator();

-- Adding the current owner as a collaborator is skipped.
create or replace function public.mh_skip_owner_collaborator()
 returns trigger
 language plpgsql
as $function$
begin
  if exists (select 1 from mh_posts where id = new.post_id and owner_key = new.member_key) then
    return null;
  end if;
  return new;
end $function$;

drop trigger if exists mh_skip_owner_collaborator on public.mh_post_collaborators;
create trigger mh_skip_owner_collaborator
  before insert on public.mh_post_collaborators
  for each row execute function mh_skip_owner_collaborator();
