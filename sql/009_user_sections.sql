-- Per-person tab/page access (applied 2026-07-21 via Supabase).
-- Which dashboard SECTIONS a person can open (the sidebar filters to these).
-- Shape: { overview?:true, content?:true, analytics?:true, ads?:true, sales?:true, ai?:true }
-- 'system' (Integrations/Diagnostics/Tools/Team) is admin-only, never stored here.
-- Admins bypass (all sections). See lib/permissions.ts SECTIONS / canAccessSection.

alter table ind_users add column if not exists sections jsonb not null default '{}'::jsonb;
