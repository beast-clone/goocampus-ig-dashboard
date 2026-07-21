# Diagnostics Results — live run

**Run date:** 2026-07-21 · **Branch:** `feat/hope-ui-reskin` · **Env:** localhost:4324 (`.env.local`)
**Method:** live checks in the signed-in Chrome — API status, real-vs-demo data, dates, console.
Companion plan: `FINAL-DIAGNOSTICS-CHECKLIST.md`. This file = what was actually observed.

**Legend:** ✅ verified real & working · 🟡 real w/ caveat · 🟠 demo/placeholder · ⚠️ needs attention · 🔎 not yet click-tested

---

## HEADLINE

**APIs are in good shape for a demo.** The Integrations tab (live token-health source of truth)
shows **10 of 11 integrations HEALTHY**, only **1 needs attention (Reddit thread-reader — optional)**.
Real data confirmed on every tab checked so far. The AI swap (OpenAI→**Perplexity**) is live and healthy.
Content Radar is the user's finished overnight work (Serper mention lanes) — left untouched.

---

## 1 · LIVE API / INTEGRATION HEALTH  *(from the Integrations tab — real, just now)*

| Provider | Status | Detail | Powers | Errors (all-time) |
|---|---|---|---|---|
| **Meta — IG · FB · Ads** | ✅ Healthy | 15 scopes · no expiry · 3% hourly rate used | Overview, Posts, Reels, Stories, Facebook, Ads, Audience | IG 51 / **Meta Ads 224** ⚠️ |
| **LinkedIn** | ✅ Healthy | member token (~60d); introspection needs client id/secret | LinkedIn (World live; **main = demo**) | 43 |
| **YouTube** | ✅ Healthy | 3 channels · refresh OK · 6 calls today / 10k units | YouTube (+Videos/Shorts) | 5 |
| **Airtable** | ✅ Healthy | Sales Hub reachable · records present | Sales Hub, Social Leads, Post Planner cal | 0 |
| **Perplexity** | ✅ Healthy | Reachable · sonar | AI Insights, AI Reports, Post Planner, format-advisor, inbox, suggest-caption | — |
| **Serper** | ✅ Healthy | 34/2,500 credits (34/200 this month) | Content Radar site: lanes (Reddit/Quora/MouthShut/ValueMD) | 6 |
| **Supabase** | ✅ Healthy | service key configured | Marketing Hub, My Day, Content Review, Scheduler, Team | — |
| **Apify** | ✅ Healthy | key configured | Competitor Ads | — |
| **HikerAPI** | ✅ Healthy | key configured | (IG scraping fallback) | — |
| **SendPulse** | ✅ Healthy | 1 bot | messaging/token health | — |
| **Reddit (thread reader)** | ⚠️ Attention | No app → Reddit mentions show snippet only | Content Radar Reddit full-thread inline | — |

**Not shown in Token-Health (verify per tab):** GA4 / Clarity / Bing → see Website below (GA4 confirmed live).

**⚠️ Follow-ups from the matrix:**
- **Meta Ads = 224 all-time errors** (vs IG's 51 on 46k calls). Worth confirming the **Ads** tab renders real spend/leads and isn't silently erroring. 🔎
- **Reddit** needs a free `script` app (`REDDIT_CLIENT_ID/SECRET`) for inline threads — **optional**, mentions still show as snippets. Not demo-blocking.

---

## 2 · PER-TAB — verified so far

- ✅ **Overview** (`/`) — `/api/posts`, `/api/audience`, `/api/insights`, `/api/me` all **200**; `overview-tips` 200. Dates correct (30d + prior-period). No console errors. *Caveat: engagement & profile-visits are derived from reach (×0.06) — don't quote as measured. Re-check the "Who you reached → 1 reached" figure and the `StatCard` key-spread React warning.*
- ✅ **Website → Google Analytics** (`/website`) — **Live · real GA4 data**: 1.3K users, 1.3K sessions, 2.0K page views, real top pages (/neet-pg-community/, /amc-pathway…), India 93% (Hyderabad/Bengaluru/Chennai), Paid-Social 82%, real key events (join_click 40, register_click 37, begin_checkout 1). Dates correct. GA4 **connected**. 🔎 *Clarity + Bing sub-tabs not yet clicked (each 503s if its key is unset — not in Token-Health list).*
- 🟡 **Marketing Hub** (`/marketing-hub`) — shell/period APIs **200**, no console errors. Function-testing (inline-edit persistence, add-column, save-view, detail-modal comment/attachment, drag-reschedule) is a manual flow — several rounds already done per CHANGELOG (2026-07-17 entries). 🔎 confirm one inline edit persists after reload.
- ✅ **Integrations** (`/integrations`) — renders full live token health; no console errors. Source of truth for §1.
- ✅ **Content Radar** (`/radar`) — **READY (user's overnight work)**: Serper site: lanes (Reddit/Quora/MouthShut/ValueMD) + Google News, clickable source filters, inline MentionModal (real Reddit threads when app connected), Serper credit guardrails, Serper+Reddit cards in Integrations. **Not modified.** 🔎 confirm the mention modal/popup opens (a popup-not-opening issue was reported earlier — verify on this finished version).

## 3 · KNOWN 🟠 DEMO / PLACEHOLDER  *(from CHANGELOG + DEMO-TEST-PLAN — confirm before demo)*

- 🟠 **Stories** — an 8-card demo grid always renders; top KPI tiles sum the demo numbers.
- 🟠 **LinkedIn (main GooCampus)** — whole tab + per-post table are demo (only **World** is live).
- 🟡 **Publishing Calendar** — demo toggle defaults **ON** (sample posts + placeholder thumbnails) — a display choice, decide before demo.
- 🟡 **Facebook** — engagement + page-views show "—" (token lacks `read_insights`) — expected.
- 🟡 **Overview** — engagement/profile-visits derived (see above).
- 🟠 **Tools** — static informational list by design.

## 4 · NOT YET CLICK-TESTED  🔎  *(next pass — one tab at a time, click every control)*
My Day (persona flows) · Content Review (hasCreative + attachments) · Scheduler (enqueue/reschedule/cancel — **don't publish-now**) · Post Planner (Perplexity) · Posts / Reels / Stories · LinkedIn · YouTube (3 channels) · Facebook · Website→Clarity/Bing · Audience · **Ads (224 errors — check)** · Competitor Ads (Apify) · Benchmark · Social Leads · Sales Hub · AI Insights / AI Reports (Perplexity) · Team (CRUD + 403) · header **bell** (wired?).

## 5 · DEAD / BY-DESIGN-INERT BUTTONS
- Content Radar: source "Connect" chips are now **clickable filters** (fixed in the overnight work) — no longer dead. Reddit inline-thread button is dormant until the Reddit app is registered (shows snippet + link — intended).
- 🔎 Header **bell** — still likely a static icon (Notifications spec unbuilt). Confirm.

---

## VERDICT SO FAR
No broken/500 APIs found. Connectivity is strong (10/11 healthy), real data confirmed on Overview,
Website/GA4, Integrations; Content Radar finished. The demo-risk items are **known demo data**
(Stories, LinkedIn-main, Calendar toggle) and **two follow-ups** (Meta-Ads error count, Reddit app).
Next: click-test §4 tab by tab and log any new break here.
