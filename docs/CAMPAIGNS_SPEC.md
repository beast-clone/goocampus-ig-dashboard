# Campaigns — offline-event leads from Sheets (spec / not built)

> Captured from a working session on **2026-09-15**. Decisions below are agreed; §5 is not.
> **Status: agreed in principle, NOT built.** Two things are needed before it can be (§6).
> Related: `docs/ASK_GOOCAMPUS_SPEC.md` (same house style — read that one's §2 for the
> "counts come from code, not a model" rule, which applies here too).

---

## 0. The problem

Offline-event leads (Gulbarga, Bijapur and the like) never reach the CRM — they live in a
Google Sheet. Today the team opens the sheet directly, calls from it, and updates it by hand.
Two costs: the dashboard can't see any of it, and sending a lead their details on WhatsApp
means copying the number out and building a campaign to send one message.

The dashboard should be the one place this happens, without taking the sheet away from
people who don't have dashboard access.

---

## 1. Shape

A **Campaigns** tab. *Add campaign* → choose a source → pick the sheet and tab → map its
columns to dashboard fields → import. Leads then live in the dashboard with the team's own
working fields on top of the raw data.

Not a spreadsheet embedded in a page. The sheet supplies raw leads; the dashboard owns the
work done to them.

---

## 2. Data flow — deliberately NOT bidirectional

**In:** raw lead fields from the sheet.
**Out:** only the dashboard-owned columns (status, notes, called-at, owner).

No field is writable from both ends, so there is nothing to conflict over. True two-way sync
on the same cell loses data silently — two people edit, last write wins, nobody is told — and
a lead list is the wrong place to discover that.

People without dashboard logins keep watching the sheet and see live status.

### Row identity — decided
The key column is **chosen at import** from a dropdown of the sheet's own columns, with a
sensible default pre-selected. Nothing is written into the sheet.

Consequences to handle, since this was chosen over stamping an ID:
- **Duplicate keys** must be detected at import and reported, not imported.
- If a key value is later edited in the sheet, that row no longer matches. It is flagged
  **unmatched** and skipped — never written to a best-guess row.

### Status field
In the dashboard: a dropdown — `Confirmed` / `Attending` / `Not attending`.
In the sheet: **plain text in the cell.** No data validation, no dropdown. The dashboard
writes the string, the sheet just holds it.

---

## 3. Reading and writing the sheet

Use a **Google service account**: share the sheet with its email, done. No per-person
consent, no token expiry, no n8n hop, and it keeps working when whoever set it up leaves.
Preferred over extending the existing Google OAuth client (which is tied to one person's
consent and currently carries only YouTube/analytics scopes).

Google sends **no change notifications** for sheet edits. Either an Apps Script `onEdit`
trigger posting to the dashboard, or polling. Polling is simpler and sufficient here —
offline-event sheets are not edited by the second.

---

## 4. WhatsApp — decided

Send **utility** templates, kept short, with a **PDF** carrying the detail. A dedicated
number already exists, and the round-robin workflow (`QM1ypp3ZMt4YFTLr`, Lead Distribution
base) already sends a lead their assigned counsellor on inbound.

Three facts that shape this:

- **Meta classifies templates by content, not by the box you tick.** "Here are our course
  details" can be reclassified as marketing even when submitted as utility. Utility has to be
  tied to something the person actually asked for — which an enquiry is.
- **Inside 24 hours of the lead's last message, no template is needed at all.** Free-form
  text and PDFs both send, with no template fee. For "send the details after the call", if
  they have replied to the first message you are already in that window.
- A number on the Cloud API **cannot also be used in the normal WhatsApp app**. Already
  handled here by having a dedicated number.

The lighter `wa.me` click-to-chat link stays worth having as a per-lead button: it opens
WhatsApp with the message pre-filled and sends from whatever number that device is logged
into. Zero cost, no approval, useful when a counsellor wants to say something bespoke.

---

## 5. NOT yet decided

1. **Column mapping** — cannot be designed without the real sheet's headers.
2. **Who sees Campaigns.** The Team tab's per-section access already covers this: give the
   CEO or a salesperson a login that opens only Campaigns. Cleaner than having them watch a
   spreadsheet, but not yet agreed.
3. **Whether WhatsApp send lives in the dashboard or stays in n8n.** The automation exists;
   duplicating it would be a second thing to keep in sync.

---

## 6. Blocked on

1. **The sheet** — or at least its column headers.
2. **The n8n connector is disconnected** ("connection invalidated, user needs to reconnect"),
   so the existing WhatsApp workflow could not be inspected. Needed before building anything
   that reuses it.

---

## 7. Build order, when unblocked

1. Service account + read a sheet → list tabs, read headers, preview rows. *Verify: real
   headers appear from the real sheet.*
2. Import with column mapping + key column, into a new Supabase table. *Verify: row count
   matches, duplicate keys refused.*
3. The Campaigns tab: lead list, status dropdown, notes. *Verify: live.*
4. Write-back of dashboard-owned columns as plain text. *Verify: the cell changes in the
   sheet and nothing else does.*
5. WhatsApp per lead — `wa.me` first, since it needs nothing; template send after.

### Non-negotiables (CLAUDE.md)
Dashboard theme tokens. No dummy data. Reuse what exists rather than a second path. Verified
live in the user's Chrome before it is called done.
