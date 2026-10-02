-- Watchers: a counselling notice is a fifth kind of radar item.
--
-- radar_actions.item_kind was fixed at news / mention / search when the report loop was
-- built (sql/022_radar_report.sql), and widened once already for Google reviews
-- (sql/023_radar_review_kind.sql). Notices found by a Watcher are now answered the same
-- way — Write this, useful, not useful — so the constraint has to admit them or every
-- thumb on a notice row fails with a check violation.
--
-- It fails quietly, which is the part worth knowing: the thumb turns green because the
-- page updates before the save returns, and the answer is simply never stored. The
-- Watchers report then reads "no action taken" for work somebody actually did.
--
-- item_key for a notice is `notice:<the notice's own URL>` — the same URL held in
-- mh_watcher_items.item_url, which is what the report joins on.
--
-- radar_day_log.item_kind was deliberately left unconstrained and needs no change. The
-- Watchers report does not use the day log at all: a radar headline is a search result
-- that is gone tomorrow and has to be copied somewhere to be remembered, while a notice
-- is already a durable row in mh_watcher_items.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

alter table radar_actions drop constraint if exists radar_actions_item_kind_check;

alter table radar_actions add constraint radar_actions_item_kind_check
  check (item_kind in ('news', 'mention', 'search', 'review', 'notice'));
