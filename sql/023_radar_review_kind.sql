-- Content Radar: Google reviews are a fourth kind of item.
--
-- radar_actions.item_kind was fixed at news / mention / search when the report loop was
-- built (sql/022_radar_report.sql). Google Maps reviews now appear on the Radar too, and
-- they can be thumbed like anything else, so the constraint has to admit them or every
-- thumb on a review row fails with a check violation.
--
-- item_key for a review is `review:<Google's own review id>`.
--
-- radar_day_log.item_kind was deliberately left unconstrained, so it needs no change —
-- the day log is a written record and should not start rejecting history because the
-- vocabulary moved on.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq).

alter table radar_actions drop constraint if exists radar_actions_item_kind_check;

alter table radar_actions add constraint radar_actions_item_kind_check
  check (item_kind in ('news', 'mention', 'search', 'review'));
