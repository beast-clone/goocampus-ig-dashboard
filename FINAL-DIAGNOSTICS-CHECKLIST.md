# GooCampus Dashboard — Final Diagnostics Checklist

**Purpose:** the one-pass, tab-by-tab diagnostic to run before the day off. For **every**
tab confirm three things:

1. **🔌 API connected** — the underlying route returns **200** (not 4xx/5xx / not a "key missing" error).
2. **📊 Real data + right dates** — real values render (not demo/placeholder), numbers are plausible
   (no `NaN`/`undefined`/absurd), and **dates are correct** (no stale/placeholder/wrong-year dates).
3. **🔘 Functions wired** — every button, filter, account switcher, date range, sub-tab, modal and
   action actually *does something* (no dead buttons).

**Legend:** ✅ real/live · 🟡 real-with-caveat · 🟠 demo/placeholder data · ⚙️ needs an env key to go live · ❓ verify
**Companion:** flow-level "how to click it" detail lives in `DEMO-TEST-PLAN.md`; this file is the
connection/real-data/dead-button audit. Test on **`feat/dashboard-reskin`** (localhost `.env.local`).

> How to run: open each tab with DevTools open. Watch Network for the tab's API call (200 + a real
> JSON body), watch Console for red errors, then click **every** control once. Mark each row.

---

## PART 1 — API / INTEGRATION CONNECTION MATRIX  *(do this first — it explains most tab states)*

The **Integrations** tab (`/integrations`, API `/api/integrations/status` + `/api/token-status`) is the
source of truth for token health. Confirm each provider below is **configured + OK** there, then the
dependent tabs will have real data.

| Provider | Env key(s) | Powers these tabs | Connected? | Real data? | Notes |
|---|---|---|---|---|---|
| **Meta / Instagram** | IG system-user token, IG account ids | Overview, Posts, Reels, Stories, Audience(IG) | ❓ | ❓ | long-lived system-user token; check expiry |
| **Meta / Facebook** | FB page token | Facebook (+Posts), Audience(FB) | ❓ | 🟡 | token lacks `read_insights` → engagement/page-views show "—" (expected) |
| **Meta Ads** | Meta ad-account id + token | Ads | ⚙️ | ❓ | 400 if unset |
| **Apify** | `APIFY_API_TOKEN` | Competitor Ads | ⚙️ | ❓ | 400 if unset; cache-first |
| **LinkedIn** | World Community-Mgmt token | LinkedIn (World live) | ❓ | 🟠 | **main GooCampus = demo**; only World is live; per-post table demo |
| **YouTube** | OAuth + 3 channel ids | YouTube (+Videos/Shorts) | ❓ | ✅ | 3 channels (GooCampus/12thplus/Study Abroad); demo badge = env dropped |
| **GA4** | GA4 service key | Website → Google Analytics | ⚙️ | ❓ | 503 if key unset |
| **Clarity** | Clarity token | Website → Clarity | ⚙️ | ❓ | 503 if unset; **capped 10 calls/day** |
| **Bing** | Bing Webmaster key | Website → Bing | ⚙️ | ❓ | 503 if unset |
| **Perplexity** ⚠️ | `PERPLEXITY_API_KEY` | AI Insights, AI Reports, Post Planner, Format-advisor, Inbox, Suggest-caption | ⚙️ | ❓ | **now the ONLY LLM** (OpenAI removed); AI Reports errors without it |
| **Airtable** | Airtable key/base ids | Sales Hub, Social Leads, Post Planner calendar | ❓ | ✅ | CRM/Contracts/Revenue etc. |
| **SendPulse** | SendPulse creds | (email/token health) | ❓ | — | shown in Integrations health |
| **Supabase** | service key (Beast Clone) | Marketing Hub, My Day, Content Review, Scheduler, Team, Content Radar alerts | ❓ | ✅ | writes via service client |
| **Weather** | (weather API) | My Day greeting | ❓ | ❓ | minor |

**⚠️ AI-layer change to re-verify:** `lib/ai.ts` + the Integrations status check moved from **OpenAI → Perplexity**.
Confirm Integrations now lists **"Perplexity"** (not OpenAI) as OK, and that every AI feature works off it.

---

## PART 2 — PER-TAB DIAGNOSTIC  *(sidebar order)*

For each: **API** = route to watch · **Data** = expected reality · **Verify** = controls that must be wired · **Watch** = known trap.

### Overview & Content

- [ ] **Overview** (`/`) — API `/api/overview-tips`, `/api/posts`, `/api/insights`
  - Data 🟡 — followers/reach/posts/audience real (goocampus IG); **engagement + profile-visits are derived from reach ×0.06 — not measured**.
  - Verify: platform toggle (IG/FB/LI/YT), **date range (7/30/60d/1y/Custom)** updates all cards + chart, "Analyze with AI" is prescriptive.
  - Watch: **"Who you reached" showed `1 reached`** — verify it's a real audience number, not 1. Key-spread React warning (`PreviewOverview.tsx:259`) in console.

- [ ] **Marketing Hub** (`/marketing-hub?tab=…`) — API `/api/marketing-hub/*`
  - Data ✅ — real `mh_posts` (Supabase).
  - Verify: inline cell edit (status/owner/date) **persists after reload**; add column; save view; detail modal comment + attachment; drag-reschedule; bottleneck panel.
  - Watch: an edit snapping back after reload = write failed.

- [ ] **My Day** (`/my-day`) — API `/api/my-day`, `/api/my-day/notifications`
  - Data ✅ — live per-person `mh_posts`.
  - Verify: person switch (Manya/Praveen/Nikhil/Nandu), Start-timer + live countdown, Set-duration **persists on reload**, Mark-done/+15/+30, Manya approve gate + move/date-picker, pipeline Accept, Requests, claim pool, chat/reminders.
  - Watch: producers must NOT see Content-Pending; countdown appears only once In-Progress + start_at set.

- [ ] **Content Radar** (`/radar`) — API `/api/radar/{feed,alerts,refresh,search,trends,article}`
  - Data 🟡 — News feed + rising searches + trends **real & free**; **Brand mentions = real but sparse (0 now)**; sentiment real.
  - Verify: search bar (type keyword → results + sentiment), "Pull latest", interest filter, "Turn into post" deep-links to Scheduler, article reader modal opens.
  - Watch (🔘 **dead-by-design buttons — expected, not bugs**): **Sources "Connect" chips (Reddit/Quora/Reviews/YouTube)** and **"Connect Search Console"** cards are honest placeholders — NOT wired yet (need free credentials). Brand Watch stays empty until Reddit/Reviews connected. **Popup issue to fix:** confirm the article reader **and** "Manage alerts" modals open (user reported a popup not opening).

### Social Media

- [ ] **Publishing Calendar** (`/calendar`) — Data 🟡. Watch: **demo toggle defaults ON** (pads grid with sample posts + placeholder thumbnails). Verify month grid shows real scheduled/published on correct **dates**; decide toggle on/off.
- [ ] **Content Review** (`/content-review`) — API `/api/content-review`. Data ✅. Verify: "Push to schedule" → Ready-to-Publish; "Send back" → Incorporating Feedback; **`hasCreative` must count `mh_attachments`** (Round-2 bug — a ready post with only an attachment must NOT read "no creative").
- [ ] **Scheduler** (`/scheduler`) — API `/api/scheduler/*`. Data ✅. Verify: to-schedule list, set/suggest time, enqueue/reschedule/cancel persist, link-back fills URLs. Watch: **do NOT click publish-now on a real post.**
- [ ] **Post Planner** (`/post-planner`) — API `/api/post-planner`. Data ⚙️ (now **Perplexity**, not OpenAI). Verify: AI ordering renders, drag/apply writes back; degrades gracefully without key.

### Analytics — Instagram

- [ ] **Posts** (`/posts`) — Data ✅ real media + reach/eng/saves/shares. Verify: filters, sort, pagination, **account switcher** swaps data.
- [ ] **Reels** (`/reels`) — Data ✅ views/watch-time. Watch: empty if <1 reel in recent 50.
- [ ] **Stories** (`/stories`) — Data 🟡. Watch: **an 8-card demo grid always renders and the top KPI tiles sum the DEMO numbers** — don't trust those totals; historical needs snapshot cron.

### Analytics — LinkedIn / YouTube / Facebook

- [ ] **LinkedIn** (`/linkedin` + `/linkedin/posts`) — Data 🟠 main demo / 🟡 World live. Verify account switch; **per-post table is demo**.
- [ ] **YouTube** (`/youtube` + `/youtube/videos`) — Data ✅ all 3 channels. Verify each channel + Long-form + Shorts + comments; **dates** on videos real. Watch: picsum thumbnails / amber "demo" badge = env dropped.
- [ ] **Facebook** (`/facebook` + `/facebook/posts`) — Data 🟡. Watch: **engagement + page-views = "—"** (no `read_insights`) — say "not enabled", not broken.

### Analytics — Website (goocampusevents.com)

- [ ] **Google Analytics** (`/website`) — API `/api/website` (GA4). Data ⚙️ (503 if key unset). Verify: realtime strip, KPIs, chart, breakdowns, **date range**, "Analyze with AI" prescriptive.
- [ ] **Clarity** (`/website/behavior`) — Data ⚙️. Watch: **capped 10 calls/day**, last-3-days only.
- [ ] **Bing** (`/website/search`) — Data ⚙️. Verify: 0-data empty state is honest; Analyze is SEO-focused.

### Audience / Ads / Sales

- [ ] **Audience / All platforms** (`/audience`) — Data 🟡 (IG live, FB countries real, **LI demo inherited**).
- [ ] **Ads** (`/ads`) — Data ⚙️ (Meta Marketing API; 400 if env unset). Verify spend/leads/campaigns/daily + **dates**.
- [ ] **Competitor Ads** (`/competitors`) — Data ⚙️ (Apify; 400 if token unset). Verify "Sync" reuses cached runs.
- [ ] **Benchmark** (`/benchmark`) — Data ✅ (`competitors.json`). Watch: empty if file missing.
- [ ] **Social Leads** (`/leads`) — Data ✅ (ad-leads + IG-comment funnel, cached 30m).
- [ ] **Sales Hub** (`/sales-ops`) — Data ✅ (Airtable, cached 12h). Verify counsellor drill-down; **dates** on contracts/attendance.

### AI

- [ ] **AI Insights** (`/ai-insights`) — Data ⚙️ Perplexity. Verify "Generate cross-channel insights" → **prescriptive** plan (how-to, not restating metrics), footer cites Perplexity.
- [ ] **AI Reports** (`/ai-reports`) — Data ⚙️ Perplexity. Verify weekly/monthly/quarterly render; **errors without the key** (hard dependency).

### System

- [ ] **Integrations** (`/integrations`) — Data ✅. This is Part-1's source of truth. Verify every provider row = configured + OK; **Perplexity replaces OpenAI**; usage counters (reset on restart = expected).
- [ ] **Tools** (`/tools`) — Data 🟠 static list (nothing to test beyond "renders").
- [ ] **Team** (`/team`) — API `/api/individual`/admin. Data ✅ (`ind_users`). Verify CRUD persists; non-admin → 403.

---

## PART 3 — 🟠 DEMO / PLACEHOLDER DATA STILL SHOWING  *(switch to real, or clearly label)*

- [ ] **Publishing Calendar** — demo toggle ON pads with sample posts + placeholder thumbnails.
- [ ] **Stories** — 8-card demo grid + KPI tiles summing demo numbers.
- [ ] **LinkedIn (main)** — whole tab + per-post table are demo (no Community-Mgmt API for main).
- [ ] **Overview** — engagement + profile-visits are *derived* (×0.06), not measured.
- [ ] **Content Radar** — Brand Watch / Sources (Reddit/Quora/Reviews/YouTube) + Your-SEO cards are empty/"connect" until credentials added.
- [ ] **Tools** — static informational content by design.

## PART 4 — 🔘 BUTTONS / FUNCTIONS TO CONFIRM WIRED  *(user reported dead buttons)*

Click each once; it must do something real (navigate, open a modal, write, or toast).

- [ ] **Content Radar** — Source "Connect" chips ×4 + "Connect Search Console" ×2 are **intentionally not wired** (placeholders). The **article reader** + **"Manage alerts"** modals **must open** (reported popup bug). "Pull latest", "Turn into post", interest chips, search must all work.
- [ ] **Every tab header** — account switcher + date-range must re-fetch (not just restyle).
- [ ] **"Analyze with AI" / "Generate insights"** buttons (Overview, Website, AI Insights) — must call Perplexity and render, not spin forever.
- [ ] **Scheduler** — set-time / suggest / enqueue / reschedule / cancel.
- [ ] **Marketing Hub** — add-column, save-view, detail-modal comment/attachment, drag-reschedule.
- [ ] **My Day** — every capsule/prompt (start, set-duration, done, extend, approve, accept, move).
- [ ] **Header bell 🔔** — is it wired to `/api/my-day/notifications` with an unread count + dropdown, or a static icon? (Notifications spec in `TESTING_CHECKLIST.md` — currently likely a static bell.)
- [ ] Sweep any remaining tab for a button that looks clickable but has no `onClick`/`href`.

## PART 5 — CROSS-CUTTING  *(test once)*

- [ ] **Auth & roles** — login works; admin (Maheen) → `/dashboard`, members → `/me`; non-admin blocked from admin pages. *Test first.*
- [ ] **Navigation** — every sidebar link stays inside `/dashboard/preview/*`, no 404 / V1 leak. (`/preview/instagram` is NOT a route.)
- [ ] **No dev chrome** — no "the dashboard theme / V2 / preview" labels on any tab.
- [ ] **Console/network** — no red errors, no 4xx/5xx on any tab.
- [ ] **Token expiry** — note days-remaining for Meta / LinkedIn-World / YouTube OAuth so nothing silently expires over the break.
- [ ] **Dates everywhere** — spot-check that timestamps render in the right format/timezone (IST) and correct year; no `Invalid Date` / 1970 / placeholder dates.

---

## SUGGESTED RUN ORDER
1. **Part 1 (API matrix)** via Integrations — establishes which tabs *can* be real.
2. **Part 5 auth/nav** — a broken login/nav blocks everything.
3. **Part 2** top-to-bottom — one tab at a time, DevTools open, click every control.
4. Log anything broken to **`AUDIT_LOG.md`** (dated section) — tab · symptom · repro · suspected `file:line` · severity.
5. **Parts 3 & 4** become the fix backlog. For code-level root-causing, run the **`improve`** skill to turn findings into executable plans under `plans/`.
