-- Diagnostics tab tables (applied 2026-07-21 via Supabase).
-- RLS enabled; the app uses the service-role client which bypasses RLS.

-- One row per diagnostics run (manual or the daily 5 AM cron).
create table if not exists mh_diagnostics_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  trigger text not null default 'manual',       -- 'manual' | 'cron'
  summary jsonb not null default '{}'::jsonb,    -- {checked, healthy, warn, error, repaired, needsYou}
  systems jsonb not null default '[]'::jsonb,    -- per-system results
  repairs jsonb not null default '[]'::jsonb,    -- what was auto-repaired
  host jsonb not null default '{}'::jsonb,       -- ram / uptime / latency snapshot
  duration_ms integer
);
create index if not exists idx_diag_runs_ran_at on mh_diagnostics_runs (ran_at desc);
alter table mh_diagnostics_runs enable row level security;

-- Token override so Diagnostics "Reconnect" rotates a token WITHOUT a redeploy.
-- lib/integration-tokens.ts reads this first, then falls back to the env var.
create table if not exists mh_integration_tokens (
  provider text primary key,                     -- 'linkedin' | 'meta' | ...
  token text not null,
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz,
  note text
);
alter table mh_integration_tokens enable row level security;
