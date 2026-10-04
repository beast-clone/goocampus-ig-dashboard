# Dashboard audit — 4 October 2026

A cluster-by-cluster audit of the GooCampus Marketing OS: what is real, what is
wired to live data, and what only looked like it was.

**Scope:** 69 pages, ~49,550 lines of V2 UI, 252 API routes, 8 clusters.
**Method:** four layers checked separately for each cluster — the page exists,
it calls something, that something is wired to a real source, and the source has
real data. A feature can look finished and be broken at any one of them; a page
with no API, an API pointing at nothing, and a working connection to an empty
table all look identical from the outside.

Everything below was measured against live systems, not inferred from the code.

---

## Headline

The dashboard is substantially real. Nothing in it is a mock — no sample data,
no placeholder tables, no screens wired to fixtures. The data behind it shows
genuine daily use: 335 rows of activity history, 11,330 lead first-touch
records, 6,142 competitor baselines.

What it was **not** doing is telling anyone when it stopped working. Every
significant fault found today had been failing silently, some for months, while
the relevant screen showed green or showed nothing at all.

| Fault | Failing since | How it looked |
| --- | --- | --- |
| Scheduled LinkedIn posts never published | always — no trigger was ever built | queue accepted posts |
| Competitor watch died at 31s on every run | 2 Oct | tab showed stale data |
| Cache warm 403'd on all 22 targets | the Aug authorization audit | returned HTTP 200 |
| KEA watcher could not reach the site | always | red error nobody acted on |
| LinkedIn could not renew its token | a config regression | Diagnostics showed **green** |
| 12thPlus insights pointed at the wrong Page | unknown | Meta error that reads as "permissions" |
| Usage card under-reported spend 15× | since it was written, 2 Oct | confidently wrong numbers |

---

## By cluster

### 1. Sales Ops — healthy

Ten pages are thin routing shims (13–15 lines) around one shared
`LeadAssignment` component with an `only=` prop. That is good architecture, not
unfinished work, and the line counts understate it badly.

All live: Airtable Sales Hub (`appersdbBcpxhadnD`) CRM, Primary Interests and
Counsellors tables all returned real fields; Supabase `lead_roles` (6),
`lead_tracked` (3), `mh_lead_first_touch` (**11,330**). Revenue reads the
Airtable Revenue Tracker and links each figure back to the row it was typed in,
so every number is traceable.

One thing to know: the assignments endpoint caches 15 minutes in memory per
server instance. On serverless that means two people can briefly see different
counts. Not a bug — but it explains "the number changed when I refreshed".

### 2. Publishing — healthy, was flying blind

Publishing does **not** live in the dashboard. `/api/scheduler/publish` handles
single images only; its own comment says video, reels and all scheduled posts
are the n8n worker's job. `lib/instagram.ts` and `lib/facebook.ts` are read-only
— neither contains a publish function.

The real path is **dashboard → Supabase `mh_posts` → n8n → Meta → link written
back**. `IG/FB Publisher — Supabase v2 (all types)` is active and genuinely
handles `REELS`, `CAROUSEL`, `STORIES`, `VIDEO` and carousel `children`. An
earlier note that reels and carousels were unverified was wrong: it was based on
the old `Instagram + Facebook Native Scheduler` being off, and it is off because
v2 replaced it.

Two faults, both fixed:

- `saveDataSuccessExecution` was `"none"`, so only failures were ever recorded.
  There was no evidence publishing had ever worked, and a silent failure looked
  identical to a healthy week. Now `"all"`.
- It called Facebook **before** checking whether anything was due — 1,440
  unconditional Meta calls a day to ask "is there work?". Now every 5 minutes.

The node order was deliberately **not** changed: `Publish` reads
`$('Load Pages')` by name while `Claim Row` consumes the item stream, so moving
that node would hand `Claim Row` a Facebook page instead of a post row.

### 3. Work Management — healthy, the most used thing you have

Marketing Hub (4,696 lines, 22 routes), My Workspace (4,389), Team Command,
Team, Content Review, Notifications, Attendance.

Real usage, not just construction: `mh_activity` **335**, `mh_notifications`
262, `mh_posts` 201, `mh_messages` 70, `mh_post_collaborators` 50,
`mh_posts_trash` 32, `ind_users` 5 (matching the team exactly). Nobody generates
335 audit rows and 32 deletions by testing.

Two features built and never used: **`mh_comments` — 0 rows** and
**`mh_columns` — 0 rows**. Task commenting and custom columns exist and have
never been touched. Worth knowing before telling the team to "use the comments".

### 4. Analytics — one real breakage, two false alarms

| Platform | State |
| --- | --- |
| Instagram | working, all four accounts |
| YouTube | working — GooCampus 23,500 subs / 939 videos, 12thPlus 612/239, Study Abroad 36/16 |
| Website | Clarity live, GA4 configured |
| Facebook | working |
| LinkedIn | working |

**Facebook was never broken.** An early finding that page insights were dead
came from testing `period=day` with no date range, which makes Meta reject the
metric name in a way that reads exactly like a permissions failure. The code
sends a proper range and gets real data: engagements 635, page views 100,
follows 241 over 30 days.

What *was* wrong is that `lib/facebook.ts` opened with a probe dated
**2026-07-11 — one day before** the token rotation that granted `read_insights`,
claiming insights were unavailable and likes/comments 400'd. Both false for
nearly three months, and the file contradicted itself sixty lines down. That
comment nearly sent an afternoon into regenerating tokens that were never the
problem. Rewritten with a dated, measured account.

Genuinely gone, and not recoverable: `post_impressions` and `post_engaged_users`
are **retired by Meta**. No token brings post-level reach back. `post_clicks`
still works.

**LinkedIn was never broken either** — see below. That was a testing error on my
part, twice over: reading a credential from `.env.local` when the application
resolves a different one at runtime.

**12thPlus insights were broken, and the cause was not what it looked like.**
Meta answered `(#10) Application does not have permission for this action`,
which reads as a permissions gap. The real cause: `accounts.local.json` paired
the `12thplusdotcom` Instagram account with the Facebook Page **"GooCampus
India"**, which has no Instagram attached. The correct Page is **"12thplus.com"**
(`1141060615764501`). Instagram insights are a Page-level product, so the call
could never succeed. Fixed locally and in Netlify's `ACCOUNTS_JSON`, which
carried the same error. All four accounts now read insights.

### 5. Content Creation — healthy, one network-level breakage

Perplexity and Serper both live. `mh_watcher_items` 399, `mh_competitor_seen`
6,142, `discover_cache` 1,941, radar fresh.

**AI spend is negligible: 430 calls, $3.34 lifetime**, tracked per feature in
`ai_usage` with `cost_usd`. Worth knowing before worrying about any job that
triggers AI.

`content_drafts` has **2 rows** — Content Studio is 1,396 lines and effectively
unused, the same pattern as `mh_comments`.

**The KEA watcher has never worked from production.**
`cetonline.karnataka.gov.in` answers an Indian IP in under a second and refuses
Netlify's US ones outright. MCC UG and PG find 58 and 49 links; KEA finds 0 and
records "Couldn't open the page". No timeout, retry or user-agent could have
fixed a network-level block.

You were not blind to KEA only because a **standalone n8n workflow**
(`KEA UGNEET 2026 Notification Watcher`) watches the same page hourly from the
Hostinger host and sends its own alerts. The capability existed; it just lived
outside the dashboard, while the Watchers tab showed a permanent red error for
the one board this business most depends on.

**Telegram alerts were never broken.** The four un-alerted items were detected
at 05:31 UTC on 2 Oct; the Telegram token was stored at 10:01 and Gmail at
06:36 — all after. Nothing fresh had appeared since. Delivery verified.

### 6. Outreach — healthy, and the single biggest consumer

Community Broadcast, 15 WhatsApp routes, `whatsapp_scheduled_messages` (6 rows,
all sent or failed, scheduled 11:47–20:22 IST). Unlike LinkedIn, it **has** a
working engine: `WhatsApp Broadcast → WAHA (dashboard queue)` polls
`/api/scheduler/whatsapp/due` and succeeds.

It was polling **every minute, 24 hours a day, with no timezone set** — 1,440
calls a day into the site, against 96 for all ten `/api/cron` jobs put together,
and straight through the overnight stop zone.

### 7. Ads — healthy

Account, campaigns and insights all live on `act_490085459361407`. No mock data.
Uses `getIntegrationToken("meta")`, which has no stored override and falls back
to the env token — the one expiring Friday.

### 8. System — healthy

Production's own diagnostics run is the best summary: **10 checked, 9 healthy,
1 warn, 0 errors**. The single warning is Meta's expiry, correctly flagged.

---

## The usage card was lying

The Netlify usage card built on 2 October — the one whose entire purpose was to
make spend visible — matched n8n jobs with `/\/api\/cron\//`.

The WhatsApp poller calls `/api/scheduler/whatsapp/due`. The TezDM lead capture
calls `/api/dm/*`. Neither matched, so neither appeared. The card reported
**96 calls a day** with enough confidence to be believed. The real figure was
**1,772**.

A usage page that cannot see its largest line item is worse than no usage page.
Both it and the Workflows tab now match anything calling this site's `/api/`.

**Visible active jobs: 10 → 16. Honest total: 1,772 → 548 calls/day after the
WhatsApp fix.**

---

## Fixed today

| Commit | What |
| --- | --- |
| `763524b` | Facebook: corrected a stale note that blamed the wrong thing |
| `8f9b4b4` | Diagnostics: stop reporting LinkedIn green when it cannot renew |
| `1a8c38d` | LinkedIn: point at the app that actually issued the tokens |
| `1008b02` | Cron: make the cache warmer and competitor watcher actually run |
| `7443d2b` | Watchers: accept HTML fetched elsewhere, for KEA *(not deployed)* |
| `e6d4e3c` | Usage: count every job that calls this site *(not deployed)* |

Not in git, because they are configuration:

- Four new n8n jobs built and verified: Publish LinkedIn, Competitor Watch,
  Snapshot Posts, Cache Warm
- WhatsApp poller: every minute 24/7 → every 5 min, 6am–11:55pm IST
- IG/FB publisher: every minute → every 5 min, success logging on
- `LINKEDIN_CLIENT_ID` corrected and `LINKEDIN_CLIENT_SECRET` supplied, locally
  and on Netlify — LinkedIn now renews itself
- `ACCOUNTS_JSON` corrected for 12thPlus, locally and on Netlify

---

## Traps worth remembering

**Test the credential the application resolves, not the one in `.env.local`.**
`getIntegrationToken(provider)` reads Supabase `mh_integration_tokens` first and
falls back to env. LinkedIn's env token is stale and expired; the stored one is
valid. Testing the wrong one produced two confident, wrong "this is dead"
reports.

**`.env.example` is a trap, not documentation.** It carried
`LINKEDIN_CLIENT_ID=86a1luhoymqmmy` ("GC World Pages API") while the tokens are
issued by `86fmmm22d2ca7i` ("GC Main Pages API"). Any `.env.local` rebuilt from
the template inherits the mismatch, and renewal then fails with
"client_secret is missing" long after anyone remembers why. This had already
been found and fixed once — see `docs/HANDOFF_2026-09-04.md` — and came back
because only `.env.local` was corrected. Both are fixed now, with a note.

**Meta's `(#10)` does not mean what it says.** It is returned both for genuine
permission gaps and for an Instagram account not linked to a Facebook Page.
Check `instagram_business_account` on the Page before touching tokens.

**Meta page insights need a date range.** Asking for `period=day` alone makes
Meta reject the metric name outright, which looks exactly like a permissions
failure and is not one.

**n8n's list API pages at 250.** This account is over that. An un-paged
`workflows?limit=250` silently drops everything past page one — which is how an
active Watchers workflow looked "missing". Always follow `nextCursor`.

**Netlify's gateway cuts at ~26s** regardless of `maxDuration`. Competitor watch
asked for 60 and was killed at 31 on every run.

**Netlify env changes need a redeploy** before running functions see them.

---

## Outstanding

**1. Meta tokens expire Friday 9 October, 18:14 UTC — 5.5 days.**

All six share one user consent and die together:

```
META_LONG_LIVED_USER · IG_PAGE_ACCESS_TOKEN
page tokens: goocampus · goocampusworld · 12thplusdotcom · samvaya_matrimony
```

When it lands, **Instagram (all four accounts), Facebook, Ads and publishing to
IG/FB all stop at once** — most of the dashboard. The tokens do not "expire";
`data_access_expires_at` lapses, so they stay technically valid while data calls
fail. Check that field, never `expires_at`.

`fb_exchange_token` does not help — it mints a new token with the same expiry.
Only a human re-consent resets it. The permanent fix is a **System User token**,
which has no data-access expiry at all. Planned for Monday 5 October; see
`project-gc-meta-token-renewal` in memory for the exact steps and scopes.

**2. Two commits not deployed** — `7443d2b` and `e6d4e3c`.

**3. KEA is not finished.** The ingest endpoint exists and is verified locally
(294 links found where it had found 0), but nothing calls it yet. The n8n job to
fetch the page and post the HTML still needs building, and the standalone
watcher must stay active until it is proven — retiring it first would leave a
gap on the board that matters most.

**4. Netlify repo link.** Builds-on-push are deliberately stopped; deploys are
manual CLI, which costs no build minutes. The deploy key and webhook are in
place, so it is one toggle if that changes.

**5. Two features nobody uses** — task comments (0 rows) and custom columns
(0 rows). Either surface them or remove them; a dashboard with dead controls
teaches people to ignore controls.

---

## A note on this audit's own errors

Three times today a fault was reported that turned out not to exist — Facebook
insights, LinkedIn, and the Telegram alerts. Each came from testing something
adjacent to what the application actually does: a credential from the wrong
place, a metric without its date range, a feature judged by data that predated
its own configuration.

The pattern is worth naming, because it is the same pattern as the bugs
themselves. Something that looks authoritative — a code comment, an env var, a
green status light — is not evidence. The measurement is.
