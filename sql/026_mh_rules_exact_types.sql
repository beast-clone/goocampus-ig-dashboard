-- 026 — owner/collaborator rules can name an exact type of work
--
-- Praveen, 28 Sep: "Type of work" on the Automations page only offered All work /
-- Design / Video. He wants to point a rule at a real type — Carousel, Reel - Cut,
-- YouTube Shorts … — so mh_rules.content_kind now also accepts a type name.
--
-- Which rule wins, most specific first (same order lib/task-create.ts uses for
-- collaborators):
--   1. higher priority          (the UI gives any rule naming a brand 20, else 10)
--   2. names a brand            over "any brand"
--   3. names an exact type      over design/video
--   4. names design/video       over "all work"
--
-- ALSO FIXES A REGRESSION FROM 019. sql/020 taught the old design→Praveen trigger
-- to leave alone a thumbnail whose owner the thumbnail flow had settled
-- (custom.thumbnail_for). 019 replaced that trigger and dropped the exception, so
-- an editor who chose to make a thumbnail would lose it to the design rule on
-- approval. It is back below.
--
-- RUN IN THE SUPABASE SQL EDITOR (project wlhbmzaernchwebapszq). Safe to run twice.
-- Changes no existing rule and no task — it only widens what a rule may say.

-- ── The column: 'video' | 'design' | an exact type name | null ──────────────
alter table mh_rules drop constraint if exists mh_rules_content_kind_check;
alter table mh_rules add constraint mh_rules_content_kind_check
  check (content_kind is null or length(trim(content_kind)) > 0);

-- ── The trigger ──────────────────────────────────────────────────────────────
create or replace function mh_enforce_owner_rules() returns trigger
language plpgsql as $$
declare
  kind_of text;
  want    text;
  found   boolean;
begin
  if new.type is null or new.status is null then
    return new;
  end if;

  -- Kept identical to VIDEO_TYPES in lib/mh-content-types.ts.
  kind_of := case
    when new.type in ('Reel - Original', 'Reel - Cut', 'YouTube Long-Form',
                      'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video')
    then 'video' else 'design' end;

  if new.status not in ('Content - Approved', 'Output - In Progress',
                        'Output - Ready', 'Ready to Publish') then
    return new;
  end if;

  -- Restored from sql/020: a thumbnail whose maker was chosen on the claim screen
  -- keeps that maker. Only the thumbnail flow sets thumbnail_for.
  if coalesce(new.custom ->> 'thumbnail_for', '') <> '' then
    return new;
  end if;

  select r.assign_to, true into want, found
    from mh_rules r
   where r.kind = 'owner'
     and r.active
     and (r.sbu is null or r.sbu = new.sbu)
     and (r.content_kind is null or r.content_kind = kind_of or r.content_kind = new.type)
     and (r.from_status is null or r.from_status = 'Content - Approved')
   order by r.priority desc,
            (r.sbu is not null) desc,
            case when r.content_kind is null then 0
                 when r.content_kind in ('video', 'design') then 1
                 else 2 end desc
   limit 1;

  -- No rule at all → leave the task exactly as it came in.
  if not found then
    return new;
  end if;

  if want is not null and coalesce(new.owner_key, '') <> want then
    new.owner_key := want;
  end if;

  return new;
end;
$$;

-- The trigger itself (mh_owner_rules, from 019) is unchanged and picks this up.

-- ── Check ────────────────────────────────────────────────────────────────────
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'mh_rules'::regclass and conname = 'mh_rules_content_kind_check';
--   → should read: CHECK (content_kind IS NULL OR length(TRIM(BOTH FROM content_kind)) > 0)
