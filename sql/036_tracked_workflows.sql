-- System → Workflows: the extra n8n workflows someone has chosen to watch.
--
-- The page finds the dashboard's own jobs automatically, by looking for workflows
-- whose nodes call an /api/cron/* endpoint here. That covers everything the
-- dashboard depends on and deliberately excludes the rest of the n8n account —
-- the TezDM funnels, the voucher generator, the ops-call summariser — because a
-- page listing forty unrelated workflows is a page nobody reads.
--
-- This table is the escape hatch: pin any other workflow to the list when you
-- want to keep an eye on it. Removing a row just stops showing it; nothing in
-- n8n is touched either way.

create table if not exists public.mh_tracked_workflows (
  workflow_id text primary key,            -- the n8n workflow id
  label       text,                        -- name at the time it was added, for display if n8n is unreachable
  added_at    timestamptz not null default now(),
  added_by    text                         -- team member id from the session
);

comment on table public.mh_tracked_workflows is
  'n8n workflows manually pinned to System → Workflows, on top of the ones auto-detected by their /api/cron/* calls.';

-- RLS on, no policies. Every read and write goes through the service-role client
-- in the API routes, which bypasses RLS. Adding an anon policy here would expose
-- the list to the public key — see the 2026-07-10 lockdown.
alter table public.mh_tracked_workflows enable row level security;
