# Changelog

Every day of work on this dashboard gets its own dated section here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/).

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
