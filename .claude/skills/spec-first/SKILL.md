---
name: spec-first
description: >-
  Use for ANY complex, confusing, ambiguous, or illogical-seeming part of the GooCampus Marketing OS
  dashboard — before building, changing, or debugging a non-trivial feature; when behaviour or logic
  seems off, contradictory, or unclear; or when you OR the user is unsure, stuck, or confused. Not
  limited to one tab — use it across the entire dashboard (My Day, Marketing Hub, Scheduler, Analytics,
  Ads, Content Radar, permissions, pipelines, anything). Runs an interactive clarify-then-build loop:
  understand the code + live UI, play back your understanding, ask the user targeted questions,
  cross-check the intended model against what's actually built, capture the agreed spec in
  docs/<FEATURE>_SPEC.md, then build (no dummy data, reuse existing code, test end-to-end). Trigger on
  "/spec-first", "let's discuss this", "walk me through", "I'm confused/stuck", "this seems off/illogical".
---

# Spec-first: clarify deeply, then build

For anything non-trivial or confusing in this dashboard, **do not build from assumptions.**
Slow down and run this loop. The user prefers understanding-first over fast-but-wrong.

## 1. Understand first (code + live)
- Read the code the change touches and trace the real flow end to end (use graphify queries over raw grep).
- Open it **live in the user's Chrome** and see how it actually behaves.
- If a `docs/<FEATURE>_SPEC.md` already exists for this area, read it first — it's the source of truth.

## 2. Play back + clarify (interactive, one thing at a time)
- State plainly what you understood the feature does.
- Ask the user **targeted, plain-text, numbered questions** — ONE topic at a time. Prefer plain text
  over the AskUserQuestion popup so the user can explain freely and correct you.
- When something seems **illogical or contradictory, say so and ask** — never paper over it.
- Voice-to-text is often garbled — play back your interpretation and confirm before acting.
- Keep going until the model is airtight. The user leads; you follow.

## 3. Cross-check spec vs. reality
- Walk the LIVE implementation against the agreed model. Sort findings into three buckets:
  **✅ matches · ⚠️ bug / out-of-logic · ❌ missing vs spec.** Give file:line evidence where useful.

## 4. Capture the spec
- Write/update `docs/<FEATURE>_SPEC.md` — the clean source of truth (roles, rules, flows, edge cases,
  current build-state gaps). Keep it updated as decisions change. Example: `docs/MY_DAY_SPEC.md`.
- Also keep a running note in memory so it survives sessions.

## 5. Only then build
Non-negotiables:
- **No dummy data** — wire to real Supabase (`mh_posts` etc.); strip hardcoded mocks/fallbacks.
- **Reuse what exists** — load the `ponytail` skill; don't reinvent components, endpoints, or patterns.
- **Test end-to-end live** in the user's Chrome; verify each phase before the next.
- The bar is **"perfectly working, no bugs, no out-of-logic behaviour."**

Existing feature specs live in `docs/*_SPEC.md` — load the matching one when it exists.
