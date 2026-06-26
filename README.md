# GooCampus Instagram & Ads Dashboard

Internal one-stop analytics dashboard for all GooCampus brands' Instagram + Meta Ads + competitor ad library. Built with Next.js 14 (App Router), deployed on Netlify, fed by Meta Graph API + Marketing API + Apify (for competitor ads) + Airtable (cache).

## What's in it

| Tab | Data source | What it shows |
|---|---|---|
| **Overview** | Meta Graph API | Followers (with daily gain area chart), reach, engagement, profile visits, latest post |
| **Posts** | Meta Graph API | Every post in range, paginated, with reach/likes/comments/shares/saves, type & sort filters |
| **Reels** | Meta Graph API | Views, avg watch time, shares per reel |
| **Stories** | Meta Graph API | Currently-active stories only (24h API limit) |
| **Audience** | Meta Graph API | Persona summary, age × gender pyramid, gender donut, top countries (with flags), cities, online activity area chart |
| **Ads** | Meta Marketing API | Spend, impressions, reach, **leads + cost-per-lead**, messages started, CPM/CPC/CTR + trend charts + campaign table + click-into-ad drilldown with thumbnails and 🏆 top-performer badges |
| **Competitor Ads** | Apify (FB Ad Library) → Airtable cache | Search competitor ads by keyword. 7-day cache TTL. Manual "Refresh now" button. Free sync from past Apify runs. Masonry layout, DPA filtering, video poster fallback |
| **AI Reports** | Anthropic (or Perplexity/ChatGPT) | "Get AI Report" button on every tab — sends current data slice to Claude, returns structured analysis |

Every data tab has a **green "Live · fetched Xs ago" indicator** with a manual **Refresh** button, plus a **highlighted active date range badge** in the title.

## Architecture

```
Instagram + Meta Ads (5 brand accounts)
        │
        ▼
   Meta Graph API (real-time, no caching)
        │
        ▼
   Next.js dashboard ──► Anthropic / Perplexity (AI Reports button)
        │
        ▼
   Netlify hosting (analytics.goocampus.in)


   Facebook Ad Library
        │ (manually triggered or cron)
        ▼
   Apify scraper
        │
        ▼
   Airtable cache (7-day TTL) ──► Competitor Ads tab
```

## Required environment variables

All these go in `.env.local` for local dev, or **Netlify → Site settings → Environment variables** for production. The `*.local` files are gitignored — backup copies of `.env.local` and `accounts.local.json` live on the external SSD at `/Volumes/SSD - Praveen/goocampus-ig-dashboard-secrets/`.

| Variable | Purpose | Where to find / generate |
|---|---|---|
| `DASHBOARD_PASSWORD` | Login password | Any strong string |
| `SESSION_SECRET` | HMAC for login cookie | 64+ random hex chars (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `META_APP_ID` | Meta Developer App ID | `1325868559684543` (GooCampus Analytics app) |
| `META_APP_SECRET` | Meta App secret | https://developers.facebook.com/apps/1325868559684543/settings/basic/ |
| `META_LONG_LIVED_USER_TOKEN` | 60-day user token with all scopes | Graph API Explorer → see [token refresh](#refreshing-the-60-day-meta-token) below |
| `META_AD_ACCOUNT_ID` | Primary ad account | `act_490085459361407` (GooCampus Edu) |
| `META_AD_ACCOUNT_NAME` | Display label | `GooCampus Edu` |
| `ACCOUNTS_JSON` | All 5 IG accounts as inline JSON (for Netlify; replaces `accounts.local.json` file) | Copy contents of `accounts.local.json` (the array) and paste as the env var value |
| `AIRTABLE_API_KEY` | Personal Access Token | https://airtable.com/create/tokens (already created: `goocampus-dashboard`) |
| `AIRTABLE_BASE_ID` | Marketing hub base | `appLdJFTrothBLDc0` |
| `AIRTABLE_TABLE_COMPETITOR_ADS` | Cache table name | `IG_Competitor_Ads` |
| `APIFY_API_TOKEN` | Apify auth | https://console.apify.com/account/integrations |
| `ANTHROPIC_API_KEY` | (Optional) For AI Reports button | https://console.anthropic.com — Or use Perplexity / OpenAI key instead |

### Local development

```bash
git clone https://github.com/beast-clone/goocampus-ig-dashboard
cd goocampus-ig-dashboard
npm install

# Copy your backup secrets in from the SSD:
cp /Volumes/SSD\ -\ Praveen/goocampus-ig-dashboard-secrets/.env.local .
cp /Volumes/SSD\ -\ Praveen/goocampus-ig-dashboard-secrets/accounts.local.json .

npm run dev
# → http://localhost:3000
```

### Netlify deployment

1. **Push to GitHub** (this repo is at `beast-clone/goocampus-ig-dashboard`)
2. **Netlify → Add new site → Import from Git** → pick the repo
3. Build config auto-detects from `netlify.toml`
4. **Site settings → Environment variables** — paste every variable from the table above.
   - For `ACCOUNTS_JSON`: open your local `accounts.local.json`, copy the entire JSON array, paste as a single env var value.
5. **Domain settings → Add custom domain** → `analytics.goocampus.in` → add the CNAME at your DNS provider as Netlify shows.

## Refreshing the 60-day Meta token

The long-lived user token expires every 60 days. To regenerate:

1. Go to https://developers.facebook.com/tools/explorer/1325868559684543/
2. Click the Meta App dropdown → pick **GooCampus Analytics** (the one with App ID `1325868559684543`)
3. Click **Generate Access Token**, approve all scopes (must include `ads_read`, `ads_management`, `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`)
4. Exchange short-lived → long-lived:
   ```
   https://graph.facebook.com/v21.0/oauth/access_token?
     grant_type=fb_exchange_token&
     client_id=1325868559684543&
     client_secret={META_APP_SECRET}&
     fb_exchange_token={SHORT_LIVED_TOKEN}
   ```
5. Update `META_LONG_LIVED_USER_TOKEN` in `.env.local` AND on Netlify
6. Restart dev server / redeploy

(Future: an n8n workflow can automate this weekly. Deferred.)

## Cost projection (monthly)

| Service | Plan | Typical use | Cost |
|---|---|---|---|
| Meta Graph API | Free | Real-time reads | $0 |
| Meta Marketing API | Free (Dev Mode) | Ads insights | $0 |
| Apify (FB Ad Library) | Free $5/mo | Weekly refresh, 5 niches, ~30 ads each | $0.30-0.60 |
| Airtable | Free | Cache + manual edits | $0 |
| Netlify | Free tier | <100GB bandwidth | $0 |
| Anthropic API (AI reports) | Pay-per-use | ~50 reports/mo on Haiku 4.5 | <$1 |
| **Total** | | | **<$2/mo** |

## File map

```
app/
  (auth)/login                  — login page
  (dashboard)/dashboard/
    page.tsx                    — Overview
    posts/page.tsx
    reels/page.tsx
    stories/page.tsx
    audience/page.tsx           — persona + age×gender pyramid + geography + online activity
    ads/page.tsx                — KPIs + trend charts + campaigns + drilldown modal
    competitors/page.tsx        — Apify-backed search + cache + sync
    ai-reports/page.tsx
  api/
    login | logout              — session auth
    insights                    — Meta IG account-level (live)
    posts                       — Meta IG media + per-post insights (live, paginated)
    audience                    — Meta IG demographics + online_followers (live)
    ads                         — Meta Marketing API account insights (live)
    ads/campaign/[id]           — Per-campaign ad drilldown
    competitors                 — Apify scrape + Airtable cache read
    competitors/sync            — Backfill from past Apify runs (free)
    ai-report                   — Claude API call
components/
  DashboardShell, Sidebar, DateRangePicker, MetricCard, TrendChart, LatestPost,
  AIReportButton, LiveIndicator, FollowerGrowthChart
lib/
  accounts.ts                   — 5 IG account list (placeholders for client-side)
  airtable.ts                   — Airtable client
  apify.ts                      — Apify scraper + past-run sync
  auth.ts                       — session helpers
  competitor-cache.ts           — 7-day TTL cache layer
  instagram.ts                  — Meta Graph API client (basic + insights + demographics + media)
  meta-ads.ts                   — Meta Marketing API client (totals + daily + campaigns + ads)
  mock.ts                       — fallback demo data
middleware.ts                   — protects /dashboard/* and /api/* routes
```

## Tech stack

- **Next.js 14** (App Router, TypeScript, server components for API)
- **Tailwind CSS** for styling
- **Recharts** for area/composed/pie charts
- **date-fns** for time math
- **Airtable SDK** for cache
- **@anthropic-ai/sdk** for the AI Reports button
- **Meta Graph API v21–v25** for IG + Ads
- **Apify HTTP API** for competitor ads

See [`PROJECT_REPORT.md`](./PROJECT_REPORT.md) for the full build log and feature breakdown.
