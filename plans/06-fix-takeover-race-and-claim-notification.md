# Guard the takeover claim against a race and stop mis-firing 'claimed a video' notifications

- **Priority:** P2
- **Area:** notifications

## Problem

Two related defects. (1) app/api/marketing-hub/takeover/route.ts does an unconditional select owner_key (line 24) then update owner_key=newOwnerKey (line 32) with no optimistic guard, so two editors claiming the same pooled video near-simultaneously both pass the oldOwner!=newOwner check and both updates succeed (last-write-wins) — both get a 'claim' activity row and a 'claimed' chat message, so the pool shows one task grabbed by two people. (2) The takeover route ALWAYS inserts mh_activity action='claim' regardless of type — it is used for editor pool claims, Praveen accepting a deferred design handoff, AND Manya's swap hand-over. The notifications 'claim' branch (route.ts:80-85) fires purely on action==='claim', computing siblingOf(actor) and telling the sibling editor '<actor> claimed a video' — so a non-video or swap takeover mis-notifies the sibling.

## Files

- `app/api/marketing-hub/takeover/route.ts`
- `app/api/my-day/notifications/route.ts`

## Steps

1. RACE: In app/api/marketing-hub/takeover/route.ts, make the ownership update conditional on the expected prior owner. Replace line 32 `const swap = await sb.from('mh_posts').update({ owner_key: body.newOwnerKey }).eq('id', body.postId);` with `const swap = await sb.from('mh_posts').update({ owner_key: body.newOwnerKey }).eq('id', body.postId).eq('owner_key', oldOwner).select('id');`. Then after the existing `if (swap.error) throw new Error(swap.error.message);` add: `if (!swap.data || swap.data.length === 0) { return NextResponse.json({ error: 'Already claimed by someone else', code: 'CONFLICT' }, { status: 409 }); }`. This makes a lost race return 409 instead of announcing a phantom claim. Note: `oldOwner` may be null for a truly unassigned row — Supabase `.eq('owner_key', null)` does not match NULLs, so if pooled videos can have NULL owner, use `oldOwner === null ? query.is('owner_key', null) : query.eq('owner_key', oldOwner)` to handle both.
2. NOTIFICATION: In app/api/my-day/notifications/route.ts, tighten the claim branch (lines 80-85) so it only fires for actual video claims. Change `if (sib) {` to `if (sib && VIDEO_TYPES.has(post?.type || '')) {`. VIDEO_TYPES is already imported at the top of this file (line 4). This prevents a non-video takeover from telling the sibling editor a video was claimed.
3. Confirm the client rolls back on 409: in HopeMyDay.tsx locate doClaimVideo (around line 1671-1692). The audit reports it already rolls back the optimistic claim and toasts on a non-ok response — verify the response handling treats status 409 the same as any non-ok (rollback + user-facing toast like 'Already claimed'). If it only checks res.ok, no change needed; if it special-cases status, add a friendly message for 409.

## Verification

Run `npx tsc --noEmit` — must pass. Race: simulate by claiming the same pooled video from two browser tabs (two editor sessions) as close together as possible; exactly one should succeed and the other should receive a 409 and roll its optimistic card back — the pool must not show the task owned by two people, and the chat/activity feed must show a single claim. Notification: perform a non-video takeover (e.g. Praveen accepting a deferred design handoff) and confirm the sibling editor does NOT receive a 'claimed a video' notification; a real video pool-claim still notifies the sibling.

## Risk

Low-medium. The NULL-owner handling in step 1 matters only if pooled rows can have NULL owner_key — inspect a real pool row first. Returning 409 requires the client to roll back gracefully (verified in step 3).
