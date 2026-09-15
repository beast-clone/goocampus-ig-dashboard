# Scheduler — Reels, covers, and what actually publishes

**Status:** not built. This is the audit and the plan.

Written 15 Sep 2026, **rewritten 15 Sep 2026 (evening)** after walking Meta's own
composer end to end with a video attached. The first version guessed at the half it
could not reach and got the most important detail wrong — see *Corrections* below.

Raised by Praveen: *"in the scheduler there is a separate tab for create a post and
create a reel … for the reel there is a facility to add the thumbnails also … in the
scheduler there is no option to add the thumbnail and all and sometimes it will not
work also."*

Both halves are right, and the second has a bigger cause than the first.

---

## Corrections to the first draft

| First draft said | Actually |
|---|---|
| Cover/thumbnail lives on the **Edit** step | It lives on **Create**, revealed once a video uploads. Edit never mentions it |
| Create holds "Text (optional)" | Create also holds **Thumbnail**, **Tags**, **Collaborator**, and alternate-title post testing |
| Edit is "cover, trim, audio" | Edit is **Audio / Crop / Text / Optimizations** + a trim timeline. No cover anywhere |
| "Decide where publishing lives" is open | **Settled: n8n publishes.** The dashboard queues. See §5 |

The first draft could not reach Edit without uploading to the live page, so it
inferred. Building against it would have put the cover field on the wrong screen.

---

## 1. Meta's Create-reel flow, as actually observed

Walked live in Meta Business Suite with `Ad_03.mp4` (2160×3840, 36s) attached,
posting to `GooCampus Edu` (FB) + `goocampus` (IG). Three steps.

### Step 1 — Create

| Section | Contents |
|---|---|
| **Post to** | Multi-select: FB Page and IG account both tickable, plus **Save preference** |
| **Media** | *"Upload video or photos to create a reel."* Upload card shows filename, dimensions, progress %, delete. Add Video / Add Photos grey out after one video |
| **Reel details** | **Customize post for Facebook and Instagram** toggle — shared fields by default, per-platform when on. **Text** · optional (labelled *Description* when only FB is selected), with `#` and emoji helpers |
| **Thumbnail** | **Choose suggested** \| **Choose frame** \| **Upload image** — ← the thing Praveen asked for |
| **Tags** | *"Add relevant keywords to help people find your reel"* |
| **Collaborator** | Up to 5, by username or Page URL |
| Right pane | Preview switcher (Facebook / Instagram), live looping playback, and a copyright check: *"Your video is safe to publish! No copyright issues were found"* |

The three thumbnail modes:

- **Choose suggested** — horizontal carousel of auto-extracted frames, with ‹ › paging
- **Choose frame** — modal: large frame preview, filmstrip scrubber, timecode
  (`00:00:00`), *Save thumbnail*
- **Upload image** — file picker for a custom cover

### Step 2 — Edit

Four tabs plus a timeline:

- **Audio** — searchable licensed music catalogue, filtered by Genres / Moods /
  Vocals / Tempos
- **Crop** — *Original*, *Smart Cropping* ("automatically crop your video to the
  ideal 9:16 aspect ratio")
- **Text** — text overlays
- **Optimizations** — *Audio Optimizations*: "automatically remove background noise
  and equalize the audio"
- **Timeline** — play/pause, Original audio volume slider, zoom, per-second ruler,
  trim handles (showed `35.7s`), and a separate **+ Add audio** track

### Step 3 — Share

- **Scheduling options** — Share now \| Schedule \| Save as draft
- **Add to playlist** · optional
- **Share to** · optional — *GooCampus Edu → Facebook story · Public*, *goocampus →
  Threads · Public*. Toggling the story opens a confirm dialog: *"Your profile is
  set to Public…"* with **Share this story** vs **Always share stories** (persists
  for all future posts until turned off)
- **Add a poll** · optional
- **Closed captions & translations** — *Closed captions* (auto-generated, **on by
  default**) + *Translate your voice with Meta AI*
- **Remixing and use of original audio**
- **Distribution** / **Additional options** (crossposting, series, **Tracking**) —
  both noted as Facebook-Page-only
- **Who can see this?** — Public / Restricted

---

## 2. What this dashboard does today

One generic composer — Post to → Collaborator → Media → Caption → Schedule
(`app/(dashboard)/dashboard/preview/scheduler/page.tsx:1134-1260`). No format
selector, no cover field, no story option. MP4 uploads are accepted
(`app/api/scheduler/upload-media/route.ts:17-21`, 300 MB cap) and queue happily.

### The part that is easy to miss

**This repo does not publish to Instagram at all.**

- The only Meta publishing code is `app/api/scheduler/publish/route.ts`. It sends
  `image_url` + `caption` and **no `media_type`** (`:32`), so Meta always creates an
  IMAGE container. Verified again 15 Sep — still true.
- **Nothing in the UI calls that route.** Verified by grep: zero callers. The
  composer posts to `/api/scheduler/enqueue`, which writes an `mh_posts` row with
  `publish_status: "scheduled"` and stops (`app/api/scheduler/enqueue/route.ts:58`).
- The worker that actually posts is an **n8n workflow outside this repo**.

So an MP4 can be uploaded, captioned and scheduled, and nothing *in this codebase*
turns it into a reel. That is a statement about the repo, not about the product —
n8n does the publishing and does it today.

### Also absent

| Capability | State |
|---|---|
| `media_type=REELS` + `video_url` | not present |
| Reel cover — `cover_url` / `thumb_offset` | not present (zero matches repo-wide) |
| Carousel publish | not present — publish route sends `media_urls[0]` only |
| `media_type=STORIES` | not present |
| Facebook page publishing | not present — `lib/facebook.ts` is read-only analytics |
| Video container status polling | **not present** |
| A `format` column on `mh_posts` | **not present** — see §5 |
| LinkedIn image + PDF carousel publish | present and real (`lib/linkedin-publish.ts:32-113`) |

### Why "sometimes it will not work"

Meta will not publish a video container until processing finishes. Any publisher
that goes straight from creating the container to `media_publish` without polling
`status_code` is racing, and losing that race looks exactly like "it sometimes
doesn't work." The dead route in this repo has that bug (`:34` → `:42`); whether
the live n8n worker does is **unverified and worth checking first** — it is the
likeliest cause of Praveen's complaint.

---

## 3. "Post to both" is two implementations, not one

Instagram and Facebook publish reels through completely different mechanisms.

| | **Instagram reel** | **Facebook Page reel** |
|---|---|---|
| Endpoint | `POST /<IG_ID>/media` → `media_publish` | `POST /<page-id>/video_reels`, 3 phases |
| Video transfer | `video_url` — a public URL Meta fetches | **binary upload** to `rupload.facebook.com` |
| Caption | `caption` | `description` (+ optional `title`) |
| **Cover** | `cover_url` **or** `thumb_offset` (ms), on the container | **no cover param** — separate `POST /{video_id}/thumbnails` with `source` (image file) + `is_preferred: true` |
| Status | `GET /<container>?fields=status_code` → `FINISHED` (poll ~1×/min, ≤5 min) | `GET /<video-id>?fields=status` → uploading / processing / publishing phases |
| Scheduling | publish once `FINISHED` | `video_state=SCHEDULED` + `scheduled_publish_time` (10 min–29 days out) |
| Collaborators | `collaborators` param | different mechanism |

**Quote this as two jobs.** One ticks two boxes in the UI; underneath it is two
publish paths, two status models, two failure modes.

### Cover: one design decision worth making early

Facebook will not take a timestamp — it wants an image file. Instagram takes
either. So rather than mirroring Meta's internals:

> **Always resolve the chosen thumbnail to a real image, whichever mode produced it.**

Frame-picking happens client-side (`<video>` → `<canvas>` → blob), so "Choose
frame" and "Choose suggested" both end as an uploaded image, same as "Upload
image". Then one asset serves both platforms: `cover_url` on Instagram, the
thumbnails call on Facebook.

Two things this buys: one code path instead of two, and the cover the user saw in
the picker is byte-for-byte what publishes — no trusting Meta to re-extract the
same frame.

Two things to handle: Meta crops a non-9:16 cover to the **middle 9:16 rectangle**
(say so in the UI — only matters for uploaded images), and Facebook's thumbnail is
a **second call after the video exists**, so it can fail on its own. A published
reel with no cover is a real outcome that needs surfacing, not swallowing.

---

## 4. What Meta offers that we cannot

Checked against the API docs, not assumed.

| Feature | Verdict |
|---|---|
| **Add a poll** | **Impossible.** IG docs: *"Publishing stickers (i.e. link, poll, location) is not supported"* |
| **Translate with Meta AI** | **Impossible** — a Business Suite product feature, no endpoint |
| **Auto-generated closed captions** | **Impossible to trigger** — Meta's ML on their servers |
| **Closed captions, uploaded** | **Facebook only**, as an `.srt` to `/{video_id}/captions`. Instagram has no subtitle upload (its `caption` param is the post *text*, easy to misread). We would have to transcribe ourselves — Whisper already runs in the ops-call workflow |
| **Remixing / use of original audio** | Excluded by decision — not available to us |
| **Licensed music catalogue** | **Impossible** — Meta holds rights we cannot obtain |
| **Share to Facebook Story** | Possible, as a *separate* publish (`/page_id/video_stories`) — not a flag on the reel |
| **Share to Threads** | Possible, but a separate Threads API integration |

### The Edit step is one infrastructure decision, not four features

Trim, Crop, Text overlays and Audio optimization look like four independent
checkboxes. They are not. **All four require re-encoding the video.** Meta's API
does not accept "start at 3s, end at 30s" — it accepts a finished file. So each one
means cutting, cropping, burning text or cleaning audio *ourselves*, then uploading
the result.

That is a single shared dependency: a video-processing pipeline. With it, all four
become tractable. Without it, none of them are — and dropping the music catalogue
does not change that, because the catalogue is excluded for **licensing** reasons
while these are blocked for **infrastructure** reasons. Different problems.

Netlify functions cannot do it (time and memory limits on a 2160×3840 file). It
needs somewhere real to run. **CloudConvert via n8n is the realistic path** — it is
already in use in the ops-call workflow (`AXwmKOufV9i8YXi5`). Costs credits per
video and adds a processing wait before publishing.

---

## 5. Build plan

Publishing stays in **n8n** (decided 15 Sep). The dashboard's job is to capture the
right fields and hand them over correctly.

### Phase 1 — Create + Share (no video processing)

1. **Format selector** — Post / Reel / Story, chosen up front, changing which fields
   show. Follow Meta's split rather than one form trying to be both.
2. **Destination multi-select** — FB Page and IG account independently tickable, with
   a saved default. Plus the **Customize for Facebook and Instagram** toggle: shared
   fields by default, per-platform when on.
3. **Thumbnail picker** — all three modes, resolving to an uploaded image per §3.
4. **`mh_posts` carries format, cover and destinations.** The row has **no format
   column today**, so even a perfect composer could not tell the worker what to
   build. This is the smallest change with the largest blocking effect — do it first.
5. **Looping preview** with an FB/IG switcher, matching Meta's.
6. **Share step** — Share now / Schedule / Save as draft; optional FB Story
   cross-post (as its own publish).
7. **Text, Tags, Collaborator** fields.

### Phase 1b — n8n side

8. **Reel publish paths** — `media_type=REELS` + `video_url` + `cover_url` for
   Instagram; the 3-phase `video_reels` flow + `/thumbnails` for Facebook.
9. **Status polling before publish**, both platforms, with a real timeout and a
   visible failure. This is the actual fix for "sometimes it will not work" — worth
   auditing the existing worker for this bug before building anything else.

### Phase 2 — the editing pipeline (separate decision)

Trim first, then crop / text / audio optimization, all on the same CloudConvert-via-n8n
pipeline. Scope and cost this on its own merits once Phase 1 is real. Deliberately
**not** bundled: the thumbnail — the thing that started this — should not wait behind
a video-processing project.

**Explicitly out:** licensed music, polls, Meta AI translation, auto-captions,
remixing controls.

---

## 6. Open questions

1. **Does the live n8n worker poll container status before publishing?** If not,
   that is Praveen's bug and it is fixable without any of the above.
2. **Do FB closed captions matter enough** to justify our own transcription for one
   platform only?
3. **Which accounts are we targeting** — the composer was opened on `Goocampus.in`
   and later showed `GooCampus Edu` + `goocampus`. Pin these before building.
4. **Threads cross-post** — wanted, or noise?

Carousels and stories are the same shape of work as reels and should be quoted with
them, not discovered afterwards.

## 7. Decision taken

Campaigns shipped first; reels are next. Phase 1 is fully specified above and needs
no video processing. Nothing is started.
