# GooCampus Dashboard — Audit & Hardening Report
**Date:** 2026-08-04 · **Branch:** `feat/dashboard-reskin` · **Landed in:** commit `bd45931`
**Detailed companions:** [`AUDIT_2026-08-04.md`](AUDIT_2026-08-04.md) (findings) · [`FIXES_2026-08-04.md`](FIXES_2026-08-04.md) (bug→fix)

This is the top-level summary of the audit + hardening pass. Readable on both machines once pulled.

---

## TL;DR
Ran a full audit (security, code quality, design, OWASP/STRIDE) on the dashboard and fixed everything actionable. Also set up design + dev-team skills (git-synced), and cleaned a committed-secrets leak out of git history. Everything is committed and pushed. **Two things still need you:** reset the Mac to the rewritten history, and rotate the leaked keys before go-live.

---

## 1. Skills installed (git-synced to both machines)
Vendored into `.claude/skills/` so they sync via the repo:
- **Design:** `taste`, `impeccable` (+ 4 agents), `gsap-*` (8 modules), and a new **`goocampus-brand`** art-direction guide (orange/navy public brand vs indigo dashboard). Provenance: `.claude/skills/_VENDORED-design-skills.md`.
- **Dev-team:** `superpowers` (14 skills), `frontend-design`. `gstack` was already present; `/code-review` + `/security-review` are native. Provenance: `.claude/skills/_VENDORED-devteam-skills.md`.
- **Claude-Mem** installed globally on Windows only (per-machine — run `npx --yes claude-mem@latest install` on the Mac).

## 2. Security — findings & status
| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Permissions enforced UI-only (API bypassable) | High | ✅ Fixed — server guards on 6 marketing-hub + leads-crm routes |
| 2 | SSRF in radar/article (redirect not re-validated) | High | ✅ Fixed |
| 3 | XSS in reader (unsanitized HTML → dangerouslySetInnerHTML) | Med-High | ✅ Fixed (server sanitizer, 6/6 tests) |
| 4 | Audit-log actor spoofing (delete) | Low | ✅ Fixed |
| 5 | leads-crm/counsellor PII — missing sales gate | High | ✅ Fixed |
| 6 | diagnostics/reconnect — any user overwrites OAuth tokens | Med-High | ✅ Fixed (admin-only) |
| 7 | **Live secrets committed to git** (`.env.local.bak.*`) | Critical | ✅ Scrubbed from history + gitignored; **rotate at go-live** |
| 8 | Session revocation gap (7-day cookie, no re-check) | High | ⏳ Deferred (design change) |
| 9 | leads/social + leads — missing sales gate | Med | ⏳ Deferred (verify vs non-sales login first) |
| 10 | Unbounded Perplexity spend on ~7 LLM routes | Med | ⏳ Deferred (add `guardRate`) |

**Verified clean:** auth (HMAC + timing-safe), CSRF, cron secrets, Google OAuth, crypto (scrypt), SQL injection, supply chain (no install scripts, lockfile tracked, no CI), security headers (full CSP/HSTS in `netlify.toml`).

## 3. Bugs fixed
- Scheduler "best time" recommended the **wrong day** (Sun/Mon grid mismatch).
- Multi-page scheduling **cloned a shared `airtable_record_id`** (broke link-back).
- Competitor **YouTube views zeroed past 50 videos** (API cap).

## 4. Performance fixed
- Removed a dead **1-second re-render** on the Audience page.
- Gated **My Day background-tab polling** (chat + data pulls) behind `document.hidden`.

## 5. Secret leak — what happened & remediation
`.env.local.bak.1785733150` (25+ real credentials incl. `SUPABASE_SECRET_KEY`, `SESSION_SECRET`, `OPENAI_API_KEY`, Meta/LinkedIn/YouTube tokens, `GA4_PRIVATE_KEY`) was tracked + pushed — `.gitignore` covered `.env.local` but not the `.bak`.
- **Exposure was effectively nil:** repo is private, 0 forks, only your account — no third party ever saw it.
- **Done:** untracked, `.gitignore` → `.env.local*`, **history rewritten** (27 commits) + force-pushed (`bd45931`), verified no ref references the file, local pre-commit hook blocks future `.env*` commits.
- **Push protection:** could NOT be enabled (needs paid GitHub Advanced Security) — the local hook is the substitute.

## 6. Deferred follow-ups (prioritized, not bugs)
1. **Rotate leaked keys** at go-live (clean production baseline).
2. Session revocation (revalidate `active`/`is_admin` per request).
3. Sales gate on `leads/social` + `leads` (verify against a non-sales login).
4. `guardRate` on the ungated LLM routes.
5. Extract shared `lib/discover-cache.ts`; back `leads-crm` cache with Supabase.
6. Consolidate the two Airtable pagination clients.
7. `readSnapshots` date column (needs a DB migration).
8. Split the 3 god-components (PreviewMyDay 3,602 / MarketingHub 3,238 / scheduler 2,828 lines).
9. Design polish: loading-vs-empty states, Master-sheet z-index overlap, perceived load speed.

## 7. Where it lives
- Branch `feat/dashboard-reskin`, latest `bd45931` (pushed).
- Reports: this file + `AUDIT_2026-08-04.md` + `FIXES_2026-08-04.md`.
- Dev server: `npm run dev -- -p 4324` (was running during the audit).

## 8. ✅ Action items for YOU
- [ ] **On the Mac, before any work:** `git fetch origin && git checkout feat/dashboard-reskin && git reset --hard origin/feat/dashboard-reskin` (history was rewritten — a stale Mac push would reintroduce the secret).
- [ ] Delete the local `.env.local.bak.1785733150` file (untracked now).
- [ ] Install Claude-Mem on the Mac (`npx --yes claude-mem@latest install`).
- [ ] At go-live: rotate the leaked credentials and move all secrets to Netlify env vars.
- [ ] (Optional) ask me to knock out the deferred items above one at a time.
