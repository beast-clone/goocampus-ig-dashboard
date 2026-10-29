# Attendance tab — spec

Agreed with Praveen, 29 Oct 2026. Approved prototype: `docs/attendance-prototype/v11.html`
(sample PDFs in `docs/attendance-prototype/v11-sample-pdfs/`).

## What it is
Attendance only — no tasks. Admin-only tab at `/dashboard/preview/attendance`, Hope UI theme,
plain white cards, no tinted boxes.

## Definitions
- **Arrived** = the first dashboard page the person opens that day (IST). Sign-in also counts.
- **Left** = when they press **End day** in My Day. If they never press it, their **last activity**:
  every open dashboard tab sends a heartbeat every 5 minutes *while the tab is visible and they
  have moved the mouse / typed in the last 5 minutes*. An idle tab left open overnight does not
  keep them "working".
- **Hours** = arrived → left, minus the part of the 1–2 PM lunch hour that falls inside it.
- **Working now** (today only) = no End day and last activity within the last 15 minutes.
- Identity always comes from the session — an admin previewing a teammate never stamps them.

## Recording
Recording starts **29 Oct 2026**. No backfill: days before that show as "not recorded",
never as absent. Weekends are not working days.

Storage: `mh_attendance` (one row per person per day) — `login_min/login_at` (arrived),
`logout_min/logout_at` (End day). Minutes are from 9 AM IST. **Last activity = the row's
`updated_at`**: each heartbeat re-saves the row, and only attendance writes touch it, so no
new column (a schema change on the live DB was not approved).

## Views
Day / Week (Mon–Fri) / Month / Custom date range.
- Summary cards on top.
- Week / Month / Custom: a line graph of ONE person's hours per working day (name pills to switch,
  their total on top, hover a day for hours + arrived–left). Today joins the line once it's over.
- One table per view. Clicking a person opens their details right under their row: in Week /
  Month / Custom a plain list of their working days (date | arrived | left | hours, or "Absent").
- "Change date" is a visible date box; clicking it opens the picker (`showPicker()`).

## Report
**Download report (PDF)** opens a preview of the actual PDF (pages drawn with pdf.js — the CSP
blocks `blob:` iframes), with a Download PDF button. Built with jsPDF, real text:
- Page 1: summary cards, thin brand-blue bars of hours per person (full bar = target,
  8h × working days), and a table.
- Week / Month / Custom: then one page per person — their graph and their day list.
