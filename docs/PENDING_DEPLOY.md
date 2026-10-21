# Pending deploy

Work that is committed and pushed but **not yet on production**. Add to this list
as changes land; clear it when a deploy goes out.

Deploys do not happen automatically — see "How to deploy" at the bottom.

---

## Waiting to deploy

Nothing — everything on `feat/dashboard-reskin` up to `c875f25` is live (4th deploy of 21 Oct, `6ad87917`: PDF page previews + Content Review side-by-side slider).

---

## Already live as of 21 October 2026, ~2:00 pm IST (third deploy that day)

Deploy `6ad874f10adbe161a419fd84` (`b526a95`): task uploads go browser → Supabase storage
(attach/sign + attach/complete, 50 MB cap) — verified live with a 7 MB PDF (test file
removed by id); long sections capped with "Show full text"; compact My Day with a 240px
History & comments column; pasted links shown in full in a box.

---

## Already live as of 21 October 2026, ~4:30 pm IST

Deploy `6ad8673c5ec359e355111c97` (`c52d630`): editor shortcuts / lines / quotes /
checklists / pasted lists; hub read cache checks a data stamp (no more flip-flop —
verified live: 30 reads after two priority changes all consistent); PDFs in My Day
uploads; the editor in My Day's brief; My Day Save no longer writes the previous
task's brief/date/priority, and its date picker changes the publishing date.

Open after this deploy: three briefs overwritten by the old My Day bug (Karnataka
NEET PG Cut Off 2025, Karnataka NEET PG Counselling 2026 (KEA), Ireland Webinar -
Carousel 0745354e) — restore only with the user's OK.

---

## Already live as of 21 October 2026, ~10:55 am IST

Deploy `6ad84a005cd31dbe6baa0ecc`, CLI from `~/dev/gc-dash-build`, branch
`feat/dashboard-reskin` at `5920b34` (includes `main` up to `5d31794`). Checked live:
Team & access switch, Mentorship calendar, Monday-first calendar (272 tasks), hub
rows carry collaborators, date-change approval answers for admins. `APP_URL`,
`N8N_API_KEY`, `NETLIFY_AUTH_TOKEN`, `SERPER_MONTHLY_BUDGET` are set on Netlify.

- **Team comments, 9–16 Oct + timer (21 Oct)** — `feat/dashboard-reskin`, after
  merging `main` in (aca57b6). One commit per comment, `#N` in the subject:
  - Notifications: one summary line instead of stacked pop-ups.
  - Task window: Owner picker with "Nobody — claim pool" (#1, also My Day #17);
    Content/Caption always-editable editor with heading/bold/italic/bullets,
    "-"+Enter bullets, pasted bullets kept, links clickable (#5 #7 #8 #9 #10 #22,
    new dependency **@tiptap/* 3.32**); separate **Attachments** section, never
    published (#6); title/format/SBU editable (#11); creatives link (#14); paste
    images (#21).
  - Calendar: Mentorship calendar sidebar entry (#4); drag shows on the new day
    dashed while Maheen approves (#12); weeks start Monday everywhere (#19).
  - Content Review: SBU dropdown always shown (#3).
  - Create: only the title is required; a first date needs no approval (#13);
    "Put it in the claim pool" for videos, editor-created pool videos really
    land in the pool (#15).
  - Workload / My Day / Team Command count the on-camera shoot (1 h) for the
    presenter; pairing fires from the pool (#2 #16). Today's plan ordering (#18).
    "<Person>'s work" includes tasks they collaborate on (#20). No auto-start of
    the timer; Start asks for the time first (#23).
  - Check after deploy: an attachment upload (kind `attachment`) and that the
    Scheduler still sees creatives only.
  - Team & access → each person → step 3: "Date changes need admin approval"
    (per person; unset = on for everyone but Maheen). Any admin approves, never
    their own request. Stored as `permissions.date_needs_approval`.

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
