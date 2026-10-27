# Wiring audit — settings that don't drive behaviour (27 Oct 2026)

Praveen asked: after finding that the Rules page's owner rows are ignored, check the whole
dashboard for the same problem — something you can set on screen that the system doesn't
actually follow, or a decision hard-coded to a person instead of a setting.

## A. Settings you can change that are ignored (fully or partly)

| # | Setting (page) | What really happens | Evidence |
|---|---|---|---|
| A1 | **Owner rows** (Rules) | Ignored. Owners come from 3 DB triggers + the update API. | docs/RULES_ENGINE_PLAN.md |
| A2 | **Collaborator rows** (Rules) | Used only when a task is made through the New task form. If no rule matches it still adds Nandu/Manya (hard-coded fallback). Tasks made from the Scheduler, Schedule-multi and the Airtable import never apply them. A DB trigger also adds Manya on every approval. | lib/task-create.ts:77 · scheduler/enqueue:118 · schedule-multi:94 · airtable-import.ts:417 · DB mh_fn_add_writer_collaborator |
| A3 | **Connect Claude** for an admin (Team & access) | Can't be switched off — the "off" is dropped on save and admins are let in anyway. | lib/permissions.ts:113 · lib/claude-connector.ts:18 |
| A4 | **Edit calendar** (Team & access) | Only hides dragging on the Content calendar. Post Planner drag ignores it; no server check. | MarketingHub.tsx:1696 · PostPlanner.tsx:594 |
| A5 | **Change dates** vs **Edit calendar** | Disagree: drag allowed but server refuses, or drag hidden but dates still change elsewhere. | update/route.ts:195 |
| A6 | **Date changes need approval / Ask why** | Post Planner "Apply plan" moves dates in bulk and skips both. | api/post-planner/apply/route.ts:15-38 |
| A7 | **Page (tab) switches** | Hide the tab only; the data behind it still answers. Admins are blocked only in the screen. | lib/api-guard.ts:64 · permissions.ts:165 |
| A8 | **Scheduler brand pages** | Two routes skip it (publish, create-post). | scheduler/publish:59 · scheduler/create-post:14 |
| A9 | **Admin / Can sign in** | Changes reach some pages only after the person logs in again. | app/api/login/route.ts:70 |

## B. Decisions hard-coded to a person (should come from Team page roles / Rules / a setting)

| Area | Hard-coded | Places |
|---|---|---|
| Who owns a task | design → Praveen; video editors = Nikhil, Nandu; unowned Long-Form → Nandu, Reels/Shorts → Nikhil | DB: mh_enforce_design_owner, mh_fn_assign_owner · update/route.ts:514,523-531 · NewTaskForm routeFor · save.ts:59,99 · PreviewMyDay autoAssign |
| Collaborators | Manya added on every approval; writer = Manya | DB mh_fn_add_writer_collaborator · PreviewMyDay withManya |
| Approvals | Publish-date approver = Maheen (but the check uses "admin") | date-approvals.ts:17 · permissions.ts:70 |
| Notifications | Swaps → Manya; date requests → Maheen; approved design → Praveen; editors list | notifications.ts:17-22,112,129,166,187 |
| Shifts / quiet hours | Everyone 9–6, Nandu 10–7 (no setting exists) | notifications/route.ts:45 · PreviewMyDay shiftStartOf · MarketingHub LATE_SHIFT |
| Samvaya | Shown only to Nandu | my-day/route.ts:120 · PreviewMyDay |
| Who sees which My Day screens | by name (Manya = writer screens, Praveen = design pipeline, Nikhil/Nandu = claim pool) | PreviewMyDay ~15 places |
| Video pairing | Nikhil on camera → Nandu edits (and back) | takeover/route.ts:15 · PreviewMyDay PAIR_* |
| Fallback "who did it" | Unknown actor credited to Maheen | PreviewMyDay:906 · update/route.ts:434 |
| Claude connector / name maps | Fixed 5 people; new teammates can't be picked | mcp-server.ts:35 · task-create.ts:24 · airtable-import.ts:35 |
| Old My Day view (/dashboard/my-day, /me/tasks) | Only Manya can create tasks; ignores the switch | MyDayView.tsx:299,350 |

## C. Lists kept in two places that can disagree
- Video vs design types: DB table mh_content_types vs app's VIDEO_TYPES; the live owner trigger has its OWN third list.
- Brands: mh_sbus vs old SBU_OPTIONS (New task default); brand → page mapping hard-coded, so a new brand silently goes to GooCampus Main.
- Statuses written as text in ~20 files.
- Scheduler gaps fixed per page; Post Planner uses its own 24 h gap.

## D. Dead machinery in the database
- **mh_slack_queue**: a trigger queues a Slack message on every owner change — 184 queued, 0 ever sent; nothing reads it (no app code, no n8n workflow).
- **mh_enforce_owner_rules()** (reads the Rules page owner rows) and **mh_fn_spawn_thumbnail()** (auto thumbnail → Praveen) exist but no trigger calls them.

## Suggested order
1. Rules engine (A1, A2, ownership/collaborator rows in B) — docs/RULES_ENGINE_PLAN.md.
2. Team page **role** (writer / designer / editor / approver) + **shift start** per person → replaces most of B.
3. Team & access fixes A3–A9 (small, independent).
4. One source for types / brands / statuses (C); switch off or wire the dead DB pieces (D).
