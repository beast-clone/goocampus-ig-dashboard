# Rules engine — plan (parked 26 Oct 2026, waiting for Praveen's go-ahead)

## What Praveen asked for
The Rules page (Marketing Hub → Rules, was "Automations") should work like Airtable
automations: each rule is **"When a task matches these conditions → do this"**, with the
conditions built like the Master sheet filter (Status becomes / is any of / is none of,
Brand, Type of work, Priority, and/or, condition groups) and the actions picked from a
dropdown (Hand it to — a person or the editors' claim pool; Add collaborator; Keep the
previous owner as collaborator). Prototype: `rules-builder-prototype.html` (shown 26 Oct).

## What we found (live database, 26 Oct)
Who owns a task is decided in FOUR places today, and the page's owner rows are not one of them:

| Where | What it does |
|---|---|
| DB trigger `mh_design_owner` → `mh_enforce_design_owner()` | Design work at Content - Approved / Output - In Progress / Output - Ready / Ready to Publish is always forced to `praveen` (skips thumbnails with `custom.thumbnail_for`; remembers an editor in `custom.intended_owner` and gives the task back if its type turns to video). |
| DB trigger `mh_trg_assign_owner` → `mh_fn_assign_owner()` | When status becomes Content - Approved and the owner is EMPTY: Post/Carousel/Story (Image)/Reel Thumbnail/YouTube Thumbnail/Meta Ads → praveen; YouTube Long-Form → nandu; Reel - Original/Story (Video)/YouTube Shorts → nikhil. |
| DB trigger `mh_trg_add_writer_collaborator` → `mh_fn_add_writer_collaborator()` | When the owner changes at Content - Approved, Manya is added as collaborator. |
| App: `/api/marketing-hub/update` approval handoff | Design → praveen with the writer kept as collaborator; a video an editor created themselves → claim pool. Skips thumbnails and "day is full" (deferHandoff). |

`mh_rules`: only the **collaborator** rows are used (by `lib/task-create.ts` when a task is
created). The **owner** rows (Design → Praveen, Video → pool, 12thPlus Post → Nandu) are
read by `mh_enforce_owner_rules()`, but no trigger calls that function any more — a later
change (`design_owner_remembers_editor.sql` / `design_video_owner_both_ways.sql`) put
`mh_enforce_design_owner()` on the trigger instead. So "12thPlus Post → Nandu" has never
taken effect: rule 1 above hands it to Praveen.

## The plan (recommended)
1. One engine in the database (so dashboard, Airtable sync and n8n all follow it):
   `mh_rules` gains `name`, `conditions jsonb` (the filter model, limited to status / sbu /
   type / kind / priority), `actions jsonb`, `position`. A BEFORE trigger applies owner
   actions (top matching rule wins); an AFTER trigger adds collaborators.
   "Status becomes X" fires on the change; "Status is any of" applies on every save.
2. Seed the starting rules to reproduce today's behaviour exactly — including the two
   hidden ones (unowned Long-Form → Nandu; unowned Reel/Shorts/Video story → Nikhil).
3. Keep the safety exceptions fixed and listed on the page: thumbnail maker kept,
   remembered editor, "day is full → waits in Pipeline".
4. Switch the old triggers OFF (not dropped) and remove the app's hard-coded handoff, so
   the page is the only source. Easy to switch back.
5. Rules page UI: the builder from the prototype, reusing `components/FilterBuilder.tsx`.
6. Test every rule on test tasks against today's behaviour, delete the test tasks by id.

## Estimate
About 5–6 hours: database engine + migration ~1.5 h · builder UI ~1.5 h · seed rules,
switch off old triggers, remove app handoff ~1 h · testing every rule + cleanup ~1.5 h.
Deploy separately from other work, and watch the first few approvals afterwards.
