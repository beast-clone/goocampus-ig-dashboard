# Community Broadcast — what's done, what's pending

Updated 24 Sep 2026 (evening). Everything below is on `feat/dashboard-reskin` and pushed to
GitHub. **The live site is still on this morning's deploy** — one deploy at the end
covers the lot.

---

## Done — on GitHub, waiting for the deploy

| | What | Commit |
|---|---|---|
| ✅ | **Its own tab** — Community Broadcast in the sidebar, not inside the Scheduler | `1506ec8` |
| ✅ | Blueticks layout — message rail, month/week/day calendar, compose popup, live WhatsApp preview | `1506ec8` |
| ✅ | **New message** button moved above the search | `807db12` |
| ✅ | **Videos and PDFs** can be sent, not just images | `ed8cb32` |
| ✅ | **Long file names keep their extension** — the bug that made a PDF arrive as a broken photo | `52de295` |
| ✅ | The file's type travels with the message, so nothing has to guess from its name | `6f226af`, `a6d8035` |
| ✅ | **Send again** — reopens a past message with everything filled in but the time | `1a39a3a` |
| ✅ | **Send now** — skips the calendar, confirms first | `6f226af` |
| ✅ | **Batch spacing** — people go 5–10 minutes apart; groups go out at once | `a6d8035` |
| ✅ | **A hand-set gap** — 5, 10, 15, 30 or 60 minutes, and never under 5 whatever is asked for | this batch |
| ✅ | **Different wording for each recipient** — ticked in the composer, written by Claude through Perplexity; facts, links and dates stay exactly as typed | this batch |
| ✅ | **Safety warning before queueing** — too many in an hour/day, outside 9am–9pm, or a big one-by-one fan-out | `a6d8035` |
| ✅ | Duplicate uploads prevented; images compressed before upload | `ef7154e` |
| ✅ | **Groups & members** — group dropdown, invite link (copy), member list, and Add all with per-number results | `475cbdc` |
| ✅ | **Numbers by CSV** — name and number, pasted or uploaded; the name is used in the invite | this batch |
| ✅ | **Sending from the groups panel** — invite those numbers, or message the group (opens the composer with it filled in) | this batch |
| ✅ | **A typed number is checked against WhatsApp** — one that has no account can't be picked | `41e77f9` |
| ✅ | **WhatsApp's own quota is read** — the panel warns when WhatsApp limits the number, and the composer says so before queueing | `ae0508b` |

## Done — already live, no deploy needed

| | What |
|---|---|
| ✅ | **n8n sender** sends videos (`sendVideo`), documents (`sendFile`) and video status |
| ✅ | **n8n trusts the carried file type**, and sends anything it can't identify as a document — so the broken-photo failure can't repeat |
| ✅ | **n8n read relay returns the quota** — message-capping and timelock per number (published 24 Sep) |
| ✅ | **n8n read relay checks a number** — does this phone have WhatsApp (published 24 Sep) |
| ✅ | **n8n read relay handles groups** — members, invite code, add participants (published 24 Sep) |
| ✅ | **n8n memory fix** — files to disk, 4 GB ceiling, 7-day history cleanup (the crash on 23 Sep) |
| ✅ | **Airtable publisher switched off** — one publisher now, fed by the dashboard |
| ✅ | 133 MB of duplicate video removed from storage |

---

## Pending — not built, waiting on a decision

| | What | Waiting on |
|---|---|---|
| ⬜ | **Monthly media retention** — the notification, the storage screen, the two-day grace period, the zip download | Specced in `MEDIA_RETENTION_SPEC.md`, agreed, not started |
| ⬜ | Confirm the warning thresholds (50/hour, 300/day) or set your own | Your numbers |

## Known, not fixed

- **A PDF uploaded on the live site right now** still loses its extension, because the fix isn't deployed. It arrives as a document (n8n handles it) but with no `.pdf` in the name.
- **Scheduled LinkedIn posts never fire** — nothing pings `/api/cron/publish-linkedin`. Separate from WhatsApp.
- The **Instagram/Facebook token** has ~17 days left; the **LinkedIn token** lapses around 3 Oct.

---

## What one deploy would ship

Everything in the first table: the standalone tab as it now stands, video and PDF
sending with correct file names, Send now, Send again, batch spacing and the safety
warnings, plus the duplicate-upload and image-compression work.
