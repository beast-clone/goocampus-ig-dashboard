-- ============================================================================
-- LEAD STATUS SNAPSHOTS — history for the Sales Hub lead tracker
-- ============================================================================
-- WHY: Airtable stores only the CURRENT value of a lead's Lead Status. There is
-- no way to ask "what stage was this lead in last Tuesday?", so lead quality and
-- movement can't be judged over time. This table records one row per lead per
-- day; the tracker diffs consecutive days to render a real timeline.
--
-- WHO WRITES IT: /api/cron/lead-snapshot, once a day (n8n hits it with the
-- x-cron-secret header). Scope is ACTIVE leads only — created in the last 90
-- days, plus anything older that isn't in a closed status.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste all of this → Run.
-- Re-runnable (idempotent).
-- ============================================================================

create table if not exists public.lead_status_snapshots (
  id              bigserial primary key,
  snapshot_date   date        not null,
  lead_id         text        not null,   -- Airtable rec… id in the CRM table
  lead_name       text,
  counsellor      text,
  status          text,
  source          text,
  interest        text,
  days_untouched  integer,
  call_attempts   integer,
  created_at      timestamptz not null default now(),
  -- One row per lead per day. Lets the cron re-run safely (upsert on conflict).
  constraint lead_status_snapshots_day_lead_uniq unique (snapshot_date, lead_id)
);

-- The two read patterns: one lead's full timeline, and "everything on day X".
create index if not exists lead_status_snapshots_lead_idx
  on public.lead_status_snapshots (lead_id, snapshot_date desc);
create index if not exists lead_status_snapshots_date_idx
  on public.lead_status_snapshots (snapshot_date desc);

-- This table holds lead names — PII. Same posture as every other table here:
-- RLS on with NO policies, so the public anon key can't touch it. Server routes
-- use the service-role key, which bypasses RLS.
alter table public.lead_status_snapshots enable row level security;
