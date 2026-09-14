# Monthly Report — target format (from GooCampus May 2026 Monthly Report)

The team's monthly report (maintained in Notion) is the **target format** for the
dashboard's report generator (AI Reports tab → `ReportView`). Source sample:
"May 2026 Monthly Report". This spec captures every section + which data source
feeds it, so the generated report can be reshaped to match and presented as-is.

## Section order (top → bottom)

1. **Title** — `<Month> <Year> Monthly Report`
2. **Achievements** (callout) — leads converted this month (with organic breakdown),
   all-time-high notes, strategy notes, platform highlights. **MANUAL.**
3. **Focused SBUs** — bullet list of focused SBUs + per-event write-ups (webinars /
   live sessions: registrations, attendees, purpose). **MANUAL.**
4. **AMC E-Book** — total sales so far + note. **MANUAL.**
5. **Newsletter** — total subscribers + note. **MANUAL.**
6. **Total Organic Leads** — table, one row per month (last ~12):
   `Month | IG/Fb | DM Bookings | YT Enquiries | Website | Inbound Call | Total`.
   **AUTO** from Sales Hub CRM (leads by source, grouped by created-month), organic only.
7. **Lead Status** — chart. **AUTO** from CRM (by status).
8. **Total Lead Status (SBU)** — chart. **AUTO** from CRM (status × SBU/interest).
9. **Instagram — monthly table** (last ~18 months):
   `Month | Followers | Reached accounts | Content Interactions | DM | Leads | Post | Reel | Story`.
   **AUTO current month** (Meta IG Graph) + **HISTORY = manual/snapshot** (see note).
10. Instagram sub-sections, each = short note + chart: **Leads, Followers, Content
    Interactions, DMs, Posts, Reels, Stories**. **AUTO charts** from monthly series.
11. **Metrics for likes, comments, saves & shares** — month-over-month table
    (`Metrics | Apr | May | … `). **AUTO current** + history.
12. IG sub-sections: **Saves, Comments, Shares, Likes** = note + chart.
13. **Best-performing content on Instagram** (all SBUs) — top posts (images). **AUTO** (Top posts).
14. **Instagram Performance Summary** — Key Insight + **Growth Summary** (MoM % per
    metric: followers, content interactions, likes, comments, saves, shares, DMs, leads).
    **AUTO numbers** (this month vs last) + AI prose.
15. **YouTube** — monthly table `Month | Subscribers | Views | Video | Shorts | leads`;
    YT Leads + YT Analytics charts; **YouTube Performance Summary** + areas of improvement;
    best-performing YT content. **AUTO current** (YouTube Data/Analytics) + history + AI prose.
16. **Facebook** — monthly table `Month | Views | Post | Reel | Content Interactions | Followers`.
    **AUTO current** (FB Graph) + history.
17. **LinkedIn** — monthly table `Month | Followers | Impressions | Reactions | Posts | Comments`
    + chart. **AUTO current** (LinkedIn API) + history.
18. **Future Prospects** — strategy bullets. **MANUAL.**
19. **Post-Meeting Action Notes** — **MANUAL.**

## Key constraint — historical month-over-month data

The template tables show 12–20 months of history. The live platform APIs return
**current** numbers, not months of back-history. That history was compiled manually in
Notion over time. So:
- **This month's row** for every table = auto (live API + CRM).
- **Prior months** = need a one-time import (paste the existing Notion tables) OR are
  filled going forward by a **monthly snapshot** the dashboard writes each month.
- Plan: a monthly snapshot store (per platform) in `discover_cache` (reuse the pattern
  from the Overview snapshot history), seeded once from the Notion tables, appended each
  month by the existing daily/monthly n8n job. See [[overview-metrics-snapshot-history]].

## Manual sections

Achievements, Focused SBUs, AMC E-Book, Newsletter, Future Prospects, Post-Meeting
Action Notes cannot be derived from any data source. The report generator needs
**editable text fields** for these (saved with the report so re-opening keeps them).

## Current generator (for reference)

`app/(dashboard)/dashboard/preview/ai-reports/` — `page.tsx` (weekly/monthly/quarterly
generate buttons) + `ReportView.tsx` (renders `ReportPayload` from `/api/ai-report`).
Today it is **Instagram-only, single-period**, live from Meta IG Graph + Sales Hub CRM,
AI prose by Perplexity. Range buttons (7d/30d/90d/6m/1y) in the shell — **leave as-is.**

## Build phases

1. **Layout + scaffold** — reshape ReportView to the template's section order; add the
   four platform blocks (IG/YT/FB/LinkedIn) and manual text-box sections (empty for now).
2. **Auto data** — YT/FB/LinkedIn current-month numbers; CRM Total-Organic-Leads,
   Lead-Status, Lead-Status-by-SBU grids; the MoM tables (current row live, prior rows
   from the snapshot store).
3. **Monthly snapshots** — per-platform monthly snapshot writer + one-time Notion import,
   so history fills over time.
4. **Manual fields** — editable, saved-with-report text for Achievements / SBUs /
   E-Book / Newsletter / Future Prospects / Action Notes.
