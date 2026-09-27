-- Content Studio: make the AI usage log answer "what did this run actually do?"
--
-- ai_usage (sql/012) already records feature, actor, model, tokens and cost. That tells
-- you the bill but not the work: every playbook run logs feature = 'playbook', so 200
-- rows all look identical and none of them says which playbook, what was asked, or
-- whether somebody overrode the framework with their own prompt.
--
-- Agreed with Praveen L on 27 Sep 2026 — store everything, report is admin-only.
-- Free text typed by the team (the task, and any custom prompt) is stored verbatim and
-- is readable by admins in the report; that was the explicit decision, not an oversight.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq, "Beast Clone").

-- Which playbook, or which step of Create. 'playbook' alone was too coarse to report on.
alter table ai_usage add column if not exists slug          text;
-- The human-readable name at the time of the run. Kept alongside the slug because a
-- playbook can be renamed and the report has to stay readable years later.
alter table ai_usage add column if not exists label         text;
-- What the person typed into "Your task".
alter table ai_usage add column if not exists task_text     text;
-- Did they replace the framework with their own instructions?
alter table ai_usage add column if not exists used_custom   boolean not null default false;
-- And if so, what they wrote. Null whenever used_custom is false.
alter table ai_usage add column if not exists custom_prompt text;
-- Wall-clock time for the call, so the report can say how long it ran.
alter table ai_usage add column if not exists duration_ms   integer;

-- The report reads newest-first, filtered to runs that have detail.
create index if not exists ai_usage_created on ai_usage (created_at desc);
create index if not exists ai_usage_slug on ai_usage (slug) where slug is not null;
