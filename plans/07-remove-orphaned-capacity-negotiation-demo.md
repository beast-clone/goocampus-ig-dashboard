# Remove the unreachable capacity-negotiation demo code from PreviewMyDay

- **Priority:** P2
- **Area:** my-day

## Problem

Since notifications now come from the server (which only emits kind 'claim'/'message' and never sets n.task), a whole sub-pipeline in PreviewMyDay.tsx is dead: setAskManya(true) is never called (0 occurrences), so AskManyaModal never renders, so sendToManya/manyaConfirmMove/ManyaReschedule and the pipeline 'waiting'/'freed' states are unreachable; the hardcoded demo constants URGENT_TASK, MOVABLE, CLAIM_POOL_INIT are dead; addNotif has no callers; and the `if (n.task)` branch in onAcceptNotif is dead since server notifs never carry a task. This dead weight (~150 lines) in a 2860-line file obscures the LIVE swap flow and is a latent source of duplicate-flow bugs. CRITICAL: the REAL swap path (acceptWork / askManyaToMove → /api/my-day/swap-request, AcceptWorkModal reachable via the Pipeline drawer 'Open' button at line 2206, and pipelineTasks / the Pipeline drawer) is LIVE and must NOT be removed.

## Files

- `app/(dashboard)/dashboard/preview/my-day/PreviewMyDay.tsx`

## Steps

1. This is a careful surgical deletion — confirm with Praveen it is wanted before starting, and do it as ONE isolated commit separate from any bug fix. For EACH symbol below, first grep the whole file to confirm the only remaining references are within the dead subtree, then remove.
2. Remove the demo data constants: URGENT_TASK (declared ~line 276), MOVABLE (~line 284), and CLAIM_POOL_INIT (~line 165, defined-only). Grep each name first — MOVABLE is referenced only inside AskManyaModal (~834) and ManyaReschedule (~854), both of which are also being removed.
3. Remove the dead components: AskManyaModal (function declared ~line 826) and ManyaReschedule (function declared ~line 846).
4. Remove the dead handlers: sendToManya (~line 1624), manyaConfirmMove (~line 1631), and addNotif (~line 1556, defined-only).
5. Remove the dead state hooks: askManya/setAskManya (~line 1089), pipeline/setPipeline (~line 1095), and movedId/setMovedId (~line 1096). WARNING: the word 'pipeline' also appears in LIVE code — pipelineTasks (~1226), the Pipeline drawer (~1856, ~2198), pipeOpen — do NOT touch those. Only the `pipeline`/`setPipeline` useState tuple and its 'waiting'/'freed'/'offered'/'done' usages in the dead subtree are removed.
6. Remove the dead render sites: the `person === 'manya' && pipeline === 'waiting'` block that renders ManyaReschedule (~line 1871-1872), and the AskManyaModal render at the bottom (~line 2319 `{askManya && <AskManyaModal ... />}`).
7. Remove the dead `if (n.task) { setAcceptTask(n.task); return; }` branch inside onAcceptNotif (~line 1559) since server notifs never carry a task field.
8. Do NOT remove: acceptWork (~1573), askManyaToMove (~1594), AcceptWorkModal (function + its render at ~2318 `{acceptTask && <AcceptWorkModal ... onAskManya={askManyaToMove} .../>}`), pipelineTasks, pipeOpen, or the Pipeline drawer — these are the live swap path.
9. After deletions, re-grep for every removed symbol name to confirm zero remaining references, and check that the Notif type / setNotifs are still used by the live notification stack (they are — do not remove them).

## Verification

Run `npx tsc --noEmit` — must pass with no 'cannot find name' errors (proves nothing live referenced the removed symbols). Run `npm run build`. In the app, exercise the LIVE swap path end-to-end: as a packed producer open the Pipeline drawer, click 'Open' on a pipelined task to bring up AcceptWorkModal, use Accept & Work AND the Ask-Manya-to-move (swap-request) action — both must still function. Confirm the notification bell still renders server notifications.

## Risk

High risk of removing the wrong half. The live swap flow shares the 'pipeline' vocabulary with the dead flow — a blind grep-and-delete will break it. Mitigate by removing one symbol at a time with a grep+typecheck after each, and by fully exercising the swap path in verification. Do this as a standalone diff so it is easy to review/revert.
