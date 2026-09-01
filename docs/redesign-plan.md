# GooCampus Marketing OS — tab-by-tab redesign plan

**Goal:** by **Mon 20 Jul** the dashboard should feel *functional, curated, and premium* for a client demo — not "too many features."

## The workflow (per tab)
For each tab we run the same loop we did for **My Day**:
1. **Open it as a first-time user** — is it clear, or cluttered / jam-packed?
2. **Mock up a decluttered layout** — *structure first*, in the current app styling (purple/light). Served at `/mockups/<tab>.html` and shown in the user's real Chrome (full screen).
3. **Review with the user** → refine until the structure is approved.
4. **Build it for real** into the actual `/dashboard/<tab>` page.
5. **Skin it in the dashboard theme** (blue `#3a57e8`, Inter, real template CSS) as the last step.

> Decisions carry across tabs: merges from the readiness plan mean we redesign the **curated** nav (~5 groups), not all 30 tabs.

## Global rules (apply to every tab)
- One shared card + type scale; no arbitrary `text-[NNpx]`.
- Purge emoji-as-UI → clean icons.
- One `formatNumber()`.
- Real empty / "Sample data" states.
- Responsive **14"→55"**: cap the app ~2200px & centre on ultra-wide; `clamp()` type scaling.
- Purple reserved for the single primary action per zone.

## Tab order & status
| # | Tab (curated) | Status | Mockup |
|---|---|---|---|
| 1 | **My Day** (Daily Planner) | ✅ layout approved — pending build | `/mockups/my-day.html` |
| 2 | Overview | the dashboard theme V2 exists (``); needs rearrange (top posts first) | — |
| 3 | Marketing Hub (Workload/Master/Pipeline/Calendar) | to do | — |
| 4 | Scheduler (the one "create a post" surface) | to do | — |
| 5 | Publishing Calendar (or merge into MH calendar) | to do | — |
| 6 | Analytics — Instagram (Posts+Reels merged), Facebook, LinkedIn, YouTube | to do | — |
| 7 | Audience | to do | — |
| 8 | Ads + Competitors (Benchmark+Competitor Ads merged) | to do | — |
| 9 | Sales — Social Leads, Sales Hub, AI (Insights+Reports merged) | to do | — |
| 10 | System — Integrations / Tools (admin corner) | to do | — |

## My Day — approved layout (reference)
10 modules → 5 zones: slim header band (greeting + inline stats) · transient **handoff notification** strip · **Today's plan** hero · work row (tasks → auto-opened detail → Reminders) · **Team chat as a full-height column pinned right**. Pin board + standup notes dropped.

## Key parallel work (not a tab)
- **The make-or-break build:** `mh_posts` → Scheduler bridge ("Send to Scheduler" on a task) so create→assign→schedule→publish is one live chain. Publish engine = external n8n Native Scheduler (confirm it's running for Monday).

## Saved assets
- `public/mockups/my-day.html` — approved My Day layout mockup
- `public` + `` — the dashboard theme Overview (V2, standalone)
- Readiness plan artifact (demo plan) — see chat
