-- 027 — brands (SBUs) become rows, not code
--
-- Praveen, 28 Sep: a new brand should appear on the Automations tab (and every
-- other brand picker) by itself, not after a developer edits lib/sbus.ts and
-- deploys. So the list moves here. lib/sbus.ts keeps SBU_OPTIONS only as the
-- fallback for when this table can't be read.
--
-- RUN IN THE SUPABASE SQL EDITOR (project wlhbmzaernchwebapszq). Safe to run twice.

create table if not exists mh_sbus (
  name        text primary key,
  -- Switched off instead of deleted: old tasks still carry the name.
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);

alter table mh_sbus enable row level security;

-- Today's 24 brands, exactly as lib/sbus.ts has them. Re-running adds nothing new.
insert into mh_sbus (name) values
  ('10K Mentorship'), ('12thPlus.com'), ('Allied Courses'), ('Australia-PGCP'),
  ('Buckingham Program'), ('Dr Divij''s Course'), ('General Content'),
  ('India NEET PG Consulting'), ('India NEET UG Consulting'), ('Interview Plus'),
  ('ISIP'), ('Mentorship Platform'), ('Middle East'), ('Portfolio Plus'),
  ('Samvaya'), ('Special Days'), ('SSAHE'),
  ('Standard Consulting Program - Australia'), ('Standard Consulting Program - UK'),
  ('Standard Consulting Program - USA'), ('Study Abroad'), ('UK ALS Course'),
  ('UK-PGCP'), ('University Programs')
on conflict (name) do nothing;

-- Check: select count(*) from mh_sbus;  → 24
