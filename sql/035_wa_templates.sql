-- Saved WhatsApp templates — the drafts that came out of Template check.
--
-- Getting a template through Meta takes effort, and the wording that finally works is
-- worth keeping. Without this the only copy lives in whoever's browser wrote it, and
-- the next person starts from nothing and gets rejected the same way.
--
-- This is the dashboard's own record, not Meta's. A row here has not necessarily been
-- submitted, and submitting still happens in WhatsApp Manager — so `status` is what
-- somebody told us, never something read back from Meta.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

create table if not exists mh_wa_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null check (category in ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  header      text,
  body        text not null,
  footer      text,
  -- What the checker thought when it was saved. Kept so a list of templates can be
  -- read at a glance without re-running anything, and so a saved draft that scored
  -- badly is visibly a draft.
  score       integer,
  likely      text,
  -- Submitted / approved / rejected, as reported by a person. Null means nobody has
  -- said. See the note above about this not coming from Meta.
  status      text check (status in ('draft', 'submitted', 'approved', 'rejected')),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One template per name, the way Meta treats them: a name is the identity and cannot
-- be changed after approval, so two rows sharing one would be ambiguous here too.
-- A plain unique constraint rather than one on lower(name), because the upsert has to
-- name it as its conflict target — and Meta only accepts lowercase names anyway, so
-- the route lowercases before writing and nothing is lost.
alter table mh_wa_templates add constraint mh_wa_templates_name_key unique (name);
create index if not exists mh_wa_templates_recent on mh_wa_templates (updated_at desc);

alter table mh_wa_templates enable row level security;
-- No policies on purpose: the dashboard reaches this through the service-role key,
-- which bypasses RLS. Adding an anon policy would open it to anyone holding the
-- publishable key. See sql/0xx notes on the other mh_ tables.
