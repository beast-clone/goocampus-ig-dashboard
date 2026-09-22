# Notifications — spec

Agreed with Praveen, 22 Sep 2026. Origin: dashboard comment #20 (Maheen) —
"make a seperate notification tab". This file is the source of truth; update it
when a decision changes.

---

## 1. What it is

One notification system for the whole dashboard, for **every member**, made of
three parts:

1. **Notifications tab** — its own page in the sidebar. Every notification the
   person has ever received, **grouped / filterable by category**.
2. **On-screen pop-up** — each new notification shows a small pop-up on
   **whatever page the person is on**, not only a badge on the bell.
3. **Re-pop** — an ignored **action-needed** item pops again after ~90 seconds,
   and keeps doing so until the person responds.

The dashboard-wide entry point is the **Notifications item in the sidebar**,
with an unread badge — shown to every member regardless of which sections they
can open. The unread count also goes into the browser tab title.

## 2. Categories

| Category | Contains | Action needed? |
|---|---|---|
| **Action needed** | Date change to approve · Waiting in your pipeline (accept) · Swap request (pick a task) · Sent back for changes | **yes** |
| **Assigned to you** | Assigned to you · Approved & handed to you | no |
| **Claims & pool** | New video up for grabs · X claimed a video | no |
| **Your tasks' progress** | "Your task is approved / being made / ready for review / scheduled / published" (for the creator) · Cleared review → scheduled | no |
| **Dates & schedule** | X moved a date | no |

"New video up for grabs" is FYI, not action-needed: it goes to both editors and
one claiming it resolves it for the other. Flip it here if that changes.

## 3. Pop-up

- Small card, **top-right** (bottom-right is taken by the Comment and New task
  buttons), on **every page** of `/dashboard/preview/*`.
- Shows emoji, title, one line of detail.
- Buttons: **Go to notification center** · **Dismiss**.
- Clicking the card body opens the exact task it is about.
- Several at once stack (action items first, max 3 visible, "+N more").
- Each pop-up hides itself after ~15 s (not while hovered). Hidden is not
  handled: an ignored action item comes back on a later check.
- An FYI only pops if it is under 12 h old, so a person's first sync (30 days of
  history) doesn't arrive as dozens of pop-ups. Action items pop at any age.

## 4. States and what each button does

| Event | Read? | Pops again? | Leaves "Action needed"? |
|---|---|---|---|
| **Go to notification center** (or clicking it open) | read | no | no — only when done |
| **Dismiss** | stays **unread** | no | no |
| **Ignored** (no click) | unread | **action-needed only**, every ~90 s, **no limit** | no |
| **Action completed** (see §5) | — | no | **yes** |
| **Delete / Clear** by the person | gone from their tab | no | — |

- **Read ≠ done.** Opening an action-needed item stops the pop-up but it stays
  **pinned in "Action needed"** until the underlying action is actually done.
- FYI items pop **once**, then sit in the tab.
- **History is kept forever** — nothing expires. A notification leaves the tab
  only when the person deletes it or clears it.
- An action-needed item **cannot be deleted while still pending** (it would lose
  the only reminder); delete becomes available once it is done. *(Default —
  change here if wanted.)*

## 5. When an action-needed item counts as done

| Item | Done when |
|---|---|
| Date change to approve | the request is approved or rejected (`lib/date-approvals.ts`) |
| Waiting in your pipeline | the person starts the task, or it is reassigned away |
| Swap request | the task now belongs to the person who asked (the existing resolved-check the feed already used) |
| Sent back for changes | the task's status leaves *Incorporating Feedback* |

## 6. Quiet hours

- No pop-ups **outside the person's shift** (9 AM–6 PM; Nandu 10 AM–7 PM), on
  **weekends**, or after they press **End day**.
- Notifications still arrive in the tab; the pop-ups start again next shift.

## 7. Extras in v1

- Clicking a notification opens the exact task.
- Unread count in the browser tab title: **"(3) GooCampus Marketing OS"**.
- **Mark all read** — overall and per category.
- Quiet hours (§6).

**Later (v2):** chat mentions and team comments as categories · desktop (OS)
notifications · WhatsApp/Telegram digest of unread action items via n8n ·
Maheen's "who hasn't acted on urgent items" view.

## 8. Data

New table **`mh_notifications`** (`sql/016_notifications.sql`) — one row per
notification per recipient, so read / dismissed / done / deleted state and
unlimited history are stored rather than recomputed.

- Notifications are still **generated from the activity log** by the existing
  `/api/my-day/notifications` logic (reused, not rewritten), then **persisted**
  keyed on `(recipient_key, source_id)`, so each event notifies once.
- Sync window = since the person's newest stored notification (first sync: 30
  days), so events are not lost if someone is away longer than the old 3-day
  window.
- `last_popped_at` is stored server-side so re-pop timing survives page reloads
  and does not double up across two open tabs.
- RLS enabled, **no anon policies** (the app uses the service role — project rule).

## 9. Build state — cross-check against what exists (22 Sep 2026)

- ✅ Notification kinds generated from `mh_activity` — `app/api/my-day/notifications/route.ts` (reuse).
- ⚠️ Bell only mounted on Overview (`PreviewOverview.tsx`); My Day has a second, separate stack (`NotificationStack`). Two systems → becomes one.
- ⚠️ Dismissals are browser-session only (`HubNotificationBell.tsx`) — reopening the dashboard brings everything back.
- ❌ No stored history — only the last 3 days, newest 160 events.
- ❌ No read / dismissed / done state.
- ❌ No pop-up, no re-pop.
- ❌ No categories or filters.
- ❌ No Notifications page in the sidebar.
- ✅ Swap requests: resolved-check already existed (owner becomes the requester) — reused.
- ⚠️ Polls every 60 s — a pop-up can arrive up to a minute after the event.

## 10. Build notes (22 Sep 2026)

- `lib/notifications.ts` — the generation rules, lifted verbatim out of
  `/api/my-day/notifications`, now also tagging each item with its category,
  event time and `taskId`. The old route is a thin wrapper and returns what it
  did before (checked for all five people).
- `taskId` is separate from `postId` on purpose: My Day treats a `postId` as
  "show an Accept button", so reusing it would put Accept on every notification.
- `/api/notifications` — GET syncs + resolves done + returns; PATCH read /
  dismiss / popped / delete. Scoped to the **session user**, never a `?person=`.
  Quiet hours are computed there in IST.
- `NotificationHost` — mounted once in the preview layout; polls every 30 s and
  on window focus; re-pop after 90 s.
- `/dashboard/preview/notifications` — the tab.
