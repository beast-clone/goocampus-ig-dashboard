-- 037 — Rules engine: "When a task … and these conditions → do this"
--
-- Praveen, 26–27 Oct: the Rules page's owner rows were never read (no trigger called
-- mh_enforce_owner_rules any more) — owners came from three fixed triggers and the
-- update API, with people's names typed in. This replaces all of that with ONE engine
-- that reads rules the team edits on the Rules page. Plan: docs/RULES_ENGINE_PLAN.md.
--
-- A rule (mh_rules row with engine = true):
--   trigger_spec  {"on":"created"} | {"on":"status","statuses":[…]} | {"on":"save"}
--   conditions    the Master-sheet filter model: {conjunction, conditions:[{field,op,value}|group]}
--                 fields: status, previous_status, sbu, type, kind, priority, owner,
--                         owner_role, owner_is_creator, owner_changed
--   actions       [{"type":"owner","to":"<person>"|"__pool__"},
--                  {"type":"collaborator","to":"<person>"},
--                  {"type":"keep_previous_owner"}]
--   position      lower runs first; the FIRST matching rule with an owner action wins.
--
-- Fixed safety rules (not editable, listed on the Rules page):
--   · a thumbnail whose maker was chosen (custom.thumbnail_for) keeps its owner;
--   · when a task is taken off an editor, they are remembered (custom.intended_owner)
--     and get it back if the task turns into video work;
--   · nobody is both owner and collaborator.
--
-- SWITCH: mh_flags 'rules_engine'. OFF (default here) = the old triggers + app code run
-- exactly as before. ON = the engine runs and the old triggers / app hand-off stand down.
-- A row with custom.engine_test = true always uses the engine (for testing while OFF).
-- Safe to run twice.

-- ── Switch ───────────────────────────────────────────────────────────────────
create table if not exists mh_flags (
  key        text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into mh_flags (key, enabled) values ('rules_engine', false) on conflict (key) do nothing;

create or replace function mh_engine_on(p mh_posts) returns boolean language sql stable as $$
  select coalesce((select enabled from mh_flags where key = 'rules_engine'), false)
      or coalesce(p.custom ->> 'engine_test', '') = 'true';
$$;

-- ── Rule columns ─────────────────────────────────────────────────────────────
alter table mh_rules drop constraint if exists mh_rules_kind_check;
alter table mh_rules add constraint mh_rules_kind_check check (kind = any (array['owner', 'collaborator', 'engine']));
alter table mh_rules add column if not exists engine       boolean not null default false;
alter table mh_rules add column if not exists name         text;
alter table mh_rules add column if not exists trigger_spec jsonb;
alter table mh_rules add column if not exists conditions   jsonb;
alter table mh_rules add column if not exists actions      jsonb;
alter table mh_rules add column if not exists position     integer not null default 0;

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- design / video, from the dashboard's type list (sql/028), with the old list as fallback.
create or replace function mh_kind_of(t text) returns text language sql stable as $$
  select coalesce(
    (select kind from mh_content_types where name = t),
    case when t in ('Reel - Original', 'Reel - Cut', 'YouTube Long-Form', 'YouTube Shorts',
                    'Story (Video)', 'Meta Ads - Video') then 'video'
         when t is null then null else 'design' end);
$$;

create or replace function mh_role_of(k text) returns text language sql stable as $$
  select role::text from mh_team_members where key = lower(k);
$$;

-- The value a condition looks at.
create or replace function mh_rule_value(field text, p mh_posts, old_status text, old_owner text, is_insert boolean)
returns text language sql stable as $$
  select case field
    when 'status'           then p.status::text
    when 'previous_status'  then old_status
    when 'sbu'              then p.sbu
    when 'type'             then p.type
    when 'kind'             then mh_kind_of(p.type)
    when 'priority'         then p.priority::text
    when 'owner'            then p.owner_key
    when 'owner_role'       then mh_role_of(p.owner_key)
    when 'owner_is_creator' then case when coalesce(p.owner_key, '') <> '' and lower(p.owner_key) = lower(coalesce(p.created_by, '')) then 'yes' else 'no' end
    when 'owner_changed'    then case when not is_insert and coalesce(old_owner, '') is distinct from coalesce(p.owner_key, '') then 'yes' else 'no' end
    else null end;
$$;

create or replace function mh_rule_cond(c jsonb, p mh_posts, old_status text, old_owner text, is_insert boolean)
returns boolean language plpgsql stable as $$
declare
  v    text := mh_rule_value(c ->> 'field', p, old_status, old_owner, is_insert);
  op   text := c ->> 'op';
  one  text := case when jsonb_typeof(c -> 'value') = 'string' then c ->> 'value' else null end;
  many text[] := case when jsonb_typeof(c -> 'value') = 'array'
                      then array(select jsonb_array_elements_text(c -> 'value')) else array[]::text[] end;
begin
  -- A condition still waiting for its value doesn't filter (same as the Master sheet).
  if op in ('is', 'isNot', 'contains', 'doesNotContain') and coalesce(one, '') = '' then return true; end if;
  if op in ('isAnyOf', 'isNoneOf') and coalesce(array_length(many, 1), 0) = 0 then return true; end if;
  return case op
    when 'isEmpty'        then coalesce(v, '') = ''
    when 'isNotEmpty'     then coalesce(v, '') <> ''
    when 'is'             then coalesce(v, '') = one
    when 'isNot'          then coalesce(v, '') <> one
    when 'isAnyOf'        then coalesce(v, '') = any (many)
    when 'isNoneOf'       then not (coalesce(v, '') = any (many))
    when 'contains'       then coalesce(v, '') ilike '%' || one || '%'
    when 'doesNotContain' then coalesce(v, '') not ilike '%' || one || '%'
    else true end;
end $$;

-- Conditions with groups (one level, like the Master sheet). No conditions = always.
create or replace function mh_rule_match(f jsonb, p mh_posts, old_status text, old_owner text, is_insert boolean)
returns boolean language plpgsql stable as $$
declare
  item jsonb;
  res  boolean;
  is_or boolean := coalesce(f ->> 'conjunction', 'and') = 'or';
  any_seen boolean := false;
begin
  if f is null or jsonb_typeof(f -> 'conditions') <> 'array' or jsonb_array_length(f -> 'conditions') = 0 then
    return true;
  end if;
  for item in select * from jsonb_array_elements(f -> 'conditions') loop
    if item ? 'conditions' then
      if jsonb_array_length(coalesce(item -> 'conditions', '[]'::jsonb)) = 0 then continue; end if;
      res := mh_rule_match(item, p, old_status, old_owner, is_insert);
    else
      res := mh_rule_cond(item, p, old_status, old_owner, is_insert);
    end if;
    any_seen := true;
    if is_or and res then return true; end if;
    if not is_or and not res then return false; end if;
  end loop;
  return case when not any_seen then true else not is_or end;
end $$;

-- Does the rule's "When…" fire for this save?
create or replace function mh_rule_fires(spec jsonb, p mh_posts, old_status text, is_insert boolean)
returns boolean language plpgsql stable as $$
declare
  sts text[];
begin
  case coalesce(spec ->> 'on', 'save')
    when 'created' then return is_insert;
    when 'status' then
      if not is_insert and old_status is not distinct from p.status::text then return false; end if;
      sts := case when jsonb_typeof(spec -> 'statuses') = 'array'
                  then array(select jsonb_array_elements_text(spec -> 'statuses')) else array[]::text[] end;
      return coalesce(array_length(sts, 1), 0) = 0 or p.status::text = any (sts);
    else return true;
  end case;
end $$;

-- ── The engine: owner (BEFORE) ───────────────────────────────────────────────
create or replace function mh_rules_engine_before() returns trigger language plpgsql as $$
declare
  r          record;
  a          jsonb;
  is_insert  boolean := tg_op = 'INSERT';
  old_status text := case when tg_op = 'UPDATE' then old.status::text end;
  old_owner  text := case when tg_op = 'UPDATE' then old.owner_key end;
  wanted     text;
begin
  if not mh_engine_on(new) then return new; end if;

  -- Fixed: a thumbnail whose maker was chosen keeps them.
  if coalesce(new.custom ->> 'thumbnail_for', '') = '' then
    for r in select * from mh_rules where engine and active order by position, updated_at loop
      a := null;
      select x into a from jsonb_array_elements(coalesce(r.actions, '[]'::jsonb)) x where x ->> 'type' = 'owner' limit 1;
      continue when a is null;
      if mh_rule_fires(r.trigger_spec, new, old_status, is_insert)
         and mh_rule_match(r.conditions, new, old_status, old_owner, is_insert) then
        if a ->> 'to' = '__pool__' then
          new.owner_key := null;                                   -- the editors' claim pool
        elsif coalesce(a ->> 'to', '') <> '' and coalesce(new.owner_key, '') <> (a ->> 'to') then
          -- Fixed: remember an editor the task is taken from.
          if mh_role_of(new.owner_key) = 'editor' then
            new.custom := coalesce(new.custom, '{}'::jsonb) || jsonb_build_object('intended_owner', lower(new.owner_key));
          end if;
          new.owner_key := a ->> 'to';
        end if;
        exit;                                                       -- first matching owner rule wins
      end if;
    end loop;
  end if;

  -- Fixed: design work that turns into video goes back to the remembered editor,
  -- or to the claim pool (moved here from mh_enforce_design_owner).
  if tg_op = 'UPDATE' and mh_kind_of(new.type) = 'video' and old.type is not null
     and mh_kind_of(old.type) <> 'video'
     and new.status in ('Content - Approved', 'Output - In Progress')
     and mh_role_of(new.owner_key) = 'designer' then
    wanted := new.custom ->> 'intended_owner';
    if mh_role_of(wanted) = 'editor' then
      new.owner_key := wanted;
    else
      new.owner_key := null;
      new.status := 'Content - Approved';
    end if;
  end if;
  if new.custom ? 'intended_owner' and (mh_kind_of(new.type) = 'video' or coalesce(mh_role_of(new.owner_key), '') <> 'designer') then
    new.custom := new.custom - 'intended_owner';
  end if;
  return new;
end $$;

-- ── The engine: collaborators (AFTER) ────────────────────────────────────────
create or replace function mh_rules_engine_after() returns trigger language plpgsql as $$
declare
  r          record;
  a          jsonb;
  who        text;
  is_insert  boolean := tg_op = 'INSERT';
  old_status text := case when tg_op = 'UPDATE' then old.status::text end;
  old_owner  text := case when tg_op = 'UPDATE' then old.owner_key end;
begin
  if not mh_engine_on(new) then return null; end if;
  -- Fixed: the new owner comes off the collaborator list (never both).
  if new.owner_key is not null and (is_insert or old_owner is distinct from new.owner_key) then
    delete from mh_post_collaborators where post_id = new.id and member_key = lower(new.owner_key);
  end if;
  for r in select * from mh_rules where engine and active order by position, updated_at loop
    continue when not exists (select 1 from jsonb_array_elements(coalesce(r.actions, '[]'::jsonb)) x
                               where x ->> 'type' in ('collaborator', 'keep_previous_owner'));
    continue when not (mh_rule_fires(r.trigger_spec, new, old_status, is_insert)
                       and mh_rule_match(r.conditions, new, old_status, old_owner, is_insert));
    for a in select * from jsonb_array_elements(r.actions) loop
      who := case a ->> 'type'
               when 'collaborator' then lower(a ->> 'to')
               when 'keep_previous_owner' then
                 case when not is_insert and old_owner is distinct from new.owner_key
                           and coalesce(mh_role_of(old_owner), '') <> 'manager' then lower(old_owner) end
             end;
      -- Fixed: never both owner and collaborator; only real team members.
      if coalesce(who, '') <> '' and who <> lower(coalesce(new.owner_key, ''))
         and exists (select 1 from mh_team_members where key = who) then
        insert into mh_post_collaborators (post_id, member_key) values (new.id, who) on conflict do nothing;
      end if;
    end loop;
  end loop;
  return null;
end $$;

drop trigger if exists mh_rules_engine_before on mh_posts;
create trigger mh_rules_engine_before before insert or update of status, type, owner_key, sbu, priority
  on mh_posts for each row execute function mh_rules_engine_before();
drop trigger if exists mh_rules_engine_after on mh_posts;
create trigger mh_rules_engine_after after insert or update of status, type, owner_key, sbu, priority
  on mh_posts for each row execute function mh_rules_engine_after();

-- ── Old triggers stand down when the engine is on ────────────────────────────
-- Same bodies as live on 27 Oct, with one line added at the top.
create or replace function public.mh_enforce_design_owner() returns trigger language plpgsql as $function$
declare
  video_types text[] := array['Reel - Original', 'Reel - Cut', 'YouTube Long-Form', 'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video'];
  editors text[] := array['nikhil', 'nandu'];
  wanted text;
begin
  if mh_engine_on(new) then return new; end if;   -- the rules engine decides (sql/037)
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
      new.owner_key := wanted;
    else
      new.owner_key := null;
      new.status := 'Content - Approved';
    end if;
  end if;
  if new.custom ? 'intended_owner' and (new.type = any(video_types) or coalesce(new.owner_key, '') <> 'praveen') then
    new.custom := new.custom - 'intended_owner';
  end if;
  return new;
end $function$;

create or replace function public.mh_fn_assign_owner() returns trigger language plpgsql as $function$
begin
  if mh_engine_on(new) then return new; end if;   -- the rules engine decides (sql/037)
  if new.status = 'Content - Approved'
     and (old.status is distinct from 'Content - Approved')
     and new.owner_key is null
     and coalesce(new.custom ->> 'thumbnail_for', '') = '' then
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
$function$;

create or replace function public.mh_fn_add_writer_collaborator() returns trigger language plpgsql as $function$
begin
  if mh_engine_on(new) then return null; end if;  -- the rules engine decides (sql/037)
  if new.owner_key is not null
     and (old.owner_key is distinct from new.owner_key)
     and new.status = 'Content - Approved' then
    insert into mh_post_collaborators (post_id, member_key)
      values (new.id, 'manya')
      on conflict do nothing;
  end if;
  return null;
end;
$function$;

-- ── Starting rules = what the dashboard does today ───────────────────────────
-- Only inserted once (keyed by name). People are named here only as the starting
-- value — they are ordinary rule settings from now on, changed on the Rules page.
insert into mh_rules (kind, engine, name, position, active, trigger_spec, conditions, actions, note)
select * from (values
  ('engine', true, '12thPlus posts go to Nandu', 5, false,
   '{"on":"save"}'::jsonb,
   '{"conjunction":"and","conditions":[{"field":"status","op":"isAnyOf","value":["Content - Approved","Output - In Progress","Output - Ready","Ready to Publish"]},{"field":"sbu","op":"is","value":"12thPlus.com"},{"field":"type","op":"is","value":"Post"}]}'::jsonb,
   '[{"type":"owner","to":"nandu"}]'::jsonb,
   'Was on the old Rules page but never took effect — the design rule below always won. Switched off so nothing changes; turn it on if you want it.'),
  ('engine', true, 'Approved design work goes to Praveen', 10, true,
   '{"on":"save"}'::jsonb,
   '{"conjunction":"and","conditions":[{"field":"status","op":"isAnyOf","value":["Content - Approved","Output - In Progress","Output - Ready","Ready to Publish"]},{"field":"kind","op":"is","value":"design"}]}'::jsonb,
   '[{"type":"owner","to":"praveen"},{"type":"keep_previous_owner"}]'::jsonb,
   'From the old fixed database rule. Re-applies on every save while the task is in these statuses.'),
  ('engine', true, 'Approved video an editor wrote goes to the claim pool', 20, true,
   '{"on":"status","statuses":["Content - Approved"]}'::jsonb,
   '{"conjunction":"and","conditions":[{"field":"kind","op":"is","value":"video"},{"field":"previous_status","op":"isAnyOf","value":["Content - Pending","Content - In Progress"]},{"field":"owner_role","op":"is","value":"editor"},{"field":"owner_is_creator","op":"is","value":"yes"}]}'::jsonb,
   '[{"type":"owner","to":"__pool__"}]'::jsonb,
   'From the dashboard hand-off. Videos written by anyone else stay with the writer and show in the editors'' pool.'),
  ('engine', true, 'Unowned approved Long-Form goes to Nandu', 30, true,
   '{"on":"status","statuses":["Content - Approved"]}'::jsonb,
   '{"conjunction":"and","conditions":[{"field":"owner","op":"isEmpty"},{"field":"type","op":"is","value":"YouTube Long-Form"}]}'::jsonb,
   '[{"type":"owner","to":"nandu"}]'::jsonb,
   'From the old fixed database rule (only when nobody owns the task).'),
  ('engine', true, 'Unowned approved Reels, Shorts and video stories go to Nikhil', 40, true,
   '{"on":"status","statuses":["Content - Approved"]}'::jsonb,
   '{"conjunction":"and","conditions":[{"field":"owner","op":"isEmpty"},{"field":"type","op":"isAnyOf","value":["Reel - Original","Story (Video)","YouTube Shorts"]}]}'::jsonb,
   '[{"type":"owner","to":"nikhil"}]'::jsonb,
   'From the old fixed database rule (only when nobody owns the task).'),
  ('engine', true, 'New tasks: Manya keeps an eye', 60, true,
   '{"on":"created"}'::jsonb,
   '{"conjunction":"and","conditions":[{"field":"sbu","op":"isNoneOf","value":["12thPlus.com","India NEET UG Consulting"]}]}'::jsonb,
   '[{"type":"collaborator","to":"manya"}]'::jsonb,
   'From the old Rules page (collaborator, any brand).'),
  ('engine', true, 'New 12thPlus and NEET UG tasks: Nandu keeps an eye', 70, true,
   '{"on":"created"}'::jsonb,
   '{"conjunction":"and","conditions":[{"field":"sbu","op":"isAnyOf","value":["12thPlus.com","India NEET UG Consulting"]}]}'::jsonb,
   '[{"type":"collaborator","to":"nandu"}]'::jsonb,
   'From the old Rules page (collaborator, 12thPlus.com and India NEET UG Consulting).'),
  ('engine', true, 'When an approved task changes hands, Manya is added', 80, true,
   '{"on":"save"}'::jsonb,
   '{"conjunction":"and","conditions":[{"field":"status","op":"is","value":"Content - Approved"},{"field":"owner_changed","op":"is","value":"yes"},{"field":"owner","op":"isNotEmpty"}]}'::jsonb,
   '[{"type":"collaborator","to":"manya"}]'::jsonb,
   'From the old fixed database rule.')
) v(kind, engine, name, position, active, trigger_spec, conditions, actions, note)
where not exists (select 1 from mh_rules r where r.engine and r.name = v.name);
