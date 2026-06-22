# GooCampus Instagram Dashboard — Project Handoff

A complete handoff doc to pick this project back up at home. Everything you need: the vision, the research, the architecture, what's built, what's pending, and how to run it.

---

## 1. The vision

Build a **single online dashboard** for all 5 GooCampus Instagram accounts. Replace the current monthly-report grind (logging into 5 accounts, exporting manually, stitching numbers together) with one place that shows:

- Every metric Meta Business Suite shows — followers, reach, impressions, engagement, post/reel/story performance, audience demographics
- A dropdown to switch between the 5 accounts, plus a "Compare all 5" view
- Latest post visible at a glance
- Date range comparison (days, weeks, months)
- **AI button** — pick any data slice, click "Get AI Report", Claude returns analysis: what worked, what dropped, why, 5 next-week actions
- Future: native post scheduler integration (deferred, low priority)

**Hosted online** — log in from anywhere, not stuck inside Airtable.

---

## 2. The research — Instagram Graph API

### What the API gives us

**Account-level (via `/{ig-user-id}/insights`):**
- Reach, impressions, accounts engaged, total interactions
- Likes, comments, shares, saves, replies (aggregated)
- Profile link taps (replaces deprecated "website clicks")
- Follower count — **only last 30 days**, so we must store daily snapshots ourselves
- Follows and unfollows
- Follower demographics — age, gender, top cities, top countries (needs 100+ followers)
- Engaged-audience demographics, reached-audience demographics
- Online followers — hour-by-hour activity

**Per post / reel:**
- Reach, likes, comments, shares, saves, total interactions
- Profile visits and follows triggered by that post
- Reels: views, watch time (ms), avg watch time

**Per story:**
- Reach, replies, shares, taps forward/back, exits
- **⚠️ 24-hour API window** — must capture insights before story expires, or use `story_insights` webhook

### Real-time vs delayed
- Likes/comments/views update in **minutes to a few hours**
- Reach/demographics lag **up to 48 hours**
- Webhooks available for: comments, mentions, story_insights, live comments, DMs
- Follower count + reach are **poll-only**

### Rate limits
- 200 API calls per IG user per rolling hour
- Polling every 15 min uses ~80/200 — plenty of headroom

### Auth setup
1. IG accounts must be Business or Creator
2. Linked to a Facebook Page you admin
3. Create Meta app, add Instagram Graph API product
4. Permissions needed: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`
5. **For internal use:** add accounts as testers, stay in Development Mode → **no App Review needed**
6. Long-lived tokens expire every 60 days — refresh via scheduled n8n workflow

### What's NOT available via API (gaps vs Business Suite)
- Competitor benchmarks
- Hashtag performance for non-owned content
- Per-slide carousel breakdown
- Story link sticker clicks
- Profile views (Meta removed Jan 2025)
- Boosted/paid performance (lives in separate Marketing API)
- Historical follower count beyond 30 days

---

## 3. Architecture

```
Instagram Graph API (5 accounts)
        │
        ▼
   n8n workflows
   ├─ Every 15 min: account-level insights → IG_Snapshots
   ├─ Every 6 hr:   post insights → IG_Posts
   ├─ Daily 2 AM:   demographics, online_followers
   ├─ Weekly:       token refresh
   └─ Webhooks:     comments, story_insights (real-time)
        │
        ▼
   Airtable (source of truth)
   ├─ IG_Accounts (5 rows: id, handle, igUserId, fbPageId, token)
   ├─ IG_Snapshots (daily per account: followers, reach, engagement, profile_visits, etc.)
   ├─ IG_Posts (every post + its metrics, refreshed)
   ├─ IG_Stories (captured before 24h expiry)
   └─ IG_Comments (real-time via webhook)
        │
        ▼
   Next.js dashboard hosted on Netlify
   └─ Custom domain: analytics.goocampus.in (planned)
        │
        ▼
   Claude API (for "Get AI Report" button only)
```

---

## 4. What's built (current state)

### Project location
`goocampus-ig-dashboard/` (this folder)

### Tech stack
- Next.js 14 (App Router, TypeScript)
- Tailwind CSS for styling
- Recharts for charts
- Airtable SDK for data
- @anthropic-ai/sdk for the AI button
- Netlify for hosting (`netlify.toml` included)

### Pages built (all live with mock data)

| Route | What's there |
|---|---|
| `/login` | Password-protected login, httpOnly cookie session |
| `/dashboard` | **Overview** — 4 metric cards (followers/reach/engagement/profile visits with % deltas), 3 trend charts, latest post card |
| `/dashboard/posts` | **Posts** — KPI cards + sortable table of all posts with type/sort filters |
| `/dashboard/reels` | **Reels** — KPIs (views, watch time, shares), 2 trend charts, top-reels table |
| `/dashboard/stories` | **Stories** — KPIs, recent stories table, 24-hour API expiry warning banner |
| `/dashboard/audience` | **Audience** — total/new/unfollow KPIs, age + gender + cities + countries bars, online-followers-by-hour chart |
| `/dashboard/ai-reports` | **AI Reports** — gradient hero, 6 quick template cards, past reports history list |

### Shared shell on every dashboard page
- Sidebar with 5-account dropdown + "Compare all 5 accounts" button + nav with active state
- Top bar with date range picker (7d/14d/30d/90d presets + custom)
- ✨ **Get AI Report** button — modal with structured Claude analysis (What worked / What dropped / Why / 5 next-week actions)

### API routes
- `/api/login` — sets session cookie
- `/api/logout` — clears session
- `/api/insights` — reads from Airtable (falls back to mock when env not set)
- `/api/posts` — placeholder, ready to wire up
- `/api/ai-report` — sends data slice to Claude API, returns structured report

### Auth
- Password protected (set via env var)
- Middleware blocks `/dashboard/*` and protected API routes when not logged in
- Login required to access anything except the login page itself

---

## 5. File map

```
goocampus-ig-dashboard/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx              ← login page
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       ├── page.tsx                ← Overview
│   │       ├── posts/page.tsx
│   │       ├── reels/page.tsx
│   │       ├── stories/page.tsx
│   │       ├── audience/page.tsx
│   │       └── ai-reports/page.tsx
│   ├── api/
│   │   ├── login/route.ts
│   │   ├── logout/route.ts
│   │   ├── insights/route.ts           ← Airtable read (mock fallback)
│   │   ├── posts/route.ts
│   │   └── ai-report/route.ts          ← Claude API call
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                        ← redirects to /dashboard
├── components/
│   ├── Sidebar.tsx                     ← nav + account dropdown
│   ├── DashboardShell.tsx              ← shared layout wrapper
│   ├── DateRangePicker.tsx
│   ├── MetricCard.tsx
│   ├── TrendChart.tsx                  ← Recharts line chart
│   ├── LatestPost.tsx
│   └── AIReportButton.tsx              ← modal with AI analysis
├── lib/
│   ├── accounts.ts                     ← 5 IG account list (placeholders)
│   ├── airtable.ts                     ← Airtable client wrapper
│   ├── auth.ts                         ← session helpers
│   └── mock.ts                         ← demo data generator
├── middleware.ts                       ← protects routes
├── netlify.toml                        ← Netlify deploy config
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── next.config.mjs
├── .env.example                        ← all env var keys
├── .env.local                          ← dev credentials (gitignored)
└── README.md
```

---

## 6. Running it locally (at home)

```bash
cd goocampus-ig-dashboard
npm install
# .env.local already has dev password/session
npm run dev
# → http://localhost:3000
```

**Dev login password:** `goocampus2026`

---

## 7. Environment variables

```env
# Login
DASHBOARD_PASSWORD=goocampus2026                      # change for production
SESSION_SECRET=dev-session-secret-change-in-prod-...  # change for production

# Airtable
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_TABLE_SNAPSHOTS=IG_Snapshots
AIRTABLE_TABLE_POSTS=IG_Posts
AIRTABLE_TABLE_ACCOUNTS=IG_Accounts

# Claude (for AI Report button)
ANTHROPIC_API_KEY=

# Meta Graph API (used by n8n, not the dashboard directly)
META_APP_ID=
META_APP_SECRET=
META_LONG_LIVED_TOKEN=
```

Without Airtable + Anthropic keys, the dashboard runs on mock data — perfect for UI/UX iteration.

---

## 8. Deploying to Netlify (production)

1. Push this folder to a GitHub repo
2. Netlify → **Add new site → Import from Git** → pick the repo
3. Netlify auto-detects build config from `netlify.toml`
4. Add env vars under **Site settings → Environment variables**:
   - At minimum: `DASHBOARD_PASSWORD`, `SESSION_SECRET`
   - Add `AIRTABLE_*` and `ANTHROPIC_API_KEY` when ready
5. **Custom domain:** Domain settings → Add `analytics.goocampus.in` → add the CNAME at your DNS provider as Netlify shows

---

## 9. What's still pending

### Phase 1 — Schema + data pipeline (priority)
- [ ] Decide Airtable schema for `IG_Accounts`, `IG_Snapshots`, `IG_Posts`, `IG_Stories`, `IG_Comments`
- [ ] Create a Meta Developer app for GooCampus
- [ ] Add 5 IG handles to `lib/accounts.ts` (currently placeholders)
- [ ] Verify all 5 IG accounts are Business/Creator and linked to Facebook Pages
- [ ] Generate long-lived access tokens
- [ ] Build n8n workflows:
  - 15-min poll: account-level insights → IG_Snapshots
  - 6-hr poll: post insights → IG_Posts
  - Daily 2 AM: demographics, online_followers
  - Weekly: token refresh
  - Webhook: comments, story_insights

### Phase 2 — Wire real data
- [ ] Replace mock data in `app/api/insights/route.ts` with Airtable queries
- [ ] Same for `app/api/ai-report/route.ts`
- [ ] Build `/api/posts` real Airtable query
- [ ] Implement "Compare all 5 accounts" aggregation

### Phase 3 — Polish
- [ ] Add CSV export per page (for management reports)
- [ ] Save AI report history to Airtable (the AI Reports page already shows mock history)
- [ ] Add account-level alerts (e.g. "follower drop >5% in 24h")

### Phase 4 — Later
- [ ] Native post scheduler integration (low priority, user said deferred)

---

## 10. Key decisions made

| Decision | Why |
|---|---|
| **Next.js on Netlify** (not GitHub Pages) | GitHub Pages is static-only, would expose API tokens. Next.js + Netlify Functions = secure server-side calls |
| **Airtable as data warehouse** | Already in GooCampus stack, fine for <100k rows, easy to inspect/edit data manually |
| **n8n for polling** | Already in GooCampus stack, handles auth + scheduling + webhooks well |
| **Password auth** (not SSO) | Simple internal tool, 1–5 users. Can upgrade to Netlify Identity later if needed |
| **Stay in Meta Dev Mode** | Avoids App Review wait for internal-only use; review only needed if/when managing external client accounts |
| **Mock data fallback** | Lets us iterate UI without waiting for the data pipeline |

---

## 11. Conversation reference

This handoff includes the work from a Claude Code session covering:
- Whether Instagram has a direct connector (no — API/n8n only)
- Full Instagram Graph API capability research
- Architecture for the dashboard
- Hosting recommendation (Netlify under analytics.goocampus.in)
- Full Next.js scaffold with all 6 sidebar tabs built out with mock data

Pick up at home by running `npm run dev` and either polishing the UI, finalizing the Airtable schema, or starting the first n8n workflow.
