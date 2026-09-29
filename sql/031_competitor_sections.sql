-- 031 — separate trackers per section of a competitor's website
--
-- Each competitor gets a list of website sections to watch (Webinars, Seminars,
-- Medical Expo, News & Blogs...), and each thing found is filed under its section so
-- the Briefing can show one small tracker per section.
--
-- RUN IN THE SUPABASE SQL EDITOR (project wlhbmzaernchwebapszq). Safe to run twice.

-- [{ "label": "News & Blogs", "url": "https://hellomentor.in/news-blogs" }, ...]
-- null = not chosen yet: the watcher picks the site's event and blog pages itself.
alter table mh_competitors add column if not exists watch_pages jsonb;

-- The section label an event was found in (null = elsewhere on the site).
alter table mh_competitor_events add column if not exists section text;
