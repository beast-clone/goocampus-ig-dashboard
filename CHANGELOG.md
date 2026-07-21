# Changelog

Every day of work on this dashboard gets its own dated section here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/).

## 2026-07-21 (pt 3) — Team permissions (per-person capability toggles)

**Finer-than-Airtable permissions on the Team page.** Instead of 5 fixed levels, each
person gets individual **function checkboxes** (`lib/permissions.ts`): create tasks,
edit, delete, assign, approve content, reschedule, view analytics, manage team. So
"create but not delete" is one click. Three presets (Producer / Manager / Viewer)
seed the boxes, then fine-tune. Admins bypass (implicitly all).

- Storage: new `ind_users.permissions` jsonb (only `true` values kept). `hasCapability(user, cap)`
  helper for enforcement (admin bypass).
- Team page: new **Access** column → expandable per-person panel with presets + 8 boxes.
- API: `/api/admin/team` PATCH accepts `permissions`; GET returns it. Roster (`team-db`)
  threads it through.
- NOTE: this ships the permission MANAGEMENT + storage + helper. Wiring each capability
  into its action (gate create/delete-task endpoints on `hasCapability`) is the next
  increment — the helper is ready.

## 2026-07-21 (pt 2) — Diagnostics tab (self-healing system health)

**New Diagnostics tab** (`/dashboard/hope-preview/diagnostics`, separate from
Integrations). One click checks all 11 systems live (Meta, YouTube, LinkedIn,
Airtable, SendPulse, Supabase, Perplexity, Serper, Reddit, Apify, HikerAPI),
**auto-repairs** what it safely can, and flags the rest — no Claude Code, all
deterministic server code (`lib/diagnostics.ts`).

- **Auto-repair tiers:** one automatic retry on transient failure · YouTube access
  token auto-refresh · "clear cache & refetch". Auth/key failures become a
  **Reconnect** / **Add key** action instead (can't silently re-consent).
- **Host health:** app RAM (`process.memoryUsage`), system RAM, uptime, per-service
  latency, avg response — real when self-hosted; on serverless reflects the instance.
- **Daily run + stored report:** `/api/cron/diagnostics` (x-cron-secret) runs the
  full check and stores a report row in Supabase `mh_diagnostics_runs`. Point n8n at
  it once a day (~5 AM IST) at deploy time. History list on the tab reopens any run.
- **Reconnect without redeploy:** new `mh_integration_tokens` table + `getIntegrationToken()`
  (reads override first, env fallback). The Reconnect modal saves a fresh pasted
  token there and the integration goes live immediately.
- Routes: `/api/diagnostics/{run,history,reconnect,clear-cache}`; nav item + `IconActivityHeartbeat`.

## 2026-07-21 — Content Radar: Reddit/Quora/MouthShut/ValueMD mention lanes

**New "site:" mention lanes.** Content Radar now watches Reddit, Quora, MouthShut,
and ValueMD alongside Google News. One combined `(site:reddit.com OR site:quora.com
OR …) <brand>` query via **Serper.dev** (`lib/site-search.ts`), merged into
`searchWebMentions` and sentiment-scored. Google News stays a separate free RSS
source — zero Serper credits. Engine priority: Serper (keyed) → Brave → DuckDuckGo
(keyless best-effort, blocks datacenter IPs). Gotcha baked in: Serper's FREE tier
only allows `num=10`.

**Credit guardrails.** Serper's 2,500 free credits are ONE-TIME (no monthly renew),
so: a monthly cap `SERPER_MONTHLY_BUDGET` (default 200) enforced via
`callsThisMonth("Serper")` in `lib/api-usage.ts`, plus 6h result caching
(`SITE_SEARCH_TTL_MS`) so the brand-watch firing on every page load costs 1 credit /
6h, not per load. Past the cap the lanes return empty; News is unaffected. New
**Serper** card in Integrations with a credits-used meter (used/2,500 + month/cap).

**Clickable source chips.** "Sources we scan" chips are now filters — click Reddit →
only reddit.com mentions, etc. — each showing a live per-source count.

**Inline mention reader (`MentionModal`).** Clicking a mention opens it inside the
dashboard: Reddit → full thread + comments via Reddit's official API
(`lib/reddit.ts`, `/api/radar/reddit-thread`, app-only OAuth) with snippet fallback;
Quora → snippet (no API); MouthShut/ValueMD/news → full inline read via Readability.
A "📖 Read full thread on Reddit" button opens the real thread. NOTE: Reddit closed
self-service API access in 2026 — the thread reader is built but DORMANT until a
Reddit app is manually approved; without `REDDIT_CLIENT_ID/SECRET` it shows the
snippet + Reddit link. Reddit card added to Integrations.

**Layout.** Pulse tiles (Brand mentions · Rising searches · Headlines today ·
Breakouts) moved to the top and are now clickable — each smooth-scrolls to its
section. "Search the web & your brand" sits directly below. The separate Brand-watch
card was removed (redundant with the pulse tile + mentions list).

## 2026-07-18 (pt 2) — Calendar creatives, V1 retired, My Day creatives

**Publishing Calendar — creative preview in the post modal.** Clicking a post now
shows its creative: image → shown; carousel → slideshow (‹ › + dots + N/total);
reel/video → inline `<video controls>` (real posts) or a portrait poster with a ▶
to the Instagram permalink. Sources `post.mediaUrls` (already returned by
`/api/scheduler/queue`); demo posts seeded with self-contained data-URI SVG
creatives so it's demonstrable. **Reels/carousels open a WIDE landscape modal**
(media in a left column sized to its shape — no black side-bars — details on the
right); single images keep the compact layout. (`calendar/HopeCalendar.tsx`.)

**V1 dashboard retired / offline.** Admins kept landing on the old `/dashboard`
(V1) after login. Middleware now lands admins on `/dashboard/hope-preview` (V2)
and redirects ANY other `/dashboard/*` path to V2, so V1 is never served or opened
by accident. V2 is a superset of V1's active tabs (V1's extras — discover/dms/
hashtags/inbox — are already hidden/orphaned; V2 adds Content Review + Website).
**V1 files are kept on disk** — delete the redirect block in `middleware.ts` to
bring V1 back. Fully reversible.

**My Day — Creatives & files wired + preview.** The "Creatives & files" box was a
dead dropzone; now upload (click or drag-drop) persists to `mh_attachments`
kind='creative' and shows immediately, creatives render as real thumbnails (post
media + uploads, each removable), and clicking one opens a preview overlay (image /
carousel slideshow / video play). `/api/my-day` now returns creative URLs + fetches
kind='creative' attachments. Verified live end-to-end (upload → thumbnail → preview
→ remove; test data cleaned up).

Also: scrapped the throwaway `/calendar-v2` full-shell comparison tab (kept the
original gradient-hero calendar + the shared library exports).

All committed on `feat/hope-ui-reskin`. Admin login = Maheen (`maheen@goocampus.in`);
members land on `/me`. V2 lives at `/dashboard/hope-preview/`.

## 2026-07-18 — Task timing, publish link write-back & full Hope-UI theme sweep

**My Day — task timing captured + shown.** A new task now stamps `start_at` on
creation and `end_at` the first time it reaches a done state; the My Day task
detail shows **Created / Started / Time taken** (mirrors the Content Calendar
modal). Verified live: creating a task set `start_at`; the modal showed the
timestamps. (`create/route.ts`, `update/route.ts`, `my-day/route.ts`,
`HopeMyDay.tsx`.)

**Published Links auto-fill on publish.** New write-back seam `lib/mh-linkback.ts`
+ `POST /api/scheduler/link-back`: when a post goes live, its permalink is written
onto the matching `instagram_url` / `facebook_url` / `linkedin_url` column,
`published_at` is stamped, the change is logged to the activity feed as "System",
and the read cache is busted — so Published Links + My Day reflect it everywhere.
Resolves the post by `mh_posts.id` OR `airtable_record_id` (the n8n integration
point). The IG app-direct publish route now routes its write-back through the same
helper. Verified live (DB-level, no real post published). **Still to wire:** the
n8n IG+FB scheduler must POST to `/link-back` after publishing for FB/LinkedIn/
scheduled posts to auto-fill.

**Pipeline tab → Hope UI.** Sections now use the brand-tinted `Panel` header
(icon + `#232D42` title), `rounded-xl` cards, `#232D42`/`#8A92A6` text tokens.

**Whole-app theme sweep (all 22 shell tabs).** Audited every tab against the Hope
UI reference and normalized to one scale: **section/card headers → 16px
`text-base font-medium #232D42`**, tiny <12px content raised (labels 12px, body
14px), `font-bold` → semibold (plus a central `.hope-scope` cap), off-brand
violet/blue/pink accents → brand `#3A57E8` — keeping platform data colors
(FB `#1877F2`, LinkedIn `#0A66C2`, GA orange, YT red) and semantic status colors.
Worst offenders fixed: Social Leads (was zero-brand), Scheduler (38 violet),
Audience (`rounded-3xl`), AI Reports / Post Planner (tiny type).
- **Follow-up fix:** the sweep left some Sales Hub / Posts / Benchmark headers &
  numbers colorless → they inherited the muted grey default and looked washed out.
  Added explicit `#232D42`; the AI Reports gradient hero got `!text-white`.
- **Verified live tab-by-tab:** opened all 24 tabs in the browser — every one
  renders on-brand with dark headers/numbers, no washed-out text, no <12px content.
- **NOT yet reskinned (deferred):** My Day and the Publishing Calendar tab still
  use their own custom CSS (`.hmd` / inline). They render fine but aren't on the
  shell standard — the only remaining theme gap.

Workload tab: bumped its cramped 10–12.5px timeline/task text to the 14px norm.

## 2026-07-18 — Handoff note (work continues next session)

Search-indexing follow-up: all 6 live goocampusevents.com landing pages were submitted to **Google Search Console** (URL Inspection → Request Indexing) and **Bing** (URL Submission). Every landing page inspected as *"URL is not on Google — no referring sitemaps, no referring pages"* (home was the only page already indexed) — i.e. Google/Bing can't discover them on their own.

**Still to do next session:**
- **Deploy `sitemap.xml` + `robots.txt`** to the goocampusevents.com site — this is the *permanent* fix (the site is a separate Netlify project `goocampus-university-webinar`, NOT this repo; needs its source repo/folder). Files are generated (see the AI/SEO entry below). Then submit the sitemap URL in Google Search Console + Bing.
- Optional: retire the legacy `/api/ai-insights` POST route (unused after the Perplexity migration); decide on deploying the dashboard.

## 2026-07-17 — AI insights (Perplexity) on the Website tab + sitemap/robots + Bing URL submission

**AI insights** — the dashboard now *suggests*, not just displays. Added a reusable "Analyze with AI" panel powered by **Perplexity** (Sonar, live web search + citations).
- `lib/ai.ts` — zero-dep Perplexity client (OpenAI-compatible chat completions). `PERPLEXITY_API_KEY` in `.env.local`.
- `app/api/website/insights/route.ts` — gathers live GA4 + Clarity + Bing, builds a compact data summary, sends it to Perplexity with a senior-growth-marketer system prompt, returns prioritized recommendations. Cached 30 min per window.
- `components/AiInsights.tsx` — reusable button+panel with a tiny zero-dep markdown renderer (headings/bold/bullets) + citation footnotes. Used on the central AI Insights tab AND each Website sub-tab.
- **Per-tool scoping:** `/api/website/insights?source=ga|clarity|bing` analyses each source ON ITS OWN with a tool-specific prompt (GA → traffic/conversion; Clarity → UX/behaviour; Bing → SEO). Every Website sub-tab (Google Analytics / Clarity / Bing) has its own accent-matched "Analyze" button — the reader gets advice for the tool they're on, not a mash-up.
- **Central AI Insights tab** (`ai-insights/page.tsx` rewritten): `app/api/ai-insights/overview/route.ts` gathers the selected account's Instagram (`/api/insights` + `/api/posts`) + Meta ads (`/api/ads`, cookie forwarded for session auth) + the goocampusevents.com website (GA4 direct), summarizes, and asks Perplexity for a prioritized cross-channel plan. Replaced the old OpenAI (out-of-quota) IG-only generator.
- Verified live: Website-tab analysis referenced 679 sessions / 72.2% bounce / /neet-pg-community 514 views; central tab connected channels — "$168k ad spend → 4,120 leads but 0 website conversions, fix the funnel before scaling," Carousels beat Reels 1.5:1. **Both** "Analyze" halves done.
- **AI Reports migrated to Perplexity too** (`app/api/ai-report/route.ts`): swapped the OpenAI (out-of-quota) call for `askPerplexity` — kept all local number-crunching + the structured `ReportPayload` shape, only the model call + a robust JSON extractor changed. Verified: full monthly report renders (3,872 followers / 1.74M reach / 880 leads → 11 contracts, funnel-bottleneck exec summary). (The old `/api/ai-insights` POST route is now unused/legacy.)

**SEO indexing** — goocampusevents.com had no sitemap/robots (both 404). Submitted the 6 live landing pages to Bing (URL Submission), and generated `sitemap.xml` + `robots.txt` (in scratchpad) for the user to deploy to the site — then submit the sitemap to Google Search Console + Bing.

## 2026-07-17 — Website → Bing tab: Bing Webmaster search performance (completes the 3-source tracker)

Third and final source. The **Website** folder now holds **Google Analytics · Clarity · Bing** for goocampusevents.com — the "one pane instead of three tabs" goal is met.

- goocampusevents.com was already a verified property in Bing Webmaster (imported via the linked Google Search Console account). Generated an account-level API key (Settings → API access → API Key) → `.env.local` as `BING_WEBMASTER_API_KEY` (+ `BING_SITE_URL=https://goocampusevents.com/`).
- `lib/bing.ts` — calls `GetRankAndTrafficStats` (daily clicks/impressions), `GetQueryStats` (top queries), `GetPageStats` (top pages) on the JSON endpoints; parses the WCF `/Date(ms-offset)/` format.
- `app/api/website/search/route.ts` — cached 6h.
- `app/(dashboard)/dashboard/hope-preview/website/search/page.tsx` — Hope UI, Bing-teal accent: Clicks/Impressions/CTR/Avg-position KPIs, clicks-&-impressions area chart, top-queries table, top-pages table, "Open in Bing" link, and an honest empty-state banner.
- Sidebar: added **Bing** child under the Website folder in `HopeSidebar.tsx`.

Verified live: API returns HTTP 200 but **0 clicks / 0 impressions** (Bing isn't ranking the site yet — every Bing property in the account is flat at zero). The tab is correct and will populate if/when Bing sends traffic; the empty-state banner says so.

## 2026-07-17 — Website → Behavior tab: live Microsoft Clarity for goocampusevents.com

Second source of the web-analytics group. **Website** is now a sidebar folder with **Traffic** (GA4) and **Behavior** (Clarity) children.

- Clarity project: "Univeristy Webinar June 15th 2026" (ID `x258m54ioh`, URL goocampusevents.com). Generated a Data Export API token (Settings → Data export) → `.env.local` as `CLARITY_API_TOKEN` (+ `CLARITY_PROJECT_ID`).
- `lib/clarity.ts` — fetches `project-live-insights` (last 3 days; the API's hard limit) and reshapes traffic, engagement time, scroll depth, the six frustration/error signals (rage/dead/quick-back/excessive-scroll/error-click/script-error), and Device/Browser/OS/Country/Referrer/PopularPages breakdowns.
- `app/api/website/behavior/route.ts` — cached **3h** (Clarity caps the API at 10 calls/project/day); client SWR has `revalidateOnFocus:false` to avoid burning calls.
- `app/(dashboard)/dashboard/hope-preview/website/behavior/page.tsx` — Hope UI, Clarity-violet accent: 6 KPIs, frustration-signal tiles, popular pages, breakdown donuts, "Open in Clarity" link, and an explicit note that heatmaps/recordings aren't API-exposed.
- Sidebar: Website leaf → folder (Traffic + Behavior) in `HopeSidebar.tsx`.

Verified live (sparse but real: 1 session / 6 users / 3 bot sessions / 8% scroll depth over 3 days — webinar traffic has wound down). **Remaining:** Bing Webmaster.

## 2026-07-17 — New "Website" tab: live Google Analytics for goocampusevents.com

Added a **Website** tab under the Analytics section (`/dashboard/hope-preview/website`) that pulls **live GA4 data** for the GooCampus Events property (`540348377`) — first of a planned 3-source web-analytics group (GA4 done; Microsoft Clarity + Bing Webmaster still to come).

**What was set up (via Google Cloud + GA Admin):**
- Service account `ig-dashboard-ga-reader@gc-dashboard-analytics.iam.gserviceaccount.com`, Analytics Data API enabled, granted **Viewer** on the GooCampus Events property. Credentials in `.env.local` (`GA4_PROPERTY_ID` / `GA4_CLIENT_EMAIL` / `GA4_PRIVATE_KEY`). For a Netlify deploy these three must be set in the Netlify UI.

**What was built:**
- `lib/ga4.ts` — **zero-dependency** GA4 Data API + Realtime API client: signs the service-account JWT with Node's built-in `crypto`, caches the access token, runs **16 reports across 4 parallel `:batchRunReports` batches** plus `:runRealtimeReport`, all over `fetch`. No `@google-analytics/data` / `googleapis` added.
- `app/api/website/traffic/route.ts` — heavy report set cached 10 min; realtime kept fresh (30s, best-effort).
- `app/(dashboard)/dashboard/hope-preview/website/page.tsx` — Hope UI page (GA-orange accent) rendering the **full Data API surface**: realtime "active now" strip, 6 KPI tiles, users-over-time chart, conversions/events table, top pages + landing pages, channels + source/medium, countries + cities, devices + browsers + OS, and new-vs-returning + age + gender + languages. Age/gender degrade to an empty state (need Google Signals). "Open in GA" deep-link for the reports no API exposes (Explorations/funnels/paths).
- Nav wiring: `"website"` added to `HopeTab` (`HopeShell.tsx`) + a **Website** leaf under Analytics in `HopeSidebar.tsx`.

Verified live in the authenticated dashboard: real numbers (634 users / 672 sessions / 7 active now; India 86%, Hyderabad 28%, Android Webview 75%, meta/paid_social 68%). **Two GA-config gaps surfaced:** Key events = 0 (no events marked as conversions in GA4) and age/gender withheld (Google Signals off).

## 2026-07-17 — Marketing Hub Content Calendar reskinned to match the Publishing Calendar

Restyled the Marketing Hub's **Content Calendar** tab (`/dashboard/hope-preview/marketing-hub?tab=calendar`) so it reads as a sibling of the Hope UI Publishing Calendar — same visual DNA (gradient hero, overlapping title card, full-width month card, colored event pills), same Hope V1 event-pill style. The old flat white-card layout is gone.

**What changed** in `app/(dashboard)/dashboard/hope-preview/marketing-hub/page.tsx`:

- **Hero band** — indigo→violet gradient, deliberately distinct from the Publishing Calendar's blue so team members don't confuse "team calendar" with "socials-only calendar". "Team calendar" tag, "Content Calendar" headline, one-line subtitle, and a live "N tasks in view" stat card on the right that reflects the active brand filter.
- **Title card** overlapping the hero, showing the month + a live entry count and the "drag any card to reschedule" hint.
- **Brand quick-filter chips** above the grid — one chip per SBU with an SBU-color dot and count; one click isolates that brand across the whole calendar (active chip goes to filled-dark). The hero stat + title-card counter both update to reflect the active brand.
- **Event pills** adopt the Hope V1 look — 1px border matching a soft-tint background, colored text driven by task **status** (Content-Pending = gray, Content-In-Progress = amber, Content-Approved = green, Output-Ready = blue, Ready-to-Publish = green-mint, Published/Scheduled = purple). Status meaning is now legible across the grid.
- **Primary interest visible on every pill** — small SBU-color square at the left + SBU name on the right (ellipsis-truncated), so brand reads at a glance even without a filter set.
- **Status legend** at the bottom auto-hides statuses not currently in view (dropped the old all-SBU legend — the brand chips do that job).
- **Kept intact** — drag-to-reschedule (writes `publishing_date` to Supabase via `saveField`), click-to-open modal, range prop driven by the hub-level range picker, "+ N more" overflow.

Scoped under `.mhcal-*` class prefix so nothing collides with `.hcal-*` (Publishing Calendar). No other tabs touched. V1 (`/dashboard/marketing-hub`) is untouched and separate.

Shipped as commit `7d6eb60` on `feat/hope-ui-reskin`.

## 2026-07-17 — Workload: Today / This-period tabs, My Day team, in-tab date range

- Split the Workload into two sub-tabs: **Today** (the per-person planned timeline; expand a person → each task's name + primary interest + time) and **This period** (the stat cards → click a person to drill into their tasks grouped by status, each showing a "Nd at stage" days-stuck badge from `lastModified`).
- Roster now matches the My Day team exactly — Manya (Content), Praveen (Ads · Senior Graphic Designer), Nikhil (Video editor · short-form), Nandu (Video editor · long-form) — same colours + avatars.
- Removed the top date bar on the Marketing Hub (new `hideRange` prop on `HopeDashboardShell`, which now also exposes `setRange`) and moved the range **next to the tabs**: 7d / 30d / 60d / 90d chips + a custom from–to picker, driving the "This period" overview.

## 2026-07-17 — Marketing Hub Workload: planned day-timeline per person

- The Workload tab's compact stat cards are now full-width **timeline rows** (like My Day's Team-capacity view) built from each person's **real** `mh_posts` tasks: a 9 AM–6 PM day-plan bar (tasks laid out by type-estimated duration, lunch + free blocks, a live "now" line), the now/next task, a Full / "Xh free" load badge, and the real Today / This week / Overdue / Done counts. "All tasks ↓" still expands the full list.
- Since the team doesn't log start/stop times, the bar is an honest **plan** (suggested schedule from real pending tasks), not live time-tracking.
- `HopeSelect` now accepts an optional `placeholder` (the marketing-hub facet filters use it).

## 2026-07-17 — Sidebar: "Social Media" section + fix the marketing-hub build

- **Sidebar regroup** (`HopeSidebar.tsx`) — moved **Publishing Calendar, Scheduler, and Post Planner** out of Content into a new **Social Media** section. Content now holds Marketing Hub, My Day, and Content Radar.
- **Build fix** — the 16 Jul marketing-hub commit imported a shared `HopeSelect` from `@/app/(dashboard)/dashboard/hope-preview/HopeSelect`, but that file was never committed (it only existed as a local function in `scheduler/page.tsx`), so the branch failed to compile. Added the missing `HopeSelect.tsx` (same API/styling, extracted from the scheduler) so the marketing-hub calendar reskin builds.

## 2026-07-16 — Scheduler goes Supabase-only + Post Planner becomes a Perplexity-ranked drag-drop calendar

All on `feat/hope-ui-reskin`. The whole V2 flow is now Supabase-native (`mh_posts`) — no Airtable writes; the only remaining Airtable use is reading post captions from the Content Calendar's Content field.

**Post Planner** (`/dashboard/hope-preview/post-planner`) — reworked from a static ranked list into a two-tab, drag-and-drop calendar for @12thplus:

- **Two calendar tabs** — **AI post planner** (AI-suggested order) and **Publishing calendar** (the team's real `publishing_date`s), with month navigation.
- **Drag to reschedule** — drop a post on a new day → writes `publishing_date` to Supabase, so it reflects in the team's Marketing Hub. An in-app "moved" note is stamped on the row as the owner's notification.
- **Ownership guard** — a post being worked on (status Content-Approved and due within 1 day) shows an "already being worked on" popup before it can be moved.
- **Daily-limit guard** — @12thplus max 2/day; moving/accepting onto a full day asks first.
- **Right-hand detail sidebar** (replaces the popup) — creative (carousel/video, or a "View creative in Slack" link when media isn't uploaded), caption (fetched from the Content field), owner/status/date, and "Why the AI put it here" on the planner tab.
- **Accept flow** — per-post "Add to <date>" button + "Apply plan" to write all suggested dates at once. Nothing auto-applies; you confirm.
- **Web-search-grounded, trend-aware ranking** — reads each post's real content and ranks by what's currently trending in India. Runs on **Perplexity `sonar`** (provider is env-swappable), with a "🔎 Ranked with live web search" badge and a graceful fallback ranker if the search model fails. Trimmed for speed (~35s → ~21s cold, cached 30 min); Perplexity `[2][5]` source markers stripped from the copy.
- **Recommended-order numbers** on planner cards (1 = publish first) + a highlight on the selected card, so the summary's post names map to visible cards. AI reasoning shows only on the AI planner tab.

**Scheduler** (`/dashboard/hope-preview/scheduler`):

- **Fixed** — every write endpoint (reschedule, publish-now, edit-caption, retry, schedule-multi) was still writing to Airtable and rejecting the Supabase UUIDs; repointed all to `mh_posts`.
- **Fixed** — Queue/Calendar now read from Supabase (`fetchScheduledQueueFromSupabase`), not the legacy Airtable table, so scheduled posts appear and counters update; killed stale caching on the read APIs.
- **Fixed** — "Ready to schedule" shows the true count (removed the cap) and only counts rows that actually have a creative.
- **Added** — clickable status counters that filter the list (Ready / Scheduled / Publishing / Published / Failed); per-row **Reschedule** and **Delete** (Delete unschedules — reversible — via a confirm popup); per-account daily over-posting guard (GooCampus Main 4/day, World 2/day, 12Plus 2/day) with a "Daily limit reached" dialog; calendar post preview with carousel slide-by-slide + inline video.
- **Changed** — Calendar tab is now Published-only (dropped the scheduled list that duplicated the Scheduled filter).
- **Removed** — dead Airtable helpers (`fetchScheduledPosts`, `updateScheduleTime`, `publishNow`, `updatePostCaption`, `retryStuckPost`, `scheduleMulti`, `airtablePatch`).

**Backend & infrastructure:**

- New endpoints: `POST /api/scheduler/cancel`, `POST /api/post-planner/move`, `POST /api/post-planner/apply`.
- New `mh_posts` columns `planner_note` / `planner_note_at` (migration `post_planner_move_tracking`) for the in-app move notification.
- Search-provider config: `PLANNER_SEARCH_BASE_URL`, `PLANNER_SEARCH_KEY`, `PLANNER_SEARCH_MODEL` (Perplexity when set; model auto-defaults to `sonar`). Lives in `.env.local` (git-ignored), per machine.

**Known limitation:** the actual carousel **images** for @12thplus posts live in private Slack and can't render inline yet (shown as a "View creative in Slack" link); captions and details work. Real creatives need Slack access (files:read + a proxy) or the creatives uploaded into the dashboard (`media_urls`).

## 2026-07-15 — Hope My Day V2: full workflow (capacity pipeline, Start/End day, team page) + working tabs

Built the standalone Hope-UI **My Day V2** (`/dashboard/hope-preview/my-day`) up from a static design preview into a rich, working prototype. Still an **in-memory mock** (hardcoded seed data, resets on reload — not yet wired to Supabase). V1 (the original `/dashboard`) is untouched and separate.

- **Task card** — adopted the exact Airtable Content Calendar **11 statuses** via a custom themed status **dropdown** (top-right of the card, not a native select); split **Owner** (claimer) vs **Collaborators** (writer) into separate fields; content brief now shows the **full write-up** (all paragraphs preserved, no inner scroll).
- **Create → auto-assign** — create-task modal (Manya) with a **Content** write-up field; **Type→owner routing** (design/thumbnail → Praveen, video → editors' claim pool) with a **content-first handoff** (starts with Manya at Content-Pending → routes to the producer on Content-Approved). Per-person filtering so a task only shows for its owner.
- **References** field (links + images) on the shared task card.
- **Capacity-aware Accept & Work pipeline** — an urgent task that doesn't fit an editor's 8h plan surfaces as a **notification** (chat-panel stack that pushes the chat down); Accept & Work shows real time-impact ("+30 min → 6:30 PM") with two paths: take the overtime, or **ask Manya to free room** → Manya's **reschedule** card (move a low-priority task to tomorrow → "Changes done") frees the slot → editor gets "Room freed" → accepts.
- **Team capacity page** — its own screen via a Manya-only **"Team capacity"** button (next to Start day); each teammate's day planner + "currently working on".
- **Start day / End today** for everyone (End-today = completed-tasks checklist; unchecked roll to tomorrow).
- **Planner** made square/edge-to-edge (only the outer track rounded), lunch centred at noon, buffer block removed.
- **V2 tabs now navigate** — the Hope sidebar links were decorative; wired **My Day V2 ↔ Overview V2**, and other tabs → the V1 pages.
- Mockups saved under `public/mockups/` (chat-notifs, capacity-pipeline, start/end + team page).
- **Next:** wire everything to real Supabase `mh_posts` (persist + real-time). Open TODO: also add the Team-capacity page to the admin dashboard.

## 2026-07-12 — Highlighted Top-performers hero on every content page

- The Instagram/YouTube "top performers = highlighted hero, all-content dense below" pattern now applies to **LinkedIn Posts** (blue panel, top 3 by impressions, doc/creative thumb + big Impr./React./Eng. stats) and **Facebook Posts** (blue panel, top 3 by engagement, image + big Likes/Comm./Shares). Each page: highlighted hero on top → "All posts · N" dense 6-up grid below. Works across all brands automatically (pages follow the account/profile). Verified: World LinkedIn (25 posts) + Edu Facebook (24 posts).

## 2026-07-12 — Bigger top-performer cards (YouTube + Instagram)

- **YouTube "Proven — worth reposting" shelf**: cards were tiny thumbnails-in-a-row; now BIG full cards (3-up for Shorts, 2-up for long-form) on an emerald panel, well above the full library grid (measured 244px thumbs vs the grid's 163px).
- **Instagram Posts "Top performers"**: the small 64px thumbnail cards are now big cards with a full square thumbnail on top (317px), larger caption + stat numbers.

## 2026-07-12 — Video plays IN-dashboard + comments shown

- **Standing rule (Maheen):** videos/reels play INSIDE the dashboard, never link out to YouTube. The Shorts/Long-form detail modal now embeds an autoplaying `youtube-nocookie.com` player (9:16 for Shorts, 16:9 for long-form); the "Watch on YouTube" link is gone. Keep this for all future video/reel work.
- **Broken comment avatars fixed**: Google's image CDN (yt3.ggpht / googleusercontent) 403s hotlinked requests that carry a referrer — added `referrerPolicy="no-referrer"` to every comment/reply avatar, plus an `<Avatar>` component that falls back to a coloured initial circle on any load failure. (The in-app preview pane's sandbox still blocks external images, so this only shows in real Chrome.)
- **Replies shown** (Maheen: "4 total but only 2 showing" — the other 2 were replies): commentThreads now requests `part=snippet,replies`, and each top-level comment renders its replies **nested/indented** beneath it (author, text, date, likes). So the count matches what's visible. Verified on the AMC Blueprint Short (@GooCampus reply under "Blueprint").
- **Comments shown + LIVE** in the player modal (`/api/youtube/comments` → `fetchVideoComments`): author avatar, name, text, likes, date, reply count — top ~25 by relevance, 15-min cached. Verified rendering real comments. A **YouTube Data API key** (`YOUTUBE_API_KEY` in .env.local) was created 2026-07-12 in GCP project gc-dashboard-analytics (restricted to YouTube Data API v3) — commentThreads rejects the OAuth `youtube.readonly` scope, and comments are public so a key is the right tool. Key created via the console in the user's Chrome; copied to clipboard → written to .env.local by PowerShell Get-Clipboard (never through chat). Videos with 0 comments show an honest "No comments yet"; comment-disabled videos say so.
- **CSP updated** (netlify.toml) so the deployed site allows the YouTube embed (`frame-src` youtube) + thumbnails/avatars (`img-src` i.ytimg.com, ggpht, googleusercontent) + LinkedIn media, and `connect-src` for googleapis/linkedin.

## 2026-07-12 — Shorts/Long-form pages rebuilt like Instagram Reels (FULL library)

- **Root fix**: the pages showed only ~9 Shorts because they used the Analytics top-25-in-range list. New `/api/youtube/uploads` + `fetchChannelUploads()` page the channel's **entire uploads playlist** via the Data API → GooCampus returns **400 videos (284 Shorts, 116 long-form)** with lifetime views/likes/comments. 30-min cached.
- **Reels-style design** (matches the Instagram Reels page): Shorts render as **9:16 vertical cards**, long-form as 16:9; play/duration badge, 🏆 Top badge on the most-viewed, views overlay, meta strip (views/likes/comments); summary stat row; **sort control** (Most viewed / Most liked / Newest); **"Proven — worth reposting" shelf** (top all-time, >30 days old — the reusable ones); click → detail modal with thumbnail + full metrics + Watch on YouTube.
- Channel pills (main mode) + profile-lock respected.

## 2026-07-12 — ALL YouTube Traffic & audience charts = pie charts

- Per Maheen (emphatic): the WHOLE Traffic & audience section is pie/donut charts now, not bars — Traffic sources, Top countries, Top cities, Devices (each a donut with a share legend) + Age & gender (Gender + Age donuts). Applied to BOTH the YouTube tab and the YouTube audience panel (the audience panel's world map is replaced by a Top-countries pie so it matches). New reusable `PieList` component + smooth accent color ramp. Verified: zero bar charts left in the section.

## 2026-07-12 — Age & gender = PIE charts (per Maheen)

- The "Age & gender" card on the YouTube tab AND the YouTube audience panel is now **two pie/donut charts side by side**: Gender (Male violet / Female pink) + Age (viewer % per bracket, violet ramp), each with a labelled legend. Real data (GooCampus: Male 65.7% / Female 34.2%; 25–34 the top bracket at 54.7%).
- (The grouped-bar version from earlier this session is retired; `AgeGenderBars` → `AgeGenderPies`.)

## 2026-07-12 — YouTube tab redesign + standard icons everywhere

- **Top videos**: the plain table is gone — now a **3-per-row grid of landscape video cards** (16:9 thumbnail, rank badge, trophy "Top video" on #1, title, and metric row with proper icons: views/watch time+avg/likes/comments). Cards click through to YouTube.
- **Traffic & audience**: all the progress-bar rows replaced with **standing (vertical) bar charts** — Traffic sources, Top countries (full names), Top cities, Devices, Age groups, Gender — six chart cards, honest "not enough data" states. (Chart components shared from the Audience panels.)
- **Standard icons sweep**: every emoji metric (👍 💬 👁 ↗ 📄 📎) across the LinkedIn/Facebook post cards + modals + overview panels replaced with the same Tabler icon set the sidebar uses (IconThumbUp, IconMessageCircle, IconEye, IconShare3, IconFileText, IconPaperclip). Verified: zero emoji left on the YouTube tab, 76 Tabler icons rendering.

## 2026-07-12 — World has no YouTube + API caching (tab-switch speedup)

- **GooCampus World has NO YouTube channel** (Maheen, emphatic): brand mapping goocampusworld → null. The Study Abroad channel is a separate GooCampus channel — reachable via the main-mode channel switcher/pills only, attached to no brand profile. World's profile now grays YouTube out (verified; LinkedIn stays live for World).
- **Server-side TTL cache** (new lib/api-cache.ts) on the slow platform APIs: YouTube 10 min (measured: 5.5s cold → 50ms warm), Facebook 10 min (four Graph calls saved), LinkedIn 30 min (also protects its tiny daily quota). Tab flips no longer re-pay live API latency.
- Note on remaining lag: `next dev` compiles each page on first visit — that freeze disappears in the production build (deploy-time; blocked today by ~12 pre-existing type errors that `next build` would enforce — future cleanup task).

## 2026-07-12 — Profile mode is now AIRTIGHT (no cross-brand leaks)

- **Maheen caught a real leak**: inside Samvaya's profile, the YouTube tab still had its own channel switcher showing GooCampus data. Fixed everywhere:
- New **lib/brand-platforms.ts** = single source of truth for which brand has which platform connected (LI_PAGE / YT_CHANNEL moved here; PlatformOverviews re-exports).
- **Sidebar (profile mode)**: platforms the brand doesn't have are **grayed out + unclickable** with a "none" tag (Samvaya: LinkedIn + YouTube grayed; IG/FB clickable).
- **Overview + Audience platform toggles**: unavailable platforms disabled (gray, tooltip "Not connected for this brand").
- **YouTube + LinkedIn deep-dive tabs**: in profile mode their own switchers disappear and the page locks to the brand's asset; if none, an honest "No YouTube channel / No LinkedIn page" panel — verified by deep-linking /dashboard/youtube inside Samvaya's profile (no Study Abroad, no 22.8K leak).
- **YouTube channel pills** (videos + audience views) hidden in profile mode.
- Honesty fix that rode along: main GooCampus's LinkedIn is NOT connected (pending LinkedIn approval) — it now counts as unavailable instead of showing demo numbers (LI_PAGE goocampus → null).

## 2026-07-12 — Brand PROFILE SWITCHER (Facebook-Pages style)

- **Switcher card** in the sidebar's empty space below the nav groups: shows what you're viewing (Main dashboard, or the brand profile with its colored initials chip); click → pick Main / Edu / World / 12thPlus / Samvaya.
- **Profile mode**: the whole dashboard locks to that brand — lands on its Overview, the sidebar slims to **Overview · Analytics · Audience · Ads** (Content, Sales, AI, Team hidden — Leads/Sales Ops stay MAIN-dashboard-only per Maheen), the header account dropdown is replaced by a "«Brand» · profile view" chip, and every page scopes to the brand automatically (new lib/profile.ts, localStorage + event sync into DashboardShell).
- **Main mode untouched** — and clicking the GooCampus logo (now a button) exits any profile back to the full admin home.
- Sidebar fixes: platform folder rows realigned (chevrons in a fixed slot, consistent row grid); clicking a platform parent now opens its page AND unfolds its children (verified: collapse → click → expanded on /dashboard/youtube).
- Verified end-to-end: 12thPlus profile → @12thplusdotcom overview, slim nav, chip header; logo → full nav restored. No console errors.

## 2026-07-12 — Audience lock + YouTube channel pills

- **No duplicate platform toggle**: opening Audience from inside a platform folder (e.g. YouTube → Audience) now locks the page to that platform — small label + link to "All platforms" instead of the 4-button switcher. The standalone AUDIENCE → All platforms entry (`#all`) keeps the toggle.
- **YouTube channel pills** (GooCampus | Study Abroad | 12thplus) on the Long-form/Shorts page AND the YouTube audience view — any channel reachable regardless of the brand dropdown (default = the brand's mapped channel). Verified: pill switch flips to @12thplus live. Also renamed "GooCampus World" → "Study Abroad" on the deep-dive tab's switcher (no such channel as World).

## 2026-07-12 — Audience panels get real charts (like the Instagram audience page)

- FB/LI/YT audience panels rebuilt from plain progress-bar rows into proper visuals (recharts + the existing GeoMaps):
  - **YouTube**: age groups = bar chart · gender = donut · views = WORLD MAP · top cities = bar chart · devices = donut.
  - **Facebook**: followers = WORLD MAP + top-countries bar chart.
  - **LinkedIn**: job function/location/industry = horizontal bar charts · seniority/company size = donuts. (Quota reset overnight — live World demographics rendering.)
- Charts that a platform hides for small audiences (e.g. Study Abroad's age/cities) show an honest "Not enough data yet" note instead of a blank box.

## 2026-07-12 — LinkedIn document posts render like the real thing

- 23 of World's 25 posts are DOCUMENT posts (carousel PDFs). Cards now render **page 1 of the actual PDF** (media.licdn.com serves them public + CORS-open; pdf.js draws them, lazy-loaded, byte-range requests so we don't download whole files). "📄 Document" badge on cards; blue text-creative stays as fallback and for text-only posts.
- **Detail modal = LinkedIn-style document viewer**: real pages with ‹ › arrows + "page N / M" counter (verified: flips 1/4 → 2/4).
- New dependency: pdfjs-dist.

## 2026-07-12 — LinkedIn Posts page rebuilt Instagram-style (cards + detail modal)

- The table was bare (most LinkedIn posts have no image). Now: **4-up card grid** like the Instagram Posts page — real thumbnail when LinkedIn provides one, otherwise a designed **text-creative placeholder** (LinkedIn-blue gradient, type badge, the post's opening lines as the visual). Cards carry snippet, date · type, 👁 👍 💬 + eng-rate.
- **Click a card → detail modal**: full caption/description on top, the creative below it, and the COMPLETE metrics grid at the bottom (impressions, unique impressions, clicks, reactions, comments, shares, engagement rate, CTR) + "Open on LinkedIn ↗".
- Verified live with GooCampus World's 25 real posts.

## 2026-07-12 — Content pages per platform (like Instagram's Posts/Reels/Stories)

- **YouTube → Long-form + Shorts** (`/dashboard/youtube/videos#longform|#shorts`): top-25 videos in range split by REAL duration (Shorts = ≤3 min, YouTube's own rule; durations fetched from the Data API — `durationSec`/`isShort` added to topVideos, maxResults 10→25). Table: thumbnail (vertical for Shorts), length, views, watch hrs, avg view, likes, comments. GooCampus 30d: 16 long-form / 9 Shorts.
- **LinkedIn → Posts** (`/dashboard/linkedin/posts`): every post in range sorted by impressions — text/thumb/date/type + impressions, clicks, reactions, comments, shares, eng rate, CTR. Live for World.
- **Facebook → Posts** (`/dashboard/facebook/posts`): recent posts (API now takes `?limit=` up to 25) as cards ranked by engagement with 👍💬↗.
- Sidebar folders updated: LinkedIn(Posts·Audience), YouTube(Long-form·Shorts·Audience), Facebook(Posts·Audience).

## 2026-07-12 — Narrative one-liners on every platform + every brand

- The Instagram overview's plain-English headline now sits on ONE line (removed the 820px cap + balanced wrapping), and its label shows the SELECTED account's handle instead of hard-coded @goocampus — so 12thplus/Samvaya/World read correctly.
- Facebook, LinkedIn and YouTube overview panels got their own narrative one-liner in the same style, always from real numbers: FB "Your page drove X post engagements and Y page views", LinkedIn "You gained X followers … Y impressions", YouTube "You gained X subscribers … Y views with Z hours watched" (gained/lost flips red when negative; FB falls back to followers+posts when insights are unavailable).

## 2026-07-12 — Dark sidebar rail (matches the member dashboard)

- Admin sidebar reskinned to the member dashboard's rail: `#14151C` background, white header, soft-gray items (`#AEB6C6`) with white hover, active tab = white/10 pill with violet-tinted icon (`#A99AF5`), muted caps group headings, dark bottom shelf. Maheen compared white vs dark and chose dark — better nav/content separation on a dense screen + one visual system across both dashboards.

## 2026-07-12 — Per-platform Audience inside each Analytics folder

- **Every platform in Analytics is now a folder with its own Audience inside**: Instagram → Posts/Reels/Stories/Audience; LinkedIn → Audience; YouTube → Audience; Facebook → Audience. Parent rows still open the platform's deep-dive page; the chevron expands the folder (auto-opens when you're on that platform's pages).
- Per-platform Audience links use URL hashes (`/dashboard/audience#youtube`) — the Audience page reads the hash and opens that platform's view directly; clicking its internal toggle updates the hash so the sidebar stays in sync.
- The **AUDIENCE group keeps one standalone entry, "All platforms"** — the collective toggle page.

## 2026-07-12 — Audience tab goes multi-platform; audience details on Overview

- **The Audience tab now has the same platform toggle as Overview** (Instagram | Facebook | LinkedIn | YouTube). The Instagram audience page (city map, active hours, post-time slots) is UNTOUCHED — it's the default view. New panels (components/PlatformAudience.tsx) show everything each platform's API offers:
  - **Facebook**: followers by country bars (the only breakdown Meta offers) + honest note.
  - **LinkedIn**: job function, seniority, industry, location, company size (professional demographics — LinkedIn never exposes age/gender). Friendly amber note when the daily API quota is spent instead of blank cards.
  - **YouTube**: age groups, gender, top countries (full names), top cities, devices — viewers in range.
- **Overview's YouTube panel** now also carries compact "Age & gender" and "Top cities" boxes (user request: don't hide the details), and its Top countries shows full country names.
- Note: the Audience tab was never lost — it lives under the Instagram group in the sidebar (Instagram → Posts/Reels/Stories/Audience).

## 2026-07-12 — LinkedIn/YouTube audience check + YouTube Top cities

- Probed what LinkedIn and YouTube offer for audience geography (user request, same as the Facebook exercise):
- **LinkedIn**: follower demographics (job function, seniority, industry, location, company size) were ALREADY implemented live — today they return empty only because our testing exhausted the Community Management API's LOW DAILY QUOTA (429 on organizationalEntityFollowerStatistics). Resets daily; no code change needed. Note for future: that endpoint is quota-precious.
- **YouTube**: `city` dimension works (state/province is US-only per Google — not possible for India). Added **Top cities** to the live builder + a conditional BarCard on the YouTube tab. GooCampus 30d: Colombo 57.6%, London, Bengaluru, Melbourne, Delhi. Google hides cities below a privacy threshold, so small channels show few rows.

## 2026-07-12 — Facebook audience geography

- **"Where your audience is"** on the Facebook tab: current followers by country with proportional bars (Edu: India 1,064 · 86.5%, UK 2.3%, Bangladesh, Pakistan, Nepal, UAE…), full country names via Intl. Top-5 version on the Overview's Facebook panel too.
- Probed Graph v25 first: `page_follows_country` is the ONLY demographic metric Meta still exposes for Pages — fans_country/city/gender_age/locale are all removed. The UI says so honestly (no city/age/gender possible).
- New `fetchPageAudience` in lib/facebook.ts; `/api/facebook` returns `audience`.

## 2026-07-12 — Facebook analytics UNLOCKED (token rotation done by Claude in the browser)

- **Rotated the Meta tokens with upgraded permissions**, driving the user's Chrome end-to-end: added the "Manage everything on your Page" use case to the GooCampus Analytics app, enabled `read_insights` + `pages_read_user_content` (both "Ready for testing"), ran the OAuth consent, and exchanged the code **server-side via a temporary localhost callback** (token never passed through chat; temp route + middleware exception deleted immediately after). New long-lived user token + fresh page tokens for all 4 brands written to `.env.local` / `accounts.local.json` (~60-day expiry).
- **Now LIVE on Facebook:** page **Engagement** (GooCampus Edu: 84.7K post engagements/30d), **Page views** (3.1K), per-post **likes/comments** (+shares where Meta returns it), and **12thPlus posts** (the fresh token also cleared its permission block).
- **Reach is gone for good** — Meta removed all `page_impressions*`/reach metrics from the Pages API (probed live: invalid metric). The Reach card is replaced by Page views everywhere; nothing fake shown.
- lib/facebook.ts posts fetcher requests likes/comments summaries with graceful fallback; Facebook tab + Overview panel updated: **Top performing posts** ranked by likes+comments+shares with 👍💬↗ per card.

## 2026-07-12 — Overview platform panels enriched (no bare stat cards)

- Per Maheen: the LinkedIn/YouTube overview panels were skeletal next to Instagram's. Rebuilt using everything the APIs already return:
- **LinkedIn**: + follower-growth chart, **Top performing posts** (thumbnail/text/date · 👁 impressions, reactions, comments, shares, eng-rate, linked), **Best day to post** (computed from the posts' own impressions by weekday), **Who follows you** (top job functions) + **Where they are** (top locations).
- **YouTube**: + views-over-time chart, **Top performing video hero** (thumbnail, views/watch/avg-view/likes/comments) with ranked 2–5 list (thumbnails, linked to YouTube), **Best day for views** (real weekday average from daily views — GooCampus: Thursday), **Where views come from** (top traffic sources) + **Top countries**.
- **Facebook**: + **Posting rhythm** stat (~days between recent posts, derived from real post dates) and richer post cards (text snippet + date).
- All insights are derived from real data or honestly absent — nothing invented. Verified in-browser: YouTube live (hero = Dr. Jeffy Koshi video, 2,243 views; best day Thursday), LinkedIn structure verified (demo for Edu, live for World).

## 2026-07-12 — Admin rework phase 1: grouped sidebar, platform Overview, Facebook tab

- **Grouped sidebar with icons** (Tabler): Overview on top · CONTENT (Marketing Hub, My Day, Content Calendar, Scheduler, Content Radar, Discover, Hashtags) · ANALYTICS by platform (Instagram expandable → Posts/Reels/Stories/Audience · LinkedIn · YouTube · Facebook) · ADS (Ads, Competitor Ads, Benchmark) · SALES (Leads, Sales Ops) · AI (AI Insights, AI Reports) · bottom shelf Team + Sign out. Subtitle rebranded "Instagram Analytics" → "Marketing OS". All 22 original tabs preserved.
- **Account picker moved from the sidebar into the page header** (dropdown next to the date range) — scoping the whole page to one brand. "Compare all 5 accounts" removed for now (**MUST return later as an All-brands scope — user wants reminding**); stale compare-mode localStorage is cleared so nobody's stuck. "✨ Get AI Report" header button removed (AI Reports tab covers it).
- **Overview tab = platform toggle** (Instagram | Facebook | LinkedIn | YouTube). Instagram is the ORIGINAL overview, untouched. The other three are new compact overview panels with honest Live/Demo badges + "Open deep dive →" links: Facebook (live followers/page likes + recent posts grid), LinkedIn (followers/impressions/eng-rate/page views/posts; live only for World), YouTube (subs/views/watch time/avg duration + top-5 videos; live for all three channels).
- **NEW: Facebook analytics tab is REAL** (built via background agent, verified live): per-brand page identity + followers/page likes live from Meta, recent-posts grid (image/text/date/link) for 3 of 4 pages (12thplus blocked by Meta page-permission/2FA), Reach/Engagement honestly "—" — the stored page tokens lack `read_insights` (and `pages_read_engagement` / `pages_read_user_content` for per-post likes/comments). Insights are still attempted each request, so re-scoped tokens go live with zero code changes. Files: lib/facebook.ts, app/api/facebook/route.ts, dashboard/facebook/page.tsx.
- Added @tabler/icons-react dependency.

## 2026-07-11 (night, later) — Member dashboard PARKED; worlds fully detached

- **Decision (Maheen):** the member dashboard is on hold while the admin dashboard gets reworked (rebrand + tab groupings). All member-dashboard work is saved on the `feat/content-radar` branch on GitHub — parked, not deleted.
- **Detached worlds in middleware:** admins can never enter `/me` or `/me/tasks` (redirect → `/dashboard`) — this kills the "clicked My tasks and landed on Praveen" bug for good; members can never enter `/dashboard/*` (redirect → `/me`); `/login` sends admins to `/dashboard`, members to `/me`.
- **Standing order recorded:** pushing a working branch to GitHub as backup = OK when asked. Deploying to Netlify (anything touching `main` / the live site) = NEVER without explicit fresh permission.

## 2026-07-11 (night) — Members get their own tasks page; Marketing Hub is admin-only again

- **New page `/me/tasks`** — each member's personal task workspace: the exact My Day experience (greeting, stat cards, 📌 reminders, task list + full detail panel with edit / mark done / claim / files / comments) **locked to whoever is signed in**. No "Viewing as" tabs, no admin sidebar — just a "← My dashboard" link back to `/me`.
- The My Day view was extracted into a shared component (`components/MyDayView.tsx`); the admin `/dashboard/my-day` page is now a thin wrapper around it and looks/behaves exactly as before (person switcher intact).
- **`/me` simplified (Option B):** the To-do list section is gone; the banner chips now show REAL numbers ("N due today · M pending" from the person's own content). "Tasks" in the rail, the "My tasks →" button, and every task row in the dock now open `/me/tasks` — never the admin dashboard.
- **Members can no longer open ANY `/dashboard/*` page** — the Marketing Hub exception is removed from middleware; the Hub is yours alone again. (Members still use the same `/api/marketing-hub` data endpoints from their own page, so it stays ONE source of truth.)
- Fixed in passing: `LiveIndicator` was being passed a misnamed prop in the extracted view.
- Verified as Praveen: `/me` chips real + section gone, `/me/tasks` shows his 104 tasks with working inline detail panel, `/dashboard/marketing-hub` and `/dashboard` both bounce him to `/me`; Maheen's my-day + hub unchanged (200). No console errors.

## 2026-07-11 (later still) — ALL THREE YouTube channels live

- Third refresh token received → verified it's **GooCampus Study Abroad** (`UCl0REZ55yfytWmth5GHS21Q`, 34 subs, 16 videos). There is **no "GooCampus World" YouTube channel** — the slot is renamed **"Study Abroad"** (@goocampusstudyabroad); internal key stays `goocampusworld` so nothing else breaks.
- All three channels verified live: GooCampus 19.3K views/30d · 12thplus 6.7K · Study Abroad 234. Note: the old demo faked 8.6K subs for the third slot; the real channel has 34.

## 2026-07-11 (later) — 12thplus YouTube channel live too + per-channel tokens

- Owner repeated the OAuth flow picking the **12thPlusdotcom** channel → second refresh token verified (567 subs, 178 videos) and stored.
- New env `YOUTUBE_REFRESH_TOKENS` = JSON map of channel→refresh token (`goocampus` + `twelfthplus`); `lib/youtube.ts` picks the right token per channel (`refreshTokenFor`), falling back to the old single `YOUTUBE_REFRESH_TOKEN`. `YOUTUBE_CHANNEL_IDS` now carries both channel ids.
- Verified all three: goocampus **live**, twelfthplus **live** (6.7K views/30d), goocampusworld demo (awaiting its owner's token — same flow, pick World).
- Also fixed: sidebar nav now scrolls on short screens (bottom tabs — LinkedIn/YouTube/Ads/Team — were unreachable below ~700px window height).

## 2026-07-11 — YouTube tab is LIVE (channel owner authorized)

- The GooCampus **channel owner ran the OAuth flow** (OAuth Playground, our `gc-dashboard-analytics` client, scopes `youtube.readonly` + `yt-analytics.readonly`, signed in as the **brand channel itself**) — this was the blocker since the tab was built (Praveen's token couldn't read channel analytics).
- New `YOUTUBE_REFRESH_TOKEN` stored in `.env.local`; verified it mints access tokens and reads analytics (30d: 19,285 views, 933 watch-hours, +270 subs).
- Two code fixes to let live mode actually switch on: `YOUTUBE_CHANNEL_IDS` env map is now parsed into `CHANNELS` (it was documented but never implemented), and the live gate uses new `hasYouTubeAuth()` (refresh-token credentials count; before it demanded a stored access token). `YOUTUBE_CHANNEL_IDS={"goocampus":"UC…h0TQ"}` set.
- **Verified in-browser: /dashboard/youtube shows ● Live** with real subs/views/watch time, real top-video titles, traffic sources, countries, devices, age/gender. GooCampus World + 12thplus channels stay demo (not authorized yet — same exercise later if wanted).

## 2026-07-11 — Per-user passwords + admin Team page

### Per-user passwords (open item #2 done)

- **`ind_users` got a `password_hash` column** (ran `sql/005_per_user_passwords.sql` in the Supabase SQL editor). Hashing is scrypt via Node's built-in crypto (`lib/passwords.ts`) — no new dependency, hashes never leave the server.
- **The rule, in plain English:** if someone has a personal password set, ONLY that password signs them in — the shared team password stops working for their email. People without a personal password keep using the shared password, so nothing breaks for anyone today.
- `/api/login` now looks people up in the **live `ind_users` roster** (new `lib/team-db.ts`, 30s cache, falls back to the hard-coded `lib/users.ts` list if Supabase is down so login can never fully break). Deactivated people are refused. Unknown emails are refused (typos no longer silently create an identity-less session).
- **Closed a real security hole found on the way:** `/api/whoami` (the "who are you?" picker for old sessions) used to hand out ANY identity — including Maheen's admin — to anyone holding the shared password. It now refuses admins and password-protected accounts; they must sign in properly.

### Admin Team page (open item #3 done)

- **New page: `/dashboard/team`** (admin-only — members get bounced by middleware like every other admin page). Manage the roster live from `ind_users`: edit email/role inline, toggle **Admin** and **Active**, **set / change / remove personal passwords**, and **add a new team member** (they can sign in immediately with their email + shared password — no code change, no redeploy).
- New API `/api/admin/team` (GET roster / PATCH person / POST set_password·clear_password·add), gated server-side by the roster's own `is_admin`. Guard rails: an admin can't demote or deactivate themselves; passwords need 8+ chars.
- **Admin flag now rides inside the signed session cookie** (`<user>:a:<token>.<sig>`), so middleware knows admin vs member without a DB call and **new admins made on the Team page actually work** (from their next login). `maheen` stays hardcoded as fallback for sessions from before this change.
- `/api/me` also reads the live roster now, so DB-added members get their name/role everywhere.
- Verified with a 19-check end-to-end test against localhost (all passed): roster CRUD, shared→personal password switchover, wrong/unknown rejections, whoami hole closed, self-demotion blocked, deactivation blocks login, fresh admin cookie opens /dashboard. Test user removed afterwards.

## 2026-07-11 — Role-aware sidebar (members see only what they can open)

- **Main-dashboard sidebar is now role-aware.** `components/Sidebar.tsx` asks `/api/me` who is logged in: admins (Maheen) see the full 21-tab menu + account picker + "Compare all 5 accounts"; regular members see only **Marketing Hub** plus a **"← My dashboard"** link back to `/me`. Mirrors the middleware rule (members can only open `/dashboard/marketing-hub` — every other tab was bouncing them to `/me` anyway).
- No flash of the admin menu: nav items render only after `/api/me` answers.
- `/api/me` now also returns `isAdmin`.
- `.claude/launch.json` dev server pinned to port **4324** (was 3000).
- Verified in-browser with signed sessions: Praveen → 2-item rail, Maheen → full rail. No console errors.

## 2026-07-11 — Individual (per-person) dashboard: live route on localhost

### New `/me` route — the personal dashboard, now running in the app (not a mockup)

- Added **`app/me/page.tsx`** + **`public/individual.html`** so the individual (per-person) dashboard is a **real route at `/me`** on the dev server, not a claude.ai artifact. Open it at `http://localhost:<devport>/me`.
- **Not auth-gated yet** — middleware only guards `/dashboard/*` + `/api/*`, so `/me` is directly reachable while we finalize the design.
- Rendered via an isolated `<iframe>` of the self-contained `public/individual.html` so its own styling doesn't collide with the app's Tailwind globals.
- **What it is:** the personal Home (time-of-day sky + live Open-Meteo weather, day plan w/ login-based clock-in + countdown + overflow, EOD review, team board with deletable pins, personal snapshot+ads box) + a right rail that **links out to the shared main dashboard** (Marketing Hub, My Day, Publishing calendar, Sales & Leads, Analytics). Publisher removed.
### Data-wiring phase 1 — login identity + first Supabase-backed domain (LIVE)

- **Login identity.** Session cookie now optionally carries who logged in (`<userId>:<token>.<sig>` — signature still covers the whole payload so middleware verify is unchanged; legacy identity-less sessions still valid). New `lib/users.ts` (the 5 team members), `getSessionUserId()` in `lib/auth.ts`, `/api/login` accepts an optional `user`, login page got a **"Who are you?"** picker, and `/api/me` returns the current person. Verified: login as nikhil → `/api/me` returns Nikhil; a forged user id is rejected.
- **Legacy-session upgrade.** `/me` shows a `WhoAmI` name-picker (component) when the session is valid but identity-less; picking a name calls `/api/whoami` (upgrades the session, no password re-entry) and reloads. So existing main-dashboard sessions can adopt an identity without logging out.
- **Individual dashboard personalised.** `public/individual.html` fetches `/api/me` and sets the greeting ("…, Manya"), rail avatar/name/role live.
- **First Supabase domain — the pin board is live.** Ran `sql/004_individual_dashboard.sql` in the GooCampus Supabase project (created `ind_pins`, `ind_tasks`, `ind_standup`, `ind_reminders`, `ind_chat`, all RLS-enabled). New `/api/individual/pins` (GET/POST/DELETE via the service key), wired into the pin board — add/delete persist to Supabase, stamped with the logged-in user. Verified end-to-end in the browser: logged in as Manya, added a pin → author "Manya BM (MB)", persisted; delete works.
### Snapshot + Ads now show LIVE data (not demo numbers)

- **Snapshot Instagram is live per brand.** New `/api/individual/snapshot` fetches real followers + 30-day reach + engagement rate (avg likes+comments/followers over recent posts) for all 4 accounts via the existing `lib/instagram` helpers. Wired into `public/individual.html` — the brand pills now show REAL numbers (Edu ~30.4K, World ~2.3K, 12thPlus ~1.1K, Samvaya ~150; the old demo showed a fake 96.2K for 12thPlus). Instagram card badged **Live**; Facebook/LinkedIn/YouTube honestly badged **Demo** (not yet wired).
- **Ads · running now is live.** Front-end fetches `/api/ads` and renders the real `activeAds` (top 8 by impressions) — real ad name, impressions, clicks (impr×ctr), leads, CTR, reach. Replaced the four hard-coded demo ad cards.
- Verified in-browser (logged in as Manya): snapshot per-brand real, 8 real active ads.
### Snapshot: Facebook + LinkedIn now live too

- **Facebook** — real page followers per brand via the Graph API (`/{pageId}?fields=followers_count,fan_count`) using the per-account page tokens (exposed `pageId` on `IGAccountConfig`). 28-day reach + engagement attempted from page insights but the page tokens lack `read_insights`, so those show "—" (honest) while followers are real. Badged **Live**.
- **LinkedIn** — GooCampus World real followers / impressions / engagement via `linkedin.buildLive("gcworld")`; other brands show "No LinkedIn". "All brands" LinkedIn = World's (the only approved org). Badged **Live**.
- `/api/individual/snapshot` now returns nested `{ig, fb, li}` per brand; front-end wired. Verified in-browser.
- **Ads now show the real creative image.** New `/api/individual/ads` enriches each active ad with its real creative via `/{ad_id}?fields=creative{thumbnail_url.width(480).height(480),image_url}` (prefers the publicly-loadable `thumbnail_url`). Front-end renders it full-bleed in the square (falls back to the gradient+name if an ad has no image). Verified the URLs return real `image/jpeg`/`png` (200) — they render in a normal browser (the sandboxed test browser can't load external fbcdn images, so screenshotting them isn't possible here).
- **Ads sharper where possible:** prefer creative `image_url` (full-res image ads), fall back to a 1080 `thumbnail_url` (video/lead ads — Meta only exposes a small thumbnail for those, so they stay soft). Front-end `<img>` tries the full image then the thumbnail (onerror chain).
- **Rail links now navigate directly** into the real main dashboard (`window.top` → `/dashboard/marketing-hub`, `/my-day`, `/calendar`, `/sales-ops`, `/dashboard`) instead of the hand-off card.
### Team, roles, login-by-email, admin gate + real content imported

- **Two Supabase tables** (`ind_users`, `ind_content`), created + `ind_users` seeded with the 5-person marketing team (real emails, roles, `is_admin`): Maheen (admin), Manya, Nikhil, Nandu, Praveen. Shubhi + Sramana excluded per the user.
- **`lib/users.ts`** now carries email + role + isAdmin (matches the seeded rows). Added `getUserByEmail`, `isAdminId`.
- **Login by email** — the login page has a "Your work email" field (was a name dropdown); `/api/login` maps email → user and stamps identity into the session. Shared `DASHBOARD_PASSWORD` still authenticates (per-user passwords = later).
- **Admin gate** — `middleware.ts` now blocks non-admins from `/dashboard/*` (redirect → `/me`); only `maheen` may open the admin dashboard. Verified: Praveen → `/dashboard` = 307 → `/me`; Maheen → 200.
- **My Day link stays inside `/me`** (scrolls to the day plan) instead of jumping to the admin dashboard.
- **Imported 200 real Content Calendar records** from Airtable (Marketing Hub base) into `ind_content`, all types (Carousel 99, Reel 67, Post 14, YouTube 6, Meta Ads 7…), owner-mapped: Praveen 111 · Manya 43 · Nikhil 36 · Nandu 10. So each person's `/me` has real content to wire to.
- **Still to do (next):** show each person's real `ind_content` in their `/me` day-plan/tasks (imported but not yet rendered); per-user passwords; an admin page to manage `ind_users` live (code still reads `lib/users.ts`); YouTube snapshot + FB reach still demo.

### /me Tasks wired to the real Marketing Hub + full content imported

- **Rail "My Day" → "Tasks"**, redundant "Marketing Hub" entry removed (they pointed at the same board).
- **`/me` To-do now reads `mh_posts`** (the SAME table the main-dashboard Marketing Hub uses) filtered to the logged-in owner — one source of truth, no more `ind_content` duplication. Shows **pending only**; approved/published hidden (full list under Tasks).
- **Click a task → opens it in the Hub:** rows deep-link to `/dashboard/marketing-hub?open=<mh_posts.id>`; the Hub API resolves the row (even if its date is outside the 30-day range) and the page auto-opens the task detail, then strips `?open`. Verified end-to-end.
- **middleware:** members may now reach `/dashboard/marketing-hub` only; every other `/dashboard/*` still admin-only.
- **Imported 189 real Content Calendar records into `mh_posts`** (the rest already existed) so Tasks + My Day show everyone's full content. Checked triggers first — the only external one (Slack) is UPDATE-only, so no spam on insert.
- **Side effect:** the Hub's `spawn_thumbnail` INSERT trigger auto-created ~89 "— Thumbnail" sub-tasks. Hidden from `/me` via a `type ilike '%thumbnail%'` filter (non-destructive). Deleting them from the live table was blocked by the safety guard — pending user OK.

## 2026-07-11 — LinkedIn tab: live per-post data + Instagram-style redesign

### Post performance — now live & clickable (GooCampus World)

- **Real posts are now live.** New `fetchPosts` in `lib/linkedin.ts` pulls the org's recent posts (`/rest/posts`) + their individual share statistics (`/rest/organizationalEntityShareStatistics` batched by share/ugcPost URN), so the section shows **actual GooCampus World posts** with real impressions / unique reach / clicks / reactions / comments / shares / engagement / CTR (was sample-only before; `partial` flag now clears). Falls back to demo posts if the live call returns nothing.
- **Instagram-style card grid** replaces the flat table as the default view (with a **Grid / Table toggle** — the full table is kept, now with Unique + CTR columns). Each card previews the post (media thumbnail or a branded type placeholder), type badge, caption snippet, and top metrics.
- **Click any card → detail modal** rendered like a real LinkedIn post (avatar + page name + date + caption + media), with a full metric panel and an **engagement-composition donut** (reactions / comments / shares / clicks), CTR, unique reach, and a **View on LinkedIn** link (real permalink).
- Post text is **de-marked-up** for display (`cleanText`): `@[Name](urn:…)` → Name, `{hashtag|\#|X}` → #X, escaped chars unescaped. Raw asset URNs are rejected as image sources so they fall back cleanly to the placeholder.
- **Real post visuals** (`resolveAsset`): the posts API only returns an asset *URN*, so each is resolved to a displayable URL — **videos** → real poster thumbnail (`/videos/{urn}.thumbnail`, with a play badge), **single images** → `/images/{urn}.downloadUrl`. **Document/carousel posts** (the majority of GC World's posts) have **no cover image in the API at all** — only a PDF — so their card shows a titled placeholder ("Carousel" + the real doc title) and the **detail modal embeds the actual PDF** (`<iframe>`) so you can flip the real pages, plus Open-document / View-on-LinkedIn links. Verified live: all 6 video/image thumbnails load from `media.licdn.com`; 17 carousels carry their title + PDF.

### More metrics + demographics redesign

- **Fuller metric row (8 stats):** added **Unique impressions**, **CTR**, and an **organic-vs-paid follower split** bar on the growth chart. Top-line impressions/CTR fall back to summing real posts when LinkedIn's org-level aggregate is empty (common for small pages over short ranges).
- **Follower demographics redesigned:** dropped the five look-alike bar cards for a **"typical follower" persona line**, **donut charts** for Seniority & Company size, and **ranked medal-style cards** for Job function / Industry / Location.
- **Post media = real visuals + Instagram sizing:** cards are **Instagram 4:5 portrait**, **4-up** on large screens (matches the IG Posts tab density — standard dashboard scale, not oversized). Real thumbnails for video (poster frame) & image posts; **document/carousel posts embed the actual PDF** (LinkedIn exposes no cover image for them) — first slide on the card, and a **portrait, scrollable** viewer in the modal to flip slide-by-slide.
- Files: `lib/linkedin.ts`, `app/api/linkedin/route.ts` (demo builder carries the new fields), `app/(dashboard)/dashboard/linkedin/page.tsx`. Verified live: GooCampus World returned 25 real posts (top: the Canadian-licensing mentor post, 914 impressions).

## 2026-07-10/11 — LinkedIn + YouTube analytics tabs

### LinkedIn tab (`/dashboard/linkedin`) — GooCampus World is LIVE

- New tab: company-page analytics with a **GooCampus / GooCampus World** switcher, LinkedIn-blue theme, four sections — followers growth, post performance, page visitors, follower demographics.
- **GooCampus World is live** via the LinkedIn **Community Management API** (Development Tier), app "GC World Pages API". Org auto-discovered (`urn:li:organization:107157863`). Live: followers, growth-over-time, impressions, engagement rate, page views, and demographics (seniority/function labelled from static maps; industry/region resolved via the taxonomy API). Per-post table still sample (`partial` flag → badge "Live · post stats sample").
- **Main GooCampus stays demo** — its own Community Management API access request was submitted (dedicated verified app "GC Main Pages API") and is **awaiting LinkedIn review** (Microsoft Vetting Services + decision email, 3–10 days).
- Files: `lib/linkedin.ts` (API client + `buildLive` + taxonomy resolver + `listAdminedOrgs` probe), `app/api/linkedin/route.ts` (live for gcworld when token present, degrades to demo on any error with `liveError`), `app/(dashboard)/dashboard/linkedin/page.tsx`. Token in gitignored `.env.local`, version pinned `202506`.

### YouTube tab (`/dashboard/youtube`) — built, on DEMO

- New tab: multi-channel switcher (GooCampus / GooCampus World / 12thplus), YouTube-red theme, four sections — views & watch time, subscribers, top videos, traffic & audience. Deterministic demo data shaped exactly like the YouTube Analytics API.
- Live integration written and proven end-to-end (`lib/youtube.ts` with OAuth refresh, `app/api/youtube/route.ts` live-when-token-present). Dedicated Google Cloud project `gc-dashboard-analytics` created (Internal consent, YouTube Analytics + Data API v3 enabled, OAuth client "GC YT Token").
- **Live is blocked** (documented, not a code issue): `praveen@goocampus.in` manages the GooCampus channel via YouTube *Studio* permissions only, not as a *Brand-Account* manager — so their OAuth token can only read their empty personal channel (API returns 403 for the real channel). Unblock = the Brand-Account owner promotes praveen at myaccount.google.com/brandaccounts, or authorizes directly. Channel IDs already resolved (GooCampus `UCmo54Vb1QG6YoBplgmIh0TQ`, 22.8k subs).
- Files: `lib/youtube.ts`, `app/api/youtube/route.ts`, `app/(dashboard)/dashboard/youtube/page.tsx`, sidebar + `.env.example` entries.

## 2026-07-10 — 🔒 Security: enable RLS on all Supabase tables (critical fix)

### The hole

- Row Level Security was **OFF** on every Marketing Hub table. The project's *publishable* (anon) key — public by design — could **read, update, and delete every row** over the Supabase REST API from anywhere on the internet, no password needed. Confirmed live: read / update / delete all returned success against `mh_posts`, `mh_notes`, etc.

### The fix (applied to production 2026-07-10)

- Ran `supabase/security-rls-lockdown.sql` in the Supabase SQL editor:
  - `enable row level security` on all 10 tables: `mh_posts`, `mh_notes`, `mh_comments`, `mh_activity`, `mh_team_members`, `mh_attachments`, `mh_post_collaborators`, `mh_slack_queue`, `story_snapshots`, `content_alerts`.
  - `revoke all … from anon, authenticated` on the same tables (belt-and-suspenders).
- **Why it's safe:** every server route talks to Supabase with the service-role (secret) key via `lib/supabase.ts`, which bypasses RLS. There is no client-side Supabase access anywhere in the codebase. RLS-on with no anon policies locks out the public key while the dashboard keeps working untouched.
- **Verified both sides after applying:** public/anon key now returns `401` on read + update + delete (was `200`); service-role key (the app) still returns `200` and reads all rows.

### Audit — everything else came back clean

- No secrets ever committed to git (`.env`, `.env.local`, `accounts.local.json`, `CREDENTIALS.md` all correctly gitignored).
- Secret key is server-only; never bundled into client code.
- Login rate-limited (5 attempts / 15 min / IP). Session cookies HMAC-signed with constant-time compare. CSRF origin check on every mutating request. Production source maps off; `x-powered-by` stripped.

### Still open (MEDIUM — not yet fixed)

- Storage buckets `scheduler-media` and `story-snapshots` are **public-read** — anyone with a file URL can open uploaded creatives. Anon *upload* is already blocked by storage RLS. Proper fix = private buckets + signed URLs (needs a code change to the attach/upload routes).
- Recommended credential rotations if a breach is suspected: `SUPABASE_SECRET_KEY`, `DASHBOARD_PASSWORD`, `SESSION_SECRET` (still a dev placeholder).

## 2026-07-07 (evening) — Role-aware My Day + Claim task workflow

### Role-aware task list

- **Designers / editors now only see tasks that reached them.** Praveen / Nikhil / Nandu no longer see `Content - Pending`, `Content - In Progress`, or `Incorporating Feedback` — those are the writer's stages. Writers still see the full pipeline.
- **Designers / editors also see claimable tasks**, not just tasks they already own:
  - Praveen sees Content-Approved / Output-Ready static tasks (Post / Carousel / Thumbnail / YouTube post) even when a writer still owns them.
  - Nikhil and Nandu see Content-Approved / Output-Ready video tasks (Reel / Video / Long-form) even when the other editor or a writer owns them.
- **"owned by X" sub-line** on each row when the current person isn't the owner, so it's clear whose queue the task is in right now.

### Claim task button

- New yellow **Claim** pill on the top-right of any eligible row (designer/editor persona × Content-Approved or Output-Ready × not the current owner). One click swaps ownership:
  - Clicker becomes the owner.
  - **Writer stays as a collaborator** (so Manya can still watch her original brief travel through the pipeline).
  - Sibling video editor (Nikhil ↔ Nandu) drops off — one editor releases the task when the other claims it.
  - Activity log gets a `claim` entry: "claimed the task from …".
- Wired to `POST /api/marketing-hub/takeover` (rebranded action label from `takeover` → `claim`, same endpoint).

### Role-aware stat cards

- Writers keep the 7-card lineup (Pending today · Content pending · In progress · Feedback to address · Content approved · Handed off · Completed).
- Designers / editors get a slimmer 5-card lineup: Pending today · **Waiting on me** · Output ready · Ready to publish · Completed. No writer-only metrics cluttering their view.

### Person-aware "Add usual team" preset

- The preset now depends on **who is looking** at the task, not just the task type.
  - Writer viewing → suggests downstream owner + reviewer (Praveen + Maheen / Nikhil + Maheen / Nandu + Maheen).
  - Praveen viewing a static task → suggests **Manya (writer) + Maheen (reviewer)**.
  - Nikhil viewing a video → suggests **Nandu (sibling) + Manya + Maheen**.
  - Nandu viewing a video → suggests **Nikhil (sibling) + Manya + Maheen**.

### Auto-status-advance on creative upload

- When a designer or editor uploads a creative to a task in `Content - Approved`, the status auto-PATCHes to `Output - Ready` — no need to click Edit or Mark done. A green toast confirms "Auto-advanced to Output Ready" and the panel refreshes.
- Dropzone copy is now personalized: designers/editors see "Click to upload **your creative**" plus a sub-line "task auto-moves to Output Ready on upload" when in the right status; writers still see the generic "reference files" wording.

### Bigger Team on this task section

- Owner is now a large card with a 40px avatar, an **OWNER** eyebrow in the person's brand color, and a color-tinted background. Instantly readable at a glance.
- Collaborators are smaller cards with a 32px avatar, a **COLLABORATOR** eyebrow, and a hover-× to remove.
- The **+ Add** picker button now matches the height of team cards. **"✨ Add usual team"** shows the preset members' names in the button itself (e.g. "Add usual team (Manya + Maheen)").

## 2026-07-07 — My Day detail panel redesign + creative pipeline

### Detail panel — brand-new landscape rectangle

- Rebuilt the task detail card from a cramped side-panel into a **portrait rectangle on the right of a compact task list** on the left. Clicking a task no longer jumps to the top of the page — the detail opens beside it.
- **Auto-expanding content area**: the "Content brief" and "Caption draft" sections grow with their text — no internal scrollbars, no fixed rows. A 15-paragraph brief renders in full.
- **One-line meta strip**: Status · Priority · Owner · Platform · Publish · Due · SBU collapsed into a single horizontal row so the body has room for the actual content.
- **Horizontal 5-stage timeline** (Draft → In progress → Approved → Output ready → Published) — green ✓ for done, pulsing accent-color dot for current, hollow grey for pending.
- **View mode ↔ Edit mode** toggle inside the same rectangle; edit-mode textareas auto-resize as you type via a new `AutoTextarea` helper.

### New sections added to the panel

- **Team strip** — collaborator pills with avatar + role. × on hover to remove. **+ Add** popover to add anyone. **✨ Add usual team** button reads the task type and adds the preset team (Praveen + Maheen for static; Nikhil + Maheen for video; Nandu + Maheen for other reels).
- **Feedback / notes** — dedicated box surfacing `additional_info`. Turns amber with 🔁 icon when status is `Incorporating Feedback`.
- **Caption draft** — separate from the brief; writers can draft the IG caption here.
- **Creative files** — was "Mood board". Horizontal strip of image / video previews + a dashed dropzone. Multi-file drag-and-drop or click-to-upload. Files land in Supabase Storage bucket `scheduler-media/mh-creatives/<postId>/…` and a row is inserted into `mh_attachments`. 25 MB per-file cap. Delete on hover.
- **Inline comments thread** — replaced the disabled "💬 Comments" button. Latest 3 shown, "View all" expands. Enter-to-send composer at the bottom, posts as the currently-viewing person.
- **Activity log** — last 5 events with relative timestamps and actor names, pulled from `mh_activity`.
- **Scheduler link** — appears when the task has been synced to Post Scheduler: "📅 Scheduled to publish Fri, 3 Jul, 9:00 AM via Post Scheduler".

### 7 stat cards across the top of My Day

- Pending today · Content pending · **In progress** · **Feedback to address** · Content approved · **Handed off** · Completed. Numbers driven live off `mh_posts`, switch when the person selector changes.

### Auto-handoff on Content Approved

- `/api/marketing-hub/update` now detects the transition **into** `Content - Approved` and:
  - **Static task** (Post / Carousel / Thumbnail / YouTube post) → owner becomes **Praveen**, old writer becomes collaborator.
  - **Video task** (Reel / Video / Long-form) → owner becomes **Nikhil** (default), **Nandu joins as sibling collaborator**, old writer becomes collaborator.
  - Logs a "handed off to …" row in `mh_activity`.
- New **🎬 Take over** button in the detail panel for video-editor siblings — when Nandu owns the task, Nikhil sees the button in his My Day (and vice-versa). One click swaps ownership + drops the other from collabs + logs `takeover` in activity.
- My Day list filter expanded: video editors now also see sibling-owned video tasks (so Nandu's queue is visible in Nikhil's list and can be claimed).

### New API endpoints

- `GET  /api/marketing-hub/task-detail?id=` — composite endpoint returning collaborators (joined with `mh_team_members` for display names + roles), attachments, comments, activity, scheduler status. One call per open panel.
- `POST /api/marketing-hub/comments` — insert a comment.
- `POST /api/marketing-hub/collaborators` — add one or many members. Uses upsert with `ignoreDuplicates` on the `post_id,member_key` composite PK.
- `DELETE /api/marketing-hub/collaborators?postId=&memberKey=` — remove.
- `POST /api/marketing-hub/attach` — multipart upload → Supabase Storage + row in `mh_attachments`.
- `DELETE /api/marketing-hub/attach?id=` — removes storage object + DB row.
- `POST /api/marketing-hub/takeover` — atomically swaps `owner_key` and drops the sibling collab.
- `update` route whitelists `additional_info` and `caption`.

### Notes tab (context)

- `POST /api/marketing-hub/notes` + PATCH + DELETE — per-person notepad. Displays as a column-flow grid inside a yellow reminders card at the top of My Day (max 4 per column, wraps to next column before growing down).

## 2026-07-06 & 2026-07-07 — Marketing Hub migration to Supabase

### Backend — Supabase

- **Created new schema** in the existing Supabase project `beast-clone's Project` (`wlhbmzaernchwebapszq.supabase.co`, Mumbai region).
  - New tables, all prefixed `mh_` (marketing hub):
    - `mh_team_members` — 5 rows seeded (Manya, Praveen, Nikhil, Nandu, Maheen), each with role + email
    - `mh_posts` — main Content Calendar equivalent, one row per post/task
    - `mh_post_collaborators` — many-to-many join
    - `mh_attachments` — file references (files themselves land in Supabase Storage later)
    - `mh_activity` — audit log for every meaningful change
    - `mh_comments` — per-post threaded internal messages with @mentions
  - New enums: `mh_role` (writer/designer/editor/manager), `mh_status` (7 states from Content Pending → Published), `mh_priority` (Low/Medium/High/Urgent).
  - `updated_at` auto-touch trigger on `mh_posts`.
  - Indexes on the columns we query most: status, owner, publishing_date, type, sbu.

- **Seeded 15 sample rows** from Airtable Content Calendar into `mh_posts`, keeping the `airtable_record_id` so we can trace back to the source.

### Backend — Dashboard endpoints (`app/api/marketing-hub/`)

- `GET /api/marketing-hub` — **rewired from Airtable to Supabase.** Reads `mh_posts` filtered by publishing_date range (or null dates for drafts). Response shape unchanged, so the Marketing Hub and My Day UIs render without modification.
- `POST /api/marketing-hub/create` — **rewired from Airtable to Supabase.** Inserts one row into `mh_posts` with `Content - Pending` default, maps display names ("Manya B M") to team member keys ("manya"), also writes an activity log entry.
- Both endpoints keep the same 12h in-memory cache pattern.

### Frontend

- No UI changes. Marketing Hub and My Day tabs still render exactly as before.

### Airtable audit (research, no code change)

- Read all 34 automations in the Marketing Hub Airtable base end-to-end.
- Documented the 5 automation patterns for later re-implementation as Postgres triggers:
  1. Auto-assign owner by Type (needs `Status = Content Approved` gate added — currently missing in Airtable too)
  2. Auto-spawn thumbnail task when a video-type post is created
  3. Change owner + Slack notification (view-based)
  4. Auto-add collaborators (view-based)
  5. Note completion time (status + output link based)

### Phase C — 5 Postgres triggers replacing the Airtable automation set

Installed 5 automation triggers on `mh_posts`:

- **`mh_trg_assign_owner`** — BEFORE UPDATE. When status flips to `Content - Approved` AND `owner_key IS NULL`, auto-set owner by type (Post/Carousel/Story/Thumbnails/Meta Ads → praveen; YouTube Long-Form → nandu; Reel-Original/Story-Video/YouTube Shorts → nikhil). Fixes the Airtable gap where the same rule fires prematurely at Content Pending.
- **`mh_trg_add_writer_collaborator`** — AFTER UPDATE. When owner changes AND status is Content Approved, adds Manya (writer) to `mh_post_collaborators` so she's notified.
- **`mh_trg_spawn_thumbnail`** — AFTER INSERT. When a video-type post is created (Reel-Original / Reel-Cut / YouTube-Long / YouTube-Shorts), auto-inserts a matching Thumbnail row assigned to praveen.
- **`mh_trg_completion_time`** — BEFORE UPDATE. When `output_link` is filled AND status is `Ready to Publish` AND `completion_time IS NULL`, stamps `completion_time = now()`.
- **`mh_trg_activity_log`** — AFTER INSERT/UPDATE. On any status or owner change, writes a row into `mh_activity`. Powers the "Activity" rail in My Day + audit trail.
- **`mh_trg_slack_queue`** — AFTER UPDATE. When owner changes, queues a message into new `mh_slack_queue` table for the Slack worker (Phase D).

New support table: `mh_slack_queue` (queue for Slack notifications the triggers can't send directly since Postgres can't make HTTP calls).

**All 5 verified end-to-end** with actual INSERT + UPDATE tests. Test rows cleaned up afterward — `mh_posts` sits at 15 (original seed count), side tables at 0.

### Docs

- Created this `CHANGELOG.md`.
- `CREDENTIALS.md` will be generated when the user says "wrap it up" (git-ignored — local reference only).
