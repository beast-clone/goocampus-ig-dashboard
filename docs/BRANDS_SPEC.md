# Brands — spec

Approved prototype: `docs/brands-prototype/v1.html` (Praveen, 29 Oct 2026). One admin page (System →
Brands) listing every brand the dashboard shows, its logo, and which of its four accounts
(Instagram, Facebook, LinkedIn, YouTube) are connected — and, finally, adding a brand without a
developer or a deploy.

## How brands work today (why it takes stages)
- The brand list is code: `lib/accounts.ts` (ACCOUNTS), `lib/brand-platforms.ts` (LI_PAGE,
  YT_CHANNEL, hasPlatform), `lib/youtube-channels.ts` (CHANNELS). 15 files import them.
- Instagram + Facebook keys come from `getConfiguredAccounts()` in `lib/instagram.ts` — a
  **synchronous** read of `accounts.local.json` (local) or the `ACCOUNTS_JSON` Netlify setting
  (live). ~30 data routes call it. Moving keys to the database means making those async.
- YouTube: per-channel Google sign-in already exists (`/api/auth/youtube/start?channel=…`), token
  saved as `youtube:<channel>` in `mh_integration_tokens`.
- LinkedIn: one member login; each brand's company page via `LINKEDIN_ORG_URN_<KEY>` settings.
- Logos: each brand's Instagram profile picture (`/api/account-avatars`, cached a day).

State on 29 Oct: Samvaya Matrimony has nothing connected — no Instagram/Facebook key, YouTube
channel ID added 8 Oct but the sign-in never finished, no LinkedIn page, so no logo either.
The local Meta user key expired 9 Oct (the live one is fine).

## Stage 1 — built now
- **Brands page** (System, admins only): the four brands, real logo, real status per account
  (Instagram/Facebook = a key is configured; LinkedIn = page + org setting; YouTube = a working
  grant), and what each one is called on that platform.
- **Logo upload** per brand (resized to 256 px, saved in `discover_cache` `brands:logos`); it
  overrides the Instagram picture in the brand picker everywhere.
- **Connect YouTube** for a brand with a channel → the existing Google sign-in.
- Instagram/Facebook and LinkedIn that aren't connected say exactly what's needed.

## Stage 2 — next
- Brand registry in the database (seeded with today's four) → **Add brand**, rename, hide.
- Instagram + Facebook keys in the database; `getConfiguredAccounts` reads it (async), so
  **Connect Instagram + Facebook** picks the brand's page from the Meta login's pages
  (`/me/accounts`) and saves its key — no settings file, no deploy.
- **Connect LinkedIn** picks the company page from the pages the LinkedIn login manages.
- YouTube channels for new brands (CHANNELS from the registry).
- Brand picker, tab greying (`hasPlatform`) and channel pills read the registry.
