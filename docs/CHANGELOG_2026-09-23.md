# Changelog — 23 Sep 2026 (Windows)

Branch **`feat/dashboard-reskin`**. **Nothing is deployed** — live is still `27b2088`.
Continues from `docs/CHANGELOG_2026-09-22_pm.md`.

Two blocks of work today: **Community Broadcast** (morning → evening) and the
**new comment queue** (night).

---

## ▶ Start here tomorrow

```bash
git fetch && git checkout feat/dashboard-reskin && git pull
npm install
npm run dev
```

On Windows `npm run dev` fails (`NODE_OPTIONS=` is Unix syntax) — use the
launcher in `D:\Claude\.claude\launch.json`, which runs it through `cmd` on
port 4324. Fine on the Mac.

**Nothing is in progress.** Work stopped at a clean point. Three things are
waiting on a decision from you — see §5.

---

## 1. Community Broadcast (WhatsApp)

A new tab that schedules WhatsApp messages to community groups and contacts,
sent through WAHA + n8n (n8n polls `/api/scheduler/whatsapp/due` every minute).

Built today: the tab itself, linking/unlinking a number, more than one number,
the real contact + group picker, recurring messages (daily/weekly/monthly),
reading a message by opening it, am/pm times, delete, and the dashboard's own
dropdowns instead of native ones.

### The 8 o'clock message "that never sent"

It **did** send. The recipient was `918892869798@c.us` — which is the *sending*
account, saved in the phone's contacts as "Praveen (test)". WhatsApp filed it in
the **Message-yourself** chat, so nothing arrived anywhere visible.

Proven by scheduling a fresh 8:22 pm test from Praveen L → 74838 00702, which
landed at 8:23 pm.

Two things came out of it:

1. **A warning when the recipient is the sending number** — the composer says so
   before you schedule, instead of letting it disappear into the self-chat.
2. **You can now see which number sends.** A tick badge on the avatar in the
   Connected numbers panel marks the sending account; the composer's "Send from"
   dropdown defaults to it, and changing the dropdown moves the tick. The
   calendar and each message row name the account they go out from. The choice
   lives in `broadcast/sendFrom.ts` (per browser — it is a preference, not team
   data).
3. The composer footer was grey-on-grey and easy to miss; it is highlighted now.

---

## 2. Comment queue — five new comments (23 Sep)

Four fixed, one blocked. **None are marked Resolved in the Comments tab yet** —
they are not deployed, so do that when they ship.

### ✅ "NEET PG SBU appears twice" (Manya, 4:52 pm)

Content Radar kept its **own** copy of the brand list, and `"NEET PG"` in it was
never a real SBU — the real one is `"India NEET PG Consulting"`. Every radar
story turned into a task carried the invented name, so it appeared as a second
brand in every dropdown on the board.

- Radar's shortlist is now typed `Sbu` (from `lib/sbus.ts`), so an entry that
  isn't a real brand **fails the build** rather than reaching the board. This is
  the fourth surface to drift; the type stops a fifth.
- Also split UG from PG — matching on "neet" alone sent both to PG.
- The one task already filed under the invented name was repointed in the
  database (see §3).

### ✅ "I can't change the content status, options are not showing" (Manya, 4:59 pm)

Status was **display-only** in the task detail. There was no control at all,
which is why no options appeared.

- The pill is now a picker over the eight statuses `/api/marketing-hub/update`
  accepts (note that includes `Content - In Progress`, a real status with no
  pipeline column). `saveOne` already surfaced the completeness gates ("can't
  approve yet — X missing") and logged to Activity, so that came for free.
- **Second bug found while testing:** the save landed and Activity logged it, but
  the pill kept showing the old stage — the modal was reading `row.status`, a
  snapshot of the board taken when you opened it. It now reads the saved status
  back from `/api/marketing-hub/task-detail` (which returns `status` as of
  today). Without this the fix looked broken even though it worked.

### ✅ "I am creating a task in the calendar, it doesn't show up" (Manya, 4:56 pm)

It **did** get created — it was invisible. A day cell only ever drew **four**
tasks and collapsed the rest into "+N more". Her first task went to 26 Sep,
which already had four.

- "+N more" now **expands the day in place** (with "Show less") instead of
  navigating off to the Day view.
- The day you just created a task on opens itself, so the new task is on screen.

### ✅ "No need for the coloured tiny boxes… looking a bit messy" (Manya, 5:01 pm)

Each chip carried a brand-coloured square *and* a status-coloured fill — two
colour systems in one small chip.

- Dropped the square. The chip is already tinted by status and there is a legend
  under the calendar, so one colour signal is left, like Airtable.
- Brand moved into the **hover card**, which used to be the browser's black OS
  tooltip and is now a themed card: title, status pill, brand, format, owner,
  and "click to open · drag to reschedule". It flips to stay on screen near the
  edges.

### ⛔ "Add expected reach in Facebook also" (Nandu, 11:20 am) — blocked by Meta

Not a code problem. The reach prediction is built entirely from **Instagram**
media insights (`predictForCaption` → `getRecentPostsWithStats`). Facebook has
no equivalent available:

```
Samvaya Matrimony   followers=21     post_impressions_unique → (#100) not a valid insights metric
GooCampus World     followers=9      post_impressions_unique → (#100) not a valid insights metric
GooCampus Edu       followers=1270   post_impressions_unique → (#100) not a valid insights metric
GooCampus India     followers=3      post_impressions_unique → (#100) not a valid insights metric
```

Tested on **v19, v21 and v23** — `post_impressions`, `post_impressions_unique`,
`post_reach` and `post_engaged_users` are all rejected on every page and every
version. It is not a small-page restriction: GooCampus Edu has 1,270 followers
and behaves the same.

**The token is fine** — it does carry `read_insights`. The comment at the top of
`lib/facebook.ts` saying otherwise is **stale and should be corrected**.

What *does* still work: `post_clicks`, `post_reactions_by_type_total`,
`post_video_views`, `post_activity_by_action_type`.

**Decision needed:** Facebook could get a predicted **engagement** figure from
those instead. Not built — labelling engagement as "reach" would be telling
Nandu something untrue. Your call.

---

## 3. Changes made to the LIVE database (Supabase `wlhbmzaernchwebapszq`)

- One `mh_posts` row moved from `sbu = "NEET PG"` → `"India NEET PG Consulting"`
  (the Content Radar story about the NEET PG answer key, created 22 Sep).
- Test data created while verifying the calendar fixes was **deleted**: two test
  tasks ("Calendar refresh test", "Expand test") and the two `mh_activity`
  status-change rows from testing Manya's "Demo" task. Her Demo task is back on
  `Content - Pending` exactly as she left it. Nothing test-related remains.

---

## 4. My Day timeline drag — looked at, left alone

You asked me to check why the Today's-plan timeline doesn't rearrange properly.
Two real problems were found and **deliberately reverted** so you can judge the
behaviour yourself tomorrow:

1. **After the shift ends, dragging does nothing at all.** The drop handler
   clears the pin when you drop at or before "now", and `now` is clamped to the
   end of the track. Tested at 9:19 pm: `nowMin` 739 clamped to 600 = the whole
   timeline, so every drop counted as the past.
2. **A block can never be dragged earlier.** The layout does
   `cursor = Math.max(cursor, pinnedTime)`, so a pin can only push a block
   *later*. Drag one left and it snaps back. This one bites during work hours too.

The fix was written and reverted on your instruction — nothing of it is in the
tree. Confirm tomorrow whether that matches what you meant by "not getting
arranged properly" before it goes back in.

---

## 5. Waiting on you

- **Facebook expected reach** — accept a predicted *engagement* figure instead,
  or drop it? (§2)
- **Nandu wants month buttons back on the Overview ranges** (22 Sep, 6:08 pm) —
  you had me remove them the same afternoon. Straight conflict between the two
  of you; not mine to settle.
- **My Day drag** — confirm the two behaviours above are what you meant. (§4)

Still open from yesterday: Samvaya YouTube channel ID · whether to floor
Samvaya's −1 engagement at 0 · the Instagram/Facebook accounts are on **US
Pacific** time, not IST (daily buckets end 12:30 pm IST) — change it in Meta
Business Suite.

---

## 6. Comment queue — where it stands

| # | Comment | Status |
|---|---|---|
| 20 | Notification tab | ✅ built + tested |
| — | NEET PG appears twice (Manya) | ✅ |
| — | Can't change content status (Manya) | ✅ |
| — | New task doesn't show in calendar (Manya) | ✅ |
| — | Coloured boxes on calendar chips (Manya) | ✅ |
| — | Expected reach on Facebook (Nandu) | ⛔ blocked by Meta — §2 |
| — | Month buttons back on Overview (Nandu) | ⚠️ conflicts with your own instruction |
| — | Sales Ops tracker: Airtable-style filters (Maheen) | ⬜ |
| — | Sales Ops leads: Airtable-style filters (Maheen) | ⬜ |
| — | Scheduler: schedule stories too (Maheen) | ⬜ |
| — | Reports › social: needs edit access (Maheen) | ⬜ |

---

## 7. Parked

- The **10 publish-flow bugs** from `CHANGELOG_2026-09-22.md`.
- `lib/facebook.ts` header comment claims the page tokens lack `read_insights`.
  They don't — correct it when someone next touches that file.
