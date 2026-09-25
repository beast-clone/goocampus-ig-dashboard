# Changelog — 25 Sep 2026

Branch **`feat/dashboard-reskin`**, 12 commits, latest `5f6cda6`. All pushed to GitHub.

> ## ⚠️ NONE OF THIS IS DEPLOYED
>
> The live site is still on the 24 Sep deploy. Everything below was built and checked
> on **localhost**, against the same live Supabase. One thing in particular only
> starts working once it IS deployed — see §1.

---

## ▶ Pick it up at home

```bash
git fetch && git checkout feat/dashboard-reskin && git pull
npm install
npm run dev
```

⚠️ **Don't run `npm run build` while the dev server is running** — they share `.next`
and the build leaves the dev server throwing `Cannot find module './9276.js'` on every
page. If it happens: stop the server, `rm -rf .next`, start again.

---

## 1. Attendance — it recorded nobody, all day

The board read **0/5, "Not in yet"** for everyone. Proven on the live site: signed in
as Praveen at 9:15, opened My Day at 9:16, still nothing.

**Why.** My Day wrote the attendance from the browser, and skipped it for any admin —
a guard meant to stop an admin previewing a teammate from stamping that teammate as
present. With **all five accounts set to admin for testing**, that meant nobody was
ever recorded. It also only fired when My Day was opened (sign in, work in another
tab, and you were absent all day) and it read the laptop's clock, not IST.

**Now.** Signing in *is* the clock-in, written on the server. First sign-in of the day
wins. It covers **all three ways in** — Google, the password form, and the
identity-claim endpoint. The first attempt only covered the password form, which is
why the first live test still showed nothing: the team signs in with Google.

The board shows the **real time** — 8:40 is recorded as 8:40. Only the timeline clamps
to 9–7, and only to draw.

**Verified:** a real Google sign-in put Praveen on the board at **9:58 AM, 1/5,
Working** — and he is an admin, the exact case that used to be skipped. The test row
was deleted afterwards, so today's record is clean.

### ⚠️ Two things still to do here

1. **Revert the all-5-admin setting** when you have finished testing. That is a
   setting, not code.
2. **This is why the plan still starts at 9 AM.** The timeline anchors to the
   *recorded* sign-in, and there are none, because the code that records them is in
   this branch and is not live. Deploy it and every person's day starts when they
   signed in. Nothing more to build — proven by giving Nandu a recorded 12:05
   sign-in: his first block moved from 10% of the track to 30.83%, 9 AM → 12:05, with
   the morning left empty. That test row was deleted too.

---

## 2. My Day timeline — dragging was broken three ways

All three reproduced on the live site first, against real tasks.

| What happened before | Why |
|---|---|
| Dragging the **last task to the front** did nothing | A drop at or before "now" was thrown away |
| A block could **never be dragged earlier** | The layout only ever pushed a pinned block later — its own tooltip said "start it later" |
| Dragging an early block later **shoved the rest off the end** | Blocks rendered at **105%**, off the track, and two disappeared |
| The **task list never followed** | It was sorted by publishing date and ignored the timeline |
| Any drag was **lost on reload** | Nothing was saved |

**Now.** A drag decides *where the task comes in the day*, not what time it starts.
Same work, different sequence, so the day stays the same length and "earlier" is just
a smaller index — the three failures disappear rather than being patched. The pinning
code is deleted.

The task list gets a **"Today's plan"** sort, which a drag switches to, so the list
can no longer disagree about what is next. The order is **saved per person per day**.

**Verified:** last-to-front works, a late block drags earlier, **0 blocks past 6pm**,
none lost, the list reorders with it, and the order survives a reload.

### Also on the timeline

- **Overdue work leads the day.** A High task due *tomorrow* was opening the day ahead
  of two tasks already a day late. The order is now **overdue → Urgent/High → by
  date**, in the plan and in the list. (There was a second bug under it: the "is this
  overdue?" test read a date that starts empty and is filled a moment later, so on a
  fresh load nothing looked overdue at all.)
- **Late work doesn't slip quietly.** A drag that pushes anything overdue or high
  priority *later* asks for a reason first, and the reason goes on that task's
  activity feed. No reason, no move. It catches the sideways version too — dragging a
  quiet task to the front pushes the late one back just the same. Moving late work
  **earlier** never asks.
- **A Rearrange button** on Today's plan puts the day back to overdue → high priority
  → publishing date, and forgets the manual order.
- **⌘Z now undoes a drag.** Undo/redo already covered status, duration, priority and
  date changes; a reorder was the one thing you could not take back. ⌘Z / ⌘⇧Z on Mac,
  Ctrl+Z / Ctrl+Y on Windows. (⌘C / ⌘V are the browser's own and already work on any
  text — there is nothing for us to build there.)
- **The "Started" badge and the plan now read the same clock.** Opening Nandu's day
  showed "Started 12:05 PM" above a timeline beginning at 10 AM — the badge was
  reading *the viewer's own browser*, not Nandu's. It says "Not signed in yet" now
  rather than inventing a time.

---

## 3. Look and feel

- **One toast for the whole dashboard, at the top.** It was pinned to the bottom-right
  of My Day, underneath the floating Comment button, where it could not be read.
  Marketing Hub and Diagnostics each drew their own at the bottom. There is one now,
  top centre, rendered once by the dashboard layout — two short lines, a dismiss, a
  four-second fade. Titles no longer carry glyphs ("Rearranged ✓" → "Rearranged").
- **Notification rows use line icons, not emojis.** The icon set has been mapped since
  23 Sep; those rows just were not using it. "Published" was drawing sparkles, which
  says nothing about a post going out — it is a **send** now. "Someone claimed a
  video" is a **person-with-tick**, not a bare tick.
- **The chat panel's Pin button** wrapped onto two lines — icon on one, word on the
  next. Fixed.

---

## 4. Comment queue — empty. 35 of 35

It was 20 open this morning. **Every one was opened on the running app and exercised
before being marked**, rather than taken from the changelog — which matters, because
two of my own earlier "not done" calls turned out to be wrong.

**Six were already built** and had simply never been checked: the status picker on the
Calendar (clicking the pill opens it — an earlier check missed it because the pill read
"Published/Scheduled"), removing a collaborator, the claim reassigning owner and
collaborators, and Posting cadence counting carousels / statics / reels separately.

**Three closed by your decision:** the months buttons (declined), and both Samvaya
YouTube comments — YouTube is left off on purpose because it serves demo data for
unknown channels, which is how Samvaya once showed mock numbers as live.

**Three needed real work:**

- **Manya's reminders.** Producers got the end-of-day nudge in the 22 Sep revision,
  but her own branch was left on *"pending 3 days — why still open?"* — so the person
  who raised it was the only one who never saw the fix. One rule for everyone now: a
  task due **today**, nudged in the last three hours of the shift, while there is
  still time to act.
- **Nandu as default collaborator on 12thPlus.** The rule was written on 22 Sep and
  fires when a task is created or claimed, but nothing ever applied it backwards —
  every 12thPlus task imported from Airtable had **no collaborator at all**.
  Backfilled the 14 still moving through the pipeline; Nandu already owns 2, and the 9
  published ones were left alone. 24 collaborator rows afterwards, **no duplicates**.
- **"Task claimed but not updated for Nikhil and Nandu."** Not reproducible until you
  claimed work for Nikhil — then the Workload read **"2 videos to edit, 5h 0m free"**
  with both reels on his row at 1h 30m each. It works. The 0m Maheen saw was correct
  at the time: Nikhil had nothing. His third task is due 16 Oct, so it is correctly
  off the Today view.

---

## 5. The last live check from 24 Sep — passed

**Marketing Hub → Master sheet → Sync from Airtable → Import**, pressed on production:

```
Imported — 0 new · 87 updated · 2 skipped (no title in Airtable)
7 seconds
```

No `Unexpected token '<'`. Those 87 updates are exactly the path that used to be cut
off at Netlify's 10-second limit, and the path the hourly cron never touched because
it only ever adds. **127 rows before, 127 after** — nothing duplicated. The
concurrency fix was enough; chunking server-side is not needed.

---

## 6. Test data — all removed

Everything written while checking was deleted by its own id:

- the 9:58 attendance row for Praveen, and the 12:05 one for Nandu
- the `plan_moved` activity row ("position 1 → position 8 — waiting on the client logo")
- Praveen's saved plan order, cleared back to empty each time

`mh_attendance` has **no rows for today**, which is the honest state.

---

## 7. Still open

| | |
|---|---|
| **Deploy** | 12 commits, proven on localhost only. The attendance fix does nothing until it ships. |
| **Revert all-5-admin** | When testing is done. A setting, not code. |
| **WhatsApp thresholds** | 50/hour and 300/day are my numbers — confirm them or set your own. |
| **Media retention** | Specced in `MEDIA_RETENTION_SPEC.md`, never started. |
| **Story publish** | The dashboard queues it and tags it correctly, but n8n (`oJCNoKDWBYuiYVp1`) has never been given a story. |
| **LinkedIn cron** | Scheduled LinkedIn posts still never fire — nothing pings `/api/cron/publish-linkedin`. |

See also `docs/LIVE_CHECK_2026-09-25.md` for the morning's findings with line numbers,
and `docs/BROADCAST_CHECKLIST.md` for the Community Broadcast work.
