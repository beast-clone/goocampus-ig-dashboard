# My Day — Product Spec (source of truth)

> Captured from an interactive spec session with the user on **2026-07-22**.
> This is the agreed model for the **My Day** tab. Build against THIS, not old code.
> Tab: `app/(dashboard)/dashboard/preview/my-day/PreviewMyDay.tsx` (live-wired to Supabase `mh_posts`).
> Companion skill: `/my-day-spec` — re-runs the clarifying discussion before any build.

---

## 0. What My Day is
Each team member's **personal work console** — "what do *I* work on today, in what order, where do I do it." Marketing Hub is the manager's master view; My Day is the producer's scoped view. Tasks come live from `mh_posts`.

## 1. People, roles, permissions
Permissions live on `ind_users` (two jsonb layers: **capabilities** + **section/tab access**); **admins bypass everything**. Model in `lib/permissions.ts`.

| Person | Role | In the pipeline |
|---|---|---|
| **Maheen** | Admin / Co-founder & CMO | **Oversee-only, does NOT work tasks.** Implicitly all permissions/tabs. |
| **Manya** | Content Writer | Pipeline entry point — creates tasks, owns content stages, **approves**, raises all feedback. |
| **Praveen** | Graphic Designer | Design tasks via **direct** assignment. |
| **Nandu** | Video Editor | Video tasks via **claim**. Also creates tasks for Samvaya/other-platform (Manya-level create perms). |
| **Nikhil** | Video Presenter + edits some videos | Video tasks via **claim**; on-camera + sometimes edits. |

Capabilities: `create_tasks, edit_tasks, delete_tasks, assign_tasks, approve_content, reschedule, view_analytics, manage_team`. Presets: Producer / Manager / Viewer. (DB currently under-assigned vs this spec — to fix.)

## 2. Status lifecycle
`Content-Pending` → `Content-In-Progress` → **`Content-Approved`** (Manya's approval = assignment trigger) → `Output-In-Progress` → `Output-Ready` → `Ready-to-Publish` → `Published/Scheduled`.
Manya owns the first three (she does all content work).

## 3. Assignment (fires on Content-Approved, by Type)
- **Design** — Poster, Carousel, Reel Thumbnail, YouTube Thumbnail, **+ static Meta ads** → **Praveen, direct**.
- **Video** — YouTube video, Reel video, **+ video Meta ads** → **claim** (Nikhil / Nandu).
- **Text-only** — plain Story, LinkedIn article, text post → **Manya owns end-to-end** (no handoff; still Output-Ready → Content Review → Scheduler).
- Automatic by default; **manual override** allowed.

## 4. Owner ↔ Collaborator (both directions)
- While Pending / In-Progress: **Manya = Owner**.
- On Content-Approved + assign/claim: **producer = Owner, Manya → Collaborator**.
- **Revert** to Content-Pending (accidental approve / content change needed): **ownership returns to Manya**.
- Detail panel must show **both Owner and Collaborator**. (Store collaborator in `mh_posts.custom` jsonb — no dedicated column.)

## 5. Per-person status tabs (My tasks)
Each tab shows **only that one status**; lists tasks where the person is **owner OR collaborator**.
- **Manya (4):** Content-Pending · Content-Approved · Incorporating-Feedback · **Claimed Task**
- **Praveen / Nandu / Nikhil (3):** Content-Approved · Incorporating-Feedback · Output-Ready
- **Maheen:** oversight only (not a personal work queue).

## 6. Producer edit rights (Praveen / Nandu / Nikhil) on their own task
- **CAN:** change status · upload creatives · add links (Drive / video store).
- **CANNOT:** change **publish date**; **edit content** — content is **read-only but visible & copy-pasteable** (do NOT hide/ban it).
- **Manya can ALWAYS edit any task** via a pencil icon, even after handoff.

## 7. Content Review + feedback loop
- Producer marks **Output-Ready** → task pushes into the **Content Review** tab (Manya's review queue).
- Manya's two actions there:
  - **Incorporating Feedback** → types notes into a per-task **`incorporating_feedback`** field (default empty) → task bounces to the owner/producer with **popup + notification**, feedback shown **highlighted (red/blue)** on their task.
  - **Send to Scheduler** → sets **Ready-to-Publish** and pushes straight to Scheduler. (No separate "Ready to Publish" step/tab — one action.)
- **Manya raises ALL feedback** (content-stage AND output-stage), for now. Incorporating-Feedback only raised **after Output-Ready**.

## 8. Claim mechanics
- A claimable video task shows in **both** Nikhil's & Nandu's lists (inline, NOT a separate pool page) with a clear **Claim button + "Claim? Yes/No" confirm**.
- Whoever claims first **owns it**; it's **removed from the other's list**; **both get notified**.
- Whoever claims → only **their** capacity/pending goes to Manya (not the other's).
- **Claim transfer:** the claimer, if unavailable (leave/full), can reassign to the other editor → auto-note *"transferred from X → Y"* + a **reason** field.
- **Unclaimed & overdue:** Manya notified; task **stays Content-Approved** (not reverted) and shows in Manya's **Claimed Task** tab.
- **Nikhil-only** on claim: a **3-option dropdown** — **Present on camera · Edit video · Both** (he sometimes only presents; then editing still needs doing). Nandu does not get this.

## 9. The Pipeline — capacity-overflow engine (much already built: Accept&Work / capacity)
**Shifts:** Manya / Nikhil / Praveen **9AM–6PM**; **Nandu 10AM–7PM**. Plan is **per-day**; tasks auto-assign to a day by **publish date**; each task's **duration** fills the day; **lunch locked 1–2PM**. "Full" = durations pack the 8h shift.

**Trigger:** pipeline only kicks in when a producer's day is **already full** AND an **urgent** task appears (**urgent = Priority High/Urgent**). Free capacity → task **auto-assigns directly**. Full → task waits in the producer's **content pipeline** until accepted.

**Manya's side (Team Capacity gate, before approve):** a **capacity popup** (Praveen's timeline for design; Nikhil+Nandu's for video) shows they're packed — "still send it?" Two choices:
1. **Move a task** — bump one of his **not-started** tasks (by time-of-day + status; NEVER the in-progress one) to next day. *(Task1 half-done + Task2 not-started → urgent bumps Task2.)*
2. **Assign anyway** — drops into the producer's content pipeline + notifies him.

**Producer's side (pipeline inbox):** two options — **Accept & Work** (accept + extend/overtime) or **Notify Manya** (she frees room by moving his not-started tasks).

**Video variant:** urgent video task notifies BOTH editors → one **claims** → same two options.

**Timer:** each task counts down from its set duration; near the end (~10 min left) → popup + timer turns **red**; **add extra time** (+15/20m) requires a **reason** → logged. Timer starts **only** on explicit "Start working" click, never auto. On accept/start, timer defaults to the set duration but producer can **manually adjust the duration before starting** (kept simple, no auto-fit).

**Dead-end** (full + nothing bumpable + can't extend): **notify Maheen** for now (rare; teams discuss before assigning; risk day = **Friday**, since Sat/Sun off but weekend content is made ahead).

## 10. Attendance (Start Day / End Day)
- **Clock-in = login.** Dashboard **auto-logs-out at a set time** (e.g. 3AM); **first login of the day = day start** (record ONLY on first login/day, not every re-login/refresh).
- **Clock-out = an explicit power/check-out button** (better than relying on auto-logout — it can't tell when they actually stopped).
- **Login time anchors the Today's Plan** — NOT a fixed 9AM. Log in 9:30 → tasks slide to start 9:30 → day extends to 6:30, with a popup explaining it.
- **End-of-day wrap-up** (EndTodayModal exists): on log-out, popup checklist of today's tasks (done vs pending); each **pending task needs a REASON** before it rolls to next day; then **notify on Telegram** (Telegram = LATER).

## 11. Reshuffle (already built)
Tasks reorderable (drag + ◀▸, move first/last). A **started task can't be moved** (anchored); only not-started tasks shuffle. **No lock icon** — just persist the manual order so it isn't auto-re-sorted (a hard freeze is overkill).

## 12. Recent Activity
Must match the **Marketing Hub master-sheet** activity feed (Airtable-style: who · what changed · when, filterable). Log **every** change: status change, content edit (what part changed), claim, transfer, extra-time, moves — for all four people. Reuse the existing MH activity source (`mh_activity` / the MH detail loader), don't build a new one.

## 13. Reminders (smart notifications)
- **Manya** — task in **Content-Pending > 1–2 days** → nudge ("why still pending?").
- **Producers** — task **overdue > 1 day** → nudge ("overdue, needs work").

## 14. Nandu — Samvaya / other-platform section
Nandu's matrimony (Samvaya) / other-platform tasks live in a **separate, clearly-labelled section inside Nandu's My Day** — NOT mixed into the GooCampus board, NOT visible to Manya. (Respects the hard Samvaya brand-separation rule.)

---

## Build state (live cross-check, 2026-07-22)
**Works:** create-btn gating (+New task only Manya+Nandu); Team-capacity = Manya-only; Claim-pool = editors-only; Pipeline badge = producers; Nandu late-shift plan starts 10AM; duration/timer present; Accept&Work + Manya reschedule + capacity warning.
**Bugs to fix:** (1) Praveen's plan blocks all labelled "Reel" though his tasks are Carousels/Thumbnails; (2) **Collaborator always "—"** — owner→collab transfer not populating Manya; (3) Manya's plan 28h crammed in 8h — no cap / no overflow; (4) approved design tasks still owned by Manya, not transferred to Praveen.
**Missing vs spec:** per-person status tabs (still generic In-progress/Feedback/Output); claim is a modal not inline; no Claim Y/N confirm; no Nikhil 3-option; no Content-Review/incorporating_feedback loop; no Manya Claimed-Task tab; no Nandu Samvaya section; no "Urgent" priority; login-anchored plan; attendance clock-in/out; smart reminders.

## Non-negotiables for the build
- **No dummy data** — everything wired to real `mh_posts`; remove hardcoded `TASKS` fallback + mock capacity board (`CAPS`).
- **Test end-to-end** — create a task and watch it flow (create → assign → approve → review → schedule).
- **Ponytail** — leanest solution, reuse existing patterns, no bloat.

## Data note
Test data reduced to **1 reference task** ("UAE GP", Carousel, Content-Pending, Manya, publishes 2026-07-27). All 272 original rows backed up to Supabase table **`mh_posts_backup_20260722`** (restore = insert back from there).
