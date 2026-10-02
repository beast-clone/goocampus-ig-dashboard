# Pending deploy

Work that is committed and pushed but **not yet on production**. Add to this list
as changes land; clear it when a deploy goes out.

Deploys do not happen automatically — see "How to deploy" at the bottom.

---

## Waiting to deploy

- **System → Workflows tab** (`/dashboard/preview/workflows`) — lists the n8n
  jobs behind this dashboard with their schedule, endpoint, on/off state and last
  run, plus a picker to track any other n8n workflow by hand.
  **Needs `N8N_API_KEY` in the Netlify environment variables before it will show
  anything in production** — without it the page falls back to a setup card.
  `sql/036_tracked_workflows.sql` is already applied to Supabase.
- **Diagnostics → Netlify usage** — what the scheduled jobs cost, split into what
  Netlify actually meters (bandwidth, plan size, billing period) and what we work
  out ourselves from the schedules. Reads `NETLIFY_AUTH_TOKEN`; without it the
  card still shows our estimate and says the Netlify figures are missing.
  Netlify does **not** expose credits-spent through its API — every usage/credits
  endpoint 404s and `capabilities.credits.used` reads 0 while the billing page
  says otherwise — so the card links out rather than printing a wrong number.
- **Overnight stop zone** (`lib/quiet-hours.ts`) — no background polling between
  midnight and 6 am IST, and all eight pollers now stop in a hidden tab too.
  The matching n8n schedule changes are already applied (see `CRON_JOBS.md`);
  this is only the browser half.

---

## Already live as of 2 October 2026, ~10:50 pm IST

These went out before the "stop deploying" instruction, on three CLI deploys.

- **Landing page** at `/landing.html`, plus the logo assets
  (`logo-mark-indigo.png`, `logo-mark-white.png`, `logo-lockup.png`,
  `logo-mark.png`, `logo-mark-white-original.png`, `goocampus-logo-small.png`)
- **All seven Netlify Scheduled Functions removed.** Verified: every
  `/.netlify/functions/*-cron` now returns 404 where it previously returned 403.
  Schedules and endpoints are recorded in `CRON_JOBS.md` for rebuilding in n8n.
- **`netlify/functions/README.md`** — keeps the directory alive so the build can
  initialize after the cron files were deleted
- **Login lands on the Overview** (`middleware.ts`). Admins used to be dropped
  into Team Command
- **Logout goes to `/landing.html`** rather than back to `/login`

---

## Known problems, not yet fixed

1. **Netlify cannot clone the GitHub repo.** Its own diagnostic: *"Host key
   verification / cloning error … could not establish a trusted, authorized
   connection"*. This is why pushing to GitHub deploys nothing and why every
   recent production deploy was run by hand. Fix needs a GitHub login:
   Netlify → Project configuration → Build & deploy → Continuous deployment →
   **Manage repository** → re-link.
2. **Meta token expires around 9 October 2026.** When it goes, Instagram,
   Facebook and Ads stop — both data and publishing.
3. **The Diagnostics workflow has no timezone set in n8n**, so it falls back to
   the server's own (Europe/Berlin) and fires at 08:30 IST, not the 05:00 its
   name claims. Every other dashboard workflow is on `Asia/Kolkata`. Fixed in
   the n8n UI, not in this repo. (The job itself was built on 2 October and is
   running — it had not run since 8 August before that, because no diagnostics
   cron existed anywhere.)
4. **`/api/cron/competitor-watch` returns 504 on every call**, taking the full
   30 s. The fault is in the route, so any scheduler hits it. Do not put it back
   on a schedule until it is fixed — and hourly is plenty.
5. **`/api/cron/watchers` takes 22–25 s.** Fine today, but close to any 30 s
   ceiling. Worth fetching the watched pages in parallel.
6. **The landing page's font may be blocked in production.** `netlify.toml` sets
   `style-src 'self' 'unsafe-inline'` and `font-src 'self' data:`, neither of
   which allows Google Fonts, and the page loads Plus Jakarta Sans from
   `fonts.googleapis.com`. Either add the two Google domains to the CSP or
   self-host the font. (No CSP header was observed on live responses, so this may
   not bite — but it is unverified.)

---

## How to deploy

The git connection is broken, so the Netlify UI's "Trigger deploy" fails at
Initializing. Deploy from this machine instead — it builds locally and uploads,
which also costs no Netlify build minutes:

```bash
export NETLIFY_AUTH_TOKEN="$(grep -m1 '^NETLIFY_AUTH_TOKEN=' .env.local | cut -d= -f2-)"
npx netlify deploy --build --prod
```

Production publishes from `main`, so merge `feat/dashboard-reskin` into `main`
first (it fast-forwards) to keep git and production in step.
