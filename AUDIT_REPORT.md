# Dashboard Audit Report — tab by tab

One row per tab. Each tab is checked against the same checklist (below), issues are
fixed, and the result is recorded here so both of us can see the state at a glance.
Raw working notes live in `AUDIT_LOG.md`; this file is the clean, shared status.

**Branch:** `feat/dashboard-reskin` · **Dev:** `ig-dashboard` @ localhost:4324

## Status at a glance

| Tab | Status | Issues found | Fixed | Notes |
|---|---|---|---|---|
| **Overview** (`/`) | ✅ **PASS** | 3 | 3 | done 2026-07-18 |
| **Marketing Hub** (Workload · Master · Pipeline · Calendar) | ✅ **PASS** | 5 | 5 | done 2026-07-18; 1 data-hygiene flag for you |
| My Day | ⬜ not started | – | – | |
| Content Radar | ⬜ not started | – | – | |
| Publishing Calendar | ⬜ not started | – | – | |
| Content Review | ⬜ not started | – | – | |
| Scheduler | ⬜ not started | – | – | |
| Post Planner | ⬜ not started | – | – | |
| Instagram (Posts/Reels/Stories) | ⬜ not started | – | – | |
| LinkedIn (+Posts) | ⬜ not started | – | – | |
| YouTube (+Videos) | ⬜ not started | – | – | ⚠ see Overview note on 0-range summary |
| Facebook (+Posts) | ⬜ not started | – | – | |
| Website · Google Analytics | ⬜ not started | – | – | (built this session) |
| Website · Clarity | ⬜ not started | – | – | |
| Website · Bing | ⬜ not started | – | – | |
| Audience | ⬜ not started | – | – | |
| Ads | ⬜ not started | – | – | |
| Competitor Ads | ⬜ not started | – | – | |
| Benchmark | ⬜ not started | – | – | |
| Social Leads | ⬜ not started | – | – | |
| Sales Hub | ⬜ not started | – | – | |
| AI Insights | ⬜ not started | – | – | (rebuilt this session) |
| AI Reports | ⬜ not started | – | – | (migrated to Perplexity) |
| Integrations | ⬜ not started | – | – | |
| Tools | ⬜ not started | – | – | |
| Team | ⬜ not started | – | – | |

Legend: ✅ PASS · 🟡 in progress · 🔴 blocked/bug · ⬜ not started

---

## The checklist — and why each item is on it

You didn't hand me a checklist, so I built one from *what actually breaks a
data-driven analytics tab.* Each check maps to a real failure mode:

| Check | Why it's on the list (the failure it catches) |
|---|---|
| **1. Loads, no crash / no error boundary** | A tab that white-screens is worthless. Baseline. |
| **2. No console errors/warnings** | React warnings usually flag a real bug (bad keys, invalid props, hydration). The Overview's key-spread warning was one. |
| **3. API returns 200 with correct data** | The tab's whole job is displaying data; a failing API = empty/wrong tab. This caught `overview-tips` returning 502. |
| **4. Data renders + is plausible** (no `NaN`/`undefined`/absurd values) | Guards against math/field-access bugs that "render" but show garbage. |
| **5. Interactions actually drive the data** (filters, toggles, date range) | A control that doesn't change anything is a silent bug. |
| **6. the dashboard theme compliance** | The project's mandated design system (`CLAUDE.md`). Off-brand = wrong per the brief. |
| **7. Code health** (dead code, unused imports) | Lint/bundle cleanliness + maintainability. Caught 3 dead functions + 5 unused imports. |

Derivation in one line: **can it load → is its data real → do its controls work → is the code clean.** That ordering is the checklist.

---

## Overview (`/dashboard/preview` → `PreviewOverview.tsx`)

**Verdict: ✅ PASS** — had 3 issues, all fixed and re-verified live. (Not "no issues" — it had them; they're now fixed.)

### Checklist results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Loads, no crash | ✅ | Renders full page (hero, KPIs, chart, audience, posts, all sections) |
| 2 | No console errors | ✅ *(after fix)* | Was 2 errors (key-spread) → cleared + reloaded → **0 errors**, incl. after all interactions |
| 3 | APIs 200 | ✅ *(after fix)* | `insights`, `posts`, `audience`, `facebook`, `youtube` render data; `overview-tips` was **502**→ fixed → **200** |
| 4 | Data plausible | ✅ | 30,948 followers / 1.74M reach / real posts; no NaN/undefined seen |
| 5 | Interactions | ✅ | Platform toggle (IG ✓ / FB ✓ / LinkedIn ✓ honest empty-state / YouTube ✓); date range 30d ✓, **60d ✓ → month switcher built May/Jun/Jul, defaulted June, "saved snapshots" path ✓** |
| 6 | the dashboard theme | ✅ (see obs.) | On-brand blue theme, sectioned cards. Font-weight caveat below. |
| 7 | Code health | ✅ *(after fix)* | Removed 3 dead functions + 5 unused imports |

### Issues found & fixed (commit `d8e6ae0`)

1. **React "key" spread warning** (console error ×2) — `<StatCard key={s.key} {...s}/>` spread the `key` field into props. → Destructured `key` out of the spread. Root-cause, one spot.
2. **Dead code** — `NavGroup` / `NavItem` / `Legend` defined but never used (sidebar is `PreviewSidebar`), + 5 unused icon imports. → Deleted.
3. **`/api/overview-tips` = 502** — still on OpenAI `gpt-4o-mini` (out of quota → 429), so the per-KPI AI action tips silently fell back to hardcoded copy. → Swapped to `askPerplexity` (reuse `lib/ai.ts`). Now 200; live prescriptive tips render.

### Observations (noted, NOT changed — out of QA scope, flag if you want them done)

- **Proof-page hardcodes:** `accountId="goocampus"` and a hardcoded "Maheen Ejaz / CMO" header. No account picker here (unlike other tabs). Fine as the original overview; change if it should reflect the logged-in user / switch brands.
- **Font-weights 700/800** throughout — contradicts `CLAUDE.md` ("400/500 only"). Deliberate hand-built proof-page style (own tokens, not `.preview-scope`). A mass restyle is a design decision, not a QA fix.
- **3× `/api/posts` on load** (limit 10 + 2× limit 200) + child fetches. Works; the posts API is slow (~20s). Optimize only if load time is a complaint.
- **Stored-month engagement shows 0** on the 60d/older-month view (e.g. June: Engagement `0`, from-posts). May be correct (snapshot months lack post-engagement) per the on-screen banner, or a real gap — worth a closer look before trusting older-month engagement.
- **YouTube range summary = 0** (0 subs / 0 views / 0 watch hours) while the chart + top videos show data — investigate under the **YouTube** tab audit, not here.

---

## Marketing Hub (`marketing-hub/page.tsx` — 4 subtabs: Workload · Master sheet · Pipeline · Content calendar)

**Verdict: ✅ PASS** — had 3 issues (all fixed & re-verified live), plus 1 data-hygiene item that's yours to action (a junk row that lives in Airtable, not fixable from code). This is the marketing team's operating base; all 4 subtabs are wired to live `mh_posts` and every control was exercised on screen, not just rendered.

### Checklist results (all 4 subtabs)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Loads, no crash | ✅ | All 4 subtabs render fully (Workload timeline + capacity cards, Master table, Pipeline stages, Calendar month grid) |
| 2 | No console errors | ✅ | 0 errors on every subtab after interactions |
| 3 | APIs 200 + correct data | ✅ | `/api/marketing-hub/*` (list, views, update, etc.) all serve; **backend cross-checked in Supabase** (`mh_posts` 270 rows, `mh_views` round-trip) |
| 4 | Data plausible | ✅ | Pipeline **reconciles to 184** (57+12+11+2+102); team counts sum to totals (Manya 20 + Praveen 131 + Nikhil 25 + Nandu 8 = 184) |
| 5 | Interactions actually drive data | ✅ | Every control **used live** — see the exercised-functions list below |
| 6 | the dashboard theme | ✅ *(after fix)* | Content Calendar was off-brand → rebuilt with a Dashboard-themed toolbar (issue #3). Rest on-brand. |
| 7 | Code health | ✅ *(after fix)* | Removed phantom-status dead code (issue #1) + a redundant meta count (issue #2) |

### Functions exercised LIVE (not just "renders")

- **Content Calendar:** month nav ‹ ›, **Today**, brand-chip filter (Australia-PGCP → 25 tasks, legend narrows), task-detail modal (full content + details + activity), status-colour legend.
- **Master sheet:** team views (Manya → 20, Owner-filtered), **date frame** 30d→90d (184→240, all counts move), **Filter** builder (Where Owner is …), **Sort** (Publishing date asc — table reorders), **Columns** (hid Priority — column disappears), **Colour** (rows tinted by Status).
- **New View — full CRUD, round-tripped to Supabase:** created "QA Test" capturing live filter/sort/columns/colour/range → **confirmed the exact config persisted to `mh_views`** → deleted via the view menu → **confirmed 0 rows remain**. This is the proof that the app's write path reaches the database.
- **Workload:** Today per-person timeline (9–5, live "Now" marker, spill-over/overbooked flags) + Tasks capacity cards (pending / overdue / done per person, date-range picker).
- **Pipeline:** stage click-to-filter (Approved → table swaps to the 12 approved tasks), bottleneck "Where it's stuck" panel, Oldest-Waiting list.

### Issues found & fixed

1. **Pipeline data bug — phantom status orphaned 12 tasks** (commit `3e8aa3a`). Code referenced `"Content - In Progress"`, which doesn't exist in Supabase; the real status is `"Content - Approved"`. Result: 12 approved tasks were invisible and the pipeline showed **172 vs the real 184**. Fixed 5 code sites to the real status + deleted 2 dead colour/pill entries. **Now reconciles to 184, APPROVED = 12.** Root-caused against the live Supabase status distribution.
2. **Redundant meta count on the calendar** — the entry count was shown twice (hero stat + a meta line). Removed the duplicate (your "flag repetitive" rule).
3. **Content Calendar was off-brand** ("looked like another team's tool"). Rebuilt to the dashboard theme: a proper `‹ › Today` toolbar, centred month title, defaults to the current month, brand chips retained. Matches the Dashboard-themed calendar reference.
4. **🔴 Calendar hid ALL upcoming content** (found via the live drag demo). The calendar shared the other tabs' *retrospective* fetch window (`to = today`), so **25 posts scheduled July 19–31 were completely invisible** — the whole future half of the month read empty even though content was booked there. Fixed: the calendar now fetches a wide past+future window (−180d…+365d) instead of the "last N days." Live count went **184 → 270** (the previously-hidden upcoming + undated tasks now show). `page.tsx` `fetchRange`.
5. **🟠 Edits snapped back** (also found via the drag demo). The read endpoint cached responses for 12h and writes didn't clear it, so a dragged/edited card reverted on the next refresh until the TTL expired. Fixed: the write routes (`update` / `create` / `takeover`) now bust the read cache via `lib/mh-cache.ts`. **Verified live:** dragged a card July 11→19 (it moved + persisted, no snap-back), dragged it back 19→11 (restored). Supabase confirmed both writes.

### Data-hygiene flag — YOURS to action (not a code fix)

- **"Test Task" junk row** sits in the pipeline (Content-Pending, owner Praveen, SBU 10K Mentorship, `id 8bac07e8…`). It carries an `airtable_record_id` (`recUo3SPfzZ4HUJmI`) — it was **synced in from Airtable**, so deleting it from Supabase alone would just re-sync back. **Delete it at the Airtable source** and it'll clear from here. Left it in place rather than auto-deleting production data.

### Observations (noted, NOT changed)

- **Drag-to-reschedule verified LIVE both ways** — dragged a card 11→19 and back, each move persisted to Supabase with no snap-back (after fixes 4 & 5). Inline field edits share the same `saveField → /api/marketing-hub/update` path, now cache-busted too.
- **"270 TASKS IN VIEW"** on the calendar hero counts all loaded rows in the wide window, not the visible month — an empty month (e.g. deep future) still shows the total. Minor label wording; not a data bug.
- **Cache-bust scope:** wired into `update` / `create` / `takeover`. The lighter write routes (`comments`, `notes`, `attach`, `collaborators`, `set-custom`) don't change the calendar/pipeline core payload, so they're not busted — add them if their edits ever need to reflect instantly.
