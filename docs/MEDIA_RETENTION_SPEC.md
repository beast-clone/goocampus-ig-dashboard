# Media retention — spec

Agreed with Praveen, 24 Sep 2026. What happens to the files we upload (videos, images,
carousels, PDFs) after their post has gone out. Supersedes the weekly deletion idea in
`MEDIA_HOUSEKEEPING_PLAN.md`; that file stays for the storage numbers and the reasoning.

**Nothing is built yet.**

---

## 1. What this is for

The dashboard shows posts **live from the Graph API**, so viewing never depends on our
copy. Our stored file is the **record of what we scheduled** — so that "we scheduled
this video, but that one went out" can be proved later.

A record does not need to be kept for ever, so it is cleared on a monthly rhythm that
the team controls. Nothing is deleted silently.

## 2. What is kept, what goes

| | |
|---|---|
| **Deleted (when approved)** | the stored file — video, image, carousel, PDF |
| **Never deleted** | the post row, caption, publishing date, live link, insights |
| **Left alone entirely** | `story-snapshots` (the only record of a story after 24 h) |

## 3. How long

**Three months.** Media older than that is what the monthly prompt proposes clearing —
but the team can keep it, and can also clear newer batches early if they want the space.

## 4. When the prompt appears

Reports are generated between the **1st and the 6th** of each month.

The trigger is the **report being generated**, not a fixed date: within **24 hours** of
a monthly report being saved (`lib/report-store.ts` writes `report:<platform>:<account>:…`
into `discover_cache`), the dashboard raises the notification. If reports are late, the
prompt is late with them — it never arrives before the reports are done.

## 5. Who is told

**The whole team**, in the **Notifications tab** we already have. One notification each,
so everyone sees it; any one of them can act on it, and it clears for the rest.

It is an **action-needed** notification, so it stays pinned and re-pops until it is dealt
with — the existing behaviour.

## 6. What the notification says

- How much space Supabase is using right now.
- How much this batch would free.
- A link into the Storage screen.

## 7. The Storage screen

Lists **everything stored**, grouped by month and by brand, with sizes:

```
September 2026 — 180 MB
  GooCampus          90 MB   12 files
  GooCampus World    60 MB    8 files
  12th Plus          30 MB    4 files
August 2026 — 210 MB
  …
```

- Anything **three months old or older is pre-ticked**; everything else is not.
- The team can tick or untick whatever they like — nothing is forced.
- Two buttons: **Keep everything** and **Delete selected**.

## 8. The grace period

Choosing "Delete selected" **schedules** the deletion; it does not delete.

- The screen and the notification then say: *scheduled for deletion on <date>* — **two
  days** after the choice. Approve on the 5th, it goes on the 7th.
- **Revoke** is available the whole time, from the notification or the Storage screen.
- On the day, a job deletes the files and writes what it removed to the activity log.

## 9. If nobody answers

**Nothing is deleted.** The batch stays and is proposed again next month. Silence never
destroys anything.

## 10. Download before deleting

**Download this batch** gives one **zip**, straight to the computer, holding that batch's
files in brand folders:

```
2026-09-media.zip
  GooCampus/
  GooCampus World/
  12th Plus/
```

Available whenever a batch is listed, not only once deletion is scheduled.

## 11. Also still to do (from the housekeeping plan)

- **Stop duplicate uploads** — the same 44 MB video is stored three times today (133 MB).
  Independent of everything above, and the biggest single saving right now.
- **Compress images on upload** — the WhatsApp composer already does it; the post
  composer does not.

## 12. Notes for whoever builds it

- **Deletion must check the live link first.** No `instagram_url` / `facebook_url` on the
  post means the publish may have failed and the file is still needed — skip it, and say
  so on screen.
- Keep a **small still image** per post when its video is deleted, so the record shows
  something.
- The zip is the awkward part: a month can be 200 MB+, which is too much for a Netlify
  function to hold in memory. Stream it, or hand back signed URLs and zip on the client.
  Decide before building.
- Deletions are logged (who approved, when, what was removed, how much was freed).
- Storage numbers come from the Supabase storage API, the same call used to produce the
  table in `MEDIA_HOUSEKEEPING_PLAN.md`.

## 13. Settled

| Question | Answer |
|---|---|
| Replaces the weekly video deletion? | Yes — monthly only |
| Who is notified? | The whole team, in the Notifications tab |
| Nobody answers? | Keep, and ask again next month |
| Download format? | One zip per batch, brand folders |
| What is listed? | Everything stored; the three-month-old batch is pre-ticked |
| When? | Within 24 h of the monthly report being generated |
| Revoke window? | Until the deletion date, two days after approval |
