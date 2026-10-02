# Changelog — 2 Oct 2026

Branch **`feat/dashboard-reskin`**, 11 commits, `494686c`..`ac7a5e5`. All on Watchers.

> ## ⚠️ STILL NOT DEPLOYED
>
> Everything below was built and checked on **localhost** in Windows Chrome, against
> the live Supabase. **Nothing checks on its own yet** — the 15-minute schedule is a
> Netlify function, so every check so far has been a button press.
>
> **Keep the n8n KEA watcher (`lhOaZp9S755bhEvT`) running until this ships.**

---

## ▶ Pick it up on the Mac

```bash
git fetch && git checkout feat/dashboard-reskin && git pull
npm install
npm run dev
```

⚠️ **Don't run `npm run build` while the dev server is running** — they share `.next`
and the build leaves the dev server throwing `Cannot find module './9276.js'`.

---

## 1. The tab is two columns now

News sat underneath the whole list of watched links — below the fold. For anyone who
doesn't scroll, that is the same as it not being there.

Links take a **20% rail on the left**, news takes the rest, both visible without
scrolling, rail sticky. The rail is also **the website filter**: click MCC PG and the
news beside it is MCC PG's. That retired the "All websites" dropdown and gave the rail
a job beyond reporting status.

At 260px four buttons per link don't fit. **Check now** stays out; Open page / Edit /
Pause / Remove sit behind a **⋯**. A coloured dot replaced two lines of prose — green
read in the last 20 minutes, amber overdue, grey paused, red errored.

**UG / PG are tabs**, not a dropdown, each with a count. Group filtering moved to the
browser because the server can only answer about one group at a time and the tabs each
need a number; the list is capped at 300 rows, so it is cheap.

Nothing was dropped: period filter, "include documents already there", day sections,
New badge, notice dates, PDF/Page, Summarize, emailed/Telegram ticks, Check all,
Add link, connection pills.

---

## 2. Email actually sends now

**There was no mail sender anywhere.** Not in `.env.local`, not in the 49 variables on
Netlify. SendPulse is connected but it is their *chatbot* product — the token
authenticates, `/smtp/senders` answers 403, and the balance is $0. The Google that was
"already linked" is `GOOGLE_LOGIN_CLIENT_ID`, which is **sign-in** and carries no
permission to send.

Side effect worth knowing: **OTP login and the comment digest have never worked in
production either**. Same missing piece. They work now.

### How it was solved

The `gmail.send` scope on the OAuth client the dashboard already has — one Google app,
one more scope, rather than a second credential to create and look after.

- Refresh token in `mh_integration_tokens` under provider `gmail`, address in `note` —
  the same store Diagnostics Reconnect uses, so it rotates without a redeploy.
- Access tokens minted hourly, never stored.
- `sendMail()` is still the only door: it prefers the connected account and falls back
  to `GMAIL_USER`/`GMAIL_APP_PASSWORD`, so every caller got this with no change.
- `hasEmail()` became async (the answer lives in Supabase now); six callers updated.

### What was done in Google Cloud Console (project `gc-dashboard-analytics`)

Three things, all permanent:

1. Two redirect URIs added to OAuth client `…q2fm`:
   `http://localhost:4324/api/auth/gmail/callback` and
   `https://goocampus-ig-dashboard.netlify.app/api/auth/gmail/callback`
2. Scope `https://www.googleapis.com/auth/gmail.send` added to Data Access
3. **The Gmail API itself enabled** — it wasn't, which is what "Gmail refused the
   message" actually meant

⚠️ The app is **External**, publishing status **In production**, **100-user cap, 3
used**. A sensitive scope on an External app means an "unverified app" screen before
Allow. **"Make internal"** would remove that permanently — but it also restricts Google
*sign-in* to goocampus.in accounts. Left alone deliberately.

### The sender dropdown

Connecting a second account used to overwrite the first. Every account that has agreed
is now its own row (`gmail:<email>`), and switching copies a grant we already hold —
**no trip to Google, nothing to allow twice**. `info@goocampus.in` and
`praveen@goocampus.in` are both connected; currently sending as **info@**.

`listGmailAccounts()` mirrors the active row the first time it looks, so an account
connected before this existed is not a one-way trip.

**Disconnect forgets every account**, not just the active one.

---

## 3. Telegram

You already had bots — n8n holds `GooCampus Bot`, `Sales bot`, `Praveen Telegram`,
`Ejaz_Telegram`. A **new one was made for this**: **@marketingos_abot**.

That was the right call, for a reason worth remembering: **Telegram delivers each update
to one reader only.** `syncTelegramChats` polls `getUpdates` and acknowledges the offset,
so this and an n8n workflow watching the same bot would steal messages from each other —
and a bot with a webhook on it can't be polled at all (409).

The token is **pasted on the tab**, not an env var, and kept in `mh_integration_tokens`
under `telegram` — so changing bots needs no redeploy. It is checked against `getMe`
before being stored, so a bad paste fails in the dialog with Telegram's own words.

**Disconnect drops the token and keeps the chats** — who pressed Start is not a
credential.

**All three watchers have Telegram on.** Only **Praveen L** has pressed Start, so right
now Telegram reaches one person. Anyone else must open @marketingos_abot and press
Start — or **add the bot to a group**, which suits a counselling desk better.

---

## 4. It says what it actually sent

The green line claimed "sent to the people on this link" whether or not anything had
been. With nothing configured, nothing had. `announce()` now returns what actually left —
dashboard pop-ups, addresses mailed, chats reached, and whether a channel was listed but
switched off:

> 2 new notices found — shown below · 3 people notified here. **Not sent: email isn't connected yet.**

**Send me a test** (email, to yourself only) and **Send a test** (Telegram, to everyone
who pressed Start, naming who it reached and who it couldn't).

---

## 5. The Content Radar loop, on Watchers

Every notice row carries **✎ Write this · 👍 · 👎**, and there is a **Report** at
`/dashboard/preview/watchers/report` (admin only).

A notice became a **fifth kind of radar item** rather than a parallel system — same
`radar_actions` table, same `Thumbs`, same written / useful / not useful vocabulary.

The report needs no nightly roll-off: a radar headline is a search result gone tomorrow
and must be copied into a day log, while a notice is already a durable row in
`mh_watcher_items`. It joins those to `radar_actions` on `notice:<url>`.

Two things it reports that the Radar one can't:

- **How late we were** — currently reading **"found 35h later"** on the KEA notices.
  That is the case for deploying the schedule, in one number.
- **Whether it reached anybody** — four notices read **"told nobody"**.

### ✅ sql/034 HAS BEEN RUN

`radar_actions.item_kind` is a CHECK constraint, widened once before for reviews
(sql/023). `notice` violated it and every thumb failed with `23514` — **silently**,
because the row reverts only after the rejected upsert finally answers, ~20 seconds
later. Run in the Supabase SQL editor on 2 Oct and verified against the live table.

Thumbs now save and survive a reload; the report shows **"Useful, not now — Maheen Ejaz"**.

### Noted, not chased

`radar_actions` was **completely empty** before this. The constraint allowed
news/mention/search/review all along, so the likeliest explanation is simply that
nobody has ever used the Radar thumbs — but it does mean **the Content Radar report has
been reporting on nothing**. Worth an hour.

---

## 6. Write this → Content Studio

Verified end to end: Write this on an MCC notice opens Studio with title and source
filled, brand **India NEET UG Consulting**, and the Perplexity fact-check already run.

**It was wired wrong at first** — the notice's group went through raw as `?sbu=UG`.
Studio's brand picker is fed the live SBU list, which has no "UG", so the draft would
have carried a brand that is not a brand. That is exactly how a second "NEET PG" got
into every picker on the board once before (Manya, 23 Sep). UG and PG now map to
`India NEET UG Consulting` / `India NEET PG Consulting`; anything else falls back to
General Content.

Worth reading what the fact-check said on the first real notice:

> **Careful.** The headline is directionally correct about a UG Round 3 final allotment
> result, but the specific source PDF filename/date pattern is odd and I could not
> verify that exact PDF from the provided results.

It read 15 sources, confirmed MCC published the result, and flagged that it could not
tie the PDF to it. **That is the argument against auto-publishing without a human.**

---

## ⚠️ Still open

1. **Not deployed.** Nothing checks itself. Keep n8n running.
2. **Only one person on Telegram.** Everyone else must press Start, or use a group.
3. **`radar_actions` was empty** — see §5.
4. **External app, 100-user cap**, unverified-app screen on consent — see §2.
5. **Auto-post from a notice** — asked for, spec to be written.

---

## Files

| New | |
|---|---|
| `lib/gmail-api.ts` | Gmail API sender, grants, account switching |
| `app/api/auth/gmail/start` · `callback` | the consent flow |
| `app/api/watchers/sender` | switch sending account |
| `app/api/watchers/test-email` | prove email works |
| `app/api/watchers/telegram` · `telegram/test` | connect, disconnect, prove |
| `app/api/watchers/disconnect-email` | stop sending |
| `app/api/watchers/report` | the report data |
| `.../preview/watchers/report/page.tsx` | the report |
| `sql/034_radar_notice_kind.sql` | **run** |

| Changed | |
|---|---|
| `.../watchers/WatchersWorkspace.tsx` | two columns, tabs, connect UI, row actions |
| `lib/email.ts` | Gmail API first, SMTP fallback, async `hasEmail` |
| `lib/telegram.ts` | token from Supabase, async `hasTelegram`, `verifyBotToken` |
| `lib/watchers.ts` | `announce()` reports what it sent |
| `lib/integration-tokens.ts` | `telegram` provider |
| `lib/radar-actions.ts`, `RadarThumbs.tsx`, `api/radar/action` | the `notice` kind |
