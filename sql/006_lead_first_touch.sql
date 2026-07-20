-- Frozen first-contact time per CRM lead (Sales Hub "Speed to lead").
--
-- Airtable only exposes "last modified" (which keeps changing), never "first modified",
-- and we may NOT add columns to the Sales Hub Airtable base. So the leads-crm route runs
-- ~daily (it's cached) and, the FIRST time it sees a lead already modified, snapshots that
-- moment here and FREEZES it — written once, never overwritten (ON CONFLICT DO NOTHING).
-- Later edits therefore can't inflate the first-contact number.
--
-- Accurate for every lead first-touched AFTER this ships; historical leads are seeded with
-- their current last-modified as a one-time estimate, and the metric caps each lead's gap at
-- 30 days so backfilled outliers / neglected leads don't skew the average.

create table if not exists mh_lead_first_touch (
  lead_id        text primary key,          -- Airtable CRM record id
  created_at     timestamptz,               -- the lead's Created Date
  first_touch_at timestamptz not null,      -- frozen: first observed "Actual Last Modified"
  recorded_at    timestamptz not null default now()
);

alter table mh_lead_first_touch enable row level security;
-- No anon policies: the dashboard uses the service-role key (bypasses RLS). Matches the
-- posture of every other mh_* table.
