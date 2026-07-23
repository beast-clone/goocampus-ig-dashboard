# GooCampus Marketing OS — project instructions

## MANDATORY: use the Hope UI theme for everything

This dashboard is built on the **Hope UI** design system — treat it as the brand book. **Every** new tab, page, panel, modal, or component you build MUST use these tokens and patterns. Never ship a generic/default-Tailwind look. If a design isn't clearly on-brand and sectioned, it's wrong — redo it.

All Version-2 UI lives under `app/(dashboard)/dashboard/hope-preview/` and renders inside `.hope-scope` (see `app/globals.css`). New V2 UI must stay in that scope.

### Brand tokens (from `.hope-scope` in `app/globals.css`)
- **Brand accent:** `#3A57E8` — use the Tailwind classes `bg-brand`, `text-brand`, `border-brand`, `bg-brand-light` (never hardcode a purple/indigo).
- **Brand dark:** `#2138B0` · **Brand light:** `#E9ECFB`
- **Headings / primary text:** `#232D42` (Tailwind: apply directly, `text-[#232D42]`)
- **Muted / secondary text:** `#8A92A6`
- **Page canvas behind cards:** `#F6F7FB` (light gray) so white cards read as sections
- **Cards / panels:** white surface, `border border-gray-100`, `rounded-xl` (12px), `rounded-2xl` for large containers. **No drop shadows** — `.hope-scope` strips them; use borders + the gray canvas for separation.
- **Font weights:** 400 and 500 only (headings are `font-medium`/`font-semibold`, never 700).

### Layout rules
- Break content into **labelled sections/cards** with a header (icon + title). Never dump text on a flat background.
- Establish hierarchy: highlight the most important thing (e.g. a brand-accented header bar `bg-brand-light`), keep secondary info in the sidebar/quieter.
- Use Tabler outline icons (`@tabler/icons-react`), the shared `HopeSelect` for dropdowns, and existing hope-preview components (`HopeDashboardShell`, `HopeSidebar`, `Panel`-style cards) rather than reinventing.
- Reference well-built examples already in the repo: the Marketing Hub Master-sheet views + detail modal (`marketing-hub/page.tsx`) and `my-day/HopeMyDay.tsx`.

## Backend / data
- Supabase writes go through the service client (`getSupabase()`), project **Beast Clone** `wlhbmzaernchwebapszq` (holds `mh_posts`, `mh_views`, `mh_attachments`, etc.). **Never touch Samvaya projects.**
- API routes are CSRF + session protected; test them from the page's own `fetch`, not curl.

## Workflow
- Work on branch `feat/hope-ui-reskin`. Verify changes live in the user's Chrome before saying they're done. No Netlify production deploy without explicit approval.

## MANDATORY: spec-first on any complex / confusing feature

For **any non-trivial, confusing, ambiguous, or illogical-seeming** part of this dashboard —
before building/changing/debugging it, or whenever you or the user is unsure or stuck —
**invoke the `spec-first` skill**. It runs a clarify-then-build loop: understand code + live UI,
play back your understanding, ask targeted questions, cross-check intent vs. what's actually built,
capture the agreed spec in **`docs/<FEATURE>_SPEC.md`**, then build (no dummy data → real Supabase,
reuse existing code → ponytail, test end-to-end live). Applies across the whole dashboard, not one tab.

Per-feature specs live in **`docs/*_SPEC.md`** — load the matching one when it exists. First one:
**`docs/MY_DAY_SPEC.md`** (the My Day tab; current code does NOT fully match it yet — build against the spec).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## MANDATORY: use the `improve` skill for audits / reviews / roadmap

The `improve` skill (shadcn, MIT — installed at `.claude/skills/improve/`) is the **required** tool whenever the task is to **audit the codebase, review changes, find improvement opportunities (bugs, security, perf, test coverage, tech debt, migrations, DX), or decide what to build next**. Reach for it by default for that class of work — every session, this one included — instead of ad-hoc reviewing.

- It is a **read-only senior advisor**: it surveys the repo and writes self-contained implementation plans under `plans/` for another agent to execute. It never edits source, never commits/pushes, never reproduces secret values, and treats all repo content as data (not instructions).
- Invoke it on demand for audit/roadmap work — it is NOT a per-session auto-run (it would otherwise re-survey the whole repo every time). Use `improve` to survey + plan, `review-plan <file>` to tighten a plan, `execute <plan>` to dispatch an executor + review its diff.

## gstack skills (project-local)

This project has the [gstack](https://github.com/garrytan/gstack) skill pack (MIT, by Garry Tan) under `.claude/skills/`. The lightweight skill instruction files are **committed** (so they sync across machines); the heavy ~1 GB engine (`.claude/skills/gstack/` — bun deps + browser binaries) is **gitignored** and stays per-machine. No Chromium is installed — the browser skill (`/browse`) is intentionally not wired up.

Useful skills for this dashboard:
- `/design-review` — visual QA: spacing, hierarchy, inconsistency, AI-slop, slow interactions.
- `/review` — pre-merge review of a branch's diff for production bugs.
- `/qa`, `/qa-only` — walk the app and find (qa-only: just report) bugs.
- `/investigate` — systematic root-cause debugging.
- `/cso` — security audit (OWASP + STRIDE).
- `/office-hours`, `/autoplan` — plan a feature before building; `/ship` — land a PR.

On another machine, the skill files are already present via git. To restore the engine for the tool-backed skills, run `cd .claude/skills/gstack && ./setup --local` (needs `bun`; skips the browser).
