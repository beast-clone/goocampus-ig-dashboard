# Team Command — admin portal spec

**Status:** building (2026-09-14). Branch `feat/dashboard-reskin`.

## Why
When the admin (Maheen) opens **My Day** they land on "Good morning, Manya" via the
person switcher — confusing (whose view am I in?). Maheen has no home of their own.
Team Command is the admin's cockpit: one glance at the whole team.

## Decisions (confirmed with user)
- **Name:** Team Command. New **admin-only** top-level sidebar tab (rendered right
  under Overview, only when `me.isAdmin`).
- **Landing:** admins land on Team Command after login (not Overview→My-Day).
  Producers are unaffected — they keep My Day. Admin can still open any tab.
- **Peek:** from a person's card, "View their day" opens that person's My Day
  (`/dashboard/preview/my-day?person=<key>`).
- **Shows, per person:** logged-in/attendance · workload today · tasks + day plan ·
  running-long flags.

## Data — all reused, no new backend
- **Attendance / who's in / done / pending / task list:** `GET /api/my-day/attendance?view=day`
  (admin-gated) → per person `{ loginAt, logoutAt, doneToday, pending, tasks[] }`.
- **Whole-team tasks (for workload + timing):** `GET /api/my-day` → everyone's
  in-flight tasks with `detail.{owner,typeLine,duration,startAt,status,priority}`.
- **Workload:** `estimateTaskMinutes(typeLine)` (or `detail.duration`) summed per
  person vs a 7h (420 min) net capacity.
- **Running long:** task with `detail.startAt` + status "Output - In Progress" where
  elapsed > planned (buffer 25%); or started before today and still in progress = stuck.
- **Roster:** manya/praveen/nikhil/nandu (Maheen is the admin viewer, not a card).

## Surfaces touched
- `app/(dashboard)/dashboard/preview/team-command/page.tsx` — server, admin-gated
  (`getSessionIsAdmin()` else redirect to `/dashboard/preview`).
- `app/(dashboard)/dashboard/preview/team-command/TeamCommand.tsx` — client portal.
- `PreviewSidebar.tsx` — admin-only Team Command leaf under Overview.
- `middleware.ts` — admins' post-login / `/me` redirect → `/team-command`.
- `my-day/page.tsx` — read `?person=` so "View their day" deep-links (admin only).

## Layout
Hero (title + date/live + team stats: present X/4 · pending · overdue · running-long)
→ one card per person (avatar, role, attendance pill, workload bar, pending/done
counts, current task + running-long flag, "View their day"). Refreshes every 60s.
