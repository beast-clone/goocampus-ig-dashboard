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

## The tab
- **Each link** shows:
  - when it was last checked and when the next check is due
  - "Check now" and "Check all now", with a live line: *Opening… reading its links* → *Read 58 links — nothing new* / *2 new notices found*
- **News** is newest first, in day sections: Today · Yesterday · then the date (e.g. "Tue, 29 Sept") for the past week · Older. Each row: UG/PG tag · New tag (if new) · date and time · title · website; clicking opens the notice itself.
  - A notice's day comes from **the notice itself** when it carries a date: a date in the title (KEA "29-09-2026") or a timestamp in the file name (MCC "202609301551…").
  - Otherwise it is when we found it.
  - A document already on the page with no date goes last, under "Already on the page · no date given".
  - Rows found after the first check, within the last day, carry a **New** badge.

## Summaries and file buttons
- **Summary:** each new notice gets a one-line English summary (`lib/pdf-summary.ts`), put in the dashboard, email and Telegram. It's made by Perplexity sonar, about $0.001 each, logged in `ai_usage` as feature "watchers". There are three routes:
  - **pdf:** a PDF with real text (MCC) → its text
  - **scan:** a scanned PDF (KEA prints and scans notices) → a picture of page 1
  - **title:** no readable document → the link text, translated
- **Summarize on request:** older notices have a "Summarize" link (`/api/watchers/summarize`).
- **pdfjs in Node** needs `wasmUrl` for scans. Without it, the CCITT/JBIG2 text layer is silently dropped and page 1 renders as a blank letterhead.
- **Netlify:** `next.config.mjs` marks `pdfjs-dist` and `@napi-rs/canvas` as external and traces their runtime files into the function. This is untested on Netlify until deploy, so check a summary there first.
- **File buttons:** every row has a **PDF** button (opens the file to view or download) or a **Page** button.

## Tables (sql/032, applied)
- `mh_watchers`
- `mh_watcher_items` (unique per watcher + link; `baseline` flag)
- `mh_telegram_chats`
- sql/033 (applied) adds `mh_watcher_items.summary` and `summary_from`

## Still needed to switch on sending
- **Email:** `GMAIL_USER` + `GMAIL_APP_PASSWORD` (a Google app password for the sending address) in `.env.local` and Netlify.
- **Telegram:** create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN`. Each person presses Start on the bot (or adds it to a group); they then appear in the pop-up's Telegram list.

## Pages this server can't reach
Netlify runs abroad, and some government sites refuse foreign servers outright.
`cetonline.karnataka.gov.in` is the standing case: the KEA watcher has recorded
"Couldn't open the page" on every run while the page itself is healthy — it answers
an Indian IP in under a second. No timeout or retry can fix that; the request never
leaves.

So the fetch moves to a host the site does answer:

    POST /api/cron/watcher-ingest     Header: x-cron-secret: <CRON_SECRET>
    { "id": "<watcher id>", "html": "<page source>" }      // or "url" instead of "id"
    { "url": "…", "html": null }                           // the fetch was tried and FAILED

n8n on the Hostinger VPS reads the page and posts the HTML. Everything after the
fetch — link extraction, diffing, summaries, alerts — is the same code path as a
direct check, so a page read this way behaves exactly like one read here.

Send `html: null` when the fetch failed, rather than sending nothing: a failed read
changes nothing, which is what stops a blocked day looking like a page that lost all
its notices and then re-announcing every one of them on the next good read.

It lives under `/api/cron` because that is where this app keeps the endpoints a
machine calls — the middleware session-gates every other `/api/` path and skips the
CSRF origin check there, and n8n sends neither a cookie nor an Origin.

## Open
- Check MCC and the rest from Netlify after deploy; anything blocked moves to the ingest route above.
- KEA's first ingest will announce whatever it finds to its three email recipients and Telegram. Run it when somebody is expecting that.
