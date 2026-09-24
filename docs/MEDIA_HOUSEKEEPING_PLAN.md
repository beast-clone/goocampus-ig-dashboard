# Media housekeeping — plan (24 Sep 2026)

What happens to a photo or video **after** its post has gone live, so storage stays
flat without anyone remembering to clean up. Agreed with Praveen on
24 Sep, including the three decisions below; **nothing is built yet**.

**Decided (24 Sep, latest):** **delete the video** once its post is live — no video
compression, so the VPS does no work at all · final sweep at **three months** ·
**leave `story-snapshots` alone**.

*(Compression was considered and dropped. For the record, the flow would have been:
Hostinger downloads the file to a temp folder, compresses it, uploads the compressed
copy to Supabase in place of the original, and deletes its temp files — one copy at
the end, never two. Kept here in case it is wanted later.)*

**Why we keep anything at all (Praveen, 24 Sep).** Not for viewing — the Posts, Reels
and analytics tabs read **live from the Graph API**, so the dashboard always shows what
is genuinely on the account, including anything posted by hand. The stored copy is a
**record of what we scheduled**, so that "we scheduled this video, but that one went
out" can be proved later. A small, compressed copy is enough for that.

**Where things run.** Three separate machines, easy to mix up:
- **Hostinger VPS** (srv1046538, KVM 2 — 2 cores, 8 GB, 100 GB disk): runs **n8n** and
  **WAHA**. The only place that can run ffmpeg, so video compression belongs here, at night.
- **Supabase** (Pro, 100 GB): the database and the file storage. Stores files; cannot process them.
- **Netlify**: the dashboard site itself.

---

## Where we are today

| Bucket | Files | Size |
|---|---|---|
| `post-media` | 82 | **237 MB** |
| `story-snapshots` | 406 | 62 MB |
| `scheduler-media` | 23 | 7 MB |
| **Total** | **511** | **≈ 0.3 GB** |

Supabase is on the **Pro** plan, which includes **100 GB**. We are using **0.3%**.
So this is housekeeping, not a rescue.

**The one real waste today:** `vietnam-mbbs-ad-final.mp4`, 44.4 MB, is stored
**three times** (133 MB — more than half of `post-media`). Each publish attempt
re-uploaded the same file instead of reusing the one already there.

---

## The idea, in order of what it saves

### 1. Stop making duplicates (biggest win, smallest job)
Before uploading, check whether a file with the same content is already in the
bucket; if it is, reuse its URL. Same-name-same-size is enough — a hash is better.
Saves 133 MB today and stops the problem repeating.

### 2. After a post is live, delete our copy of the video
Once the post is published, **Meta hosts the media**. Our copy exists only for the
dashboard's own preview.

A weekly job (Sunday night) would:
1. Take every post marked published in the last week.
2. Confirm it really has its live link (`instagram_url` / `facebook_url`).
   **No link → touch nothing.** That is the safety catch.
3. **Delete the video** from Supabase and keep the link.
4. Keep a **small still image** as the record of what was scheduled.

A reel is 20–50 MB and the still is under 100 KB, so effectively all of it comes back.
Instagram keeps the video itself, and the dashboard reads it from there.

### 3. Compress what we keep
- **Images / carousels:** 5 MB → 1–2 MB. Text stays readable. The composer already
  does exactly this for WhatsApp (long edge 1600px, JPEG 0.7), so it is the same code.
- **Video:** not compressed — deleted instead (step 2), so no ffmpeg and no VPS load.

### 4. The three-month sweep
Anything older than three months: delete the stored media entirely, keep the row, the
caption and the live link. The post stays in reports and on Instagram; only our copy
of the file goes.

---

## How Instagram itself does it (for comparison)

They re-encode on upload and keep **one** optimised copy — the original you sent is
not kept. Their CDN links expire; the **permalink** does not. That is the same shape
as the plan above: keep the link and a small preview, not the heavy original.

---

## Order of work

| Step | Saves | Effort | Risk |
|---|---|---|---|
| 1. No duplicate uploads | 133 MB now | small | none |
| 2. Delete video after the link is confirmed | ~40 MB per reel | small | low — gated on the link |
| 3. Compress images we keep | ~60% of image size | small | none |
| 4. ~~Compress video~~ — dropped in favour of deleting | — | — | — |
| 5. Three-month sweep | everything older | small | low |

Steps 1, 2, 3 and 5 are the whole job now. Nothing runs on the VPS.

---

## Rules to keep it safe

- **Never delete anything whose post has no live link.** If the link is missing, the
  publish may have failed and the file is still needed.
- Never touch `mh_posts` rows — only the stored file. The record, caption, date and
  link stay for reports.
- Deletions get logged, so "where did the file go" has an answer.
- Run it weekly at night, in one batch, so it never competes with a publish.

## Answered 24 Sep

1. **Delete the video** once the post is live (changed from compressing it — no reason
   to load the VPS). The still image plus the caption is the record; viewing comes from
   the Graph API.
2. **Three months** for the final sweep.
3. **Leave `story-snapshots` alone** (406 files, 62 MB — small, and they are the only
   record of a story once its 24 hours are up).
