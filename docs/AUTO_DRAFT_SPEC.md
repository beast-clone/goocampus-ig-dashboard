# Auto-draft from a notice — spec

*Agreed 2 Oct 2026 · branch `feat/dashboard-reskin` · NOT BUILT*

## What it's for

Today a counselling notice becomes a post like this: someone sees it, taps **Write
this**, waits for the fact-check, picks a format, taps **Write it with Claude**, reads
the draft, taps through to the board. Five or six deliberate acts, all of which need a
person at a screen.

The ask is to remove the person from the middle of that, not from the end of it. A
notice posted at 03:14 should have a finished, fact-checked draft waiting by 03:16,
whether anyone is awake, travelling, or away from their phone.

## What was decided (2 Oct)

1. **Automatic only when the facts check out.** A notice whose fact-check comes back
   clean goes all the way; anything else waits for a human.
2. **Everything lands on the board** as a task in the Content Calendar, so it flows
   through the pipeline, scheduler and approvals that already exist.
3. **One watcher first** — KEA UG NEET 2026 — with a per-watcher switch, widened once
   we have seen a week of what it actually writes.

### The tension in 1 + 2, resolved

"Posts itself" and "lands on the board" are not the same thing, so to be exact:

**Every** auto-draft becomes a task on the board. That is the audit trail and it is
never skipped. The verdict decides what happens to that task next:

| Fact-check verdict | Task status | Who is told | What happens |
|---|---|---|---|
| `ok` | Scheduled | Telegram + email, for information | Goes to the scheduler for the next slot |
| `careful` | Ready for review | Telegram + email, asking | Waits. Nothing publishes. |
| `wrong` | Ready for review, flagged | Telegram + email, warning | Waits, and says why it was refused |

Nothing is ever published without existing as a reviewable task first.

## The verdict gate

This design only works because the fact-check already returns a machine-readable
verdict rather than prose. `lib/studio.ts`:

```ts
verdict: "ok" | "careful" | "wrong"
```

and, importantly, it **fails closed** — when the model's JSON cannot be parsed it
returns `careful`, not `ok`. So a malformed answer waits for a human rather than
publishing.

This is not theoretical. The first real notice put through Content Studio on 2 Oct came
back:

> **Careful.** The headline is directionally correct about a UG Round 3 final allotment
> result, but the specific source PDF filename/date pattern is odd and I could not
> verify that exact PDF from the provided results.

It read 15 sources, confirmed MCC had published the result, and still would not vouch
for the document. Under this spec that notice **waits**, which is the correct outcome
and the reason the gate exists.

## How it works

```
every 15 min   netlify/functions/watchers-cron.mts
               └─ /api/cron/watchers          ← exists today, must stay fast
                  └─ finds new notices, stores them, notifies

every 5 min    netlify/functions/autodraft-cron.mts        ← NEW
               └─ /api/cron/autodraft                       ← NEW
                  ├─ picks the oldest notice where
                  │     watcher.auto_draft = true
                  │     and item.drafted_at is null
                  ├─ /api/content/studio step=check   → verdict
                  ├─ /api/content/studio step=write   → the copy
                  ├─ /api/marketing-hub/create        → the task
                  └─ marks the notice drafted, records verdict + task id
```

### Why drafting is a separate pass — the thing that will bite otherwise

**Netlify kills a synchronous function at 10 seconds.** This is not a guess: it is what
broke the Airtable import on 25 Sep and produced `Unexpected token '<', "<HTML> <HE"...`,
because the HTML error page came back where JSON was expected.

A fact-check plus a draft is a Perplexity call and a Claude call — comfortably 30–60
seconds. Putting that inside `/api/cron/watchers` would mean the **15-minute check
itself starts failing**, so a slow draft would stop us noticing notices at all. That is
strictly worse than not having the feature.

Hence: the watcher pass stays as it is, and drafting is its own pass that handles **one
notice per run**. Five-minute spacing clears a backlog quickly without ever running two
expensive calls in one invocation.

## What lands on the board

Created through `/api/marketing-hub/create`, the same endpoint the Studio uses:

| Field | Value |
|---|---|
| Title | the notice title |
| Brand / SBU | `India NEET UG Consulting` or `India NEET PG Consulting` from the notice's own group |
| Format | Carousel (configurable per watcher) |
| Copy | the generated draft |
| Source | the watcher's name, and the notice URL |
| Status | `Scheduled` when `ok`, `Ready for review` otherwise |
| Owner | unassigned — the round-robin owns that decision, not this |

## Telling people — and a constraint worth knowing now

The obvious design is Telegram inline buttons: **Approve · Edit · Skip**, right in the
message.

**That cannot be added without breaking what we built today.** A bot reads either by
polling `getUpdates` or by webhook, never both — set a webhook and `getUpdates` answers
409. Watchers uses polling (`syncTelegramChats`), which is how the chat list is
discovered. Inline buttons send a `callback_query` that would only be collected on the
next poll, so "one tap to approve" would take up to fifteen minutes to do anything.

Two honest options, to decide before building:

- **(a) A link, not a button.** The Telegram message carries the draft and a deep link
  to the task on the board. One tap opens it, already written, and the existing approve
  flow takes over. Nothing changes about the bot. **Recommended** — it is one extra tap
  and no new failure mode.
- **(b) Move the bot to webhooks.** True one-tap approval from the message. Costs a
  webhook endpoint, abandoning `getUpdates`, and rebuilding how chats are discovered.

## What has to be true before it can run

1. **Deployed.** None of this exists on a schedule until the branch is on Netlify.
   That is also true of the 15-minute check today.
2. **`CRON_SECRET`** — already set in production.
3. **A migration** — `mh_watchers.auto_draft boolean default false`, and on
   `mh_watcher_items`: `drafted_at`, `draft_verdict`, `task_id`.
4. **`PERPLEXITY_API_KEY`** — already set.

## Cost

Per notice: one Perplexity fact-check plus one Claude draft. KEA produced 4 notices in
the busiest day observed, so single-digit rupees a day at that volume. It is bounded by
how often the government posts, which nobody can inflate by accident. Logged in
`ai_usage` under a `autodraft` feature so the bill is attributable.

## Deliberately out of scope

- **Images.** Text only. A carousel still needs a designer.
- **Instagram/LinkedIn publishing from this path.** It hands over to the existing
  scheduler and stops.
- **The other two watchers.** MCC UG and MCC PG stay off until KEA has been watched.
- **Anything with `wrong`.** It is written and parked, never queued.

## Open questions

1. **(a) or (b)** above for the Telegram approval.
2. **Which format** should a notice default to — carousel, or a plain image post?
3. **A daily ceiling?** If a site posts thirty notices in an hour because of a reshuffle,
   should drafting stop after N and say so? I would suggest yes, at 10/day, failing
   loudly rather than quietly spending.
4. **Who owns an auto-created task** before someone claims it?

## Risks, stated plainly

- **The drafts may simply not be good enough**, and a board full of mediocre
  auto-drafts is worse than an empty one, because people stop reading it. One watcher
  for one week is how we find out cheaply.
- **`ok` is the model's opinion.** It is a good one — it was appropriately cautious on
  the first real notice — but it is not a guarantee. Anything it clears still publishes
  under GooCampus's name. The per-watcher switch is the off ramp.
