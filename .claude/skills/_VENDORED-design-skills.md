# Vendored design skills (committed into this repo)

These three design skill sets were copied in from public repos on 2026-08-03 so they
sync across machines with the repo (same pattern as gstack / graphify). They are plain
skill files — no per-machine install needed for the core behavior. Update by re-cloning
the source and re-copying the folder(s) noted below.

| Folder(s) | Source repo | Source commit | License | Auto-triggers on |
|-----------|-------------|---------------|---------|------------------|
| `taste/` | github.com/Leonxlnx/taste-skill | `e988add` | MIT | Landing pages, portfolios, redesigns |
| `gsap-core/` … `gsap-utils/` (8) | github.com/greensock/gsap-skills | `aed9cfd` | MIT | GSAP animation / motion in JS, React, Vue |
| `impeccable/` (+ `../agents/impeccable-*.md`) | github.com/pbakaus/impeccable | `707794c` | Apache 2.0 | Any frontend design/redesign/polish, incl. dashboards |

## Notes / gotchas

- **taste** = `design-taste-frontend`. Its own spec says it is **for landing pages/portfolios/redesigns, NOT dashboards / data tables / product UI.** Use it on the marketing/landing sites, not on the dashboard app shell.
- **impeccable** covers dashboards + product UI and is `user-invocable` → also runs as the `/impeccable` command. Its deep-audit *detectors* call `npx impeccable …`; that npm package is optional and installs per machine. Without it, the skill still gives full design guidance — only the automated detector pass needs the CLI.
- **impeccable agents**: 4 helper subagents live in `.claude/agents/impeccable-*.md` (asset-producer, documenter, finish-reviewer, manual-edit-applier). They're namespaced, so no collision with repo agents.
- **gsap** is modular — 8 folders, each activates only when relevant (core / scrolltrigger / timeline / react / plugins / performance / frameworks / utils).

## To update any of these later
```bash
git clone --depth 1 https://github.com/<repo> /tmp/src
# then copy the skill folder(s) over the ones here and bump the commit SHA above
```
