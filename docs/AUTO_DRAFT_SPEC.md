# Notice → post, approved from Telegram — spec

*Agreed 2 Oct 2026 · branch `feat/dashboard-reskin` · NOT BUILT*

*Replaces the first draft of this spec, which gated auto-publishing on the fact-check
verdict with no person involved. That was rejected in favour of a person approving from
Telegram — better, because the human decides whether a notice is worth a post **before**
any AI call is spent, and can fix the draft from a phone without opening the dashboard.*

## What it's for

A counselling notice appears at 03:14. Nobody is awake. By the time someone sees it,
competitors have posted.

Today turning that notice into a post takes five or six deliberate acts at a screen.
This moves all of them into a Telegram conversation, so the only thing needed is a
person with a phone, anywhere.

## The flow

```
notice found                     (the watcher, every 15 min — exists today)
   │
   ▼
Telegram: "New notice. Worth a post?"      [Yes] [No]
   │                                         └── No → nothing happens, notice marked
   ▼ Yes
caption written        (Claude, after the Perplexity fact-check — exists today)
image made             (Placid template — NEW)
   │
   ▼
Telegram: the image, the caption, where it is going    [Approve] [Change] [Skip]
   │                        │
   │                        └── Change → "what should change?" → rewrite → shown again
   │                                     (loops, replacing the same message)
   ▼ Approve
task on the board → Scheduler → Publishing Calendar → published
```

Nothing publishes that a person has not read.

## Telegram can carry this — tested, not assumed

Run against `@marketingos_abot` on 2 Oct:

| Needed | Result |
|---|---|
| Image + caption + buttons in one message | ✅ sent, `message_id: 3` |
| Rewrite the draft in place | ✅ `editMessageCaption` — same message, not a new one |
| Works in a group | ✅ `can_join_groups: true` |

Rewriting in place is what makes the change loop usable: round three replaces round two
rather than leaving a thread of near-identical drafts.

### Limits that shape the design

1. **Caption cap 1024 characters.** Instagram allows 2200. A long caption cannot ride on
   the image — it goes as a second message underneath.
2. **An album holds 2–10 images and cannot carry buttons.** A 20-slide carousel previews
   as the first few slides, with the buttons in a following message.
3. **Group privacy is on** (`can_read_all_group_messages: false`). In a group the bot
   only sees replies and mentions. Fine one-to-one; needs `/setprivacy` in BotFather for
   free-form "make it shorter" in a group.

### The one change to what exists

**The bot must move from polling to a webhook.** Replies and button taps have to come
back, and `getUpdates` polling would collect them on the next poll — up to fifteen
minutes to answer a tap. A bot does one or the other, never both.

This is a simplification, not a cost: `syncTelegramChats` goes away, because every
message that arrives tells us who sent it. Chat discovery stops being a separate job.

## The image — the actual gap

`lib/studio.ts` has three functions: fact-check, build prompt, write draft. **Text only.**
Nothing in the dashboard makes an image; Praveen and the editors do that by hand. Without
solving this, "it posts itself" means "it writes a caption and then waits", which is not
what was asked for.

**Decision: generate it from a template**, the way the voucher generator already does in
n8n with Placid (`GC Placid Connection`, workflow `Oit92H4NaYq6wU8P`, in production since
May). Proven path, proven service, already paid for.

### Two ways to reach Placid

| | How | Cost |
|---|---|---|
| **(a) Direct** | `PLACID_API_KEY` in the dashboard; it calls Placid itself | One key to copy. No dependency on n8n. |
| **(b) Through n8n** | The dashboard calls an n8n webhook; n8n makes the image and returns the URL | Reuses a working path and needs no new credential — but the dashboard now depends on n8n being up. |

**Recommend (a).** The watcher already runs in the dashboard; adding a second system in
the middle of a 3am path means two things that can be down instead of one. The voucher
workflow stays exactly as it is.

### The real work here is design, not code

Calling Placid is an afternoon. **The templates are the job**, and they decide whether
this looks like GooCampus or like a robot. At minimum:

- a seat-matrix / vacancy notice
- a result or allotment announcement
- a date or deadline change
- a plain fallback for anything that fits none of the above

Each takes the notice title, the date, the round, and GooCampus branding. These are
designed once, in Placid, by a person. Until they exist there is nothing to generate.

## What lands where

On approval, through `/api/marketing-hub/create` — the same endpoint Content Studio uses:

| Field | Value |
|---|---|
| Title | the notice title |
| Brand | `India NEET UG Consulting` / `India NEET PG Consulting`, from the notice's group |
| Caption | the approved copy |
| Creative | the generated image, attached |
| Source | watcher name + notice URL |
| Status | Scheduled |
| Page | the brand's page — shown in Telegram before approval |

From there it is an ordinary task: **Scheduler** and **Publishing Calendar** pick it up
with no new work. That part already exists and is not being rebuilt.

## The fact-check still runs

It returns `ok` / `careful` / `wrong` and **fails closed** — unparseable output becomes
`careful`, not `ok`. It no longer decides whether to publish, because a person does that
now. It decides what the first Telegram message says:

- `ok` — "New notice. Worth a post?"
- `careful` — same, plus what could not be confirmed
- `wrong` — says so plainly and does not offer to write one

Not theoretical: the first real notice put through Studio came back `careful` because it
could not tie the PDF to the result. You would want that on screen before tapping yes.

## Scope

**KEA UG NEET 2026 only**, behind a per-watcher switch, until a week of real output has
been read. MCC UG and MCC PG stay off.

## What has to be true

1. **Deployed.** None of this runs on a schedule until the branch is on Netlify — true
   of the 15-minute check today as well.
2. **Placid templates designed** — see above. The blocking item.
3. **`PLACID_API_KEY`** in the dashboard and Netlify.
4. **The bot moved to a webhook**, and `syncTelegramChats` retired.
5. **A migration** — `mh_watchers.auto_draft`, and on `mh_watcher_items`:
   `asked_at`, `answered_at`, `draft_state`, `task_id`.

## Cost per notice

One Perplexity fact-check, one Claude caption, one Placid render, plus a render per
rewrite round. KEA's busiest observed day was 4 notices. Single-digit rupees. Bounded by
how often the government posts, which nobody can inflate by accident. Logged in
`ai_usage` under `autodraft`.

## Open questions

1. **Expiry** — should an unanswered notice stop asking after, say, 12 hours, so the bot
   is not still asking about Tuesday's seat matrix on Thursday? Suggest yes.
2. **Rewrite limit** — after how many rounds does it say "open it on the dashboard"?
   Suggest three.
3. **Who can approve** — anyone who has started the bot, or named people only? A
   notification list is not an approval list.
4. **Format** — carousel or single image for a notice post?

## Risks

- **The templates may look generic**, and a generic post under the GooCampus name is
  worse than a late one. One watcher, one week, read every output.
- **Approval from a phone is easy to do carelessly.** The message must show the page it
  is going to and the brand, not just the picture — tapping Approve on a train should
  still be an informed act.
- **An approved post is published automatically.** The per-watcher switch is the off
  ramp, and it should be reachable without a deploy.
