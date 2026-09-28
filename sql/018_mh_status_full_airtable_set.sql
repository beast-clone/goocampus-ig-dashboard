-- 018 — mh_status: the three Airtable statuses the dashboard never had
--
-- Airtable's Content Calendar offers ELEVEN statuses. This enum had EIGHT, so the
-- import quietly rewrote the other three to their nearest neighbour and stashed the
-- real one in custom.airtable_status:
--
--     Content - Needs Approval  ->  Content - In Progress       (8 rows today)
--     Rejected/Not Published    ->  Incorporating Feedback      (5 rows today)
--     Failed                    ->  Incorporating Feedback      (0 rows today)
--
-- So thirteen tasks have been showing the team a status Airtable disagrees with,
-- which is what they reported (25 Sep). Nothing was lost — but nothing said so
-- either.
--
-- APPLIED to production on 28 Sep 2026, in the Supabase SQL editor (the MCP
-- connection is read-only and PostgREST cannot do DDL). What actually happened:
--
--   · the three ALTERs ran clean — the enum is eleven values now
--   · Rejected/Not Published: 5 rows restored. "Incorporating Feedback" went to
--     zero, because all five of its rows were really rejections
--   · Content - Needs Approval: 0 rows moved. Those eight had ALREADY been
--     approved in Airtable since the import first remapped them, so they were
--     sitting on "Content - Approved" — not on the substitute the guard looks
--     for. The guard did its job: a row somebody has moved on is left alone.
--     custom.airtable_status is a note of what the status was at import time,
--     not a claim about what it is now.
--   · a fresh import afterwards reported 0 new / 100 updated and rewrote
--     nothing — the statuses now land as themselves.
--
-- Needs Approval and Failed read 0 in the Master sheet today only because no task
-- in the synced "Task Dashboard" view currently has either status. The moment one
-- does, it stores as itself instead of being squashed.
--
-- Run the three ALTERs FIRST, on their own, and only then the UPDATE block.
-- Postgres will not let a transaction use an enum value it added itself, so the
-- restore has to be a separate statement from the ALTERs.
--
-- Adding an enum value cannot be undone — there is no DROP VALUE. That is fine
-- here: these three are Airtable's own vocabulary, not a guess.

-- ── Step 1 — add the values (run this block alone) ────────────────────────────
ALTER TYPE mh_status ADD VALUE IF NOT EXISTS 'Content - Needs Approval' AFTER 'Content - In Progress';
ALTER TYPE mh_status ADD VALUE IF NOT EXISTS 'Rejected/Not Published';
ALTER TYPE mh_status ADD VALUE IF NOT EXISTS 'Failed';

-- ── Step 2 — put the remapped rows back (run AFTER step 1 has committed) ──────
--
-- Only rows the import itself rewrote are touched: they carry the original in
-- custom.airtable_status, and we only move one whose current status is still the
-- substitute the import chose. A row somebody has since moved on by hand is left
-- exactly where they put it.

UPDATE mh_posts
   SET status = 'Content - Needs Approval'
 WHERE custom->>'airtable_status' = 'Content - Needs Approval'
   AND status = 'Content - In Progress';

UPDATE mh_posts
   SET status = 'Rejected/Not Published'
 WHERE custom->>'airtable_status' = 'Rejected/Not Published'
   AND status = 'Incorporating Feedback';

UPDATE mh_posts
   SET status = 'Failed'
 WHERE custom->>'airtable_status' = 'Failed'
   AND status = 'Incorporating Feedback';

-- ── Check ────────────────────────────────────────────────────────────────────
-- Expect eleven rows, and no row whose stored status disagrees with Airtable's.
--
--   SELECT status, count(*) FROM mh_posts GROUP BY status ORDER BY 2 DESC;
--
--   SELECT count(*) AS still_disagreeing
--     FROM mh_posts
--    WHERE custom->>'airtable_status' IS NOT NULL
--      AND custom->>'airtable_status' <> status::text;
