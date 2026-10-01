# Watchers — spec

*Agreed 1 Oct 2026 · built 1 Oct · branch `feat/dashboard-reskin` · not deployed yet*

## What it's for
Watch web pages, starting with the KEA and MCC counselling notice pages, and tell people the moment something new is posted:
- on the dashboard (Watchers tab, plus a pop-up notification)
- by email
- on Telegram

This replaces n8n workflow `lhOaZp9S755bhEvT` ("KEA UGNEET 2026 Notification Watcher"). Switch that workflow off once this is live, and only with the user's OK.

## How it works
- **Add link** (pop-up):
  - the link and an optional name
  - a category (UG / PG / your own)
  - **Auto-categorize**
  - emails: the team list from the dashboard plus any typed address
  - Telegram on/off, with a pick of chats
- **Checking:** every active link is checked every 15 minutes (`netlify/functions/watchers-cron.mts` → `/api/cron/watchers` → `lib/watchers.ts`). "Check now" checks one link immediately.
- **First read = baseline:** every link on the page is recorded as "already there" and nobody is told.
  - An empty read changes nothing.
  - More than 30 "new" links at once means the page layout changed. They are recorded quietly and flagged.
- **Grouping** comes from each notice's own title, then its link:
  - **PG:** NEET PG, PGET, MD/MS, DNB…
  - **UG:** NEET UG, UGNEET, MBBS, BDS, AYUSH UG…
  - If a notice says neither, it falls back to the link's category, else "Other". It does not rely on the person picking the right category.
- **Telling people** (each new notice):
  - a notification for team members on the email list (pops up once)
  - one branded email listing what's new, grouped
  - a short Telegram message

## Tables (sql/032, applied)
- `mh_watchers`
- `mh_watcher_items` (unique per watcher + link; `baseline` flag)
- `mh_telegram_chats`

## Still needed to switch on sending
- **Email:** `GMAIL_USER` + `GMAIL_APP_PASSWORD` (a Google app password for the sending address) in `.env.local` and Netlify.
- **Telegram:** create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN`. Each person presses Start on the bot (or adds it to a group); they then appear in the pop-up's Telegram list.

## Open
- Netlify runs abroad, and some government sites block foreign servers. KEA and MCC load fine from India; check them from Netlify after deploy. If they're blocked, fetch via the Hostinger VPS.
