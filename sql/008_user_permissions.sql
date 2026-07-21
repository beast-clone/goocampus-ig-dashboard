-- Per-person capability permissions (applied 2026-07-21 via Supabase).
-- Fine-grained function toggles on top of the is_admin flag. Admins bypass
-- (they implicitly have every capability — see lib/permissions.ts hasCapability).
-- Shape: { create_tasks?:true, edit_tasks?:true, delete_tasks?:true, assign_tasks?:true,
--          approve_content?:true, reschedule?:true, view_analytics?:true, manage_team?:true }
-- Only `true` values are stored; absence = not granted.

alter table ind_users add column if not exists permissions jsonb not null default '{}'::jsonb;
