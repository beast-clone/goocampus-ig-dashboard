# Cron jobs — moved off Netlify

The seven Netlify Scheduled Functions under `netlify/functions/*-cron.mts` were
deleted on 2 October 2026. Netlify bills their run time against the team's credit
allowance, and one of them (`competitor-watch`) was timing out on every single run
and retrying three times — about 7 hours of wasted compute a day.

**No application logic was lost.** Those files were ~20-line shims. Every one of
them did the same thing: call a Next.js API route with a shared secret. All the
real work still lives in `app/api/cron/*/route.ts` and `lib/`.

## Rebuilt in n8n — created 2 October 2026, all INACTIVE

Six replacements exist in n8n (`n8n.srv1046538.hstgr.cloud`), each a Schedule
trigger into an HTTP Request carrying `x-cron-secret`. **None of them is switched
on.** Activating is a deliberate step — they start hitting production the moment
they are enabled.

| Workflow | ID | Schedule |
| --- | --- | --- |
| GC Dashboard — Watchers | `u0Wh2FCfuUPlc0BI` | every 15 min |
| GC Dashboard — Import Airtable | `jSJDzpkK5trV0J1B` | hourly |
| GC Dashboard — Radar Refresh | `pgwHISeTcdEltX6S` | hourly |
| GC Dashboard — Snapshot Stories | `VBPWyH2nhHzYgtZO` | hourly |
| GC Dashboard — Link Published | `pGJ8C8vTl6CJmk2R` | daily 02:00 |
| GC Dashboard — Radar Rolloff | `m7outQ1x5BjPAedf` | daily 23:59 |

`competitor-watch` was deliberately **not** rebuilt — see the warning further down.

### Status as of 2 October 2026, 11:10 pm IST

All nine dashboard workflows are **active**. Seven carry an explicit
`Asia/Kolkata` timezone; two still run on the Europe/Berlin default.

| Workflow | Set to | Timezone | Actually fires |
| --- | --- | --- | --- |
| Watchers | every 15 min | Asia/Kolkata | correct |
| Import Airtable | hourly | Asia/Kolkata | correct |
| Radar Refresh | hourly | Asia/Kolkata | correct |
| Snapshot Stories | hourly | Asia/Kolkata | correct |
| Link Published | 02:00 | Asia/Kolkata | 02:00 IST |
| Radar Rolloff | 23:59 | Asia/Kolkata | 23:59 IST |
| Daily Comment Digest | 21:00 | Asia/Kolkata | 21:00 IST |
| **Daily Metrics Snapshot** | 06:30 | **not set** | **10:00 IST** |
| **Nightly Lead-Status Snapshot** | 01:00 | **not set** | **04:30 IST** |

The last two are the only ones left wrong. Both predate tonight and neither has
been reopened since (`updatedAt` 21 July and 14 September). Setting
`GENERIC_TIMEZONE=Asia/Kolkata` on the n8n host fixes both at once, and stops the
problem recurring on anything created later.

`Import Airtable` was test-run on 2 Oct (execution `2958838`, success in 4s). The
endpoint returned OK and no rows changed, which is consistent with nothing new in
Airtable at that moment rather than a failure.

### The n8n instance is NOT on IST — fix this before trusting any daily job

Measured, not assumed. "GC Dashboard — Daily Metrics Snapshot" is configured for
**06:30** and its last two runs started at **04:30 UTC** (1 and 2 October 2026).
That is a +2 offset, so the instance is running **Europe/Berlin**, n8n's default —
not Asia/Kolkata.

What that means:

- That existing snapshot, labelled 06:30, actually fires at **10:00 IST**.
- The two new daily workflows, entered as 02:00 and 23:59, would fire at
  **05:30 IST** and **03:29 IST**.
- The four hourly / 15-minute workflows are unaffected — interval schedules do
  not care about the zone.

**The fix:** set the timezone to `Asia/Kolkata`, either per workflow (open the
workflow → three-dot menu → Settings → Timezone) or instance-wide via the
`GENERIC_TIMEZONE` environment variable on the n8n host. Do not compensate by
shifting the configured hours: Europe/Berlin leaves summer time on 25 October
2026, which would silently move every "corrected" job by an hour.

This cannot be done from here. The n8n SDK has no timezone field, the MCP
`update_workflow` tool rejects its own `operations` argument, and the n8n UI
requires a sign-in that only the account holder should perform.

### The secret

The workflows carry the same `x-cron-secret` value as the existing, working
"GC Dashboard — Daily Metrics Snapshot" workflow. That value was checked against
`CRON_SECRET` in `.env.local` and matches. If the secret is ever rotated, all of
these need updating too.

## The schedules that were removed

Recreate these in whatever scheduler you use. Each is a plain HTTP `GET`.

| Endpoint | Schedule (UTC) | In plain words |
| --- | --- | --- |
| `/api/cron/watchers` | `*/15 * * * *` | every 15 minutes |
| `/api/cron/competitor-watch` | `*/5 * * * *` | every 5 minutes — **see the warning below** |
| `/api/cron/import-airtable` | `@hourly` | on the hour |
| `/api/cron/radar-refresh` | `@hourly` | on the hour |
| `/api/cron/snapshot-stories` | `@hourly` | on the hour |
| `/api/cron/link-published` | `30 20 * * *` | 20:30 UTC = 2:00 am IST |
| `/api/cron/radar-rolloff` | `29 18 * * *` | 18:29 UTC = 11:59 pm IST |

Netlify cron expressions were UTC. Keep that in mind if the new scheduler runs in
local time — `link-published` and `radar-rolloff` were deliberately offset so they
land at 2:00 am and 11:59 pm IST.

## How to call them

```
GET https://<the-dashboard-host>/api/cron/<name>
x-cron-secret: <value of CRON_SECRET>
```

The routes reject anything without a matching `x-cron-secret` header, so the
schedule can live anywhere — n8n, cron-job.org, GitHub Actions, a server crontab.

## Do not re-enable competitor-watch until it is fixed

`/api/cron/competitor-watch?ig=1` was returning **504 Inactivity Timeout** on every
invocation, taking the full 30 seconds and then being retried. That is a fault in
the route, not in the scheduler, so pointing a different scheduler at it will fail
in exactly the same way. Fix the slowness first, then schedule it — and hourly is
almost certainly enough for competitor snapshots. Every five minutes was 288 calls
a day to notice changes that move weekly.

## A caveat worth understanding

Moving the *trigger* off Netlify does not move the *work* off Netlify. These routes
are Next.js App Router handlers, so they still execute as Netlify functions and
still consume compute. What this change removes is the wrapper around each call —
and, in `competitor-watch`'s case, the three timed-out retries that were the bulk
of the waste.

`/api/cron/watchers` was taking 22–25 seconds per run. That is fine on its own, but
it is close enough to any 30-second ceiling that one slow notice board will tip it
over. Worth fetching the watched pages in parallel rather than one after another.
