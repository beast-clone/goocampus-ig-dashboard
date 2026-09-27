# What the database does on its own (mh_posts)

Nine triggers run on `mh_posts`. Several make real decisions — reassigning owners,
creating whole tasks — and until 27 Sep 2026 none of them were written down anywhere.
Reading the dashboard's code is therefore **not enough** to explain what it does.

Two of them were found only because a test produced a task nobody wrote code for.

To re-list them at any time (read-only):

```sql
select t.tgname as trigger_name,
       pg_get_triggerdef(t.oid) as fires_when,
       p.prosrc as what_it_does
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relname = 'mh_posts' and not t.tgisinternal
order by t.tgname;
```

## The three that make decisions

### `mh_design_owner` → `mh_enforce_design_owner`
*before insert or update of status, type, owner_key*

Forces **non-video** work at Content - Approved / Output - In Progress / Output -
Ready / Ready to Publish onto Praveen, whatever owner was set. This one IS in the
repo: `sql/013_design_work_owner.sql`, amended by `sql/020_thumbnail_owner.sql` to
skip tasks carrying `custom.thumbnail_for`.

### `mh_trg_assign_owner` → `mh_fn_assign_owner`
*before update*

When a task **first** reaches Content - Approved **and has no owner**, it picks one
by type:

| Type | Goes to |
|---|---|
| Post, Carousel, Story (Image), Reel Thumbnail, YouTube Thumbnail, Meta Ads | Praveen |
| YouTube Long-Form | Nandu |
| Reel - Original, Story (Video), YouTube Shorts | Nikhil |

Note this names **specific editors** for video, which is a different idea from the
dashboard's claim pool (where approved video stays with the writer until an editor
claims it). In practice it rarely fires for video, because video usually already has
an owner by then — the `owner_key is null` guard is what keeps the two from fighting.

Amended by `sql/021` to skip parked thumbnails, whose null owner means "not decided
yet", not "unset".

### `mh_trg_spawn_thumbnail` → `mh_fn_spawn_thumbnail`
*after insert* — **removed by `sql/021`**

Created a second task for every Reel - Original, Reel - Cut, YouTube Long-Form and
YouTube Shorts, owned by **Praveen**, briefed "Auto-spawned thumbnail task for post:
&lt;title&gt;". It fired on every insert including Airtable sync and n8n rows, and had
no dedup.

This is why thumbnails kept landing on Praveen regardless of intent. Replaced by the
thumbnail flow (docs/THUMBNAIL_FLOW_SPEC.md), which asks instead of assuming. The
function is left in place so it can be restored with one statement if needed.

## The rest

Summarised from their trigger definitions and opening lines rather than read in full —
they are bookkeeping and none of them reassign work. Worth reading properly if one
ever looks responsible for something.

| Trigger | When | What it does |
|---|---|---|
| `mh_posts_updated_at` | before update | Stamps `updated_at = now()` |
| `mh_status_log_trg` | after update of status | Writes the change to `mh_status_log` |
| `mh_trg_activity_log` | after insert or update | Writes a row to `mh_activity` |
| `mh_trg_add_writer_collaborator` | after update | **When the owner changes**, attaches the previous owner as a collaborator |
| `mh_trg_completion_time` | before update | Stamps completion once `output_link` is filled |
| `mh_trg_slack_queue` | after update | Queues a Slack message when the owner changes |

`mh_trg_add_writer_collaborator` is worth knowing about: it only fires **on an owner
change**. A task someone creates and approves themselves never changes owner, so it
never gets a collaborator — and the approval gate in
`app/api/marketing-hub/update/route.ts` refuses to approve a task with none. That is
why filing a task straight at Content - Approved used to fail silently.

## Note for anyone reading only the code

`sql/` records migrations written *here*. It is not a picture of the live schema —
objects have been added to the database directly. Before concluding "nothing in the
code does that", list the triggers.
