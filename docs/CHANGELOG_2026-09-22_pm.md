# Changelog — 22 Sep 2026 (evening session, Windows)

Branch **`feat/dashboard-reskin`**. **Nothing is deployed** — live is still `27b2088`.
Continues from `docs/CHANGELOG_2026-09-22.md` (the daytime session).

---

## ▶ Start here (office, Mac)

```bash
git fetch && git checkout feat/dashboard-reskin && git pull
npm install
npm run dev
```

Open **http://localhost:3000/dashboard/preview** and sign in.
Before any commit: `find app components lib public -name "._*" -delete`

**Resume point: finish testing Notifications (comment #20)** — see §3. Everything
else from this session is built and verified.

---

## 1. What changed, in order

### Overview (comments #11–#15)
1. **Date ranges are 7 / 30 / 60 / 90 days.** 60 and 90 are ONE combined period
   each, never month-by-month. 1 year / long custom ranges keep the month switcher.
2. **Samvaya is back in the brand switcher** — Instagram + Facebook only. Accounts
   now carry a `platforms` whitelist (`lib/accounts.ts`), because YouTube serves
   DEMO data for an unknown channel, which is how Samvaya got pulled before.
   The platform hero now names the right brand (was always "GooCampus on …").
3. **Posting cadence** counts **carousels / statics / reels** separately per week.
4. **New "Monthly output" section** — carousels, static posts, reels, stories per
   **calendar month (1st → 30th/31st)**, month boundaries in **IST**, current month
   marked "so far". Sits ABOVE the weekly cadence, under the heading "What you
   published". Numbers checked against the Graph API directly: Sep 52, Aug 79, Jul 66.
5. **Post Mix / Hashtags cards are equal width** — root cause was a nested
   `.preview-scope` picking up the page-shell `max-width + margin-inline:auto`
   (fixed in `app/globals.css`).

### Data fixes (these were real bugs)
6. **Snapshot collector never recorded profile visits, engagement or website
   clicks** — Meta needs `metric_type=total_value` and answered with a 400 in the
   body, which banked a 0. Fixed in `lib/snapshot.ts`. History before 22 Sep stays 0.
7. **`/api/overview-tips` 500'd on any range > 30 days** — now reads stored snapshots.
8. **60/90-day loads took 20–40 s** — past months now come from the monthly post
   snapshots (`readPostsForRangeHybrid`), only missing/current months go live.
9. **Expired Instagram images (403)** from stored months — media URLs are
   refreshed in one batched Graph call per 50 posts.
10. KPI tiles label partial coverage ("30 of 38 days") instead of looking complete.

### In-dashboard post modal
11. `components/PostDetailModal.tsx` (shared). Opens from Overview top/latest posts,
    **Stories** (their permalinks die after 24 h), **Facebook posts**, and the
    (hidden) repost card. Frame fits the real media — 9:16 reel / 4:5 carousel, no
    black bars. Reels + LinkedIn keep their own modals; competitor/radar content
    still links out (not ours, no insights).

### My Day (comments #16–#19)
12. **Reminders** fire for tasks due TODAY in the last 3 h of the shift — overdue
    items are no longer "reminders" (they stay red in the task list). (#19, Manya)
13. **Remove collaborators** — × on each chip (hover). (#16)
14. **Default collaborator on every new task:** Manya — except **12thPlus / GC India
    → Nandu** (Manya is NOT on 12thPlus). Never both owner and collaborator. (#17)
15. **Claim flow** (#18) — **the editor owns it, the presenter collaborates**:
    - "Present on camera" does NOT claim; the task shows "X is presenting — needs
      an editor" and stays claimable.
    - "Both" → claimer owns it, default collaborator only.
    - Both editors now get the 3-way choice (spec said Nikhil-only — changed on purpose).
    - Verified all 7 cases for Nandu AND Nikhil against the database.

### Notifications (#20) — built, partly tested
16. Spec: **`docs/NOTIFICATIONS_SPEC.md`** (source of truth).
17. New table **`mh_notifications`** — `sql/016_notifications.sql`, **already applied**
    to project `wlhbmzaernchwebapszq` (RLS on, public key blocked — verified).
18. `lib/notifications.ts` (generation rules, shared), `/api/notifications`
    (sync + done-check + read/dismiss/popped/delete, session user only, quiet hours
    in IST), `NotificationHost` (pop-ups on every page, mounted in the preview
    layout), `/dashboard/preview/notifications` (the tab), sidebar item + badge,
    "(N)" in the browser tab title.

---

## 2. Changes made to the LIVE database (Supabase `wlhbmzaernchwebapszq`)

- Backfilled **June + July monthly post snapshots** (260 posts) and **the last
  30 days of daily snapshots** (now with profile visits / engagement / clicks).
- Created **`mh_notifications`** (sql/016).
- All test tasks, their auto-created Thumbnail tasks, test chat messages and the
  test date-change request were **deleted**. Nothing test-related is left.

---

## 3. ▶ Resume: finish the Notifications test

Already verified live: action + FYI pop-up, sidebar badge, "(N)" tab title, FYI
doesn't return after reload, 30-day-old FYI never pops (12 h rule), pop-up
styling, action item comes due for re-pop at 90 s. Pop-ups are skipped while the
dashboard tab is in the background and fire the moment you return to it.

**Still to check:** re-pop actually showing · Dismiss (stays unread, stops popping)
· Go to notification center (read, stays pinned) · resolve the action → unpinned
· delete blocked while pending · mark all read · open task link · the tab's filters.

**Evening testing:** in the browser console run
`localStorage.setItem('gc-notif-ignore-quiet','1')` — pop-ups then ignore quiet
hours. Works ONLY on the local dev server; the live site always keeps quiet hours.

**Creating test data:** do NOT use the app's date-change request to make an action
item — `requestDateChange()` also posts to **team chat, Slack #creative_marketing
and email**. Insert only the `discover_cache` row (`datechg:<postId>`, status
pending) + the `mh_activity` `date_change_requested` row, and delete them after.

Then: tick #20 done, and decide on pushing/deploying.

---

## 4. Comment queue — 15 from 22 Sep

| # | Comment | Status |
|---|---|---|
| 11–12 | 90 days combined / months | ✅ (now 7/30/60/90) |
| 13–14 | Samvaya dashboards | ✅ IG + FB · ⛔ YouTube needs a channel ID |
| 15 | Posts vs videos | ✅ carousels/statics/reels + Monthly output |
| 16 | Remove collaborators | ✅ |
| 17 | Nandu default on 12thPlus | ✅ |
| 18 | Claim / owner-collaborator | ✅ |
| 19 | Reminder timing | ✅ |
| 20 | Notification tab | 🟡 built, testing (§3) |
| — | Sales Ops tracker: Airtable-style filters (Maheen) | ⬜ |
| — | Sales Ops leads: Airtable-style filters (Maheen) | ⬜ |
| — | Scheduler: schedule stories too (Maheen) | ⬜ |
| — | Reports › social: needs edit access (Maheen) | ⬜ |

None are marked **Resolved** in the Comments tab yet — do that once shipped.

---

## 5. Waiting on Praveen

- **Samvaya YouTube** — does Samvaya have a channel? If yes, send the channel ID.
- **Samvaya Engagement shows −1** (Meta's net interactions) — floor at 0?
- **Instagram/Facebook accounts are on US Pacific time**, not IST (daily buckets
  end 12:30 PM IST). Change the timezone in Meta Business Suite; then re-check.
- **Snapshot gap 21 Jul → 14 Aug (+14–19 Jul)** is permanent (Meta won't serve it).
  Worth checking why the cron stopped then.

---

## 6. Parked

- The **10 publish-flow bugs** from the daytime changelog (`CHANGELOG_2026-09-22.md`,
  "End-to-end test… NOT fixed yet").

---

## 7. Gotchas found this session

- **A second Supabase project also has an `mh_posts` table.** The first two runs of
  sql/016 went there (it has its own `mh_notifications` now). Always check the
  address bar says `wlhbmzaernchwebapszq` — the dashboard's DB has 51 tasks.
- **Windows:** `npm run dev` fails (`NODE_OPTIONS=…` is Unix syntax). The launcher
  in `D:\Claude\.claude\launch.json` runs it via `cmd` instead. Fine on the Mac.
- **Chrome extension** dropped off several times on Windows; reconnect from the
  Claude side panel. Only drive the browser marked "on this computer".
- **Tokens:** Instagram/Facebook ~17 days left; LinkedIn lapses ~3 Oct.
- Untracked files `components/OverviewExtras.backup.tsx` and `lib/schedule-multi.ts`
  are not from this session — left alone.
- Commits this session: `5df1963` … `65de500` (21 commits).
