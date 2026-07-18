# Audit Log — `feat/hope-ui-reskin` session

## QA 2026-07-18 — Overview tab (`/dashboard/hope-preview` → `HopeOverview.tsx`)

Thorough tab check (code + APIs + runtime). 3 issues found, all FIXED & verified live.

| # | Issue | Severity | Fix | Verified |
|---|---|---|---|---|
| 1 | **React "key" spread warning** on every render — `<StatCard key={s.key} {...s}/>` spread the `key` field into props (console error ×2). | med (console noise, React anti-pattern) | Destructure key out of the spread: `stats.map(({key, ...rest}) => <StatCard key={key} {...rest} …/>)`. Root cause, one spot. | Console clean after reload ✓ |
| 2 | **Dead code** — `NavGroup`, `NavItem`, `Legend` defined but never used (sidebar is `HopeSidebar`); 5 unused icon imports (`IconSettings/Sun/Users/Wand/Speakerphone`). | low (lint/bundle) | Deleted the 3 functions + 5 imports. | Compiles + renders ✓ |
| 3 | **`/api/overview-tips` returned 502** — still on OpenAI `gpt-4o-mini` (out of quota → 429), so the per-KPI AI "action" tips silently fell back to hardcoded plain copy. | high (feature dead) | Swapped OpenAI → `askPerplexity` (reuse `lib/ai.ts`), same as the ai-report migration; prescriptive prompt + robust JSON parse. | `200` via Perplexity; live prescriptive tips render ✓ |

**Observations (NOT changed — noted for later):**
- Overview is hardcoded to `accountId="goocampus"` and header shows a hardcoded "Maheen Ejaz / CMO" — it's the original "proof page", no account picker. Fine as-is; flag if it should reflect the logged-in user / switch brands.
- Font-weights use 700/800 throughout, which contradicts CLAUDE.md ("400/500 only"). Deliberate hand-built proof-page style (own `C` tokens, not `.hope-scope`). Left alone — a mass restyle is out of scope for QA.
- Fires `/api/posts` 3× on load (limit 10 + 2× limit 200) plus child components' own fetches — heavy; posts API is slow (~20s). Works; optimize only if load time becomes a complaint.

---


**Date:** 2026-07-17
**Branch:** `feat/hope-ui-reskin`
**Status:** ⚠️ **WORK IN PROGRESS — DO NOT PUSH / DEPLOY.** Round-1 fixes applied; **Round-2 findings still OPEN** (see below). Typecheck passes for Round-1 state.

This log is the resume point. When we reconnect, start at **"Round 2 — OPEN findings"** and fix top-down.

---

## What this session built

1. **Content Review tab** — a human gate between `Output - Ready` and the Scheduler.
   - New: `app/(dashboard)/dashboard/hope-preview/content-review/page.tsx`, `app/api/content-review/route.ts`
   - Gate change: `app/api/scheduler/to-schedule/route.ts` now surfaces only `Ready to Publish`
   - Push to Schedule → `Ready to Publish`; Send back → `Incorporating Feedback`
2. **My Day wired to live `mh_posts`** (was a mock).
   - New: `app/api/my-day/route.ts` (per-person tasks + claim pool + stats)
   - `HopeMyDay.tsx` fetches it; persists writes: status via `/api/marketing-hub/update`, claim via `/api/marketing-hub/takeover`, create via `/api/marketing-hub/create`
3. **Real notifications** from the `mh_activity` event log.
   - New: `app/api/my-day/notifications/route.ts` (claim→other editor, handoff→receiver, send-back→owner, push→owner; never self)
   - `app/api/marketing-hub/update/route.ts` now logs non-approval status transitions
4. Shared constant `lib/mh-content-types.ts` (`VIDEO_TYPES`).

**Verified live in Chrome:** create→approve→handoff→Output-Ready→Content Review→Push→Scheduler; video claim-pool (Nandu/Nikhil claim); Send back → lands in owner's Feedback tab; real claim notification reached the sibling editor.

---

## Round 1 audit — 10 confirmed → 7 unique — ALL FIXED ✅

| # | Sev | Issue | Fix | Status |
|---|-----|-------|-----|--------|
| 1 | HIGH | `my-day` `WORKING` omitted `Content - Needs Approval` + `Output - In Progress` → task vanishes after reconcile | Added both to `WORKING` in `app/api/my-day/route.ts` | ✅ |
| 2 | MED | `claimVideo` swallowed takeover failure (no rollback/toast) | Rollback + "Claim failed" toast on `!res.ok`/catch | ✅ |
| 3 | MED | `setTaskStatus` kept optimistic change when PATCH failed | `load()` resync on failure branch + catch | ✅ |
| 4 | MED | `VIDEO_TYPES` diverged across 3 routes (`Meta Ads - Video` missing) | Single shared `lib/mh-content-types.ts` imported by all three | ✅ |
| 5 | MED | Handoff kept notifying an editor who already claimed | Skip "up for grabs" when post already owned by an editor | ✅ |
| 6 | LOW | `load()` blanket-cleared `claimedTasks`, racing an in-flight claim | Reconcile buffer instead of blanket clear *(⚠ see Round-2 #B — this fix has a bug)* | ⚠ superseded |
| 7 | LOW | Content Review omitted `actor` → send-back/push self-exclusion never fired | update route derives actor from `getSessionUserId()` fallback | ✅ |

---

## Round 2 re-sweep — 6 confirmed + 1 uncertain — **OPEN (not yet fixed)**

Fix these next, top-down. Notes include the planned fix and exact locations.

### A. 🔴 HIGH — `hasCreative` ignores `mh_attachments` (real deadlock)
- **Files:** `app/api/content-review/route.ts:48`, and same omission in `app/api/scheduler/to-schedule/route.ts:~46`
- **Problem:** `hasCreative` reads only `mh_posts.media_urls` / `output_link`. But creatives uploaded through the Marketing Hub task-detail modal (`POST /api/marketing-hub/attach`) are written **only** to the `mh_attachments` table — never to `media_urls`/`output_link`. So a genuinely-ready post shows "No creative attached", Push-to-Schedule is disabled, and it can **never reach the Scheduler** (Content Review is now the only gate). Deadlock.
- **Planned fix:** In both routes, after fetching posts, run a second query on `mh_attachments` (`select post_id where post_id in (ids)`), build a `Set` of post_ids that have attachments, and treat `hasCreative` (and the to-schedule filter) as true when `media_urls`/`output_link` **or** an attachment exists. `mh_attachments` columns confirmed: `id, post_id, filename, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at`.

### B. 🟠 MED — reconcile dedupes against the VIEWER, not the CLAIMER (bug introduced by Round-1 #6)
- **File:** `app/(dashboard)/dashboard/hope-preview/my-day/HopeMyDay.tsx:~923` (the `load()` `setClaimedTasks` reconcile) + `meNameRef` at ~907/~933
- **Problem:** Reconcile keeps a buffered claim while `server.detail.owner !== meNameRef.current`. `meNameRef` is the **currently-viewed** person, not the claimer. Claim as Nandu → switch person to Manya before takeover resolves → reconcile keeps the row → switching back to Nandu renders the card **twice** (duplicate React key).
- **Planned fix:** Compare against the **claimer captured on the buffered entry** — i.e. `server.detail.owner !== c.detail.owner` (each `claimedTasks` entry already has `detail.owner = claimer`). This is viewer-independent AND still keeps in-flight claims (satisfies Round-1 #6). Then **remove `meNameRef`** (no longer needed).

### C. 🟠 MED — video approval optimistic "→ pool" diverges from server → card bounces back
- **Files:** `HopeMyDay.tsx:~992` (setTaskStatus video branch) ↔ `app/api/my-day/route.ts:~101`
- **Problem:** On a writer approving a video, the client optimistically removes it from the writer's list and shows it in the pool as "Unclaimed". But the server **keeps `owner_key` on the writer** for video (only design → Praveen). `my-day` returns that row in **both** `tasks` (owner=writer) and `pool`, so after `load()` it reappears on the writer's board — the handoff visually reverts.
- **Planned fix (server-side, cleanest):** In `app/api/my-day/route.ts`, exclude **unclaimed approved videos** from `tasks` (they live only in `pool`). Refactor:
  ```ts
  const isUnclaimedVideo = (r) =>
    r.status === "Content - Approved" && VIDEO_TYPES.has(r.type || "") &&
    !EDITORS.has((r.owner_key || "").toLowerCase());
  const pool  = rows.filter(isUnclaimedVideo).map(toTask);
  const tasks = rows.filter((r) => !isUnclaimedVideo(r)).map(toTask);
  ```
  This makes server truth match the optimistic UI. (`EDITORS` set already exists in that file.)

### D. 🟡 LOW — Content Review gate is UI-only; `Ready to Publish` settable directly (bypass)
- **File:** `app/api/scheduler/to-schedule/route.ts:17` (gate) + `app/api/marketing-hub/update/route.ts` (no transition guard)
- **Problem:** Any authenticated user can set `Ready to Publish` from My Day's status dropdown or the Master sheet, and the row then appears in the Scheduler — skipping Content Review. The gate is convention-only. (Internal tool, ~5 trusted users; still requires a human to schedule.)
- **DECISION NEEDED (Praveen):** Enforce server-side (in `update` route, only allow `→ Ready to Publish` when prior status is `Output - Ready`, i.e. the Content Review push path) — **or** accept the Master-sheet's admin flexibility as intended and leave it. Enforcing is stricter but changes admin-grid behaviour. Recommend a short chat before implementing.

### E. 🟡 LOW — orphaned dead code (Accept-&-Work capacity pipeline)
- **File:** `HopeMyDay.tsx` — `URGENT_TASK` (~291), `pipeline` state, `onAcceptNotif`/`acceptWork`/`askManyaToMove`/`sendToManya`/`manyaConfirmMove`/`addNotif`, `AcceptWorkModal`/`AskManyaModal`/`ManyaReschedule`, and the `NotificationStack` urgent/freed button branch.
- **Problem:** Replacing the mock notification effect (Round-1) orphaned the whole capacity-negotiation demo — the poll only emits `claim`/`message` notifs with no `task`, so the Accept-&-Work flow is now unreachable dead code.
- **DECISION NEEDED (Praveen):** Remove the dead pipeline (declutter) — **or** re-wire it later if the urgent-task escalation feature is wanted. Removal is a sizeable, careful edit; recommend deciding before doing it.

### (Uncertain) — Master-sheet `Ready to Publish` bypass
- Same root cause as **D** (Master sheet exposes `Ready to Publish` as an editable status). Folded into D's decision.

---

## Current state / git

- Round-1 fixes: **applied**, `npx tsc --noEmit` clean for touched files.
- Round-2 findings A–E: **not started.**
- Nothing committed or pushed. Branch in sync with `origin/feat/hope-ui-reskin` (this session's work is all uncommitted working-tree changes).
- No Netlify deploy.

## Resume checklist (next session)
1. Fix **A** (mh_attachments) — both routes.
2. Fix **B** (reconcile vs claimer) — remove `meNameRef`.
3. Fix **C** (unclaimed-video exclusion) — my-day route.
4. Decide **D** (gate enforcement) and **E** (dead code) with Praveen, then act.
5. `tsc` → re-sweep (same workflow) → repeat until clean.
6. When clean: write/refresh `CHANGELOG.md`, commit, `git push` to `feat/hope-ui-reskin`.
