-- 019 — owner and collaborator rules become rows, not code
--
-- Praveen, 28 Sep: "what if Nandu leaves and someone else comes? I have to come to
-- Claude and do it and deploy again." Exactly right. Who owns a task and who is
-- attached to it is a fact about the team THIS MONTH, not about the software.
--
-- Until now those two rules lived in three places that all had to agree:
--   · sql/013 — a trigger hard-coding 'praveen', and its own copy of the video list
--   · lib/task-create.ts — defaultCollaboratorFor(), hard-coding 'nandu' / 'manya'
--   · NewTaskForm.tsx — routeFor(), describing the first one back to the reader
--
-- They are one table now, and the trigger reads it. That matters more than it
-- sounds: the hourly Airtable sync and n8n write straight to mh_posts and never
-- run a line of dashboard code, so a rule enforced only in the app would be
-- silently skipped by them — which is the bug sql/013 was written to fix in the
-- first place.
--
-- RUN IN THE SUPABASE SQL EDITOR. Safe to run twice.

-- ── The table ────────────────────────────────────────────────────────────────
create table if not exists mh_rules (
  id           uuid primary key default gen_random_uuid(),
  -- 'owner'        — who the task belongs to once it reaches `status`
  -- 'collaborator' — who is attached when a task is created
  kind         text not null check (kind in ('owner', 'collaborator')),
  -- null = any. Matched against mh_posts.sbu exactly.
  sbu          text,
  -- 'video' | 'design' | null = any. Which side of the VIDEO_TYPES line.
  content_kind text check (content_kind in ('video', 'design')),
  -- owner rules only: the status at which it takes effect, and everything after it
  -- in the pipeline. null on a collaborator rule.
  from_status  text,
  -- The person key ('praveen', 'nandu', …). NULL on an owner rule means "leave it
  -- with whoever has it" — which is how a video reaches the claim pool.
  assign_to    text,
  -- Higher wins. A rule naming an SBU should beat a catch-all, so give it a
  -- bigger number; the UI does this for you.
  priority     int not null default 0,
  active       boolean not null default true,
  note         text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);

alter table mh_rules enable row level security;

create index if not exists mh_rules_lookup_idx on mh_rules (kind, active, priority desc);

-- ── Today's behaviour, written down as rows ──────────────────────────────────
-- Seeded ONLY when the table is empty, so re-running this file never undoes an
-- edit someone has made since.
insert into mh_rules (kind, sbu, content_kind, from_status, assign_to, priority, note)
select * from (values
  ('owner', null, 'design', 'Content - Approved', 'praveen', 10,
   'Design work belongs to the designer once content is approved.'),
  ('owner', null, 'video', 'Content - Approved', null, 10,
   'Video is never auto-assigned — it waits in the claim pool until an editor takes it.'),
  ('collaborator', '12thPlus.com', null, null, 'nandu', 20,
   'Nandu follows 12thPlus work.'),
  ('collaborator', 'India NEET UG Consulting', null, null, 'nandu', 20,
   'Nandu follows India NEET UG work.'),
  ('collaborator', null, null, null, 'manya', 10,
   'Manya follows everything else.')
) as seed(kind, sbu, content_kind, from_status, assign_to, priority, note)
where not exists (select 1 from mh_rules);

-- ── The trigger, now reading the table ───────────────────────────────────────
--
-- Same job as sql/013, same statuses, same video list — but 'praveen' comes from
-- a row instead of being typed into the function. An owner rule with assign_to
-- NULL means "hands off", which is what sends video to the claim pool.

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

  -- Which side of the line this content sits on. Kept identical to VIDEO_TYPES in
  -- lib/mh-content-types.ts — the one duplication left, and the one to check first
  -- if a task is ever assigned to the wrong half of the team.
  kind_of := case
    when new.type in ('Reel - Original', 'Reel - Cut', 'YouTube Long-Form',
                      'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video')
    then 'video' else 'design' end;

  -- The pipeline from Content - Approved onward. Incorporating Feedback is left
  -- out on purpose: that stage can belong to the writer or the designer.
  -- Published work is history and is never reassigned.
  if new.status not in ('Content - Approved', 'Output - In Progress',
                        'Output - Ready', 'Ready to Publish') then
    return new;
  end if;

  select r.assign_to, true into want, found
    from mh_rules r
   where r.kind = 'owner'
     and r.active
     and (r.sbu is null or r.sbu = new.sbu)
     and (r.content_kind is null or r.content_kind = kind_of)
     and (r.from_status is null or r.from_status = 'Content - Approved')
   order by r.priority desc, (r.sbu is not null) desc, (r.content_kind is not null) desc
   limit 1;

  -- No rule at all → leave the task exactly as it came in. An empty table must
  -- never mean "wipe every owner".
  if not found then
    return new;
  end if;

  if want is not null and coalesce(new.owner_key, '') <> want then
    new.owner_key := want;
  end if;

  return new;
end;
$$;

drop trigger if exists mh_design_owner on mh_posts;
drop trigger if exists mh_owner_rules on mh_posts;
create trigger mh_owner_rules
  before insert or update of status, type, owner_key, sbu on mh_posts
  for each row execute function mh_enforce_owner_rules();

-- ── Check ────────────────────────────────────────────────────────────────────
--   select kind, sbu, content_kind, assign_to, priority, active from mh_rules
--    order by kind, priority desc;
--
-- And that nothing moved when the rules still say what they said before:
--   select status, owner_key, count(*) from mh_posts
--    where status in ('Content - Approved','Output - In Progress','Output - Ready','Ready to Publish')
--    group by 1,2 order by 1,2;
