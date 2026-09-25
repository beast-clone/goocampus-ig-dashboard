# Changelog — 24 Sep 2026

Branch **`feat/dashboard-reskin`**. **LIVE.** Deployed to production at the end of
this session — deploy `6ab55f62`, https://goocampus-ig-dashboard.netlify.app.
Everything below is on the live site right now.

Two sessions ran today: Community Broadcast during the day (its own file,
`docs/BROADCAST_CHECKLIST.md`), and this one in the evening. Both are on the same
branch and went live together.

---

## ▶ Start here tomorrow (office, Mac)

```bash
git fetch && git checkout feat/dashboard-reskin && git pull
npm install
npm run dev
```

⚠️ **Do not run `npm run build` while the dev server is running.** They share
`.next`, and the production build leaves the dev server throwing
`Cannot find module './9276.js'` on every page. If that happens: stop the server,
`rm -rf .next`, start it again. Cost about 20 minutes today, twice.

---

## 1. ▶ What to check on the LIVE site (this is the list you asked for)

Everything else was verified locally against the **same** live Supabase and live
Meta / Airtable APIs, so it is already proven. Three things could not be, and are
the whole reason the deploy matters. **Two of them were settled after the deploy —
only 1a is still open.**

| | | |
|---|---|---|
| 1a | The import `<HTML>` error | ✅ **fixed — pressed on production 25 Sep, see `LIVE_CHECK_2026-09-25.md` §4** |
| 1b | Hourly Airtable sync | ✅ verified on production after the deploy |
| 1c | Does a Story publish | ⬜ needs a real story through n8n |

### 1a. The import that failed with `Unexpected token '<'`  ✅ **done**

**Pressed on the live site at 9:33 am, 25 Sep. It worked:** *Imported — 0 new · 87 updated ·
2 skipped (no title in Airtable)*, in **7 seconds**. No `<HTML>` error. 87 updates is exactly
the case that used to time out, and the row count was 127 before and 127 after, so nothing
was duplicated. The concurrency fix was enough; server-side chunking is not needed.

**Marketing Hub → Master sheet → Sync from Airtable → Import.**

Expected: it finishes and reports what it did. No `<HTML>` error.

Why it could only be tested live: that error was **Netlify killing the request at
10 seconds**. 88 records were written one at a time (~8.4s of pure waiting, plus a
2.2s Airtable read). Localhost has no 10s limit, so it succeeded there whether or
not anything was fixed. Writes now go six at a time — 8.4s → 1.6s measured.

If it still fails, the fix was not enough and the next step is chunking the import
server-side, not tuning the concurrency.

**Note:** the hourly cron runs the same code on the same Netlify runtime and
finishes in under 2s — but it only ADDS, so it never exercised the 86 updates,
which is exactly where the timeout was. That is why this one is still open.
Someone signed in has to press Import once.

### 1b. The hourly Airtable sync  ✅ verified on production

Run against the live site twice after the deploy:

```
GET /api/cron/import-airtable   (with x-cron-secret)
{"ok":true,"ms":857,"added":0,"inView":88,
 "skipped":[{"already in the dashboard":86},{"no title in Airtable":2}]}
200 in 1.8s
```

`netlify functions:list` shows both `import-airtable-cron` and
`snapshot-stories-cron` as `deployed: yes`.

**Does it create duplicates? No — measured, not assumed.** Database counted either
side of a production run:

```
rows before : 124   distinct airtable ids: 87   duplicates: 0
rows after  : 124   distinct airtable ids: 87   duplicates: 0
```

Two independent guards: every task carries Airtable's record id and is matched on
it (which is why pressing Sync twice has always updated rather than duplicated),
and the hourly run additionally skips anything already present.

**Left to confirm:** only that the *schedule* fires by itself on the hour —
Netlify → Project → Logs → Functions → `import-airtable-cron`, one line per run:
`[cron/import-airtable] N added, 88 in view, NNNNms`. Add a task to the Airtable
"Task Dashboard" view and it should appear within the hour with nobody pressing
Sync.

**It only ADDS.** It never touches a task that is already here. A full import
copies every Airtable field over the dashboard's row — right when a person presses
the button and watches, but on a timer it would quietly revert the team's own
edits (change a status here, get Airtable's old one back within the hour).

Also fixed alongside it: the **story-snapshot cron has been calling a dead URL**
(`/gc-dashboard/api/...`) ever since the app moved to the site root — a 404 every
hour, silently. Proven against live: the root path answers 401, the
`/gc-dashboard` one 404s. **This is a strong candidate for the snapshot gap** noted
in `CHANGELOG_2026-09-22_pm.md` §5. Worth confirming stories now snapshot hourly.

### 1c. Does a Story actually publish  ⬜

The dashboard queues it correctly and the enqueue API tags it `type: "Story"`, but
the publisher is **n8n** (`oJCNoKDWBYuiYVp1`), outside this repo and never tested
with a story. Schedule one and watch it go out.

---

## 2. ▶ Two things you asked me to look at — NOT started

### 2a. Attendance — is login/logout time calculated properly?  ⬜

The Attendance tab under My Workspace. Nobody has checked whether the recorded
login/logout times and the totals derived from them are right. Start by comparing
one person's recorded day against what actually happened.

### 2b. My Day — dragging a task should reorder the list too  ⬜

Today dragging a task on the **timeline** moves it on the timeline only. The task
list below/beside it keeps its old order, so after a drag the two disagree about
what you are doing next.

Expected: drag the last task to the front and it becomes first **in the list as
well**.

Related, from 23 Sep and still true (the fix was written and deliberately
reverted so you could judge it yourself):

1. **After the shift ends, dragging does nothing at all.** The drop handler clears
   the pin when you drop at or before "now", and "now" is clamped to the end of the
   track — so after 6pm every drop counts as the past. Measured at 9:19pm:
   `nowMin` 739 clamped to 600, the whole timeline.
2. **A block can never be dragged earlier.** The layout does
   `cursor = Math.max(cursor, pinnedTime)`, so a pin only ever pushes a block
   *later*. Drag one left and it snaps back. This one bites during work hours too.

---

## 3. Comment queue — closed

**19 of 20 built. 1 declined by you. 0 marked Resolved** (do that once the live
checks in §1 pass).

### Built today

| Who | Comment | What was actually wrong |
|---|---|---|
| Manya | NEET PG SBU appears twice | Content Radar kept its own brand list containing `"NEET PG"`, which is not a real SBU. Every radar story filed tasks under the invented name. The list is now typed so a fake brand fails the build. |
| Manya | Can't change the content status | Status was **display-only** in the task detail — no control existed, hence no options. It is a picker now. It also reads the saved value back, because the pill kept showing the stale board snapshot after a change. |
| Manya | New task doesn't show in the calendar | It did — invisibly. Day cells drew only 4 tasks; hers went to 26 Sep which already had 4, so it sat behind "+1 more". "+N more" now expands in place, and the day you just created on opens itself. |
| Manya | Coloured boxes on calendar chips | Removed. The chip is already tinted by status with a legend; brand moved into a themed hover card (was the browser's black OS tooltip). |
| Maheen | Sales Ops tracker — filters like Airtable | The Marketing Hub's filter builder was lifted into `lib/filter-model.ts` + `components/FilterBuilder.tsx` and reused, rather than writing a second one. |
| Maheen | Sales Ops leads — filters like Airtable | Same builder on first-contact tracking. |
| Maheen | Report needs edit access | "Edit the wording" makes the prose editable and saves it back, stamped with who changed it. **Text only** — the save path writes a field only if what is there is already a string, so figures and charts cannot be rewritten. |
| Maheen | Schedule story as well | Stories were already supported, but the Format control only appeared after attaching exactly one file — so opening the composer showed no format choice at all. Now always visible, with what the creative can't be greyed out and the reason on hover. **And added to the row editor**, which is how produced work actually gets scheduled. |
| Nandu | Expected reach on Facebook | See §4. Facebook now shows its measured engagement instead. |
| — | Samvaya dashboards | Already correct: Instagram + Facebook, no YouTube (confirmed with Praveen). YouTube is excluded on purpose — it serves demo data for unknown channels, which is how Samvaya once showed mock numbers as live. |

Earlier today, also live now: Broadcast (see the checklist), the import speed fix,
the hourly sync, the 12thPlus.com rename, and the `Sync from Airtable` date
shortcuts removed in favour of the two date pickers.

### Declined

**Nandu — "add a months buttons also"** (Overview, on the `60 days` button).
Praveen: do not add. Note he asked for this 1h43m *after* asking for 60/90 to be
one combined view. Month-by-month still works on **1 year** and **custom ranges
over a month** — it is only off for 60d/90d.

---

## 4. Facebook: reach is gone, engagement is what is left

Nandu asked for "expected reach in facebook also". Instagram's panel cannot be
repeated, because **Meta serves no reach or impressions for Page posts at all**:

```
post_impressions · post_impressions_unique · post_reach · post_engaged_users
  -> (#100) The value must be a valid insights metric
  on v19, v21 AND v23, on all four pages, with a token that DOES carry read_insights
```

The comment at the top of `lib/facebook.ts` blaming a missing `read_insights`
scope is **stale — do not trust it**.

So Facebook shows what its posts actually got instead — likes, comments, shares
over the last 25 posts, the per-post average and the best recent one — stated as
measurement, not forecast. On GooCampus Main that currently reads **7 engagements
across 25 posts**.

⚠️ Earlier in the session I said Facebook engagement was "literally zero". That
was wrong — I had sampled only the 6 newest posts per page. Over 25 it is very
low, but not zero.

**The real finding is not a dashboard one:** the Facebook pages are getting almost
no engagement, and reach cannot be measured at all. Worth deciding whether those
pages are worth posting to.

---

## 5. Changes made to the live database

- One `mh_posts` row moved from `sbu = "NEET PG"` → `"India NEET PG Consulting"`.
- Test data created while verifying was **all deleted**: three test tasks, two
  `mh_activity` rows, and an edit to a real saved report restored byte-for-byte
  (558 characters, exactly as generated). Nothing test-related remains.

---

## 6. Still open from before

- **Instagram/Facebook accounts are on US Pacific time**, not IST — daily buckets
  end 12:30pm IST. Change it in Meta Business Suite.
- **Samvaya Engagement shows −1** (Meta's net interactions) — floor at 0?
- Broadcast: confirm the **50/hour, 300/day** warning thresholds, and the
  **media-retention build** (specced in `MEDIA_RETENTION_SPEC.md`, not started).
- The **10 publish-flow bugs** from `CHANGELOG_2026-09-22.md`.
- `lib/facebook.ts` header comment is wrong about `read_insights` — correct it
  when someone next touches that file.
