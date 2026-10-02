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

### Before switching the two daily ones on, check the timezone

Netlify ran cron in UTC. n8n uses its own instance timezone, which is not set per
workflow here, so the two daily jobs were entered as **IST wall-clock** times
(02:00 and 23:59) on the assumption the n8n instance runs Asia/Kolkata. If it
does not, those two will fire at the wrong hour — the four hourly/15-minute ones
are unaffected either way. Confirm the instance timezone, or set it explicitly on
those two workflows, before relying on them.

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
