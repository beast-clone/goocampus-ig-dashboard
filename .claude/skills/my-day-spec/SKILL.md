---
name: my-day-spec
description: >-
  Use whenever the user wants to build, modify, review, debug, or discuss the GooCampus Marketing OS
  "My Day" tab or any part of its model — status tabs, owner/collaborator, assignment (design→direct
  vs video→claim), the content pipeline / capacity overflow, Content Review + Incorporating-Feedback,
  attendance (Start Day / clock-out), reminders, per-person permissions, the Nandu Samvaya section, or
  the recent-activity log. Also trigger on "/my-day-spec", "my day tab", "HopeMyDay",
  "app/(dashboard)/dashboard/hope-preview/my-day". Loads the agreed spec and re-runs the clarifying
  discussion BEFORE any build so we build to spec, not from memory.
---

# My Day build companion

The **My Day** tab has a detailed, user-agreed spec captured in
`docs/MY_DAY_SPEC.md`. That file is the source of truth — the current code does
**not** fully match it yet. Do not build or answer from the code alone.

## When the user asks to build/change/discuss any My Day part

1. **Read `docs/MY_DAY_SPEC.md` fully first.** It covers roles/permissions, the
   status lifecycle, assignment rules, owner↔collaborator transfer, per-person
   status tabs, Content Review + feedback, the capacity pipeline, attendance,
   reminders, activity log, and the current build-state gaps.

2. **Locate the exact section** the request touches, then **re-run the clarifying
   discussion** — don't assume. Play back your understanding of that part and ask
   the user targeted questions to confirm before writing code, the same way the
   spec was gathered. Prefer plain-text numbered questions over the AskUserQuestion
   popup — the user wants to explain freely and correct you. Update
   `docs/MY_DAY_SPEC.md` with anything new or changed.

3. **Then build to spec**, honouring the non-negotiables:
   - **No dummy data** — wire to real Supabase `mh_posts`; strip the hardcoded
     `TASKS` fallback and the mock capacity board (`CAPS`).
   - **Reuse what exists** (load the `ponytail` skill) — e.g. the Marketing-Hub
     activity feed for Recent Activity; existing owner/collab fields; existing
     Accept&Work / capacity / reschedule which are already built.
   - **Test end-to-end live** in the user's Chrome (create a task → auto-assign →
     approve → Content Review → Send to Scheduler) and fix bugs before calling it
     done. Verify per phase; the user's bar is "perfectly working, no bugs, no
     out-of-logic behaviour."

## Key facts to keep straight (details in the spec)
- Team: **Maheen** (admin, oversee-only), **Manya** (content writer, creates+approves),
  **Praveen** (designer, direct-assign), **Nandu** (video editor, claim + creates Samvaya
  tasks), **Nikhil** (presenter + edits, claim, 3-option on claim).
- Assignment on **Content-Approved**: design→Praveen direct, video→claim pool, text→Manya.
- Ownership: Manya until approved → producer owns, Manya collaborator (reverses on revert).
- Tabs are **per-person status tabs** (Manya 4 incl. Claimed; producers 3), each strict-status,
  owner-or-collaborator.
- Shifts: 9–6 for Manya/Nikhil/Praveen, **10–7 for Nandu**; lunch locked 1–2; urgent = Priority High/Urgent.
- Attendance: login = clock-in, power button = clock-out, plan anchors to login time.
- Test data currently reduced to 1 reference task; 272 rows backed up in `mh_posts_backup_20260722`.
