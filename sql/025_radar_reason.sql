-- Content Radar: why something was turned down, and a fuller day log.
--
-- 1. REASON. Thumbs-down answered "not useful" and nothing else, so the report could
--    say an item was rejected but never why. Agreed with Praveen L on 27 Sep 2026:
--    the reason is OPTIONAL and asked AFTER the thumb registers, never before. The
--    whole value of the thumb is that it costs one tap — make rejecting cost a
--    sentence and people stop rejecting, which is the exact problem the thumbs were
--    built to solve.
--
-- 2. The day log needs the same column so the reason survives the 11:59 PM roll-off
--    into the report, where it is the thing worth reading.
--
-- Run once in the Supabase SQL editor (project wlhbmzaernchwebapszq, "Beast Clone").

alter table radar_actions  add column if not exists reason text;
alter table radar_day_log  add column if not exists reason text;

-- The roll-off now also logs Google Trends searches and positive reviews, so the Log
-- tab can show everything the radar produced that day rather than only the parts that
-- someone might have acted on.
