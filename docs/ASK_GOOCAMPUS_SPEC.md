# Ask GooCampus — chat answering layer (spec / parked)

> Captured from a working session with the user on **2026-09-04**.
> **Status: agreed in principle, NOT built.** Blocked on one billing decision (§3).
> Prototype (clickable, hand-written data): https://claude.ai/code/artifact/30ca5c40-f8dd-4129-82f2-1a8d114c5d46
> Tab this replaces/extends: `app/(dashboard)/dashboard/preview/assistant/page.tsx` + `lib/assistant.ts`.

---

## 0. What it is

Turn **Ask GooCampus** from a keyword lookup into something you can ask a question and get an answer from.

The trigger: "how many tasks does Praveen have on pending?" returned **nothing**. Two reasons —
the search only matched a task's own text and never its owner (fixed, see §1), and it returns rows
but **cannot count**, so no phrasing of a "how many" question could ever have worked.

The prototype is one conversation, read top to bottom: a count question, a follow-up about a
contradiction between two boards, a one-word ambiguous search, and an analytics question.

---

## 1. Already shipped (this session, branch `feat/dashboard-reskin`)

These landed and are live-verified; the chat layer builds on top of them.

| Commit | What |
|---|---|
| `1001ec9` | Search matches `owner_key`, so a teammate's name finds their tasks. Result line says "owned by Praveen". |
| `6b26a28` | Scope chips (All / Tasks / Leads / Reports) with live counts, group headers in the ⌘K palette, `task:` / `lead:` prefixes, scope defaulted from the section you're standing in. |
| `93f9874` | A failed search no longer reports itself as "No matches" — network failure and non-OK responses get their own error state + Retry. |

---

## 2. The one architectural rule

**Counts are computed in code. The model never counts.**

Hand an LLM ten rows and ask how many there are and it will sometimes say nine. The green
"counted from your task sheet" line in the prototype is only worth anything if a computer produced
the number. So the split is:

- **Code** — runs the Supabase query, counts, aggregates, builds the row list and the provenance line.
- **Model** — chooses the *filter* from the question ("owner = praveen, status = open"), and writes
  the prose around numbers it was handed. It never invents a figure.

Every answer is stamped:
- **green — counted from your data**: a real query, with table + row count + timestamp, rows one click away.
- **amber — model's opinion, not measured**: prose the model wrote that the data does not prove.

This matters more here than in most products. This dashboard has previously shown mock Instagram
figures behind a green "Live" badge, reported engagement as `reach × 6%`, and rendered a dead server
as "No matches". A confident chat answer with no way to check it would be the same failure again.

---

## 3. BLOCKER — Perplexity is out of quota

Verified live on 2026-09-04:

```
POST https://api.perplexity.ai/chat/completions
HTTP 401 — {"type":"insufficient_quota",
            "message":"You exceeded your current quota, please check your plan and billing details."}
```

`lib/ai.ts` states Perplexity is **the only LLM provider in the dashboard — no OpenAI anywhere**.
The key is `PERPLEXITY_API_KEY` (also accepted as `PLANNER_SEARCH_KEY`).

**Knock-on effect: Content Studio and Post Planner run on this same key and are therefore also
broken right now.** Worth checking before anyone reports it as a separate bug.

### The decision the user needs to make

1. **Top up Perplexity** → both halves get built together.
2. **Build the deterministic half now** *(recommended)* — answers task and lead questions properly
   today at zero running cost; the free-form layer switches itself on when the key is funded,
   because `lib/ai.ts` already exports `hasAI()` as the guard. No rewrite needed later.
3. **Different provider** — possible, but adds a key and breaks the single-provider rule the
   codebase states in writing. Would want a reason.

---

## 4. Still to settle (not yet discussed)

Do **not** build past these without asking. The user leads.

1. **Read-only, or can it act?** The prototype shows "Send him a nudge" and "Open Praveen's day".
   Reading is safe. Acting (reassign, nudge, reschedule) needs permission rules and an undo story.
2. **Who can use it?** Today `/api/assistant` is gated by `requireSection("content")`. A tab that can
   answer "how many leads did we get" crosses into sales data — is that the same gate?
3. **Cost ceiling.** Per-question cost and a rate limit. `guardRate` already exists (40/min on the
   assistant route) but that governs abuse, not spend.
4. **Scope of answerable questions.** Tasks and leads are well-shaped. Analytics ("why is reach down")
   spans the Instagram/LinkedIn/YouTube layers and is a much larger surface — probably phase 3.

---

## 5. Build plan (when unblocked)

**Phase 1 — deterministic answers, no AI.** A question-intent matcher over a small set of shapes the
data actually supports: *how many X does <person> have*, *what is <person> working on*, *what is
overdue*, *who owns <task>*, *how many leads named <name>*. Each maps to a real query in
`lib/assistant.ts`, returns `{ answer, figures[], rows[], provenance }`. Render as the answer card in
the prototype. Falls back to today's search results when no shape matches — never a dead end.

**Phase 2 — model layer behind `hasAI()`.** Model picks the filter and writes prose; code still
supplies every number. Amber stamp on anything it asserts beyond the data. Unrecognised questions
route here instead of falling back to search.

**Phase 3 — analytics questions.** Only after 1 and 2 are solid.

### Files it touches
- `lib/assistant.ts` — add the answer engine beside the existing `search()`.
- `app/api/assistant/route.ts` — return an optional `answer` alongside `results`.
- `app/(dashboard)/dashboard/preview/assistant/page.tsx` — render the answer card above the results.
- `lib/ai.ts` — reuse `askPerplexityJSON` / `hasAI`, add nothing.

### Non-negotiables (from CLAUDE.md + spec-first)
- No dummy data — real Supabase, no mock fallbacks.
- Reuse existing components and endpoints; don't reinvent.
- Test end-to-end live in the user's Chrome before calling it done.
- Use the dashboard theme tokens (`#3A57E8`, Inter 400/500, bordered cards, no shadows).

---

## 6. Data facts confirmed while speccing (2026-09-04)

- `mh_posts.owner_key` holds a lowercase first name: `praveen` (10), `nandu` (4), `nikhil` (2),
  `manya` (1), one NULL (unclaimed). No name→key lookup needed; `keywords()` already lowercases.
- Praveen: 10 open tasks, 9 overdue (28–40 days), 1 Urgent, 1 in `Content - Pending`.
- **"Pending" means different things on different boards.** Praveen's My Day reads `Pending 0` while
  he owns a `Content - Pending` task, because that counter shows the *writer's* queue — the task sits
  with Manya until it is handed to a designer. Not a bug, but it confused the user and is worth a
  label change.
- "praveen" also matches **12 CRM leads** (Praveen Kumar, Praveen Naidu, Dr. Praveena Shanmugam…),
  which is what made the unscoped search unusable and drove the scope chips in `6b26a28`.
