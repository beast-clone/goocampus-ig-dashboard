# Backlog — agreed ideas, not built yet

## Re-review when a creative changes after approval (Praveen, 22 Oct 2026)

Today a post that passed Content Review can have its video/images swapped in the
Scheduler or the task, and it goes out without anyone looking at the new version.

Agreed direction (build later):
1. Adding / removing / replacing a creative on a post that is already approved
   (Ready to Publish, or queued in the Scheduler) moves it back to **Output - Ready**
   — into Content Review — and out of the Scheduler until approved again. Note on the
   task: "Creative changed after approval — needs review again".
2. "Fix creative →" on a failed post follows the same path (task → Content Review →
   Scheduler).
3. Content Review flags it "Changed after approval" and shows old vs new creative.
4. Open question: should caption-only edits also send it back? (Suggested: no.)
5. The Scheduler's manual "Send back" stays.
Watch-out: a post with a fixed time waits for re-approval and can miss its slot — the
note should say so.

## Scheduler: publish progress timer + per-post history (Praveen, 22 Oct 2026)

"Publish now" only moves schedule_time to now; the n8n publisher (frQoNFQjqVSnZsTp)
checks every 5 minutes, so a post can sit as "Scheduled" for up to 5 min with no sign
of life (and the pop-up wrongly says "within about a minute"). A reel being processed
by Meta is handed back as "scheduled" between runs, which looks like nothing happened.

Agreed direction (build later):
1. Live status on the post: "Waiting for the publisher — next check in m:ss" →
   "Publishing… 0:48" (counting up) → "Published in 4 min 20 s · View post" /
   "Failed after 2 min · Why". Also show "Instagram is processing the video (try 2 of
   20)" while a reel container is waiting. Fix the pop-up copy to "within 5 minutes".
2. History per post in the detail view: scheduled (who / for when), Publish now,
   publishing started, processing at Meta, failed (reason), Fix creative / taken out of
   the queue, rescheduled, published (link, time taken). Record every publish_status
   change with a DB trigger (DDL via the Supabase SQL editor in Chrome) so n8n's
   background steps are captured too.
3. Optional: make "Publish now" wake the n8n publisher immediately (webhook) instead of
   waiting for the 5-minute tick — needs an n8n workflow change.
