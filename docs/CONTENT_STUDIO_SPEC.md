# Content Studio — spec

Source of truth for how Content Studio generates content and which model runs it.

## Engines (who does the writing)

Content Studio runs entirely on **one API key** — `PERPLEXITY_API_KEY` (a `pplx-…`
key; verified live, HTTP 200, has balance). There is **no Anthropic account and no
OpenAI** anywhere. Two engines are available, and **both bill to the same Perplexity
balance** (the finite, use-it-or-lose-it credit; the Perplexity Pro *subscription* is
cancelled — the API runs on prepaid credit, which is separate and unaffected):

| Engine | Model | Endpoint | Cost | Strength |
|---|---|---|---|---|
| **Perplexity** (default) | `sonar` / `sonar-pro` / `sonar-deep-research` | `/chat/completions` | cheapest | live web research + citations |
| **Claude via Perplexity** | `anthropic/claude-sonnet-4-5` | `/v1/responses` (OpenAI "Responses" format) | pricier (Anthropic token rate + ~$0.005/search) | far stronger writing |

Key facts about the Claude engine (verified against the live key):
- Only `anthropic/claude-sonnet-4-5` is accepted — older IDs (`claude-3-5-sonnet`,
  `claude-sonnet-4-20250514`, `claude-opus-4-1`, `-3-7-`, `-haiku`) return 400.
- Anthropic models **require `max_output_tokens`** in the request or it 400s.
- Response shape: `output[] → {type:"message", content:[{type:"output_text", text}]}`;
  usage is `{input_tokens, output_tokens, total_tokens, cost:{total_cost}}` — the API
  returns **real USD cost per call**, which the UI now shows.

### Important: the Claude engine does NOT auto-load skills
Neither engine reads the `.claude/skills/*` files — those only apply when Claude Code
(the agent) works in-session. What differs is **how much guidance we inject into the
prompt**: Sonar gets a condensed framework (it's a weaker model); Claude Sonnet 4.5,
a strong instruction-follower, gets the **full playbook framework + GooCampus voice**.
The *fullest* skill application remains a human-in-the-loop session with Claude Code.

## Where the toggle lives

**Playbooks tab** (`content-studio/PlaybooksLibrary.tsx`, `SkillRunner`). The 53
marketing playbooks ([marketing-skills/](../marketing-skills/), Corey Haines' open pack
+ Pillar Content) each run through **one** call — the ideal place to compare engines
like-for-like. A segmented **Engine** switch (`Perplexity` · `Claude via Perplexity`)
sits in the "Your task" card, with a one-line note explaining each, plus:
- an engine chip on the result showing which model produced it,
- the real **$ cost** of the run in the token badge.

Flow: `SkillRunner` → `POST /api/marketing-skills/run { slug, task, engine }` →
`runSkill(slug, task, engine)` in [lib/marketing-skills.ts](../lib/marketing-skills.ts)
→ `askPerplexity` (sonar) or `askClaudeViaPerplexity` (claude) in
[lib/ai.ts](../lib/ai.ts). Same framework + GooCampus context feed either engine, so
switching is a true A/B.

## Generation pipeline (the "Make content" path — unchanged, Sonar-only for now)

`content-studio/page.tsx` → `POST /api/content/make` → `generateQuickPost` (radar item,
`sonar`) or `generateFromTopic` (typed topic: `sonar-deep-research` writes a cited brief
→ `sonar-pro` writes the 4 drafts) in [lib/content-pipeline.ts](../lib/content-pipeline.ts).
Result stored in `content_drafts` (`factcheck`, `drafts`, `citations`, `model`).

## Not built yet (agreed direction, deferred)
- Engine toggle on the **Make content** generator (currently Sonar-only).
- **Research-and-store**: on the deep-research path the grounded brief is used then
  discarded — store it (new `content_drafts.brief` column) + a batch-harvest action, to
  convert the finite $90 into a permanent cited-research library. Writing then hands to
  Claude Code in-session (zero API cost) for the pieces that matter.

## Billing model (the rule that drove all of the above)
- **Claude Max ($200/mo)** cannot be used as an API by the dashboard — it powers Claude
  Code / Claude apps only. Wiring an Anthropic API key into the server = double billing.
  So: dashboard-automated writing = Perplexity credit; top-quality writing = Claude Code
  in-session on the Max sub.
- The Claude-via-Perplexity engine is the middle option: automated + self-serve + strong
  writing, paid from the Perplexity balance (burns it faster than Sonar).
