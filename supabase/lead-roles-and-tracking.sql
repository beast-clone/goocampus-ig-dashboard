-- ============================================================================
-- LEAD ROLES + TRACKED LEADS — for the Sales Hub tabs
-- ============================================================================
-- WHY these live in Supabase and not Airtable: the CRM is the source of truth for
-- leads, and we don't add fields to it. These two tables are dashboard-owned
-- preferences, not lead data.
--
--  lead_roles    — what each lead-holder IS. Six people appear in the CRM's
--                  Counsellor field but only two sell; the rest are the holding
--                  pool, a partner router, or legacy holders. The role decides how
--                  someone is counted, alerted on, and whether they can receive
--                  transfers. Change a role here and the whole Sales Hub follows —
--                  no code change, no CRM edit.
--
--  lead_tracked  — leads someone starred to pin on the Leads tracker tab. Every
--                  lead is tracked by the nightly snapshot regardless; this is
--                  only about which ones surface on that tab.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste all of this → Run.
-- Re-runnable (idempotent).
-- ============================================================================

create table if not exists public.lead_roles (
  holder      text primary key,          -- the name as it appears in CRM → Counsellor
  role        text not null default 'inactive'
              check (role in ('counsellor','pool','partner','inactive')),
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.lead_tracked (
  lead_id     text primary key,          -- Airtable rec… id in the CRM table
  lead_name   text,
  added_by    text,
  added_at    timestamptz not null default now()
);

create index if not exists lead_tracked_added_idx on public.lead_tracked (added_at desc);

-- Seed today's known holders so the board is correct the moment this runs.
-- on conflict do nothing means re-running never overwrites a role you changed.
insert into public.lead_roles (holder, role) values
  ('Robin Johnson J',      'counsellor'),
  ('Jeswin Shaju',         'counsellor'),
  ('Maheen Ejaz',          'pool'),
  ('Arun Kannan',          'partner'),
  ('Alfiya Naaz',          'inactive'),
  ('Ralph Leander D Cruz', 'inactive')
on conflict (holder) do nothing;

-- Both hold lead names / staff names — service-role only, like every other table
-- in this project. RLS on with no policies locks out the public anon key.
alter table public.lead_roles   enable row level security;
alter table public.lead_tracked enable row level security;
