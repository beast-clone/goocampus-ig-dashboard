# Member Dashboard (My Workspace) + Briefing tab — research & plan

_Captured 2026-08-03. Handoff doc: read this + the mockups (`public/mockups/member-briefing.html`,
`public/mockups/member-briefing-v2.html`) before continuing the build._

---

## 1. Two dashboards (locked decision)

- **Admin dashboard** = what we have now, incl. the **Marketing Hub** (Workload · Master sheet ·
  Pipeline · Content calendar, **team-wide**). This is _sorted — do not change it._
- **Member dashboard** = **My Workspace** (renamed from "My Day"). What an individual teammate sees
  when they log in. The clock starts on login.

## 2. My Workspace — Stage 1 (DONE, verified live)

Added an internal **tab bar** inside My Workspace: **My Day · Workload · Master sheet · Pipeline ·
Content calendar**. The four non-"My Day" tabs reuse the **exact admin Hub components**, fed data
**scoped to the logged-in member** (by `owner`). No person-picker — it follows whoever is logged in
(and syncs with the admin "Viewing as" switcher in My Day).

How it's wired:
- Extracted the Marketing Hub implementation into a plain module
  `marketing-hub/MarketingHub.tsx` (Next won't let a `page.tsx` export named view components).
  `marketing-hub/page.tsx` is now a thin `export { MarketingHubPage as default }`.
- Exported from `MarketingHub.tsx`: `Row`, `Facets`, `Data`, `ymd`, `ownerMatchesKey`,
  `TeamView`, `PipelineView`, `CalendarView`, `MasterTab`, `DetailModal`.
- New `my-day/MemberHub.tsx` fetches `/api/marketing-hub`, filters rows to the member via
  `ownerMatchesKey(row.owner, person)`, renders the chosen view.
- `my-day/HopeMyDay.tsx` hosts the tab bar inside its own `.main` content column (My Day owns its
  shell/sidebar) and swaps the body: `wsTab === "myday" ? <day content> : <MemberHub person tab>`.
  Reuses HopeMyDay's existing `person` state.
- Sidebar label renamed **"My Day" → "My Workspace"** (`HopeSidebar.tsx`).

Verified live: Master sheet + Content calendar render scoped to Nandu (his tasks only);
admin Marketing Hub still team-wide (17 tasks). tsc clean.

**Stage 2 (pending):** relabel the reused view headers for the member context (Calendar still says
"Team calendar / everything the marketing team is on"); spot-check Workload + Pipeline tabs.

## 3. Briefing tab (new member landing) — competitor + market intelligence

When a member logs in, the first screen is a **Briefing** — an at-a-glance feed of what the
**competition + the wider market** did. **Nothing about GooCampus's own content** (that stays in
Analytics). **Never** our scheduled posts.

Mockups: `public/mockups/member-briefing.html` (v1, mixed) and
`public/mockups/member-briefing-v2.html` (v2 — competitor-only + trending + the flow). v2 is the
current direction.

Sections in v2:
- **Competitor scoreboard** — followers/growth, engagement rate, posts/30d per competitor.
- **Latest competitor posts** — Instagram (live) + YouTube/LinkedIn (needs connector), openable.
- **Competitor ads running now** — Meta Ad Library.
- **Top competitor content** — their best posts by reach.
- **What people are saying** — Reddit/Quora/MouthShut/News mentions + sentiment.
- **Trends they could jump on** — Google Trends breakouts.
- **Trending beyond medical (trend-jack)** — viral/general content to remix (e.g. the tower-couple
  flag clip → "Free MBBS cutoff on 12thplus.com"). Each has an **"Adapt this →"** button.

## 4. Data-source feasibility — LIVE vs NEEDS WIRING

| Feature | Status | Source / notes |
|---|---|---|
| Competitor **Instagram** (scoreboard, posts, top content) | **LIVE** | Benchmark tab → `lib/instagram.ts` `fetchCompetitor()` (business_discovery). Handles in `competitors.json`. Fields: followers, media_count, avgLikes/Comments, engagementRatePct, postsLast30d, recent[] with `permalink`. |
| Competitor **Meta ads** | **LIVE** | Competitor Ads tab → `lib/apify.ts` (Apify FB Ad Library). Fields: page_name, ad_text, cta, images/videos, start/end (→ running days), is_active, publisher_platforms, permalink. **No objective.** |
| **Content Radar** mentions + sentiment | **LIVE** | `lib/web-mentions.ts` — Google News, Reddit, Quora, MouthShut, ValueMD (Serper). Sentiment via lexicon. |
| **Google Trends** (topics) | **LIVE — PROVEN** | `lib/google-trends.ts` RSS `https://trends.google.com/trending/rss?geo=IN`. No token. |
| **YouTube trending** (viral videos) | **LIVE — PROVEN** | Data API `videos.list?chart=mostPopular&regionCode=IN` via `YOUTUBE_API_KEY` (already in `.env.local`). |
| Competitor **YouTube / LinkedIn** posts | **NEEDS WIRING** | YouTube tab is our own channels only; no competitor YT/LinkedIn tracking anywhere. |
| General **viral Instagram** feed | **NEEDS WIRING** | Graph API has no "trending" feed. Proxy = hashtag top-media + specific creator accounts. |
| **Trending audio** | **NOT VIA META GRAPH** | No API exposes it; lives only in the IG app. Needs a paid 3rd-party tool, or manual. |
| Google/YouTube **ads**, competitor **keyword rankings**, true **share of voice** | **NEEDS WIRING** | Only Meta ads + our own Search Console keywords today. |

### Trending from the 5 sources — reality
- **YouTube** ✅ trending (mostPopular) — PROVEN. **Google** ✅ Trends RSS — PROVEN.
- **Instagram** ⚠️ proxy only (hashtag top-media / creator accounts); no trending audio via Graph.
- **Facebook** ❌ no trending API (deprecated 2018). **LinkedIn** ❌ no trending API.

## 5. Trend-jack flow (spot → post)

1. **Spot** it in the Briefing → 2. **Adapt this** (pull the format/idea + link out) →
3. opens in **Content Studio**, remix into our message → 4. **Manya** approves & assigns →
5. producer makes it → **Pipeline**.

Steps 3–5 **already exist** (Content Studio generate/edit + Approve→assign→Content-Pending). The only
new piece is the **"Adapt this"** button carrying the trend in as the brief.

## 6. Live proof — run 2026-08-03 (both HTTP 200, no new tokens)

**Google Trends · India:** Samsung Galaxy F70 Pro 5G (10k+), gold rate, **UGC NET June 2026**,
Mahesh Bhatt, T Dilip (cricket), "4 August horoscope" (20k+) — mix of general-viral + occasional
on-topic.

**YouTube trending · India:** RAMAYANA Official Trailer (Sony · 18.5M views), Krrish 4 / Korean
Kanakaraju / Thudakkam trailers, T-Series music, BGMI (2.2M), Minecraft, Bhojpuri songs (1M+) — real
viral videos with title, channel, views, thumbnail, link.

Feed will have noise (gaming, random songs) → surface the biggest, let the team pick. "Sometimes
useful, sometimes not" is acceptable (user's words).

## 7. Build plan / open decisions

- **Phase 1:** build the Briefing on LIVE sources — competitor Instagram (scoreboard/posts/top),
  Meta ads, Content-Radar mentions, **YouTube trending + Google Trends** — each item carrying the
  **"Adapt this → Content Studio"** flow. Refresh daily / every couple hours (n8n or scheduled task).
- **Phase 2:** connectors for competitor YouTube/LinkedIn + a viral-Instagram feed;
  (optional) trending audio via a paid 3rd-party tool.
- **Open:** keep the name **"Briefing"**? refresh cadence (daily vs 2h)? viral-video source
  confirmation (YouTube trending is proven).
