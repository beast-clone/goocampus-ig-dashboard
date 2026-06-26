# GooCampus Dashboard — Project Report

**Generated:** 2026-06-26
**Author:** Praveen L (GooCampus)
**Repo:** https://github.com/beast-clone/goocampus-ig-dashboard
**Target host:** https://analytics.goocampus.in (Netlify, planned)

---

## 1. The problem we solved

GooCampus runs 5 Instagram brand accounts plus ~₹58 lakhs of cumulative Meta Ads spend across the GooCampus Edu ad account. Until now, the team has been:

- Logging into Meta Business Suite per account, exporting screenshots, stitching numbers
- Switching to Meta Ads Manager for spend / CPL / campaign performance
- Opening Facebook Ad Library separately when wanting to see what competitors run
- Manually copy-pasting into Airtable for monthly reports

**Goal:** one place — like Canva is for design — where everything Instagram + Meta Ads + competitive lives, with live data, no app-switching. Read-only (no ad-creation/editing — keep that in Ads Manager).

## 2. What's built

### 2.1 Instagram analytics (live via Meta Graph API)

- **All 5 accounts** wired via long-lived tokens stored in `accounts.local.json` (or `ACCOUNTS_JSON` env var in production):

  | Page | Handle | Followers | Posts | IG User ID |
  |---|---|---|---|---|
  | GooCampus Edu ⭐ | @goocampus | 28,672 | 2,751 | 17841407196182440 |
  | GooCampus World | @goocampusworld | 2,105 | 446 | 17841473429363077 |
  | GooCampus India | @12thplusdotcom | 634 | 899 | 17841451240960832 |
  | Wall of Tunes | @wall_of_tunes | 220 | 101 | 17841427051248054 |
  | Samvaya Matrimony | @samvaya_matrimony | 80 | 12 | 17841444879120174 |

- **Overview tab:** followers, reach, engagement, profile visits (Meta API caps reach/engagement at 30 days — banner explains the cap when picking 6m/1y). Includes a clean area chart of total followers + daily-gain headline (`+2,880 in range · avg +96/day · best day +141`).
- **Posts tab:** every post in the picked range, paginated (no 25-cap), thumbnails, real reach/likes/comments/shares/saves, type & sort filters.
- **Reels tab:** views, avg watch time (ms), shares per reel.
- **Stories tab:** only currently-active stories (Meta drops stories from the API after 24h — would need an n8n webhook to capture story metrics before expiry; currently flagged with an amber banner).
- **Audience tab (redesigned):**
  - **Persona summary banner** — auto-writes one sentence: *"A 25-34-year-old, with an even male-female split, based in India, mostly in Chennai, most active around 09:00."*
  - **Age × Gender pyramid** — bidirectional bars (male left in violet, female right in pink) per age bucket.
  - **Gender donut chart** (Recharts pie) with legend + counts.
  - **Top countries** with **flag emojis** + readable names (🇮🇳 India 73.9% · 🇵🇰 Pakistan 10.5% · etc.).
  - **Top cities** numbered with state name shown in lighter grey.
  - **Online activity area chart** showing average per hour over last 7 days. Peak hour badge.

### 2.2 Meta Ads analytics (live via Marketing API)

Added on 2026-06-26 in this session.

- **Marketing API product** added to the existing GooCampus Analytics app, `ads_read` + `ads_management` permissions auto-enabled.
- **10 ad accounts discovered**, primary one is **act_490085459361407 / GooCampus Edu** (₹58 lakhs lifetime spend).
- **Long-lived user token regenerated** with `ads_read` scope, expires 2026-08-25 (60 days).
- **Ads tab features:**
  - 4 primary KPIs: Spend, Impressions, Reach, Link Clicks
  - 4 conversion KPIs: **Leads, Cost per Lead, Messages Started, Cost per Message** (read straight from the Meta `actions` / `cost_per_action_type` fields)
  - 4 cost KPIs: CPM, CPC, CTR, Frequency
  - 4 time-series area charts
  - **Campaigns table** sorted by spend, with a 🏆 badge auto-applied to the campaign with the lowest cost-per-lead (falls back to highest CTR if no leads in range)
  - **Click a campaign row → modal drilldown** showing every ad inside that campaign, with thumbnails (from `creative.thumbnail_url`), ad copy, ad set name, lead-level metrics, and "Open ad on Facebook ↗" link

Sample numbers, last 30 days verified live:
- Spend ₹1,64,030 · Impressions 41.8 L · Reach 18.45 L
- **2,456 leads at ₹133.58 / lead**
- 503 messages at ₹675 / message
- Top campaign **Samvaya Matrimony Lead Ads (June 2026)**: 884 leads at **₹41/lead** (winner)

### 2.3 Competitor ad library (Apify + Airtable cache)

The hardest gap to close — Meta's official Ad Library API only returns political/social-issue ads, not commercial competitor ads. Built around that.

- **Apify FB Ad Library Scraper** (`curious_coder/facebook-ads-library-scraper`) wired via the `run-sync-get-dataset-items` endpoint
- Search by keyword + country + active-only + full-creative toggle
- **Airtable cache layer:**
  - New `IG_Competitor_Ads` table created in the **GooCampus marketing hub** base (`appLdJFTrothBLDc0`)
  - 7-day TTL keyed on `(query, country, active, full)` tuple
  - One row per scrape with full payload JSON
- **Cache flow:** every search hits Airtable first → if fresh (<7d) returns instantly with `cached · 1m ago` badge → if stale or missing, hits Apify + writes back to Airtable. Manual **↻ Refresh now** button forces a fresh Apify scrape.
- **"Sync past Apify runs (free)" button:** pulls every successful past Apify run's dataset into Airtable for $0 (the data is already paid for and stored Apify-side). Smart enough to skip if Airtable already has newer data.
- **UI improvements:**
  - **Masonry layout** so vertical reels / square posts / landscape ads pack without gaps
  - **Natural aspect ratio** — no forced 16:9, each ad displays its true dimensions
  - **DPA detection** — Dynamic Product Ads (template ads with `{{product.brand}}` placeholders) are hidden by default with a one-click "+ N catalog ads hidden" toggle. When shown, they get a compact amber banner explaining why there's no creative.
  - **Video poster fallback** — when FB CDN video URLs expire (after a few hours), the card falls back to the poster image with a "Video URL expired — open in Ad Library" overlay.
  - **Preset chips** for IMG Education / Matrimony / Test Prep niches.

### 2.4 Cross-cutting UX improvements

- **Live indicator on every data tab** — green pulsing dot + "Live · fetched Ns ago (XXXms)" + manual **↻ Refresh now** button. Proves to the user that the connection is alive even when picking a non-reactive filter.
- **Active preset highlight** — the date range button matching the current range (7d / 30d / 90d / 6m / 1y) is filled solid purple-on-white instead of grey.
- **Range badge in title** — e.g. "Posts · Last 30 days" or "Audience · Last 7 days". Always visible.
- **30-day API limit banner** — appears on Overview when the user picks 6m / 1y, explaining Meta caps account-level insights at 30 days regardless of picker.
- **Lifetime-data banner** on Audience — explains why the date picker doesn't affect demographics.
- **AI Report button** on every tab — sends the current data slice + filters to Claude API and returns structured "What worked / what dropped / why / 5 next-week actions" analysis.

## 3. Key technical decisions

| Decision | Why |
|---|---|
| Direct Meta Graph API reads (no Airtable cache for IG) | Real-time data was the user's top priority. Adding Airtable warehousing for historical IG data is Phase 2 (see [Pending](#5-whats-pending) below). |
| Apify scrape + Airtable cache for competitor ads | Apify is the only realistic way to get commercial (non-political) competitor ads. Airtable cache keeps cost predictable — even with the free $5/mo Apify plan, the project budget lasts ~10+ months. |
| Stay in Meta Dev Mode (no App Review) | Internal use only — accounts added as testers. App Review would only be needed if managing external client accounts. |
| Long-lived user token (60 days) over per-page tokens for ads | Marketing API doesn't expose page-scoped tokens. User-scoped long-lived works fine; refresh weekly via n8n is the next automation. |
| Single dashboard password (no SSO) | Single-user / small team tool. Can upgrade to Netlify Identity later if needed. |
| Masonry layout for competitor ads | Variable aspect ratios (9:16 reels, 1:1 posts, 1.91:1 landscape) leave gaps in CSS grid. Pinterest-style columns pack them tight. |

## 4. Costs (steady-state, per month)

| Service | Tier | Estimated cost |
|---|---|---|
| Meta Graph API + Marketing API | Standard Access (Dev Mode) | $0 |
| Apify FB Ad Library Scraper | Free $5/mo credit | ~$0.30-0.60 (weekly refresh × 5 niches) |
| Airtable | Free | $0 (free tier supports 1,000 rows + manual edits) |
| Netlify hosting | Free tier | $0 (Next.js stays well under bandwidth limits) |
| Anthropic API (AI Reports) | Pay-as-you-go | <$1 (using Haiku 4.5 at ~$0.003 per report, ~50 reports/mo) |
| **Total monthly run cost** | | **<$2** |

## 5. What's pending

Roughly ordered by user value:

1. **Inbox tab** — reply to IG comments + DMs from this dashboard, synced with Meta Business Suite. We already have `instagram_manage_comments` + `instagram_manage_messages` permissions on the token.
2. **5-agent AI panel** (Ideator / Hook & Script / Planner / Analyst / DM Manager) — using Perplexity Sonar Pro (already-purchased $100 credit) + GPT-4o-mini fallback for creative writing.
3. **Hashtag performance** for owned posts — easy add via existing media insights.
4. **PDF / CSV export** per page — for monthly client/team reports.
5. **Telegram daily digest bot** — yesterday's top winners + threshold alerts (follower drop ≥5%, spend spike, CPL > X).
6. **Best-time-to-post heatmap** (weekday × hour grid using `online_followers`).
7. **Stories webhook capture** — n8n + Airtable to keep stories past 24h.
8. **Cross-account "Compare all 5"** view — real aggregation rather than defaulting to GooCampus Edu.
9. **Influencer discovery** in IMG/Matrimony/Test Prep niches via Apify.
10. **Sentiment analysis** on incoming comments via Perplexity.
11. **n8n weekly token-refresh workflow** so the 60-day Meta token doesn't expire silently.
12. **Native IG/FB scheduler** integration (you've explicitly deferred this — Meta Ads Manager + the separate IG+FB scheduler n8n workflow will keep doing posting).

## 6. Repo / hosting / credentials

- **Repo:** https://github.com/beast-clone/goocampus-ig-dashboard (private)
- **Default dev password (local only):** `GC_Dashboard_726b1c84` — change for production via `DASHBOARD_PASSWORD` env var
- **Backups of `.env.local` and `accounts.local.json`** live on external SSD at `/Volumes/SSD - Praveen/goocampus-ig-dashboard-secrets/`
- **Meta Developer App:** "GooCampus Analytics", App ID `1325868559684543`, Business `417097980219999` (GooCampus Edu Solutions Private Limited)
- **Long-lived token expiry:** 2026-08-25 (~60 days). Refresh procedure in [README.md](./README.md#refreshing-the-60-day-meta-token).
- **Airtable base:** GooCampus marketing hub, `appLdJFTrothBLDc0`, new table `IG_Competitor_Ads` (`tbl4cgd1oLDmEU5Hw`)
- **Apify account:** free tier, $5/mo credit, ~$0.075 consumed during build
- **Primary ad account:** `act_490085459361407` (GooCampus Edu)

## 7. How to use it day to day

| You want to… | Open this tab |
|---|---|
| Know overall follower growth + daily gains | Overview |
| See which posts/reels are working this week | Posts / Reels |
| Understand who your audience is | Audience |
| Check ad spend, leads, CPL, top campaigns | Ads |
| Click into a campaign to compare its ads | Ads → click any row |
| See what competitors are running ads on | Competitor Ads → search a keyword |
| Get AI-written analysis of any slice | Click "✨ Get AI Report" on any tab |

To switch brand accounts, use the sidebar dropdown.

To change date range, click `7d / 30d / 90d / 6m / 1y` at the top right. The active preset highlights solid purple; the badge under the title confirms which range you're seeing.

To prove the page is live: the green pulsing dot ticks up "Live · fetched Ns ago" every second. Click "↻ Refresh now" to force a re-fetch — you'll see the spinner, "Fetching…" text, then a fresh latency value in ms.

---

*End of report. For technical operations and deployment, see [README.md](./README.md).*
