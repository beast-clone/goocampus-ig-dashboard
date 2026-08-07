# Self-healing & alerting — plan

**Goal:** the dashboard recovers from routine failures on its own, and only pings a human when something genuinely needs a decision — so the team isn't babysitting errors.

## Core principle

Two kinds of "healing", treated very differently:

- **Runtime / operational issues** (the machinery hiccupped) → **auto-fix, no approval.** Safe, standard, low blast radius.
- **Code or data bugs** (the logic is wrong) → **prepare a fix, then notify.** This app writes real tasks/attendance and posts to LinkedIn/Meta; an unattended wrong fix is worse than the original error. Gate *every* code/data change, not just critical ones — approving a good fix is one tap; a bad auto-merged fix breaks the dashboard.

## The four layers

### Layer 1 — Runtime self-heal (autonomous, safe)
Covers ~80% of "it broke while I was away."
- **Auto-restart** the server on crash — process manager (pm2 or systemd), restart-on-exit + boot.
- **Retries with backoff** on transient fetch/DB failures.
- **Fallbacks** when a dependency is down (Perplexity quota, Serper cap → rule-based path; a failed panel → "temporarily unavailable", never a blank crash).
- **Circuit breakers** — stop hammering a failing upstream, resume when healthy.
- **Dev hygiene** — auto-clean exFAT `._*` files before git ops.

### Layer 2 — Error watchdog (autonomous)
- Catch every client + server error, **dedupe**, and **classify**: transient (auto-recovered → silent) vs. real (needs attention).
- Keep a rolling error log (table or a service like Sentry) with counts + last-seen.

### Layer 3 — Notifications (the "notify me" path)
- For **real / critical** cases only: send the error, what it tried, and a suggested fix.
- **Channel: _TBD_** — WhatsApp / Slack / email (pick one).
- Severity tiers: `critical` (page immediately) · `needs-you` (digest) · `info` (dashboard only).

### Layer 4 — Gated auto-fix (optional, human-in-the-loop)
- A scheduled agent reproduces a bug and opens a fix on a branch / PR for **one-click approval**.
- Never auto-merges. Never touches the DB or publishes without approval.

## Phased rollout

1. **Phase 1 (highest value, cheapest):** Layer 1 auto-restart + consistent fallbacks. Removes most "server stopped / dependency down" incidents.
2. **Phase 2:** Layer 2 watchdog + Layer 3 alerts on the chosen channel. You stop watching for errors; the real ones find you.
3. **Phase 3 (optional):** Layer 4 gated auto-fix agent for code bugs.

## Guardrails (always on)

- No unattended **code merges**, **schema/data migrations**, **deletes**, or **publishing** (LinkedIn/Meta/email).
- Token refresh is auto only when a refresh token exists; a real re-login always notifies.
- Every autonomous action is logged, so there's an audit trail.

## Rough effort

- Phase 1: small (process manager + a fallback/retry pass). ~½–1 day.
- Phase 2+3 alerts: small–medium (watchdog + one notification integration). ~1–2 days.
- Phase 4: medium (scheduled agent + PR flow). Optional.

## Decisions needed before building

1. Notification channel (WhatsApp / Slack / email).
2. Who receives `critical` vs `needs-you` alerts.
3. Whether to include Phase 4 (gated code auto-fix) now or later.
