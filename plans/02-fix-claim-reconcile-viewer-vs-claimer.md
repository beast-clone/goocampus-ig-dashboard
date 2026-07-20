# Fix My Day claim reconcile to dedupe against the claimer, not the viewed person

- **Priority:** P1
- **Area:** my-day

## Problem

In HopeMyDay.tsx load(), the optimistic claim buffer is reconciled with `return !!server && server.detail.owner !== meNameRef.current;` (line 1211). meNameRef.current (set at line 1219 to the currently-VIEWED person) is not the editor who claimed the task. Repro: claim video V as Nandu (claimedTasks holds V with detail.owner 'Nandu'), switch the person picker to Manya before the takeover POST resolves — the reconcile keeps V because owner 'Nandu' !== viewer 'Manya' — then switch back to Nandu, where the server row for V now also arrives in `tasks` with owner 'Nandu'. workingTasks = [...claimedTasks, ...tasks] then renders the same t.id from both arrays → duplicate React key warning, a doubled card, and double-counted stat tiles. Each claimedTasks entry already carries detail.owner = the claimer, so the correct comparison is viewer-independent.

## Files

- `app/(dashboard)/dashboard/hope-preview/my-day/HopeMyDay.tsx`

## Steps

1. In app/(dashboard)/dashboard/hope-preview/my-day/HopeMyDay.tsx, change line 1211 from `return !!server && server.detail.owner !== meNameRef.current;` to `return !!server && server.detail.owner !== c.detail.owner;` (the `c` param of the `.filter((c) => {...})` at line 1206 is the buffered claim and already has detail.owner = the claimer).
2. Delete the now-unused ref declaration at line 1190 (`const meNameRef = useRef("");`).
3. Delete the assignment at line 1219 (`meNameRef.current = me.name;`).
4. Do NOT remove the `useRef` import on line 2 — it is still used by dragKey, trackRef, grabDX, closedManually, personRef, remLoaded, lastMsgId (confirmed multiple other useRef call sites remain).

## Verification

Run `npx tsc --noEmit` — must pass and must NOT report meNameRef as undefined anywhere (grep the file for `meNameRef` first to confirm zero remaining references). In the app: as Nandu, claim a pooled video; before it settles switch the person picker to Manya, then back to Nandu. The claimed card must render exactly once (open browser console — no 'Encountered two children with the same key' warning) and the top stat tiles must not double-count it.

## Risk

Low. Preserves the Round-1 intent (in-flight claims survive a concurrent refetch) while making the comparison viewer-independent. Only removes a ref that is provably unused after the edit.
