# GooCampus Instagram Dashboard

Internal analytics dashboard for 5 GooCampus Instagram accounts. Built with Next.js, hosted on Netlify, fed by Airtable (which n8n keeps in sync with the Instagram Graph API).

## What's here

- Login page (password-protected)
- Dashboard with account dropdown (5 accounts), date range picker, metric cards, trend charts, latest post panel
- "Compare all 5 accounts" view
- **Get AI Report** button — sends the current data slice to Claude and returns analysis
- API routes: `/api/insights`, `/api/posts`, `/api/ai-report`, `/api/login`, `/api/logout`
- Returns mock data by default so you can see the full dashboard before Airtable is wired up

## Architecture

```
Instagram Graph API ──► n8n workflows ──► Airtable
                                              │
                                              ▼
                                  Next.js dashboard (Netlify)
                                              │
                                              ▼
                                       Claude API
                                  (AI report button only)
```

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values (password + session secret minimum)
npm run dev                  # http://localhost:3000
```

Without any env values set, the dashboard works with mock data — useful for design/QA.

## Deploy to Netlify

1. Push this repo to GitHub
2. In Netlify: **Add new site → Import from Git → pick the repo**
3. Build settings auto-detect from `netlify.toml`
4. Set env vars under **Site settings → Environment variables**: at minimum `DASHBOARD_PASSWORD` and `SESSION_SECRET`. Add `AIRTABLE_*` and `ANTHROPIC_API_KEY` as they become available.
5. Custom domain: **Domain settings → Add custom domain** → e.g. `analytics.goocampus.in`. Add the CNAME on your DNS provider as Netlify shows.

## Next build steps (deferred)

1. Finalize Airtable schema: `IG_Accounts`, `IG_Snapshots` (daily), `IG_Posts`, `IG_Stories`
2. Build n8n workflows:
   - 15-min poll: account-level insights for all 5 accounts → IG_Snapshots
   - 6-hr poll: post insights for posts <30 days old → IG_Posts
   - Daily 2 AM: demographics, online_followers
   - Weekly: token refresh
   - Webhook handler: comments, story_insights
3. Replace mock data in `app/api/insights/route.ts` and `app/api/ai-report/route.ts` with real Airtable queries
4. Add per-page views (Posts, Reels, Stories, Audience) — sidebar links are placeholders today

## File map

```
app/
  (auth)/login              login page
  (dashboard)/dashboard     main dashboard
  api/
    login | logout          session auth
    insights | posts        Airtable reads
    ai-report               Claude analysis
components/                  Sidebar, DateRangePicker, MetricCard, TrendChart, LatestPost, AIReportButton
lib/
  accounts.ts               5 IG account list (placeholders)
  airtable.ts               Airtable client
  auth.ts                   session helpers
  mock.ts                   demo data
middleware.ts               protects /dashboard and /api routes
```
