-- LinkedIn image / PDF uploaded ahead of a post's time, per page:
-- { "<page>": { "src": "<image_url>", "urn": "urn:li:image:..." } }. The cron uploads it up
-- to 30 min early and only creates the post at the time (22 Oct 2026).
alter table linkedin_scheduled_posts add column if not exists prepared jsonb;
