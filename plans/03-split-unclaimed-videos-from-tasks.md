# Exclude unclaimed approved videos from My Day tasks so they live only in the pool

- **Priority:** P1
- **Area:** my-day

## Problem

app/api/my-day/route.ts builds `tasks` by mapping ALL working rows (line 152) and `pool` as a filtered subset of the same rows (156-163). On video approval the server keeps owner_key on the writer (only design work hands to Praveen — update/route.ts:198 auto-assigns only when !isVideo), so an unclaimed approved video row has owner=writer AND matches the pool filter — it is returned in BOTH arrays. When a writer (e.g. Manya) approves a video, the client optimistically moves it off her board into the pool, but the next load() re-adds it to her board because workingTasks special-cases Manya to include every in-view status (PreviewMyDay.tsx:1242) and the row is still in `tasks` with owner=Manya. Net effect: the handoff visually reverts on the next poll. Server truth must match the optimistic UI: an unclaimed approved video belongs only in `pool`.

## Files

- `app/api/my-day/route.ts`

## Steps

1. In app/api/my-day/route.ts, move the EDITORS set so it is defined BEFORE the `tasks` mapping. Currently `const EDITORS = new Set(["nikhil", "nandu"]);` is at line 155 (just above the pool). Cut it and paste it right after `const rows = [...(working.data || []), ...(doneRecent.data || [])] as Row[];` (line 123) OR anywhere before line 152.
2. Directly below the EDITORS definition add a predicate: `const isUnclaimedVideo = (r: Row) => r.status === 'Content - Approved' && VIDEO_TYPES.has(r.type || '') && !EDITORS.has((r.owner_key || '').toLowerCase());`.
3. Change the tasks mapping (line 152) from `const tasks = rows.map((r) => toTask(r, refByPost.get(r.id) || [], creativeByPost.get(r.id) || []));` to `const tasks = rows.filter((r) => !isUnclaimedVideo(r)).map((r) => toTask(r, refByPost.get(r.id) || [], creativeByPost.get(r.id) || []));`.
4. Change the pool builder (lines 156-163) to reuse the predicate: `const pool = rows.filter(isUnclaimedVideo).map((r) => toTask(r, refByPost.get(r.id) || [], creativeByPost.get(r.id) || []));` and delete the now-duplicated inline filter and the second EDITORS declaration.
5. OPTIONAL scaling hardening (same file, only if quick): the mh_attachments fetch at lines 135-140 uses a flat `.limit(5000)` global cap. Replace it with an id-scoped fetch: build `const taskIds = rows.map((r) => r.id);` before the attachments query and change `.in('kind', ['reference', 'creative']).order('uploaded_at', { ascending: false }).limit(5000)` to `.in('post_id', taskIds).in('kind', ['reference', 'creative'])`. Skip this step if taskIds could exceed ~1000 (it would make the request URL very long) — in that case leave the 5000 cap as-is.

## Verification

Run `npx tsc --noEmit` — must pass. In the app as Manya: approve a video-type task. The card must leave her board and appear in the editors' claim pool, and must STILL be gone from her board after waiting ~1 poll cycle (the My Day fetch interval) / clicking refresh — it must not bounce back. As an editor (Nandu/Nikhil) confirm the same video shows in the claim pool and is claimable. Confirm design (non-video) approvals still hand to Praveen unchanged.

## Risk

Low-medium. Only re-partitions rows already returned; Published rows are unaffected (status != 'Content - Approved'). The optional attachments step changes a query shape — verify creatives/references still render in the modal if you apply it.
