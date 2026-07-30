---
name: daily-audit
description: Adversarial audit of everything committed in the last 24 hours (or a given window / git ref) — find real defects, verify each before trusting it, fix at the root with a regression guard, and loop until it converges. Reviews the recent diff for this Supabase + Next.js dashboard. Fixes but does NOT commit or push — you review, then run /commit-session.
license: MIT
metadata:
  version: "1.0.0"
  adapted-from: codex daily-audit (ported + adapted for GooCampus Marketing OS)
---

# daily-audit

Adversarially audit what landed recently and fix what's actually broken. Optimise for **truth over volume** — a small list of confirmed, root-caused fixes beats a long list of maybes.

**Argument:** an optional time window or git ref. Default: everything committed in the **last 24 hours**. Examples: `/daily-audit 3 days`, `/daily-audit HEAD~5`, `/daily-audit <sha>..HEAD`.

## Steps

1. **Scope the diff.** Resolve the window to a git range (default `--since="24 hours ago"`). Get the changed files and the full diff:
   - `git log --since="24 hours ago" --oneline` (or the given ref range)
   - `git diff <range> --stat` then read the actual diffs for changed files.
   If nothing changed in the window, say so and stop.

2. **Find — adversarially.** Go through the changed code hunting for *real* defects, not style. Prioritise:
   - **Correctness**: logic errors, off-by-one, wrong date/time math, null/undefined paths, broken state updates, race conditions.
   - **Data integrity**: writes to the wrong Supabase table/column, missing `await`, silent catch-swallows, dummy/sample data leaking into a real path (this project's rule: real Supabase, no dummy data).
   - **Security**: a route that dropped its CSRF/session guard, a Supabase table touched by a new migration with **RLS disabled**, a secret committed, an endpoint returning more than the caller should see.
   - **Regressions**: a change that breaks an existing tab/flow (My Day, Marketing Hub, Scheduler, Analytics…). Trace callers with graphify (`graphify query "…"` / `graphify path "A" "B"`) rather than guessing.

3. **Verify before you trust it.** For each candidate defect, prove it's real: trace the exact inputs/state that trigger it and the wrong output/crash it produces. If you can't construct a concrete failure, drop it — do not fix phantom issues. Default to *not a bug* when unsure.

4. **Fix at the root.** Fix the underlying cause, not the symptom. Match surrounding code style (Hope UI tokens, existing patterns, `getIntegrationToken()` etc. — reuse, don't reinvent). Keep each fix minimal.

5. **Guard against regression.** Where the project has a way to prove the fix (a test, a typecheck, a live check via the page's own `fetch`), add or run it. At minimum run `npx tsc --noEmit` after your edits. Prefer a real end-to-end check in the running app over asserting it's fixed.

6. **Loop to convergence.** Re-scan the areas you touched — a fix can surface or cause another issue. Repeat find → verify → fix until a pass turns up nothing new.

7. **Do NOT commit or push.** Leave the working tree with your fixes staged-or-unstaged for the user to review. Report:
   - the window/range audited,
   - each confirmed defect (file:line, the concrete failure, the root-cause fix),
   - anything you investigated and cleared (so it's not re-audited),
   - what's still open / couldn't be verified locally.
   Then offer to run `/commit-session` to land the fixes.

Never invent problems to look thorough. If the recent diff is clean, the correct output is "audited <range> — nothing to fix," with a one-line note on what you checked.
