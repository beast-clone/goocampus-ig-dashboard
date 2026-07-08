# Changelog

Every day of work on this dashboard gets its own dated section here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/).

## 2026-07-07 (evening) — Role-aware My Day + Claim task workflow

### Role-aware task list

- **Designers / editors now only see tasks that reached them.** Praveen / Nikhil / Nandu no longer see `Content - Pending`, `Content - In Progress`, or `Incorporating Feedback` — those are the writer's stages. Writers still see the full pipeline.
- **Designers / editors also see claimable tasks**, not just tasks they already own:
  - Praveen sees Content-Approved / Output-Ready static tasks (Post / Carousel / Thumbnail / YouTube post) even when a writer still owns them.
  - Nikhil and Nandu see Content-Approved / Output-Ready video tasks (Reel / Video / Long-form) even when the other editor or a writer owns them.
- **"owned by X" sub-line** on each row when the current person isn't the owner, so it's clear whose queue the task is in right now.

### Claim task button

- New yellow **Claim** pill on the top-right of any eligible row (designer/editor persona × Content-Approved or Output-Ready × not the current owner). One click swaps ownership:
  - Clicker becomes the owner.
  - **Writer stays as a collaborator** (so Manya can still watch her original brief travel through the pipeline).
  - Sibling video editor (Nikhil ↔ Nandu) drops off — one editor releases the task when the other claims it.
  - Activity log gets a `claim` entry: "claimed the task from …".
- Wired to `POST /api/marketing-hub/takeover` (rebranded action label from `takeover` → `claim`, same endpoint).

### Role-aware stat cards

- Writers keep the 7-card lineup (Pending today · Content pending · In progress · Feedback to address · Content approved · Handed off · Completed).
- Designers / editors get a slimmer 5-card lineup: Pending today · **Waiting on me** · Output ready · Ready to publish · Completed. No writer-only metrics cluttering their view.

### Person-aware "Add usual team" preset

- The preset now depends on **who is looking** at the task, not just the task type.
  - Writer viewing → suggests downstream owner + reviewer (Praveen + Maheen / Nikhil + Maheen / Nandu + Maheen).
  - Praveen viewing a static task → suggests **Manya (writer) + Maheen (reviewer)**.
  - Nikhil viewing a video → suggests **Nandu (sibling) + Manya + Maheen**.
  - Nandu viewing a video → suggests **Nikhil (sibling) + Manya + Maheen**.

### Auto-status-advance on creative upload

- When a designer or editor uploads a creative to a task in `Content - Approved`, the status auto-PATCHes to `Output - Ready` — no need to click Edit or Mark done. A green toast confirms "Auto-advanced to Output Ready" and the panel refreshes.
- Dropzone copy is now personalized: designers/editors see "Click to upload **your creative**" plus a sub-line "task auto-moves to Output Ready on upload" when in the right status; writers still see the generic "reference files" wording.

### Bigger Team on this task section

- Owner is now a large card with a 40px avatar, an **OWNER** eyebrow in the person's brand color, and a color-tinted background. Instantly readable at a glance.
- Collaborators are smaller cards with a 32px avatar, a **COLLABORATOR** eyebrow, and a hover-× to remove.
- The **+ Add** picker button now matches the height of team cards. **"✨ Add usual team"** shows the preset members' names in the button itself (e.g. "Add usual team (Manya + Maheen)").

## 2026-07-07 — My Day detail panel redesign + creative pipeline

### Detail panel — brand-new landscape rectangle

- Rebuilt the task detail card from a cramped side-panel into a **portrait rectangle on the right of a compact task list** on the left. Clicking a task no longer jumps to the top of the page — the detail opens beside it.
- **Auto-expanding content area**: the "Content brief" and "Caption draft" sections grow with their text — no internal scrollbars, no fixed rows. A 15-paragraph brief renders in full.
- **One-line meta strip**: Status · Priority · Owner · Platform · Publish · Due · SBU collapsed into a single horizontal row so the body has room for the actual content.
- **Horizontal 5-stage timeline** (Draft → In progress → Approved → Output ready → Published) — green ✓ for done, pulsing accent-color dot for current, hollow grey for pending.
- **View mode ↔ Edit mode** toggle inside the same rectangle; edit-mode textareas auto-resize as you type via a new `AutoTextarea` helper.

### New sections added to the panel

- **Team strip** — collaborator pills with avatar + role. × on hover to remove. **+ Add** popover to add anyone. **✨ Add usual team** button reads the task type and adds the preset team (Praveen + Maheen for static; Nikhil + Maheen for video; Nandu + Maheen for other reels).
- **Feedback / notes** — dedicated box surfacing `additional_info`. Turns amber with 🔁 icon when status is `Incorporating Feedback`.
- **Caption draft** — separate from the brief; writers can draft the IG caption here.
- **Creative files** — was "Mood board". Horizontal strip of image / video previews + a dashed dropzone. Multi-file drag-and-drop or click-to-upload. Files land in Supabase Storage bucket `scheduler-media/mh-creatives/<postId>/…` and a row is inserted into `mh_attachments`. 25 MB per-file cap. Delete on hover.
- **Inline comments thread** — replaced the disabled "💬 Comments" button. Latest 3 shown, "View all" expands. Enter-to-send composer at the bottom, posts as the currently-viewing person.
- **Activity log** — last 5 events with relative timestamps and actor names, pulled from `mh_activity`.
- **Scheduler link** — appears when the task has been synced to Post Scheduler: "📅 Scheduled to publish Fri, 3 Jul, 9:00 AM via Post Scheduler".

### 7 stat cards across the top of My Day

- Pending today · Content pending · **In progress** · **Feedback to address** · Content approved · **Handed off** · Completed. Numbers driven live off `mh_posts`, switch when the person selector changes.

### Auto-handoff on Content Approved

- `/api/marketing-hub/update` now detects the transition **into** `Content - Approved` and:
  - **Static task** (Post / Carousel / Thumbnail / YouTube post) → owner becomes **Praveen**, old writer becomes collaborator.
  - **Video task** (Reel / Video / Long-form) → owner becomes **Nikhil** (default), **Nandu joins as sibling collaborator**, old writer becomes collaborator.
  - Logs a "handed off to …" row in `mh_activity`.
- New **🎬 Take over** button in the detail panel for video-editor siblings — when Nandu owns the task, Nikhil sees the button in his My Day (and vice-versa). One click swaps ownership + drops the other from collabs + logs `takeover` in activity.
- My Day list filter expanded: video editors now also see sibling-owned video tasks (so Nandu's queue is visible in Nikhil's list and can be claimed).

### New API endpoints

- `GET  /api/marketing-hub/task-detail?id=` — composite endpoint returning collaborators (joined with `mh_team_members` for display names + roles), attachments, comments, activity, scheduler status. One call per open panel.
- `POST /api/marketing-hub/comments` — insert a comment.
- `POST /api/marketing-hub/collaborators` — add one or many members. Uses upsert with `ignoreDuplicates` on the `post_id,member_key` composite PK.
- `DELETE /api/marketing-hub/collaborators?postId=&memberKey=` — remove.
- `POST /api/marketing-hub/attach` — multipart upload → Supabase Storage + row in `mh_attachments`.
- `DELETE /api/marketing-hub/attach?id=` — removes storage object + DB row.
- `POST /api/marketing-hub/takeover` — atomically swaps `owner_key` and drops the sibling collab.
- `update` route whitelists `additional_info` and `caption`.

### Notes tab (context)

- `POST /api/marketing-hub/notes` + PATCH + DELETE — per-person notepad. Displays as a column-flow grid inside a yellow reminders card at the top of My Day (max 4 per column, wraps to next column before growing down).

## 2026-07-06 & 2026-07-07 — Marketing Hub migration to Supabase

### Backend — Supabase

- **Created new schema** in the existing Supabase project `beast-clone's Project` (`wlhbmzaernchwebapszq.supabase.co`, Mumbai region).
  - New tables, all prefixed `mh_` (marketing hub):
    - `mh_team_members` — 5 rows seeded (Manya, Praveen, Nikhil, Nandu, Maheen), each with role + email
    - `mh_posts` — main Content Calendar equivalent, one row per post/task
    - `mh_post_collaborators` — many-to-many join
    - `mh_attachments` — file references (files themselves land in Supabase Storage later)
    - `mh_activity` — audit log for every meaningful change
    - `mh_comments` — per-post threaded internal messages with @mentions
  - New enums: `mh_role` (writer/designer/editor/manager), `mh_status` (7 states from Content Pending → Published), `mh_priority` (Low/Medium/High/Urgent).
  - `updated_at` auto-touch trigger on `mh_posts`.
  - Indexes on the columns we query most: status, owner, publishing_date, type, sbu.

- **Seeded 15 sample rows** from Airtable Content Calendar into `mh_posts`, keeping the `airtable_record_id` so we can trace back to the source.

### Backend — Dashboard endpoints (`app/api/marketing-hub/`)

- `GET /api/marketing-hub` — **rewired from Airtable to Supabase.** Reads `mh_posts` filtered by publishing_date range (or null dates for drafts). Response shape unchanged, so the Marketing Hub and My Day UIs render without modification.
- `POST /api/marketing-hub/create` — **rewired from Airtable to Supabase.** Inserts one row into `mh_posts` with `Content - Pending` default, maps display names ("Manya B M") to team member keys ("manya"), also writes an activity log entry.
- Both endpoints keep the same 12h in-memory cache pattern.

### Frontend

- No UI changes. Marketing Hub and My Day tabs still render exactly as before.

### Airtable audit (research, no code change)

- Read all 34 automations in the Marketing Hub Airtable base end-to-end.
- Documented the 5 automation patterns for later re-implementation as Postgres triggers:
  1. Auto-assign owner by Type (needs `Status = Content Approved` gate added — currently missing in Airtable too)
  2. Auto-spawn thumbnail task when a video-type post is created
  3. Change owner + Slack notification (view-based)
  4. Auto-add collaborators (view-based)
  5. Note completion time (status + output link based)

### Phase C — 5 Postgres triggers replacing the Airtable automation set

Installed 5 automation triggers on `mh_posts`:

- **`mh_trg_assign_owner`** — BEFORE UPDATE. When status flips to `Content - Approved` AND `owner_key IS NULL`, auto-set owner by type (Post/Carousel/Story/Thumbnails/Meta Ads → praveen; YouTube Long-Form → nandu; Reel-Original/Story-Video/YouTube Shorts → nikhil). Fixes the Airtable gap where the same rule fires prematurely at Content Pending.
- **`mh_trg_add_writer_collaborator`** — AFTER UPDATE. When owner changes AND status is Content Approved, adds Manya (writer) to `mh_post_collaborators` so she's notified.
- **`mh_trg_spawn_thumbnail`** — AFTER INSERT. When a video-type post is created (Reel-Original / Reel-Cut / YouTube-Long / YouTube-Shorts), auto-inserts a matching Thumbnail row assigned to praveen.
- **`mh_trg_completion_time`** — BEFORE UPDATE. When `output_link` is filled AND status is `Ready to Publish` AND `completion_time IS NULL`, stamps `completion_time = now()`.
- **`mh_trg_activity_log`** — AFTER INSERT/UPDATE. On any status or owner change, writes a row into `mh_activity`. Powers the "Activity" rail in My Day + audit trail.
- **`mh_trg_slack_queue`** — AFTER UPDATE. When owner changes, queues a message into new `mh_slack_queue` table for the Slack worker (Phase D).

New support table: `mh_slack_queue` (queue for Slack notifications the triggers can't send directly since Postgres can't make HTTP calls).

**All 5 verified end-to-end** with actual INSERT + UPDATE tests. Test rows cleaned up afterward — `mh_posts` sits at 15 (original seed count), side tables at 0.

### Docs

- Created this `CHANGELOG.md`.
- `CREDENTIALS.md` will be generated when the user says "wrap it up" (git-ignored — local reference only).
