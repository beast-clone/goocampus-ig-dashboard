-- Per-account profile picture + theme choice (Nikhil's comment, 22 Sep 2026).
--
-- photo_url — public URL of the person's profile picture (uploaded from the Account
--             page to the scheduler-media bucket under avatars/). NULL = show initials.
-- theme     — 'light' | 'dark' | 'system' (default). Saved per account so it follows
--             the person to any device.
--
-- Additive only. Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

alter table ind_users add column if not exists photo_url text;
alter table ind_users add column if not exists theme text not null default 'system';
alter table ind_users drop constraint if exists ind_users_theme_check;
alter table ind_users add constraint ind_users_theme_check check (theme in ('light', 'dark', 'system'));
