-- 041 — rules engine: "when the type changes", and the design→video hand-back as a
-- normal rule (27 Oct, Praveen: "if we change the owner and the type, where it will go").
-- Engine-only: the engine is switched off until the deploy, so the live dashboard is
-- unchanged by this file. Safe to run twice.

-- 1. A rule can fire when a task's type changes: trigger_spec {on:'type', types:[…]}.
--    Both engine triggers note the old type for mh_rule_fires (transaction-local).
create or replace function mh_rule_fires(spec jsonb, p mh_posts, old_status text, is_insert boolean)
returns boolean language plpgsql stable as $function$
declare
  sts text[];
  ot  text;
begin
  case coalesce(spec ->> 'on', 'save')
    when 'created' then return is_insert;
    when 'status' then
      if not is_insert and old_status is not distinct from p.status::text then return false; end if;
      sts := case when jsonb_typeof(spec -> 'statuses') = 'array'
                  then array(select jsonb_array_elements_text(spec -> 'statuses')) else array[]::text[] end;
      return coalesce(array_length(sts, 1), 0) = 0 or p.status::text = any (sts);
    when 'type' then
      if is_insert then return false; end if;
      ot := coalesce(current_setting('mh.old_type', true), '');
      if ot = coalesce(p.type, '') then return false; end if;
      sts := case when jsonb_typeof(spec -> 'types') = 'array'
                  then array(select jsonb_array_elements_text(spec -> 'types')) else array[]::text[] end;
      return coalesce(array_length(sts, 1), 0) = 0 or coalesce(p.type, '') = any (sts);
    else return true;
  end case;
end $function$;

-- 2. Owner action "__remembered__": back to the editor the task was taken from, else
--    the claim pool (and back to Content - Approved). Was a hard-coded block; now a rule.
create or replace function mh_rules_engine_before() returns trigger language plpgsql as $function$
declare
  r          record;
  a          jsonb;
  is_insert  boolean := tg_op = 'INSERT';
  old_status text := case when tg_op = 'UPDATE' then old.status::text end;
  old_owner  text := case when tg_op = 'UPDATE' then old.owner_key end;
  wanted     text;
begin
  if not mh_engine_on(new) then return new; end if;
  perform set_config('mh.old_type', case when tg_op = 'UPDATE' then coalesce(old.type, '') else '' end, true);
  if coalesce(new.custom ->> 'thumbnail_for', '') = '' then
    for r in select * from mh_rules where engine and active order by position, updated_at loop
      a := null;
      select x into a from jsonb_array_elements(coalesce(r.actions, '[]'::jsonb)) x where x ->> 'type' = 'owner' limit 1;
      continue when a is null;
      if mh_rule_fires(r.trigger_spec, new, old_status, is_insert)
         and mh_rule_match(r.conditions, new, old_status, old_owner, is_insert) then
        if a ->> 'to' = '__pool__' then
          new.owner_key := null;
        elsif a ->> 'to' = '__remembered__' then
          wanted := new.custom ->> 'intended_owner';
          if mh_role_of(wanted) = 'editor' then
            new.owner_key := wanted;
          else
            new.owner_key := null;
            new.status := 'Content - Approved';
          end if;
        elsif coalesce(a ->> 'to', '') <> '' and coalesce(new.owner_key, '') <> (a ->> 'to') then
          if mh_role_of(new.owner_key) = 'editor' then
            new.custom := coalesce(new.custom, '{}'::jsonb) || jsonb_build_object('intended_owner', lower(new.owner_key));
          end if;
          new.owner_key := a ->> 'to';
        end if;
        exit;
      end if;
    end loop;
  end if;
  if new.custom ? 'intended_owner' and (mh_kind_of(new.type) = 'video' or coalesce(mh_role_of(new.owner_key), '') <> 'designer') then
    new.custom := new.custom - 'intended_owner';
  end if;
  return new;
end $function$;

create or replace function mh_rules_engine_after() returns trigger language plpgsql as $function$
declare
  r          record;
  a          jsonb;
  who        text;
  is_insert  boolean := tg_op = 'INSERT';
  old_status text := case when tg_op = 'UPDATE' then old.status::text end;
  old_owner  text := case when tg_op = 'UPDATE' then old.owner_key end;
begin
  if not mh_engine_on(new) then return null; end if;
  perform set_config('mh.old_type', case when tg_op = 'UPDATE' then coalesce(old.type, '') else '' end, true);
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
      if coalesce(who, '') <> '' and who <> lower(coalesce(new.owner_key, ''))
         and exists (select 1 from mh_team_members where key = who) then
        insert into mh_post_collaborators (post_id, member_key) values (new.id, who) on conflict do nothing;
      end if;
    end loop;
  end loop;
  return null;
end $function$;

-- 3. The two type-change rules, as rows the Rules page shows (same behaviour as today's
--    fixed database rule).
insert into mh_rules (kind, engine, active, position, name, trigger_spec, conditions, actions, note)
select 'engine', true, true, 12, 'Work that turns into design goes to the designer',
  '{"on":"type"}'::jsonb,
  '{"conjunction":"and","conditions":[{"field":"kind","op":"is","value":"design"},{"field":"status","op":"isAnyOf","value":["Content - Approved","Output - In Progress","Output - Ready","Ready to Publish"]}]}'::jsonb,
  '[{"type":"owner","to":"praveen"}]'::jsonb,
  'From the old fixed database rule: an approved task whose type changes to design work goes to the designer.'
where not exists (select 1 from mh_rules where engine and name = 'Work that turns into design goes to the designer');

insert into mh_rules (kind, engine, active, position, name, trigger_spec, conditions, actions, note)
select 'engine', true, true, 14, 'Design work that turns into video goes back to its editor',
  '{"on":"type"}'::jsonb,
  '{"conjunction":"and","conditions":[{"field":"kind","op":"is","value":"video"},{"field":"status","op":"isAnyOf","value":["Content - Approved","Output - In Progress"]},{"field":"owner_role","op":"is","value":"designer"}]}'::jsonb,
  '[{"type":"owner","to":"__remembered__"}]'::jsonb,
  'Was built into the engine; now a rule you can read and switch off.'
where not exists (select 1 from mh_rules where engine and name = 'Design work that turns into video goes back to its editor');
