-- 033 — a one-line English summary of each notice (lib/pdf-summary.ts).
-- summary_from: 'pdf' (read the document's text), 'scan' (read a picture of page 1),
-- 'title' (no readable document; translated the link text).
--
-- RUN IN THE SUPABASE SQL EDITOR (project wlhbmzaernchwebapszq). Safe to run twice.
alter table mh_watcher_items add column if not exists summary text;
alter table mh_watcher_items add column if not exists summary_from text;
