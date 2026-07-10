-- ============================================================================
-- SECURITY LOCKDOWN — enable Row Level Security on every Marketing Hub table
-- ============================================================================
-- WHY: RLS is currently OFF on all mh_* tables. The project's *publishable*
-- (anon) key — which is public by design — can therefore READ, UPDATE, and
-- DELETE every row over the REST API from anywhere on the internet.
--
-- WHY THIS IS SAFE FOR THE APP: every server route in this app talks to
-- Supabase with the SERVICE-ROLE (secret) key via lib/supabase.ts. The
-- service-role key BYPASSES RLS. So turning RLS on — with NO policies for the
-- anon/authenticated roles — locks out the public key completely while the
-- dashboard keeps working exactly as before. There is no client-side Supabase
-- access in this codebase (verified), so nothing legitimate breaks.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste all of this → Run.
-- Re-runnable (idempotent). Takes effect immediately.
-- ============================================================================

alter table public.mh_posts               enable row level security;
alter table public.mh_notes               enable row level security;
alter table public.mh_comments            enable row level security;
alter table public.mh_activity            enable row level security;
alter table public.mh_team_members        enable row level security;
alter table public.mh_attachments         enable row level security;
alter table public.mh_post_collaborators  enable row level security;
alter table public.mh_slack_queue         enable row level security;

-- story_snapshots and content_alerts already returned 0 rows to the anon key,
-- but enable RLS on them too so a future policy change can't silently expose them.
alter table public.story_snapshots        enable row level security;
alter table public.content_alerts         enable row level security;

-- Belt-and-suspenders: hard-revoke direct table privileges from the public
-- API roles. With RLS on this is redundant, but it means that even if someone
-- later adds a permissive policy by mistake, these roles still can't touch the
-- tables unless a GRANT is also deliberately re-added.
revoke all on public.mh_posts,
              public.mh_notes,
              public.mh_comments,
              public.mh_activity,
              public.mh_team_members,
              public.mh_attachments,
              public.mh_post_collaborators,
              public.mh_slack_queue,
              public.story_snapshots,
              public.content_alerts
  from anon, authenticated;

-- ============================================================================
-- VERIFY (run after the above; every row should show rls_enabled = true):
-- ============================================================================
-- select relname as table, relrowsecurity as rls_enabled
-- from pg_class
-- where relnamespace = 'public'::regnamespace
--   and (relname like 'mh_%' or relname in ('story_snapshots','content_alerts'))
-- order by relname;
