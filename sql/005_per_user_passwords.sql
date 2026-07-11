-- Per-user passwords for dashboard login.
-- Run in the GooCampus Supabase project (wlhbmzaernchwebapszq) SQL editor.
--
-- ind_users.password_hash holds a scrypt hash ("s1$<salt>$<hash>", see lib/passwords.ts).
-- NULL = this person has no personal password yet, so the shared DASHBOARD_PASSWORD
-- still logs them in. Once set, ONLY their personal password works for their email.

alter table ind_users add column if not exists password_hash text;
