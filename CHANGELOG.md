# Changelog

Every day of work on this dashboard gets its own dated section here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/).

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
