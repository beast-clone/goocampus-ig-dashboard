# Scheduler — Reels, covers, and what actually publishes

**Status:** not built. This is the audit and the plan, written 15 Sep 2026 so the
next person starts from what is true rather than from what the UI implies.

Raised by Praveen: *"in the scheduler there is a separate tab for create a post and
create a reel … for the reel there is a facility to add the thumbnails also … in the
scheduler there is no option to add the thumbnail and all and sometimes it will not
work also."*

Both halves of that are right, and the second half has a bigger cause than the first.

---

## 1. What Meta's own Create-reel flow looks like

Checked live in Meta Business Suite (Reels composer, goocampus page). It is three
steps, not one form:

| Step | Holds |
|---|---|
| **Create** | Post to (page) · Media with two separate buttons, **Add Video** and **Add Photos** · Reel details → Text (optional), with emoji and hashtag helpers |
| **Edit** | Cover / thumbnail, trim, audio. Only reachable once a video is attached — not inspected, because that needs uploading to the live page |
| **Share** | Scheduling |

The separation matters: "create a post" and "create a reel" are different flows with
different fields, and the cover is a first-class step, not a checkbox.

## 2. What this dashboard does today

One generic composer — Post to → Collaborator → Media → Caption → Schedule
(`app/(dashboard)/dashboard/preview/scheduler/page.tsx:1134-1260`). No format
selector, no cover field, no story option. MP4 uploads are accepted
(`app/api/scheduler/upload-media/route.ts:17-21`, 300 MB cap) and queue happily.

### The part that is easy to miss

**The dashboard does not publish to Instagram at all.**

- The only Meta publishing code is `app/api/scheduler/publish/route.ts`. It sends
  `image_url` + `caption` and **no `media_type`** (`:32`), so Meta creates an IMAGE
  container. Its own header says: *"Video/Reels + scheduled posts are the n8n
  worker's job (not here)"* (`:12-13`).
- **Nothing in the UI calls that route.** The composer posts to
  `/api/scheduler/enqueue`, which writes an `mh_posts` row with
  `publish_status: "scheduled"` and stops (`app/api/scheduler/enqueue/route.ts:51-59`).
  Its comment says so: *"This does NOT publish to Meta … Nothing goes live until that
  worker exists."*
- The worker is an **n8n workflow that is not in this repo**.

So an MP4 can be uploaded, captioned and scheduled, and there is nothing in this
codebase that could ever turn it into a reel.

### Also absent, found while looking

| Capability | State |
|---|---|
| `media_type=REELS` + `video_url` | not present anywhere |
| Reel cover — `cover_url` / `thumb_offset` | not present anywhere (zero matches repo-wide) |
| Carousel publish (`is_carousel_item` + `children`) | not present — the publish route sends `media_urls[0]` only |
| `media_type=STORIES` | not present |
| Facebook page publishing | not present — `lib/facebook.ts` is read-only analytics |
| Video container status polling | **not present** |
| LinkedIn image + PDF carousel publish | present and real (`lib/linkedin-publish.ts:32-113`) |

### Why "sometimes it will not work"

Meta will not publish a video container until it has finished processing. The publish
route goes straight from creating the container (`:34`) to `media_publish` (`:42`)
with no wait and no `status_code` check. For an image that is fine. For anything
video-shaped it is a race, and losing it looks exactly like "it sometimes doesn't
work".

## 3. What building it properly takes

1. **Format in the composer** — Post / Reel / Story, chosen up front, changing which
   fields show. Follow Meta's own split rather than one form that tries to be both.
2. **Cover** — either an uploaded `cover_url` or `thumb_offset` (a frame in ms). A
   frame-picker is nicer; an upload is smaller to build. Either needs somewhere to
   live on the queued row.
3. **`mh_posts` carries the format and the cover.** Today the row has no format
   column at all, so even a correct composer could not tell the worker what to do.
4. **Publish path for video** — `media_type=REELS`, `video_url`, `cover_url` /
   `thumb_offset`, then **poll the container's `status_code` until `FINISHED`**
   before `media_publish`, with a real timeout and a visible failure.
5. **Decide where publishing lives.** Right now it is split: the dashboard queues,
   n8n posts, and the repo contains a publish route nobody calls. Whichever way it
   goes, one of them should be deleted or wired up — the current arrangement is how
   you end up debugging a route that was never running.

Carousels and stories are the same shape of work and should be quoted with it, not
discovered afterwards.

## 4. Decision taken

Campaigns work ships first; reels are the next piece. Nothing here is started.
