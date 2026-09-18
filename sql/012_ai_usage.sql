-- Perplexity usage log — one row per API call the dashboard makes.
--
-- Every Perplexity call goes through lib/ai.ts, which writes a row here after the
-- call returns: which feature made it, who was signed in, the model, the tokens and
-- the exact dollar cost Perplexity reports in the response. The Integrations tab sums
-- it into today / this week / this month against the monthly budget.
--
-- Perplexity's API does not expose the remaining account balance, so this measures
-- what we spend, not what is left.
--
-- Additive only. RLS enabled; the app writes with the service-role client.
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

create table if not exists ai_usage (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  feature           text not null,          -- e.g. content-studio, playbook, post-planner
  actor             text,                   -- dashboard user id, null for background jobs
  model             text,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd          numeric(10, 5),         -- as reported by Perplexity; null if it didn't say
  ok                boolean not null default true,
  error             text
);

create index if not exists ai_usage_created_at_idx on ai_usage (created_at desc);

alter table ai_usage enable row level security;

comment on table ai_usage is
  'One row per Perplexity API call, written by lib/ai.ts. Summed on the Integrations tab against AI_MONTHLY_BUDGET_USD (default $10).';
