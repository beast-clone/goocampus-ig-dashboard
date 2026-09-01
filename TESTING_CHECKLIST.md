# Dashboard Testing Checklist

Tab-by-tab QA of the the dashboard theme dashboard (`/dashboard/preview/*`). Work top to
bottom. For each tab, log anything broken in **AUDIT_LOG.md** (don't fix inline
unless trivial — see "Ground rules"). Dev server: `ig-dashboard` on port 4324.

## Ground rules
- **This is a testing session running in PARALLEL with a feature-dev session in the same repo/working dir.** To avoid clobbering each other: **observe + log findings to AUDIT_LOG.md; do NOT make broad code edits.** Batch fixes after, or hand specific bugs back. Only trivial, isolated one-line fixes inline (and commit immediately, small).
- Test each tab against **each brand account** where the account picker matters (GooCampus main, GooCampus World, 12thplus, Study Abroad, Samvaya) — some tabs are live for one brand and demo for others.
- Change the **date range** (7d / 30d / 90d) on tabs that have it — confirm data + charts update.

## Per-tab checks (apply to every tab)
- [ ] Loads with **no console errors** and **no error-boundary / crash**
- [ ] Underlying API returns **200** (check Network / preview logs), not 4xx/5xx
- [ ] Data **renders** (real where expected; "demo"/"live" badge is honest; empty-states are graceful, not blank)
- [ ] **Interactions** work: buttons, filters, account switcher, date range, in-page sub-tabs, modals, drag/reschedule
- [ ] **the dashboard theme** consistent (brand tokens, no default-Tailwind look, no stray shadows)
- [ ] Numbers are **plausible** (no NaN, no `undefined`, no absurd values)

## Tabs (sidebar order)

### Overview & Content
- [ ] **Overview** (`/`) — headline stats, latest post, gain chart
- [ ] **Marketing Hub** (`/marketing-hub`) — subtabs `?tab=team|master|pipeline|calendar`; inline grid edit; bottleneck panel; drag-reschedule
- [ ] **My Day** (`/my-day`) — pipeline, accept/decline, team board, notifications
- [ ] **Content Radar** (`/radar`)

### Social Media
- [ ] **Publishing Calendar** (`/calendar`)
- [ ] **Content Review** (`/content-review`)
- [ ] **Scheduler** (`/scheduler`)
- [ ] **Post Planner** (`/post-planner`)

### Analytics — Instagram
- [ ] **Posts** (`/posts`) — filters, sort, pagination
- [ ] **Reels** (`/reels`)
- [ ] **Stories** (`/stories`)

### Analytics — LinkedIn / YouTube / Facebook
- [ ] **LinkedIn** (`/linkedin`) + **Posts** (`/linkedin/posts`)
- [ ] **YouTube** (`/youtube`) + **Videos** (`/youtube/videos`) — 3 channels
- [ ] **Facebook** (`/facebook`) + **Posts** (`/facebook/posts`)

### Analytics — Website (goocampusevents.com)
- [ ] **Google Analytics** (`/website`) — realtime strip, KPIs, chart, breakdowns; **"Analyze with AI"** returns *prescriptive* advice (how-to, not metric-restating)
- [ ] **Clarity** (`/website/behavior`) — signals + **Analyze** (Clarity-focused)
- [ ] **Bing** (`/website/search`) — 0-data empty state honest; **Analyze** (SEO-focused)

### Audience / Ads / Sales
- [ ] **Audience** (`/audience`)
- [ ] **Ads** (`/ads`) — Meta ad spend/results
- [ ] **Competitor Ads** (`/competitors`)
- [ ] **Benchmark** (`/benchmark`)
- [ ] **Social Leads** (`/leads`)
- [ ] **Sales Hub** (`/sales-ops`)

### AI
- [ ] **AI Insights** (`/ai-insights`) — "Generate cross-channel insights" → prescriptive plan (IG + ads + website)
- [ ] **AI Reports** (`/ai-reports`) — weekly/monthly/quarterly; report renders; insights prescriptive; footer says "Perplexity"

### System
- [ ] **Integrations** (`/integrations`) — token statuses
- [ ] **Tools** (`/tools`)
- [ ] **Team** (`/team`)

## Notifications (proposed — build during/after testing)
Goal: on opening the dashboard, surface *what changed / what needs attention* so users don't hunt for it. **Existing infra to reuse:** `app/api/my-day/notifications/route.ts` (My Day already has a notifications concept) — extend rather than rebuild.

Proposed triggers (each = one notification card/toast):
- [ ] 🏆 **Top performer** — best post of the last 7 days (reach/ER), with thumbnail + link
- [ ] 📈 **Big mover** — a metric that jumped/dropped >X% vs prior period (reach, engagement, followers, ad CPL)
- [ ] ⚠️ **Response lag** — N leads waiting, avg first-response > SLA (from Sales Hub)
- [ ] 🎯 **New conversions** — key events started firing (GA4), or a spike in `join_click`
- [ ] 🔑 **Token expiring** — any platform token near expiry (LinkedIn/Meta/YT)
- [ ] 🗓️ **Scheduler** — a scheduled post failed or is due
- [ ] 🔴 **Live now** — realtime active users on goocampusevents.com above a threshold

UI: a **bell in the header** with an unread count + dropdown panel, and a one-time
"what's new since you last visited" summary on open. Notifications should be
**actionable** (click → go to the relevant tab), not just informational.

## Also run during testing
- **Ponytail** (code-quality/minimalism skill) — on any tab whose code you touch or that looks over-built; note simplifications in AUDIT_LOG.md.
- **Graphify** — not runnable yet in this repo (`.claude/skills/graphify` has docs but no `bin`); if you want structural queries, set it up first (`npm install` in the graphify skill per the D:\Claude root CLAUDE.md), then `graphify build` → query instead of grepping.
