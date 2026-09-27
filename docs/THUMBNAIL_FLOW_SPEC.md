# Thumbnail flow — spec

Agreed with Praveen L / Maheen on 27 Sep 2026. Replaces the old "Also create a
thumbnail task" tickbox, which created an unlinked task and always gave it to
Praveen.

## Why it changed

The old tickbox assumed the designer makes every thumbnail. In practice the editor
who cuts the reel usually makes its thumbnail too. The flow now lets that decision
be made by the person who actually picks up the video, at the moment they pick it up.

## Scope

The question is asked only for **Reel - Original, Reel - Cut and YouTube Long-Form**
(the same three the old tickbox used). YouTube Shorts, Story (Video) and Meta Ads -
Video are deliberately left out — they don't get a separate thumbnail.

The thumbnail task's type follows the video: YouTube Long-Form → `YouTube Thumbnail`,
the two reel types → `Reel Thumbnail`.

## The flow

1. Manya creates a video task. Because the type is eligible, the form asks
   **"Does this also need a thumbnail?"**
2. If yes, a panel opens inside the same form. It carries the same fields as a normal
   task, pre-filled from the video (title + " — Thumbnail", same SBU, publishing date
   and priority), and she writes the thumbnail brief there.
3. She chooses **who makes it**:
   - `editor` — whoever claims the video also makes the thumbnail. No one is asked.
   - `praveen` — goes to Praveen immediately, like the old tickbox.
   - `ask` — the claiming editor is asked to choose.
4. The video goes to the editors' claim pool as usual.
5. When Nikhil or Nandu claims the video:
   - `editor` → the thumbnail is assigned to them silently, alongside the video.
   - `ask` → they are asked **"I'll do it"** or **"Praveen does it"**, and it goes there.
   - `praveen` → nothing happens; it was already his.

## Where the thumbnail lives before it is claimed

For `editor` and `ask`, nobody owns the thumbnail yet. It is created straight away —
so the brief can never be lost — with **no owner**, which keeps it out of every task
list until it is decided. It is not in the claim pool either: the pool is video work
only, and a thumbnail type is not video.

## How the two tasks are linked

There is no parent/child column on `mh_posts`, and this does not add one. It uses the
existing `custom` jsonb bag, the same place collaborators and time extensions live:

- on the **thumbnail** row: `custom.thumbnail_for = <video task id>`
- on the **video** row: `custom.thumbnail = { taskId, decision, type }`

`decision` is one of `editor` / `praveen` / `ask`, and is rewritten to the person who
was actually chosen once it is settled, so the claim screen never asks twice.

## Database change (sql/020) — REQUIRED

`sql/013_design_work_owner.sql` forces any **non-video** task at Content - Approved or
later onto Praveen. A thumbnail is non-video, so without a change the database would
take the thumbnail back off Nikhil or Nandu the moment they started work — the exact
opposite of this feature.

`sql/020_thumbnail_owner.sql` adds one exception: a task carrying
`custom.thumbnail_for` has had its owner chosen deliberately by this flow, so the
trigger leaves it alone. Everything else is unchanged.

**This must be run by hand in the Supabase SQL editor (project wlhbmzaernchwebapszq)
before the flow works end to end.** Until it is run, an editor's thumbnail will keep
jumping to Praveen once it passes Content - Approved.

## Deliberately not included

- No thumbnail question on the **calendar**-created tasks beyond what the shared form
  already does — it is the same form, so it behaves the same everywhere.
- The claiming editor is not offered "give it to the other editor". Only themselves or
  Praveen, as agreed.
