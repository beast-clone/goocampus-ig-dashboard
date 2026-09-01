# My Day — real per-person login

**Decided 2026-07-31.** Replaces the demo profile-switcher with real, session-bound identity.

## Intent

Each teammate logs in as themselves and My Day opens on **their own** day and their
own chat inbox — no more shared profile-switcher that let anyone view anyone.

## Decisions (from the user)

- **Access scope:** producers get the **full dashboard**, same as admins (they chose
  this knowing it exposes CRM lead phone numbers, revenue, and ad spend). So the
  middleware no longer bounces non-admins to the parked `/me`.
- **Switcher:** kept for **admins only** (Maheen / the owner) so the boss can still
  view any teammate's day. Producers are **locked to their own logged-in identity**
  and never see the switcher.

## How it works

1. `lib/auth.ts` → `getSessionIsAdmin()` reads the signed `:a:` admin flag from the
   session cookie (same flag the Edge middleware trusts). `getSessionUserId()` already
   returned the person-key (`manya`/`nikhil`/`nandu`/`praveen`/`maheen`).
2. `my-day/page.tsx` (server) reads both and passes them in:
   - producer (`user && !admin`) → `initialPerson = user.id`, `isAdmin = false` → locked.
   - admin → `initialPerson = undefined` (defaults to a producer view) + `isAdmin = true` → switcher shown.
3. `PreviewMyDay({ initialPerson, isAdmin })` seeds `person` from `initialPerson` and only
   renders the header switcher when `isAdmin`.
4. `middleware.ts`: any authenticated teammate may open `/dashboard/preview`
   (V1 still redirects to V2); `/me` is retired (authed hits → V2); `/login` → V2 for all.

## Known follow-ups (not done here)

- **Shared password caveat:** if a teammate has no *personal* password set, the shared
  `DASHBOARD_PASSWORD` logs them in — so one producer could sign in as another by
  using that person's email + the shared password. For true per-person security, set a
  **personal password per teammate** (Team page). Code wiring is done; this is provisioning.
- **Chat identity is still client-supplied:** `/api/my-day/chat` trusts the `person`/`sender`
  in the request. Now that the server knows the real user, a later hardening should derive
  the chat identity from the session instead of the client param.
- Producers now see admin-only surfaces (Team permissions, Diagnostics). Per the "full
  dashboard" decision that's accepted; revisit if any of those should stay admin-only.
