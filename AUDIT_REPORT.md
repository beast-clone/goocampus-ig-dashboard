# Dashboard Audit Report — tab by tab

One row per tab. Each tab is checked against the same checklist (below), issues are
fixed, and the result is recorded here so both of us can see the state at a glance.
Raw working notes live in `AUDIT_LOG.md`; this file is the clean, shared status.

**Branch:** `feat/hope-ui-reskin` · **Dev:** `ig-dashboard` @ localhost:4324

## Status at a glance

| Tab | Status | Issues found | Fixed | Notes |
|---|---|---|---|---|
| **Overview** (`/`) | ✅ **PASS** | 3 | 3 | done 2026-07-18 |
| Marketing Hub | ⬜ not started | – | – | |
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
| **6. Hope UI compliance** | The project's mandated design system (`CLAUDE.md`). Off-brand = wrong per the brief. |
| **7. Code health** (dead code, unused imports) | Lint/bundle cleanliness + maintainability. Caught 3 dead functions + 5 unused imports. |

Derivation in one line: **can it load → is its data real → do its controls work → is the code clean.** That ordering is the checklist.

---

## Overview (`/dashboard/hope-preview` → `HopeOverview.tsx`)

**Verdict: ✅ PASS** — had 3 issues, all fixed and re-verified live. (Not "no issues" — it had them; they're now fixed.)

### Checklist results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Loads, no crash | ✅ | Renders full page (hero, KPIs, chart, audience, posts, all sections) |
| 2 | No console errors | ✅ *(after fix)* | Was 2 errors (key-spread) → cleared + reloaded → **0 errors**, incl. after all interactions |
| 3 | APIs 200 | ✅ *(after fix)* | `insights`, `posts`, `audience`, `facebook`, `youtube` render data; `overview-tips` was **502**→ fixed → **200** |
| 4 | Data plausible | ✅ | 30,948 followers / 1.74M reach / real posts; no NaN/undefined seen |
| 5 | Interactions | ✅ | Platform toggle (IG ✓ / FB ✓ / LinkedIn ✓ honest empty-state / YouTube ✓); date range 30d ✓, **60d ✓ → month switcher built May/Jun/Jul, defaulted June, "saved snapshots" path ✓** |
| 6 | Hope UI | ✅ (see obs.) | On-brand blue theme, sectioned cards. Font-weight caveat below. |
| 7 | Code health | ✅ *(after fix)* | Removed 3 dead functions + 5 unused imports |

### Issues found & fixed (commit `d8e6ae0`)

1. **React "key" spread warning** (console error ×2) — `<StatCard key={s.key} {...s}/>` spread the `key` field into props. → Destructured `key` out of the spread. Root-cause, one spot.
2. **Dead code** — `NavGroup` / `NavItem` / `Legend` defined but never used (sidebar is `HopeSidebar`), + 5 unused icon imports. → Deleted.
3. **`/api/overview-tips` = 502** — still on OpenAI `gpt-4o-mini` (out of quota → 429), so the per-KPI AI action tips silently fell back to hardcoded copy. → Swapped to `askPerplexity` (reuse `lib/ai.ts`). Now 200; live prescriptive tips render.

### Observations (noted, NOT changed — out of QA scope, flag if you want them done)

- **Proof-page hardcodes:** `accountId="goocampus"` and a hardcoded "Maheen Ejaz / CMO" header. No account picker here (unlike other tabs). Fine as the original overview; change if it should reflect the logged-in user / switch brands.
- **Font-weights 700/800** throughout — contradicts `CLAUDE.md` ("400/500 only"). Deliberate hand-built proof-page style (own tokens, not `.hope-scope`). A mass restyle is a design decision, not a QA fix.
- **3× `/api/posts` on load** (limit 10 + 2× limit 200) + child fetches. Works; the posts API is slow (~20s). Optimize only if load time is a complaint.
- **Stored-month engagement shows 0** on the 60d/older-month view (e.g. June: Engagement `0`, from-posts). May be correct (snapshot months lack post-engagement) per the on-screen banner, or a real gap — worth a closer look before trusting older-month engagement.
- **YouTube range summary = 0** (0 subs / 0 views / 0 watch hours) while the chart + top videos show data — investigate under the **YouTube** tab audit, not here.
