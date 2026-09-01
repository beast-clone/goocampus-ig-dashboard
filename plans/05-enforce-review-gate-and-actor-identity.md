# Enforce the Content Review status gate server-side and derive actor identity from the session

- **Priority:** P1
- **Area:** shared

## Problem

Two coupled trust-boundary gaps, both DECISION-GATED (confirm with Praveen before shipping — this is an internal ~5-user tool and changes Master-sheet admin flexibility). (1) The update route validates only enum membership (VALID_STATUS, lines 83-89) with no transition guard, so any authenticated user can PATCH a post straight to 'Ready to Publish' from the My Day status dropdown (CC_STATUS_ORDER offers it, line 44) or the Master sheet, and it appears in the Scheduler (to-schedule filters on that status) without ever passing Content Review — the gate is convention-only. (2) The activity actor is taken from the request body first (update/route.ts:115-116 `bodyActor || getSessionUserId()`); chat/route.ts and swap-request/route.ts similarly trust body-supplied identity, and notifications/route.ts trusts a `person` query param — so attributions and the 'never notify yourself' self-exclusion are forgeable. NOTE: the legitimate 'act as person' switch in My Day relies on passing a body actor, so tightening (2) must preserve that feature.

## Files

- `app/api/marketing-hub/update/route.ts`
- `app/(dashboard)/dashboard/preview/my-day/PreviewMyDay.tsx`

## Steps

1. GATE (primary): In app/api/marketing-hub/update/route.ts, after the `before` fetch and its error check (line 97) — so `before.data.status` is available — add a transition guard: `if (typeof clean.status === 'string' && clean.status === 'Ready to Publish' && before.data.status !== 'Output - Ready') { return NextResponse.json({ error: 'A post can only be marked Ready to Publish from Content Review (current status must be Output - Ready).' }, { status: 400 }); }`. This forces the Output-Ready → Content Review push path. Confirm with Praveen whether the Master sheet needs an explicit admin bypass before shipping; if yes, gate the check behind an admin flag instead of rejecting outright.
2. GATE (UI): In PreviewMyDay.tsx the task-card status dropdown at line 747 maps over CC_STATUS_ORDER (defined line 44), which is ALSO consumed elsewhere (e.g. the stage rail at line 326), so do NOT mutate CC_STATUS_ORDER directly. Instead add a new constant near line 47: `const CC_SELECTABLE_STATUS: CCStatus[] = CC_STATUS_ORDER.filter((s) => s !== 'Ready to Publish' && s !== 'Published/Scheduled');` and change ONLY the dropdown at line 747 to map over CC_SELECTABLE_STATUS. This removes the two publish-side statuses from the user-selectable menu while leaving the display/stage logic intact.
3. ACTOR (secondary, decision-gated): In update/route.ts, prefer the session identity while still allowing the deliberate 'act as' switch: change the derivation at 115-116 so that when a session user exists and a bodyActor is supplied that differs, you log the bodyActor ONLY if the app treats the current session as permitted to act-as (there is no admin helper today, so the minimal safe change is to keep bodyActor but record the true session user too). Recommended minimal step: leave `actor = bodyActor || getSessionUserId()` but additionally stamp the real session user into the activity row as a separate field if the schema has one, OR simply document the accepted risk. Do NOT silently break the act-as switch. Flag to Praveen whether to add a proper admin-scoped act-as check across update, chat (chat/route.ts sender), swap-request (from), and notifications (person param).
4. Coordinate ordering with Plan 4: if Plan 4 (harden-update-route-write-failures) is landed first, the `before` fetch and `clean` object already exist exactly where this gate check needs them; apply this plan's gate check immediately after Plan 4's atomic-handoff block.

## Verification

Run `npx tsc --noEmit` — must pass. In the app: from a post whose status is NOT 'Output - Ready', attempt to set 'Ready to Publish' via the Master sheet or an API PATCH — it must be rejected with the 400 message. Push the same post through Content Review (Output-Ready → Push to Schedule) and confirm it succeeds and lands in the Scheduler. Confirm the My Day card status dropdown no longer lists 'Ready to Publish' or 'Published/Scheduled'. Confirm normal editing (act-as person switch) still attributes activity correctly.

## Risk

Medium and DECISION-GATED. The gate reduces Master-sheet admin flexibility — do not ship without Praveen's sign-off, or add the admin bypass. The actor change risks breaking the legitimate act-as switch if over-tightened; keep it conservative. Removing statuses from the dropdown must use a separate constant so the stage rail (line 326) is unaffected.
