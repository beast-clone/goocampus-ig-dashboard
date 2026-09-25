# Live check — 25 Sep 2026

Everything below was tested on **https://goocampus-ig-dashboard.netlify.app**, in Mac
Chrome, signed in as a real user. Nothing was tested on localhost and nothing was fixed
— this is the list to work through.

---

## 1. Attendance — broken, cause found

The board reads **0/5, "Not in yet"** for everyone. Confirmed against the live API: all
five rows have `login_at: null`.

**Proof, end to end:** signed in as Praveen L at **9:15 am**, opened **My Day** at
**9:16 am** → still nothing recorded.

| | What's wrong | Where |
|---|---|---|
| 1.1 | **All 5 users are admin on live.** My Day skips the attendance write for any admin, so nobody is ever recorded. | the test setting, to revert |
| 1.2 | The guard is `if (viewerIsAdmin) return` — **any** admin, not "an admin looking at someone else's day". Maheen is a real admin, so she could never be recorded even after 1.1 is reverted. | `PreviewMyDay.tsx:1719`, and the same at `:2459` for logout |
| 1.3 | Login is stamped **when My Day opens**, not at sign-in. Sign in, work elsewhere, and you are absent all day. | `PreviewMyDay.tsx` ~1712 |
| 1.4 | The time comes from the **browser's clock** (`d.getHours()`), not IST. A laptop on the wrong timezone records the wrong hour. | same block |
| 1.5 | Clamped to **9:00 am – 7:00 pm**. 8:40 am records as 9:00; 7:30 pm records as 7:00 pm. | `DAY_START_H = 9, DAY_END_H = 19` |

**Not proven:** whether the rest of the chain (POST → `mh_attendance` → board) works once
a write gets through. Needs one non-admin login, or a fix plus a deploy.

**Suggested fix for 1.2:** skip only when the admin is viewing a teammate —
`if (viewerIsAdmin && person !== signedInUserId) return`.

---

## 2. My Day timeline — drag and drop

All reproduced on the live site against Praveen's real plan. **Nothing was saved** — the
drag is screen-only, which is itself finding 2.5.

| | What I did | What happened |
|---|---|---|
| 2.1 | Dragged the **last task to the front** (9:05 am) | **Nothing moved.** A drop at or before "now" is discarded — `pinPlanAt` sets `at: undefined` when `mins <= now`. So the headline request is impossible. |
| 2.2 | Dragged it to **11:00 am** — earlier than its slot | **Nothing moved.** The layout does `cursor = Math.max(cursor, pinnedTime)`, so a pin can only push a block later. The block's own tooltip says "Drag along the timeline to start it later". |
| 2.3 | Dragged it to **5:20 pm** — later | Worked (75% → 82.5%). |
| 2.4 | Dragged the **first task to 12:00** | **This is the "misaligned".** Everything after it was shoved past the end of the day: blocks rendered at **95% and 105%** — off the right edge — and **two blocks disappeared** from the timeline (11 → 9). |
| 2.5 | Any drag, then reload | **Gone.** `pinPlanAt` only calls `setPlan` — nothing is persisted. |
| 2.6 | The **task list beside the timeline** | **Never changes.** It is sorted by "Publishing date" and does not follow the timeline at all. |

What Praveen asked for: drag the last task to the front, and the list below reorders with
it. Neither is possible today — 2.1 and 2.2 block the drag twice over, and 2.6 means the
list would not follow even if it moved.

---

## 3. Comment queue — 10 marked resolved

Each was opened on the live site and exercised before marking. The note on each comment
says what was verified.

| Who | Comment | Verified |
|---|---|---|
| Manya | Coloured tiny boxes on calendar chips | Chips show the title only; brand is in the hover card |
| Manya | New task doesn't show in the calendar | "+15 more" expands in place, becomes "Show less" |
| Manya | NEET PG SBU appears twice | One "India NEET PG Consulting (26)"; the invented entry is gone |
| Nandu | Expected reach on Facebook | Composer shows FACEBOOK / LAST 25 POSTS with real engagement |
| Nandu | 60 days → 90 days | Overview has both 60 and 90 |
| Maheen | Sales Ops **tracker** — Airtable filters | Filter → field / contains / value, Add condition |
| Maheen | Sales Ops **leads** — Airtable filters | Same builder |
| Maheen | Report needs edit access | "Edit the wording" → 11 editable fields, Done / Discard |
| Maheen | Schedule story as well | Create post shows Format — Post / Reel / Story — with no file attached |
| Maheen | Make a separate notification tab | Notifications is its own tab with an unread count |

**35 comments total: 25 resolved, 10 still open.**

### Still open, and why

| Who | Comment | Why it's still open |
|---|---|---|
| Manya | Can't change the content status | **Half done.** The picker exists in the **Master sheet** detail (Content - Pending / Approved / Output - In Progress / Incorporating Feedback / Output - Ready / Published). In the **Calendar** modal — where she reported it — the status is still a static pill with no picker. |
| Nandu | Add a months buttons also | Declined by Praveen |
| Maheen | Samvaya Instagram, Facebook **and YouTube** | IG + FB are there. YouTube is excluded on purpose (it serves demo data for unknown channels). Needs Praveen's word to close. |
| Nandu | Add Samvaya Instagram and YouTube | Same |
| Maheen | Nandu as default collaborator for 12thPlus.com | Not built |
| Maheen | Nandu editing → Nandu owner, Nikhil collaborator | Not built |
| Maheen | Option to remove collaborators | Not built |
| Maheen | Task claimed but not updated for Nikhil and Nandu | Not built |
| Manya | Reminder should go hours before day end, not after the publishing date | Not built |
| Manya | Show videos and posts separately, not as one | Not built |

---

## 4. Not done yet

- **Marketing Hub → Master sheet → Sync from Airtable → Import** (changelog §1a) — the
  one live check still open. It writes to live data, so it needs Praveen's go-ahead.
- **Does a Story actually publish** (§1c) — needs a real story through n8n.
