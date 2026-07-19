# GooCampus Marketing OS — Demo Test Plan (QA script)

**Purpose:** the checklist I (Claude) run through to confirm every tab works before the demo.
This is the tester's script — what to click, the flow to exercise, and what "correct" looks like.
Not executed here; kept ready so testing is systematic, not ad-hoc.

**Environment to test on:** the branch/URL you're demoing from. Latest My Day work lives on
`feat/hope-ui-reskin` — test THAT, not `main`. Localhost = `.env.local`; deployed = Netlify env vars.

**Legend:** ✅ real/live · 🟡 real-with-caveat · 🟠 demo data (labelled) · ⚙️ needs env key

**How to read each block:** *Flow* = the steps to perform · *Pass* = the correct result ·
*Watch* = the known weak spot / most likely place it breaks.

**Priority order for demo prep:**
1. Section A (Content & Workflow) — the flagship story, test hardest.
2. Section D (cross-cutting: login, roles, nav) — a broken login kills the whole demo.
3. Sections B & C — confirm each loads real data with no console errors.

---

## SECTION A — CONTENT & WORKFLOW  *(demo-critical — test every flow)*

### A1 · My Day  ✅  — the flagship cockpit
The one tab that must be flawless. Test as **each persona** (Manya / Praveen / Nikhil / Nandu) — behaviour differs by role.

- **A1.1 Person switch & role rule**
  *Flow:* switch between Manya, Praveen, Nikhil, Nandu (top switcher).
  *Pass:* greeting + task list change per person; producers (Praveen/Nikhil/Nandu) see **only Content-Approved+** work, never Content-Pending/In-Progress; Manya sees the content phase.
  *Watch:* a producer showing a "Content - Pending" task = role filter broke.

- **A1.2 Today's plan**
  *Flow:* open a person with several tasks.
  *Pass:* plan lays out from **9 AM** with no empty morning gap; lunch block pinned **1–2 PM** aligned to the tick; the red "now" line sits at the real current time; finished/other-people's tasks aren't on it.
  *Watch:* lunch drifting off the 1 PM tick; empty 9 AM block.

- **A1.3 "In Progress" + live timer + countdown**
  *Flow:* open a Content-Approved task → click **"Start working — start the timer"**.
  *Pass:* status flips to **In Progress**; STARTED stamps the real time; header shows 3 equal capsules — **In Progress · Set duration · ⏱ N left** (countdown ticks down live); strip below reads "Xm planned · Ym on the clock".
  *Watch:* countdown not appearing (timer only runs once In Progress + start_at set); capsules unequal height.

- **A1.4 Duration persistence**
  *Flow:* Set duration → 2h → reload the page → reopen the task.
  *Pass:* still shows **2h** (saved to `duration_min`); plan block length + timer "planned" use it.
  *Watch:* reverting to the auto-estimate after reload = persistence broke.

- **A1.5 Finish / extend**
  *Flow:* on an In-Progress task near/over planned time, use the inline prompt.
  *Pass:* **Mark done** → Output-Ready (leaves the plan, end_at stamped); **+15m/+30m** extends and the rest of the day reshuffles.

- **A1.6 Approve gate (Manya)**
  *Flow:* as Manya, set a **design** task (carousel/post/thumbnail) to **Content - Approved**.
  *Pass:* wide popup shows Praveen's **live timeline** (blocks, lunch, now-line) + "committed/free" + what he's on now. If it **fits** → "Approve & hand over". If **full** → "not free for a while" + his not-started tasks each with **Move → next day** and a **date picker**, or **Send anyway → his pipeline**.
  *Watch:* timeline compressed/unreadable; moves not logged as Manya.

- **A1.7 Pipeline accept (producer)**
  *Flow:* after a "Send anyway", switch to Praveen → **⏳ Pipeline**.
  *Pass:* queued task shows the honest fit math + **Accept & work** (takes ownership onto his board) and **"Send my not-started list to Manya"**.

- **A1.8 Swap — Manya picks**
  *Flow:* as a packed producer click "Send my not-started list to Manya" → toast "Sent to Manya ✓" → switch to Manya → **🔔 Requests**.
  *Pass:* Manya sees "X is packed — pick a task to move" with his not-started list (duration + due); clicking **Move this · hand over** rolls that task +1 day AND puts the queued task on his plan.
  *Watch:* the producer being asked to pick (he must NOT); "System moved a date" where a person did it.

- **A1.9 Chat, notifications, reminders**
  *Flow:* open team chat; trigger a status change; add a reminder.
  *Pass:* chat posts persist (Supabase `mh_messages`), poll updates; approvals/claims/handoffs show in Requests named by person; reminders persist per-person.
  *Watch:* chat/reminders are per-browser (localStorage) — expected, not a bug.

- **A1.10 Team capacity (Manya) + layout**
  *Flow:* Manya → **Team capacity**; toggle **Today / Week**.
  *Pass:* Today = 8h, Week = 35h (Mon–Fri, lunch excluded); bars absolute-aligned; My-tasks list **fills the column height** (no fixed short scroll with dead space).

- **A1.11 Editors' claim pool**
  *Flow:* as Nikhil/Nandu open **Claim pool**; approve a **video** as Manya first.
  *Pass:* approved video appears "up for grabs"; claiming transfers ownership and it lands in My tasks.

### A2 · Marketing Hub  ✅
*Flow:* open Master sheet → inline-edit a cell (status/owner/date) → add a custom column → save a view → open the detail modal → add a comment/attachment.
*Pass:* every edit persists to Supabase `mh_posts` and survives reload; custom columns/views/comments/attachments all save.
*Watch:* an edit snapping back after reload = write failed.

### A3 · Content Review  ✅
*Flow:* open the queue (tasks at Output-Ready) → "Push to schedule" and "Send back" on one each.
*Pass:* push flips status toward Ready-to-Publish (into Scheduler); send-back returns to Incorporating Feedback; queue reflects it.

### A4 · Scheduler  ✅
*Flow:* open "To schedule" → open a produced post → set/suggest a time → enqueue → check Calendar/queue → try reschedule + cancel.
*Pass:* enqueue/reschedule/cancel all persist; published IG posts show real insights; predict/top-performers render.
*Watch:* publish-now actually posts to Meta — **do NOT click publish on a real post during a rehearsal.**

### A5 · Publishing Calendar  🟡
*Flow:* open the month grid.
*Pass:* real scheduled/published posts appear on their dates.
*Watch:* **the demo toggle defaults ON**, padding the grid with sample posts + placeholder thumbnails. Decide before demo: leave for fullness, or turn off for real-only. (Not broken — a display choice.)

### A6 · Post Planner  ⚙️
*Flow:* open (scoped to @12thplus) → review AI ordering → drag a card / apply.
*Pass:* ranking renders; move/apply write back. *Watch:* needs OpenAI/search key — degrades gracefully without it.

### A7 · Content Radar  ✅  *(leave code as-is per instruction — test only)*
*Flow:* open → "Pull latest" → open an article inline → "Turn into post".
*Pass:* feed loads from saved alerts (Bing News + Google Alerts RSS); article reader renders; "turn into post" deep-links to Scheduler.
*Watch:* **refresh is manual only — pull it right before the demo so items are fresh.** No auto-cron by design.

### A8 · Team  ✅
*Flow:* as admin (Maheen) open Team → add/edit a member.
*Pass:* roster from Supabase `ind_users`; CRUD persists; non-admins get 403.

---

## SECTION B — ANALYTICS & SOCIAL  *(confirm real data loads + no console errors)*

### B1 · Overview  🟡
*Pass:* followers/reach/posts/audience real for `goocampus` IG. *Watch:* **engagement & profile-visits are derived from reach (×0.06)** — don't quote them as measured; pinned to the goocampus account.

### B2 · Instagram — Posts ✅ / Reels ✅
*Flow:* open each; switch account in the shell picker.
*Pass:* real media list + per-post reach/engagement/saves/shares (Posts); views/watch-time (Reels). *Watch:* Reels empty if <1 reel in recent 50.

### B3 · Instagram — Stories  🟡
*Pass:* live 24h + historical are real. *Watch:* **an 8-card demo grid always renders and the top KPI tiles sum the demo numbers** — don't present those totals as real. Historical needs the snapshot cron running.

### B4 · Facebook (+ Posts)  🟡
*Pass:* followers/page-likes/posts/country audience real. *Watch:* **engagement & page-views show "—"** (token lacks `read_insights`) — expected, say "not enabled", not broken.

### B5 · LinkedIn (+ Posts)  🟠 main / 🟡 World
*Pass:* **GooCampus World** = live with its token; **main GooCampus = labelled demo** (no Community Mgmt API yet). Per-post table is demo. *Watch:* present only World as live; leave main as the badged demo.

### B6 · YouTube (+ Videos, Shorts)  ✅  *(live for all 3 channels — OAuth linked)*
*Flow:* open each channel (GooCampus / 12thplus / Study Abroad) + Long-form + Shorts + comments.
*Pass:* real subscribers/views/videos/comments per channel. *Watch:* if a channel ever shows picsum thumbnails or an amber "demo" badge, its env channel-id/OAuth dropped — re-check env.

### B7 · Website — GA4 ⚙️ / Clarity ⚙️ / Bing ⚙️
*Pass:* real traffic (GA4), behavior/heatmaps (Clarity, last 3 days), search performance (Bing) for goocampusevents.com. *Watch:* each returns **503 if its env key is unset** — verify all three keys on the demo env; Clarity capped 10 calls/day.

### B8 · Audience  🟡
*Pass:* IG audience live; FB countries real. *Watch:* LinkedIn/YouTube audience sub-tabs inherit their platform state (LI demo).

### B9 · Benchmark  ✅
*Pass:* real competitor IG followers/cadence/engagement from `competitors.json`. *Watch:* empty if the file is missing.

### B10 · Competitor Ads  ⚙️
*Pass:* real Meta Ad Library scrapes (Apify), cache-first. *Watch:* 400 if `APIFY_API_TOKEN` unset; "Sync" reuses cached runs.

### B11 · Ads  ⚙️
*Pass:* real spend/leads/campaigns/daily (Meta Marketing API). *Watch:* 400 if Meta ad-account/token env unset.

### B12 · AI Insights  ⚙️ / AI Reports  ⚙️
*Pass:* pull real cross-channel data → AI narrative (prescriptive: how to grow, not restating metrics). *Watch:* needs Perplexity/AI key — **AI Reports errors** without it; Insights falls back to a "key not set" note.

---

## SECTION C — SALES & SYSTEM

### C1 · Social Leads  ✅
*Pass:* real ad-leads + IG-comment funnel detection, cached 30 min.

### C2 · Sales Hub  ✅
*Pass:* real Airtable Sales Hub (CRM/Contracts/Revenue/Performance/Attendance…), cached 12h; counsellor drill-down works.

### C3 · Integrations  ✅
*Pass:* real per-provider token-health (Meta/LinkedIn/SendPulse/Airtable) + usage counters. *Watch:* usage counts reset on server restart (session-scoped) — expected.

### C4 · Tools  🟠
*Pass:* static informational stack list — by design, nothing to test beyond "renders".

---

## SECTION D — CROSS-CUTTING  *(test once, affects everything)*

- **D1 Auth & roles:** login works; middleware sends Maheen (admin) to `/dashboard`, members to `/me`; non-admin can't reach admin-only pages. *A broken login kills the demo — test first.*
- **D2 Navigation:** every sidebar link routes inside `/dashboard/hope-preview/*` (no V1 leaks / 404s). Note: `/dashboard/hope-preview/instagram` is NOT a route — IG lives under Posts/Reels/Stories.
- **D3 Chrome removed:** no "Hope UI theme / Version 2 preview / V2" dev labels on any tab (removed this session — confirm none reappear).
- **D4 Console/network:** open each demo tab with devtools — no red console errors, no failed API calls (405/500).
- **D5 Branch:** the demo environment is running **`feat/hope-ui-reskin`** (has the latest My Day). If it's on `main`, the flagship work is missing.

---

## PRE-DEMO CHECKLIST (do in order, day-of)
1. [ ] Confirm demo env is on `feat/hope-ui-reskin` (or merge to main + deploy).
2. [ ] Verify env keys present: GA4, Clarity, Bing, Meta Ads, Apify, Perplexity, YouTube OAuth/channel-ids, LinkedIn World token.
3. [ ] Content Radar: click "Pull latest" so the feed is fresh.
4. [ ] Decide Publishing Calendar demo toggle: on (full) or off (real-only).
5. [ ] Run Section A end-to-end as all 4 personas.
6. [ ] Spot-check one tab per platform in Section B for real data + clean console.
7. [ ] Rehearse WITHOUT clicking Scheduler "publish-now" on any real post.
