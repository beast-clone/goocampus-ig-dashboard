-- 028 — types of work become rows, not code
--
-- Praveen, 28 Sep: a new type of work (say "Podcast") should be addable from the
-- dashboard and show up in every picker and rule, not wait for a developer.
-- CONTENT_TYPES / VIDEO_TYPES in lib/mh-content-types.ts stay as the fallback.
--
-- kind decides which half of the team the work belongs to: 'video' goes to the
-- editors' claim pool, 'design' to the designer — the same split the owner rule
-- (mh_enforce_owner_rules) has always made. That function now reads kind from
-- here, falling back to its old typed list for a type the table doesn't have.
--
-- RUN IN THE SUPABASE SQL EDITOR (project wlhbmzaernchwebapszq). Safe to run twice.

create table if not exists mh_content_types (
  name        text primary key,
  kind        text not null check (kind in ('video', 'design')),
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);

alter table mh_content_types enable row level security;

insert into mh_content_types (name, kind) values
  ('Post', 'design'), ('Carousel', 'design'), ('Reel - Original', 'video'),
  ('Reel - Cut', 'video'), ('Reel Thumbnail', 'design'), ('YouTube Long-Form', 'video'),
  ('YouTube Shorts', 'video'), ('YouTube Thumbnail', 'design'), ('Meta Ads', 'design'),
  ('Meta Ads - Video', 'video'), ('Story (Image)', 'design'), ('Story (Video)', 'video'),
  ('Atomic Essay', 'design')
on conflict (name) do nothing;

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

  select t.kind into kind_of from mh_content_types t where t.name = new.type;
  if kind_of is null then
    kind_of := case
      when new.type in ('Reel - Original', 'Reel - Cut', 'YouTube Long-Form',
                        'YouTube Shorts', 'Story (Video)', 'Meta Ads - Video')
      then 'video' else 'design' end;
  end if;

  if new.status not in ('Content - Approved', 'Output - In Progress',
                        'Output - Ready', 'Ready to Publish') then
    return new;
  end if;

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

  if not found then
    return new;
  end if;

  if want is not null and coalesce(new.owner_key, '') <> want then
    new.owner_key := want;
  end if;

  return new;
end;
$$;

-- Check: select count(*) from mh_content_types;  → 13
