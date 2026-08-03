# Vendored dev-team skills (committed into this repo)

Copied in 2026-08-03 so they sync across machines with the repo (same pattern as the
design skills — see `_VENDORED-design-skills.md`). Plain skill files, no per-machine
install for the core behavior.

| Folder(s) | Source repo | Source commit | License |
|-----------|-------------|---------------|---------|
| `frontend-design/` | github.com/anthropics/skills (`skills/frontend-design`) | `b29e7cf` | see repo |
| `brainstorming/`, `writing-plans/`, `executing-plans/`, `test-driven-development/`, `systematic-debugging/`, `subagent-driven-development/`, `verification-before-completion/`, `requesting-code-review/`, `receiving-code-review/`, `dispatching-parallel-agents/`, `using-git-worktrees/`, `finishing-a-development-branch/`, `writing-skills/`, `using-superpowers/` (14) | github.com/obra/superpowers (`skills/*`) | see repo |

## Notes
- **Superpowers** normally auto-enforces its workflow via a SessionStart hook (from the marketplace install). Here we vendored **only the skill files** (git-syncable) — they work as regular auto-triggering skills, but without the enforcing hook. For full `/superpowers:*` command enforcement, marketplace-install per machine: `/plugin marketplace add obra/superpowers-marketplace` → `/plugin install superpowers@superpowers-marketplace`.
- **Overlap with gstack (already in this repo):** `finishing-a-development-branch`≈`/ship`, `requesting-code-review`≈`/review`, `writing-plans`/`executing-plans`≈`/office-hours`/`/autoplan`, `systematic-debugging`≈`/investigate`. Kept anyway per request; prune any you don't use.
- **frontend-design** overlaps `impeccable` + `taste` heavily — it's the Anthropic take on the same "don't look AI-generated" goal.

## Already covered elsewhere (NOT vendored — no action needed)
- **Code Review** → native `/code-review` (+ gstack `/review`)
- **Security Review** → native `/security-review` (+ gstack `/cso`)
- **gstack** → already vendored (the `office-hours`/`ship`/`qa`/`review`/… skills)
- **Claude-Mem** → per-machine install (Node/Bun/SQLite), NOT git-syncable — installed separately.
