# Audit Log — `feat/hope-ui-reskin` session

## QA 2026-07-18 — Task-detail **Activity** log (mh_activity)

**Reported:** Activity only ever showed "created" — moving a task's date (drag) or editing its content recorded nothing. Confirmed: the DB trigger `mh_fn_log_activity` logged only `created` / `status_changed` / `owner_changed`, so reschedules and field/content edits were invisible.

**Fix (Supabase migration `mh_activity_log_reschedule_and_edits`):** extended the trigger — fires on every UPDATE to `mh_posts`, so it catches drag + inline edits + API writes — to also log:
`rescheduled` (publishing_date, DD Mon YYYY), `due_date_changed`, `renamed` (particulars), `priority_changed`, `type_changed`, `content_edited`/`content_removed`, `caption_edited`/`caption_removed`, `notes_edited`. Long-text edits log the *event* only (no giant before/after dump).

**Verified LIVE:** dragged "Booming careers" 11 Jul → 19 Jul → the task's Activity panel showed **"— rescheduled 11 Jul 2026 → 19 Jul 2026 · 18 Jul 01:39 pm"** (backend row confirmed). Restored the date + deleted the 2 test rows → activity back to just "created" (data pristine).

**Known limitation:** trigger-written events show actor "—" (a Postgres trigger has no session/user context). Attributing them to the editor needs the app to pass the user id into the trigger (session GUC) — noted, not done.

---

## QA 2026-07-18 — Marketing Hub (`marketing-hub/page.tsx` — Workload · Master · Pipeline · Calendar)

The marketing team's operating base. All 4 subtabs verified LIVE in Chrome (frontend) + cross-checked in Supabase (backend). 3 issues fixed; 1 data-hygiene item handed back.

| # | Issue | Sev | Fix | Verified |
|---|-------|-----|-----|----------|
| 1 | **Phantom status `"Content - In Progress"`** (doesn't exist in Supabase) orphaned 12 `Content - Approved` tasks → pipeline showed 172 not 184 | HIGH (wrong data) | Point 5 code sites + PIPELINE_STAGES to real `Content - Approved`; deleted 2 dead colour/pill map entries | Pipeline reconciles 57+12+11+2+102 = **184**, APPROVED=12, live ✓ (commit `3e8aa3a`) |
| 2 | **Redundant entry count** on calendar (hero stat + meta line) | LOW (repetitive) | Removed the duplicate meta count | Calendar shows count once ✓ |
| 3 | **Content Calendar off-brand** (no month toolbar, range-derived month) | MED (Hope UI) | Rebuilt CalendarView: `‹ › Today` toolbar, centred month title, `monthCursor` defaulting to current month, brand chips retained; MHCAL_CSS toolbar styles | Opens on July 2026 w/ toolbar; month nav + Today + brand filter all work live ✓ |
| 4 | **🔴 Calendar hid all upcoming content** — shared the retrospective fetch (`to=today`); 25 posts on Jul 19–31 invisible, future half of month empty. Surfaced by the live drag demo (dragged card vanished past today). | HIGH (data hidden) | `page.tsx`: when `tab==='calendar'`, fetch a wide window (−180d…+365d) instead of `range`. API already respects `to` (no server cap). | Count 184→270; Jul 19–31 populate; console clean ✓ |
| 5 | **🟠 Edits snapped back** — GET route cached 12h, writes didn't invalidate it, so drag/edit reverted on refresh until TTL. | MED (stale UI) | New `lib/mh-cache.ts` (cache Map + `bustMarketingHubCache`; a route.ts can't export helpers). `update`/`create`/`takeover` call the bust after a successful write. | Dragged 11→19 (moved+persisted, no snap-back) → 19→11 (restored); DB confirmed both ✓ |

**Backend cross-checks (Supabase `wlhbmzaernchwebapszq`):**
- `mh_posts` status distribution root-caused issue #1 (real statuses: Published/Scheduled, Content-Pending, Ready to Publish, Output-Ready, Content-Approved — no "In Progress").
- **New View CRUD round-trip:** created view via UI → row appeared in `mh_views` with EXACT captured config (`filter owner is manya`, `sorts publishingDate asc`, `hiddenCols [priority]`, `color status`, `rangeDays 90`, `created_by maheen`) → deleted via view menu → `count = 0`. Proves the app write path reaches the DB.

**Functions exercised live:** calendar month nav/Today/brand-filter/task-modal; Master team-views/date-frame(30→90d = 184→240)/Filter/Sort/Columns(hide Priority)/Colour(by Status)/New-View create+persist+delete; Workload Today-timeline + Tasks capacity cards; Pipeline stage click-to-filter (Approved→12 tasks). Console clean on all.

**Data-hygiene (handed back, NOT auto-fixed):** `"Test Task"` row (`id 8bac07e8…`, `airtable_record_id recUo3SPfzZ4HUJmI`) is Airtable-sourced junk in the pipeline — delete at Airtable source (Supabase-only delete would re-sync). Not a code issue.

**Not re-mutated this pass:** drag-to-reschedule + inline edits use the same proven `saveField → /api/marketing-hub/update` path (verified prior session); skipped re-mutating live publishing dates. Offer standing to do a live drag demo.

---

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

## 2026-07-21 — Part 1 (API/Integration matrix) diagnostics pass

- **Perplexity — Integrations shows "error / not configured"** · sev: medium (misleading, not broken)
  - Repro: `/api/integrations/status` → perplexity `configured:false, status:error`, yet AI features (Post Planner, Ads analyst) work.
  - Cause: `app/api/integrations/status/route.ts:172` read only `PERPLEXITY_API_KEY`, but the project stores the key as `PLANNER_SEARCH_KEY` (lib/ai.ts already reads either) → status diverged from reality.
  - Fix: status check now reads `PERPLEXITY_API_KEY || PLANNER_SEARCH_KEY`; also added explicit `PERPLEXITY_API_KEY` to local `.env.local` from the uploaded credentials file. → green.
- **Serper — Integrations shows "warn / no key"** · sev: medium (Content Radar lanes empty)
  - Cause: `SERPER_API_KEY` not present in local `.env.local`.
  - Fix: added `SERPER_API_KEY` from the uploaded credentials file. → configured.
- Reddit thread-reader: `warn` (no app) — EXPECTED/optional, snippet fallback works. Not a bug; left as-is.

## 2026-07-21 — Part 2 (per-tab click-test) diagnostics pass

### Section 1 — Overview & Content
- **Overview** ✅ — all KPIs real (Followers 31,128 / Reach 17,80,110 / Eng 1,06,806 / Profile Visits 37,382). "Who you reached · **1 reached**" is only the pre-load skeleton state — resolves to **31K** (F 41 / M 41 / Undisclosed 18) once data lands. NOT a bug. Console clean across 2 loads; no React key warning at the flagged line (file shifted; line 259 is now aggregation code).
- **Marketing Hub** ✅ — Workload (real per-person plans/capacity) + Master sheet (162 tasks, views rail with live counts, Filter/Sort/Columns/Colour, period toggle). Live·fetched, token never-expires.
- **My Day** ✅ — real per-person tasks (Nandu), timeline, In-progress/Feedback/Output tabs, task detail + start-timer gate, content brief/creatives. Producer correctly sees only Content-Approved; countdown hidden until started. Permission→button gating = admin bypass (all controls visible), verified earlier.
- **Content Radar** ✅ — real brand mentions (10, Reddit, w/ sentiment), rising searches, source chips with live counts. **Reported "popup not opening" bug does NOT reproduce**: both "Manage alerts" (Track topics) and the article-reader modals open correctly.

### Section 2 — Social Media
- **Publishing Calendar** 🟡 — Sample-data toggle defaults **OFF** (checklist feared ON — good). Real scheduled post ("9a Uni Prog - Carousel") lands on the correct date (Jul 21). **Minor UX note (open, non-blocking):** grid defaults to *next* month (August, empty) on load instead of the current month; "Today" corrects it. Decide before demo.
- **Content Review** 🟢 FIXED — **Round-2 Fix A (content-review route):** `hasCreative` at `app/api/content-review/route.ts:48` counted only `media_urls` + `output_link`, never `mh_attachments`, so a post whose only creative was an uploaded attachment wrongly read "no creative" and had its "Push to Schedule" disabled. Fix: join `mh_attachments` (kind != 'reference') for the queued post ids; `hasCreative` and `thumbnailUrl` now include creative attachments. Typecheck clean; queue renders (15), enabled/disabled Push states correct.
  - NOTE: AUDIT_LOG Round-2 "Fix A — both routes" — this covers the content-review route. Re-check the second route (Scheduler creative-presence) during the Scheduler tab.
- **Scheduler** 🟢 FIXED — **Round-2 Fix A (second route):** `app/api/scheduler/to-schedule/route.ts:49` filtered the "Ready to schedule" queue to `media_urls || output_link` only, so a post that cleared Content Review with an attachment-only creative would silently disappear from the Scheduler. Fix: same `mh_attachments` (kind != 'reference') join; attachment-backed posts now pass the filter and their public URLs are merged into `mediaUrls` (so downstream publish's `media_urls[0]` works). Typecheck clean; queue renders (25), post detail + IG feed preview + upload all wired. Did NOT trigger publish-now. **→ Round-2 Fix A now complete on BOTH routes.**
- **Post Planner** ✅ — "Ranked with live web search · Perplexity"; ordering is genuinely timely (cites NEET 2026 results declared Jul 16–20), numbered cards on real dates with trend tags, Apply plan / Re-plan / drag present. Degrades to plain order without key (unchanged).

**Section 2 net: 2 real code fixes (Round-2 Fix A, both routes). Publishing Calendar next-month-default = open UX decision.**

### Section 3 — Analytics · Instagram
- **Posts** ✅ — real IG data (63 posts, Avg Reach 2,238, Eng 5.36%, Save 2.08%, Share 1.66%), account switcher, Top-performers Today/Week/Month, working thumbnails, type filter + sort + period toggle. Live·fetched.
- **Reels** ✅ — 14 reels (Avg Views 5,206, Watch 7s, Reach 3,943), Top performers + full grid with real video thumbnails. Not empty.
- **Stories** ✅ — checklist's "8-card demo grid + demo KPIs" trap is RESOLVED. Now 3 real live stories (per-story views/reach/replies/follows) + "Historical stories (from Supabase — persists forever) · 30 snapshotted". `/api/stories` + `/api/stories/historical` both 200. Snapshot cron working. No demo data.

### Section 4 — Analytics · LinkedIn / YouTube / Facebook
- **LinkedIn** 🟡 — main tab honestly badged "Demo data"; World tab attempts live but badges "Live call failed · showing demo" and falls back transparently. Honest degradation, NOT a silent fake. Root cause = LinkedIn API access gating (credential/partnership), not a code bug. Flag for Praveen; nothing to fix in code.
- **YouTube** ✅ — the amber "Demo data" badge is only the pre-load placeholder; resolves to Live·fetched with real data (Subs 22.9K +211, Views 19.8K, Watch 940h, 25 videos, retention, best-times, views-over-time). Channels GooCampus + 12thplus. Not picsum/demo.
- **Facebook** ✅ — Live·fetched; Followers 1.2K + Page Likes 1.2K live from Meta. Engagement (57.7K) and Page Views (1.9K) NOW POPULATE (checklist feared "—"). Real country audience breakdown with honest "Meta removed city/age/gender" caveat. Recent posts real dates+captions.

### Section 5 — Analytics · Website
- **Google Analytics (GA4)** ✅ — Live·Google Analytics; realtime strip (11 active, India 10/Kuwait 1), Users 1.4K / Sessions 1.4K / Page Views 2.2K / Engagement 37%, users-over-time chart, conversions & events, Analyze-with-AI. Range toggle live.
- **Clarity** ✅ — verified live earlier this session; history routes code-reviewed (serves stored days >3, honest "Building history" badge).
- **Bing** ✅ — Live·fetched; honest empty state ("connected and correct — numbers appear once ranking in Bing"), Clicks/Impr 0, Avg Position "—". Snapshot-history working: "45 days saved / 29 days of stored history" badges.

### Section 6 — Audience / Ads / Sales
- **Ads** ⚠️ (transient, dev-only) — first cold navigation to `/ads` showed **"Error: Unexpected token '<', "<!DOCTYPE"…"** (HTTP 500 with an HTML body). Root cause: Next.js dev on-demand compilation of the `/api/ads` route (fans out to 6 Meta calls via the heavy `lib/meta-ads` deps) failed/timed out on the very first hit; an authenticated re-fetch returns **200 + valid JSON** (spend ₹1,58,128, 3,708 leads) and the page renders perfectly on reload (AI Analyst summary + accordion recs + diagnostic chips + budget bars all intact). NOT a persistent code bug — production build precompiles routes so the cold 500 won't recur.
  - Secondary nit: `useApi`'s error path renders the raw JSON-parse message and doesn't auto-retry a transient 500. Low severity; recommend (a) confirm on the Netlify preview/prod build that `/ads` loads first-try, and optionally (b) make `useApi` show a friendly "Couldn't load — Retry" instead of the raw parse error. Deferred (shared hook; no risky change pre-demo without approval).
- **Audience / All platforms** ✅ — IG live (@goocampus 31,129 followers, gender 41/41/17.9, full age×gender pyramid, 10 countries/top India/Chennai, map). Platform sub-tabs present.
- **Competitor Ads** ✅ — FB Ad Library search UI renders, honest empty state, "Sync past scans (free)" present. Live Apify search not triggered (credit spend).
- **Benchmark** ✅ — competitors.json loads; @mokshacademy pulls real IG data (followers/posts/eng 14.29%/top-posts). Other handles honestly show per-account ERROR (private/renamed/personal). DEMO NOTE: most tracked handles are private/invalid → tab looks sparse; refresh the tracked-handle list with valid public Business/Creator accounts for a richer demo.
- **Social Leads** ✅ — 3-tab redesign live: DM Leads 257 / Meta Ads 1,590 / Samvaya 1,208. DM tab: Contact-Shared 257, Closed-Won 8 (3.1%), Reply 89%, keyword funnel (AMC/ALS), AI Summary panel (77 prospect comments), full status funnel + real lead table. On-brand.
- **Sales Hub** ✅ — redesign live (874 leads/31d): source-first, speed-to-lead SLA, untouched 260, counsellor table (New-Leads/Maheen holding pool + real counsellors w/ first-touch colour + status-mix + closings), conversion-by-source. Counsellor DRILL-DOWN verified: modal opens with in-modal status filters, sort, Copy CSV, real lead table (mobiles, sources, created dates, days-idle, Open).

**Section 6 net: Ads transient dev-500 (works on reload, prod precompiled); no persistent code bugs. Benchmark handle-list = demo-quality note.**

### Section 7 — AI
- **AI Insights** ✅ — "Generate cross-channel insights" produces a genuinely prescriptive, data-grounded Perplexity plan: names the bottleneck (63% bounce), a prioritized "one move that matters most" (landing-page audit), per-channel how-to grounded in live numbers (carousel reach 6,237 vs Reel 2,219; CTR 3.86% but 2.0% lead rate; Paid Social 83.3% traffic) with citations + Regenerate. Footer cites Perplexity. VALIDATES the Part 1 Perplexity key fix.
- **AI Reports** ✅ — Monthly report renders fully; exec summary integrates Sales Hub data (874 leads, Jeswin Shaju 5 contracts, 67h→<24h first-response), highlight cards w/ explanations, trend chart, Weekly/Monthly/Quarterly tabs + Export/Print. Hard Perplexity dependency satisfied.

### Section 8 — System
- **Integrations** ✅ — 11 integrations, 10 healthy / 1 need-attention (optional Reddit thread-reader). Perplexity now Healthy (AI·sonar·reachable) — Part 1 fix holds. Meta rate-limit 15%, all token cards green.
- **Team** ✅ — real ind_users (Maheen admin + Nikhil/Praveen/Manya/Nandu) with editable role/email, Admin/Active toggles, per-person Access permission editor (feeds My Day gating), Set-password, +Add member. CRUD present.
- **Tools** ✅ — static "20 tools across 9 categories" reference list; renders on-brand.

## Part 2 — SUMMARY (all 25 tabs)
**Code bugs found + FIXED (2):** Round-2 Fix A, BOTH routes — Content Review (`app/api/content-review/route.ts`) and Scheduler (`app/api/scheduler/to-schedule/route.ts`) were blind to `mh_attachments`, so an attachment-only creative read "no creative" and the post would vanish from the Scheduler. Both now join creative attachments (kind != 'reference'). Typecheck clean.
**Transient (1):** Ads `/api/ads` first-hit dev-compile 500 → renders on reload; production precompiles so won't recur. Optional: friendlier `useApi` error + auto-retry.
**Open non-blocking notes (3):** (a) Publishing Calendar opens on next month (empty) instead of current — "Today" fixes; (b) LinkedIn World live-call failing → honestly shows demo (LinkedIn API access gating, not code); (c) Benchmark tracked-handle list mostly private/invalid → sparse; refresh with valid public Business/Creator handles.
**Everything else:** healthy, real data, honest labeling. Perplexity fix (Part 1) validated across AI Insights, AI Reports, Post Planner, Ads analyst, Integrations. Stories demo-grid trap RESOLVED (now live + Supabase history). Facebook engagement/page-views now populate. Content Radar popups open. "1 reached"/"Demo data" badges are pre-load placeholders only.

## Part 5 — CROSS-CUTTING diagnostics pass

- **Auth & roles** ✅ (code-verified `middleware.ts`) — unauth → `/login` (pages) / 401 (API); non-admin on `/dashboard` → `/me`; admin on `/me` → `/dashboard/hope-preview`; any non-`hope-preview` `/dashboard` path → `/dashboard/hope-preview` (V1 never leaks).
- **Navigation** ✅ — every sidebar link visited in Part 2 stayed under `/dashboard/hope-preview/*`; no 404 / V1 leak.
- **No dev chrome** ✅ — no "Hope UI / V2 / preview" labels on any of the 25 tabs.
- **Console/network** ✅ — Overview clean; across Part 2 only transient 503→200 retries seen (radar reddit-thread, scheduler suggest-time) + the logged Ads cold-compile 500. No persistent red errors / 4xx-5xx.
- **Token expiry** (note) — Meta: never-expires; LinkedIn member token ~60d; YouTube OAuth auto-refresh (~60m access). Nothing silently expires over the break.
- **Dates** ✅ — all timestamps render correctly (2026, IST); no Invalid Date / 1970 / placeholder dates seen.

### Part 5 / Part 4 fix — header notification bell
- **Overview header bell + mail were STATIC/dead** (`HopeOverview.tsx:305` rendered bare `IconBell` + `IconMail`, no onClick) while the fully-wired `components/HubNotificationBell.tsx` (polls `/api/my-day/notifications`, badge + dropdown) was imported nowhere (dead code). FIXED: Overview now renders `HubNotificationBell` (verified: opens "Notifications · You're all caught up" dropdown); dead mail icon removed. Commit 25acf1f.

## Parts 3 & 4 — status (covered during Parts 2 & 5)
- **Part 3 (demo/placeholder):** Stories demo-grid RESOLVED (live + Supabase history); Overview derived engagement/profile-visits now labeled **EST**; LinkedIn main honestly badged "Demo data"; Content Radar connect-chips are honest placeholders (by design); Publishing Calendar demo toggle defaults OFF + opens on current month; Tools static by design. All either real or clearly labeled.
- **Part 4 (buttons wired):** verified live in Part 2 — Content Radar article-reader + Manage-alerts modals open; account switcher + date range re-fetch; Analyze-with-AI / Generate-insights call Perplexity and render; Scheduler set-time/suggest/enqueue/reschedule/cancel present; Marketing Hub add-column/save-view/detail-modal; My Day capsules; **header bell now wired (above).** No dead clickable buttons found beyond the by-design Content Radar connect placeholders.

## Hope UI theme-consistency audit (code-level, all tabs)

Audited every hope-preview tab + shared component against the Hope UI tokens.
- **Colours** ✅ — on-token everywhere. Overview uses JS constants (primary #3A57E8, ink #232D42, muted #8A92A6, white cards, #F5F6FA canvas) that match the tokens; `.hope-scope` also auto-maps the legacy purple #6D5AE6 → #3A57E8. No off-brand hardcoded colours found.
- **Shadows** ✅ — `.hope-scope` strips Tailwind `shadow-*` classes; Overview's `SHADOW` constant = "none". Cards are flat. (Two brand-tinted glows remain on the Overview hero band + a rank badge — intentional accents, not the grey V1 card-shadow anti-pattern.)
- **Font weight** 🟢 FIXED — Overview had 30× inline `fontWeight: 700` + 1× `800` (bypassing `.hope-scope`'s `.font-bold`→600 cap), rendering HEAVIER than every other tab (which top out at 600). No other file used 700. Normalised all to 600. Now uniform.
- **Font family** 🟢 FIXED — only 3 pages (Overview, Calendar, My Day) loaded Inter via `next/font`; the root layout set no font, so the other ~22 tabs fell back to the system font (SF Pro on macOS). Loaded **Inter globally on `<html>`** in `app/layout.tsx`. Verified: `document.body` computes Inter on both the Overview and a previously-system-font tab (Content Review). Typography now identical across all tabs.
- **Spelling** ✅ — codebase-wide typo scan clean; no user-facing misspellings (only British spellings + `cancelled` in comments/vars).

## Account page + password-reset OTP (Gmail SMTP) — setup note

- **Feature:** `/dashboard/hope-preview/account` (reached from the Overview profile menu) shows the logged-in user's name/email/username/role and lets them change their own password via an emailed 6-digit OTP. Routes: `POST /api/account/otp` (send code) + `POST /api/account/change-password` (verify + update). Email: `lib/email.ts` (nodemailer + Gmail SMTP). OTP stored hashed (scrypt) in `discover_cache`, 10-min expiry, burned on use.
- **Env vars required (NOT in git — set per machine + on Netlify):**
  - `GMAIL_USER=praveen@goocampus.in`  ← must match the Google account the app password belongs to (the app password was generated under praveen@, NOT info@ — using info@ gives Gmail 535 "Username and Password not accepted").
  - `GMAIL_APP_PASSWORD=<16-char Google app password>`  (Google Account → Security → 2-Step Verification → App passwords). Optional: `GMAIL_FROM_NAME`.
  - Verified working 2026-07-21: SMTP auth + delivery confirmed (test email received at info@goocampus.in).
- **Also:** each user needs a real `email` in `ind_users` to receive a code (set on the Team page). Maheen's email was set to `info@goocampus.in` for the test.
- **Windows laptop / Netlify TODO:** add `GMAIL_USER` + `GMAIL_APP_PASSWORD` to that machine's `.env.local` and to Netlify env vars (part of go-live) or reset won't send.
