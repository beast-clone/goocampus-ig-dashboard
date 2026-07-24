# Session Handoff — GooCampus Marketing OS dashboard

**Written:** 2026-07-22 · **Branch:** `feat/hope-ui-reskin` · **Everything below is pushed to GitHub.**
New session: read this file, then `CLAUDE.md`, then `docs/MY_DAY_SPEC.md` before doing anything.

---

## 1. Project at a glance
- **Repo:** `goocampus-ig-dashboard` (GitHub: `beast-clone/goocampus-ig-dashboard`, private)
- **Branch:** `feat/hope-ui-reskin` — ⚠️ this branch does **NOT** deploy. Only `main` deploys to Netlify prod.
- **Stack:** Next.js 14 App Router + **Hope UI** design system (brand `#3A57E8`). V2 UI lives under
  `app/(dashboard)/dashboard/hope-preview/` and renders inside `.hope-scope`.
- **DB:** Supabase project **“Beast Clone”** `wlhbmzaernchwebapszq` (`mh_posts`, `mh_messages`,
  `mh_attachments`, `ind_users`, `discover_cache`, …). Writes go through the service client.
- **Docs:** `CHANGELOG.md` (running log), `docs/MY_DAY_SPEC.md` (feature spec), this file.
- **Secrets:** `.env.local` + `CREDENTIALS.md` are gitignored — never commit or print them.

## 2. What shipped this session (all pushed)
| Commit | What |
|---|---|
| `98955f2` | Marketing Hub pipeline logic fixes (6th stage “Output - In Progress”, awaiting-approval count), status-colour unification, dashboard-wide Hope-UI Tier-1 audit fixes (HopeSelect shadow, 10 native `<select>` → HopeSelect, purple → brand), Post Planner mh_posts-only + “Rescheduled by AI” block, and a real cache bug fix (`.maybeSingle()` → `.limit(1)+[0]` in leads, leads/social, competitor-cache, web-history) |
| `0ef135f` | Overview **Performance** section → aligned 2-column layout (Post mix + Hashtags left 40%, Which-format-wins + Your-read right 60%) |
| `0dfed0f` | `docs/MY_DAY_SPEC.md` (My Day source of truth) + CLAUDE.md pointer |
| `962a39e` | Universal **`spec-first`** skill (generalized from a My-Day-only version) |

## 3. CURRENT FOCUS — rebuild the My Day tab to spec (NOT started)
A long interactive session produced a complete, user-agreed spec for **My Day**
(`app/(dashboard)/dashboard/hope-preview/my-day/HopeMyDay.tsx`, ~3,100 lines, already live-wired to
`mh_posts`). **Read `docs/MY_DAY_SPEC.md` in full — it is the source of truth; the code does NOT match it yet.**

**Agreed build order** (verify each phase live before the next):
1. **Per-person status tabs** — Manya 4 (Content-Pending · Content-Approved · Incorporating-Feedback · Claimed Task); producers 3 (Content-Approved · Incorporating-Feedback · Output-Ready). Strict single-status per tab; list where the person is **owner OR collaborator**. (Today: generic In-progress/Feedback/Output for everyone.)
2. **Owner ↔ Collaborator** — store collaborator in `mh_posts.custom` jsonb (no column exists); transfer on Content-Approved, **reverse on revert to Content-Pending**; display BOTH.
3. **Recent Activity** — reuse the **Marketing Hub master-sheet activity feed** (Airtable-style who·what·when); log status changes, content edits (what changed), claims, transfers, extra-time.
4. **Claim rework** — inline in BOTH editors’ lists (not the current modal), “Claim? Yes/No” confirm, remove-from-other + notify-both, **Nikhil-only 3-option** (Present on camera / Edit video / Both).
5. **Content Review loop** — Output-Ready → Content Review queue; `incorporating_feedback` field; Incorporating-Feedback vs **Send to Scheduler** (skip a separate Ready-to-Publish step).
6. **Bug/plan fixes** — plan mislabels every block “Reel” (show real type); day has no cap (Manya shows 28h in an 8h day); anchor plan to login time.
7. **Attendance** — login = clock-in (first login of day only), power-button = clock-out, plan anchors to login time, end-of-day wrap-up + reason per pending task (Telegram = later).
8. **Misc** — “Urgent” priority level, smart reminders (Content-Pending >1–2d → Manya; overdue >1d → producer), Nandu’s separate Samvaya/other-platform section.

**Non-negotiables (user was emphatic):** no dummy data (real `mh_posts`; strip the hardcoded `TASKS`
fallback and mock `CAPS` capacity board), reuse existing code (`ponytail` skill), and **test end-to-end
live** (create a task → auto-assign → approve → review → scheduler) — “no bugs, no out-of-logic behaviour.”

## 4. Known bugs found in the live cross-check
- Praveen’s Today’s-plan blocks all labelled **“Reel”** though his tasks are Carousels/Thumbnails.
- **Collaborator always “—”** — the owner→collaborator transfer never populates Manya.
- Manya’s plan crams **28h into an 8h day** (no capacity cap / no overflow to pipeline).
- Approved **design** tasks still owned by Manya instead of transferring to Praveen.
- Team Capacity board renders **hardcoded mock** loads, not real per-person data.

## 5. Data state ⚠️
`mh_posts` was intentionally reduced to **ONE reference task** for clean testing:
*“UAE GP” · Carousel · Content-Pending · owner `manya` · publishes 2026-07-27.*
**All 272 original rows are backed up in the Supabase table `mh_posts_backup_20260722`** —
restore with `insert into mh_posts select * from mh_posts_backup_20260722 on conflict do nothing;`

## 6. Standing rules (do not break)
- **NEVER `git push` without explicit user approval.** Committing locally is fine.
- **NEVER `git add -A`** — stage files intentionally. **Pull first** (same user works on two machines:
  Windows @ home, Mac @ office, synced via GitHub).
- **Hope UI is mandatory** on every view/panel/modal — brand `#3A57E8`, no drop shadows, weights 400/500.
- **Local-first:** verify every change live in the user’s Chrome before saying it’s done.
- **`spec-first` skill is mandatory** for any complex/confusing feature (see `CLAUDE.md`).
- **`ponytail` skill** for all coding — leanest solution, reuse over rewrite, no bloat.
- Cannot: create accounts, enter passwords, solve CAPTCHAs, or deploy to Netlify.
- AI insights must be **prescriptive** (how to grow), never restate metrics.

## 7. Environment
- Dev server: `npm run dev -- -p 4324` → http://localhost:4324 (currently **stopped**).
- My Day: `/dashboard/hope-preview/my-day` · Overview: `/dashboard/hope-preview`
- Verify in the user’s Chrome via the browser tools (the extension must be connected; the Windows
  Chrome is the one that can reach `localhost:4324`).
- Refresh the code graph after edits: `node ".claude/skills/graphify/bin/graphify.js" update .`

## 8. Other open threads (not blocking My Day)
- **Design audit Tier-1 leftovers:** consolidate divergent metric cards into shared `components/MetricCard`;
  Overview reimplements its own shell; Leads tab uses raw `<style>`; card radius lg↔xl drift.
- **Instagram data-history (researched, nothing built):** IG account insights are capped at ~30 days
  (`app/api/insights/route.ts` clamps it) and IG keeps **no** historical follower data — only our own
  snapshots can build history. **Facebook** retains ~2 years (90-day query chunks). The snapshot
  pipeline already exists (`lib/snapshot.ts`, `/api/cron/snapshot`, `/api/insights-stored`) but the
  **daily cron is not running** — needs the dashboard deployed + an n8n daily trigger with
  `x-cron-secret`, then a one-time `?backfill=60`. History only accrues forward from switch-on.
- **`lib/dm.ts`** still has the same `.maybeSingle()` cache bug (not dashboard-facing).

## 9. First actions for the next session
1. Read `CLAUDE.md` + `docs/MY_DAY_SPEC.md`.
2. Invoke the **`spec-first`** skill, confirm Phase 1 scope with the user, then build.
3. Start the dev server and verify live before calling anything done.
