---
name: commit-session
description: Commit ONLY this session's own file changes with explicit per-path staging, run the Supabase RLS/DB safety gate, refresh graphify, then push (this project's standing rule). Use after finishing a coding task to land it safely. Never uses a blanket "git add -A", never touches Samvaya, never commits secrets.
license: MIT
metadata:
  version: "1.0.0"
  adapted-from: codex commit-session (ported + adapted for GooCampus Marketing OS)
---

# commit-session

Land **this session's** work as one clean, correctly-scoped commit — then push, because for this project GitHub is the durable backup and every completed change is pushed immediately.

You are landing code, not auditing it. If you want a correctness pass first, run `/daily-audit` before this.

## Steps

1. **Collect this session's own changed files.** List the files *you* created or edited in this session. Cross-check against `git status --porcelain`. If a changed file appears that you did **not** touch this session, do not assume it's yours — surface it and ask before including it. If the collected list is empty, stop and say there's nothing to commit.

2. **Never stage blindly.** Stage each file by explicit path (`git add -- <path>`), one path at a time. Never run `git add -A` / `git add .`. Skip anything gitignored on purpose — `.env*`, `accounts.local.json`, build output.

3. **Verify the staged set.** Run `git diff --cached --name-only` and confirm it matches your intended list exactly. If anything unexpected is staged, unstage it (`git restore --staged -- <path>`) and re-check before proceeding.

4. **Samvaya guard.** If any staged file or its content relates to Samvaya, STOP and report — this project never touches Samvaya.

5. **Secret scan.** Reject the commit if a staged diff contains a real token, key, password, or service-role secret. Point to the line; never print the secret value.

6. **Supabase RLS / DB gate** *(only when staged files include a migration or raw SQL that touches the database — Beast Clone `wlhbmzaernchwebapszq`)*: verify row-level security is enabled on every affected table before committing. If a table has RLS disabled, STOP — don't commit; report the offending tables and the one-line fix. If the check can't be run locally, warn in one line rather than blocking.

7. **Branch.** Work stays on `feat/dashboard-reskin` (per `CLAUDE.md`). If you somehow find yourself on the default branch, branch first before committing.

8. **Typecheck if code changed.** If any `.ts`/`.tsx` changed, run `npx tsc --noEmit` and fix errors before committing. (A full `LIGHT_BUILD=1 BASE_PATH= npm run build` is the caller's call — mention if you skipped it.)

9. **Write a conventional-commit message.** Subject `type(scope): summary` (≤~72 chars), body as bullet points explaining what changed and why. End the message with exactly:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

10. **Commit.**

11. **Refresh graphify.** Run `graphify update .` so the knowledge graph stays current (AST-only, no API cost). If graphify isn't available, note it in one line and continue.

12. **Push** (this project's standing rule — GitHub is the durable backup): `git push`. If the push is rejected, report why; do not force-push without asking.

13. **Report back:** the commit hash, the subject line, the exact file list committed, the graphify-refresh result, and the push result.

If step 1 yields no files, do not commit — say there's nothing to commit.
