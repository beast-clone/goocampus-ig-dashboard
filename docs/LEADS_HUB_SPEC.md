# Leads Hub — build spec

**Status:** mockup done, not built. Build from this spec + the mockup.
**Mockup:** `public/mockups/leads-hub.html` (open in a browser, or dev server → `/mockups/leads-hub.html`). Interactive: switch sub-tabs, tick leads → transfer drawer.
**Proposed route:** `app/(dashboard)/dashboard/hope-preview/leads-hub/page.tsx` (Hope UI, `.hope-scope`). Add a sidebar item "Leads Hub" under the Sales group in `HopeSidebar.tsx`.

## Goal
A Sales-side hub over the Airtable **Sales Hub** CRM that solves three real needs:
1. **Volume** — how many leads came in (today / yesterday / week / month), broken down **by primary interest** and **by counsellor**.
2. **Transfer** — bulk-reassign leads off one counsellor onto others (the trigger: a counsellor was on leave a week, 111 leads piled up unassigned-in-practice; needed to pull them back and redistribute fast).
3. **Tracking** — a personal watchlist of specific leads whose status + "contacted?" refreshes daily from Airtable, so you don't have to open Airtable to check.

## Data sources — Airtable Sales Hub (base `appersdbBcpxhadnD`)
Reuse the existing **read-only** client `lib/sales-hub.ts` (`airtableList`, `SALES_HUB_BASE`, helpers). It has a hard **NO-WRITES** rule — see the Transfer note below.

- **CRM** `tblTvEGviLA4tEjic` — the lead records. Fields:
  - `Lead Status` (singleSelect, `fldZy5qwzxSX2ctlj`) — 20 options incl. New, Re-Enquiry, Attempted to contact, Initial discussions, Hot lead, Closed won, Junk lead… (used for status chips + Tracking status).
  - `Counsellor` (singleCollaborator, `fld4J0OfBE4A2J94T`) and `Claimed Counsellor` (`fldnklOl1c7OUh0iE`) — who owns the lead (Transfer + "by counsellor").
  - `Primary Interest (n8n)` (singleSelect, `fldodaIfLGS0Ts3pv`) — for the by-interest breakdown. (There's also a linked `Primary Interest (remove)` — prefer the n8n single-select.)
  - `Created Date` (createdTime, `fldtmzhZeFBewcmxS`) — for the volume date buckets. Use `dateRangeFormula()` from sales-hub.ts.
  - `Call Attempts` (rating, `fldVbgx9J4gH8L4Pl`) + `Actual Last Modified` (`fldwZBiANCPcMMDRx`) — candidate signals for "Contacted?" (see Q4).
  - `Full Name`, `Raw 10-Digit Number`, `Mobile Number`, `Link to Record` (`fldpJfIf5ucTvx6ug`).
- **Transfer Ownership** `tblNbJfDXKE4iNrrM` — **already exists** for reassignment. Fields: `Full name` (link to CRM), `Original Counsellor (Manual)`, `New Owner` (singleCollaborator), `Confirm Transfer` (checkbox), `Transfer Notes`, `Status`. The Transfer feature should create rows here (or PATCH the CRM `Counsellor`) — confirm the exact mechanism with the existing n8n transfer automation before writing.
- **Counsellors** `tblhSMVy2sDbEOPqp` — `Name`, `User` (collaborator), `Email`, `Telegram ID`, `Label`. Source of the counsellor picker list + notify channels.
- **Attendance** `tblGjGNBWu4TeHZu9` — `Attendance` (singleSelect), `Assigned User`, `Date`. Candidate source for the "On leave" flag (see Q3).
- **DM Leads** `tbl8CpgnQSYcbFKEH` — DM-sourced leads (already read by the Inbox via `lib/dm-leads-airtable.ts`). Include if DM leads should appear here too.

## Sub-tabs (match the mockup)
### 1. Volume
- Period toggle: Today / Yesterday / This week / This month / Custom (drives `Created Date` range).
- KPI row: count per period + delta vs previous period.
- **By primary interest**: horizontal bars, count per `Primary Interest (n8n)` value, for the selected period.
- **By counsellor**: bars per `Counsellor`; flag anyone on leave in red.

### 2. Transfer
- **Counsellor load strip**: open-lead count per counsellor + Active / On-leave badge.
- **Status filter chips** in a row (All · New · Re-Enquiry · Attempted · Initial · Hot · Junk) + "Assigned to" filter + "Primary interest" filter + search.
- **Leads table** with checkboxes; "Select all N". Columns: Lead · Phone · Primary interest · Status · Assigned to · Created · Last activity.
- **Bulk action bar** → **Transfer drawer**: multi-select counsellor picker (2+ = split the batch round-robin), Notes (saved per lead), notify WhatsApp/Telegram, confirm.

### 3. Tracking
- ⭐ star to add a lead to a watchlist. Table: Lead · Interest · Assigned · Status (Airtable) · Contacted? (Yes/No + when) · Last activity.
- "Last synced 5 AM" + manual "Refresh now". **View-only** — Airtable stays the source of truth.

## Open questions — CONFIRM before building
1. **Placement** — new sidebar item "Leads Hub" under Sales, or a sub-tab inside the existing Sales Hub tab?
2. **Transfer semantics** — reassign (remove from old owner) — yes? And 2+ counsellors = split the batch between them?
3. **"On leave" source** — read from the Attendance table, or set somewhere else?
4. **"Contacted?" derivation** — from `Call Attempts` > 0 / status past "Attempted to contact" / a specific field?
5. **Tracking scope** — personal watchlist (per dashboard user) or shared across the team? Where is the star state stored — Supabase `mh_*` table, or an Airtable checkbox? Refresh: daily 5 AM cron (n8n) + manual, agreed?

## Build notes
- Read paths reuse `lib/sales-hub.ts`. The **Transfer WRITE** is the sensitive part — the Sales Hub base has 30k+ rows and `sales-hub.ts` is deliberately read-only. Route the write through the existing Airtable transfer automation (Transfer Ownership table / n8n) or a new, carefully-scoped PATCH — do NOT bulk-PATCH the CRM without confirming with the user first.
- Persist the Tracking watchlist + any dashboard-only state in Supabase `mh_*` (RLS on, service-role key), not in Airtable, unless Q5 says otherwise.
- Volume counts: prefer server-side Airtable `filterByFormula` date ranges (cache like `/api/posts` does) over pulling all rows.
