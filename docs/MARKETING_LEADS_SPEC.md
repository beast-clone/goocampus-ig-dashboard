# Marketing Leads — spec

**Approved: prototype v3** (`docs/marketing-leads-prototype/v3.html`, 29 Oct 2026) — v2's
Scheduler-style layout, made roomy for a big screen. Built in
`app/(dashboard)/dashboard/preview/leads/page.tsx`; rules in `lib/lead-brand.ts`; saved matches via
`app/api/leads/brand-matches/route.ts`. (v1 = single table, v2 = compact three columns.)

Defaults used because the open questions below weren't answered yet — all changeable from the page:
- United Arab Emirates → Middle East (built-in default; a saved match overrides it).
- Every other unmatched interest stays in **No brand yet**; an admin matches it with one pick.
- Samvaya and Meta ad spend aren't CRM leads, so they're kept as two items under **More** in the
  left list, showing their existing views (from the daily `/api/leads/social` snapshot).
- Saving a match is admin-only (it moves leads in everyone's report), like adding a brand.

## Problem with today's page
- Tabs mix two different things: **DM Leads** and **Meta Ads Leads** are channels; **Samvaya** is a brand.
- No brand split. A new brand added in Marketing Hub never appears here.
- It shows only DM leads. Last 30 days the CRM had 260 marketing leads; the page showed 96.

## Proposed model
**One list of every marketing lead, grouped by brand automatically; channel is a filter.**

### Leads
All CRM leads created in the range (same source as Sales Hub: `/api/leads-crm/counsellor?name=all`).

### Channel (filter, from `Lead Source (n8n)`)
| Channel | CRM sources |
|---|---|
| Ads & lead forms | Digital marketing activity |
| Instagram / Facebook DMs | Instagram/Facebook DMs, DM Booking |
| YouTube | YouTube |
| Website | Website |
| Bookings | Bookings |
| Other | blank / anything new |

### Brand (automatic, from `Primary Interest`)
Matched against the live brand list (`mh_sbus` via `/api/sbus`, minus the content buckets
"General Content" and "Special Days"):
1. **Saved match** — an admin picked a brand for this interest once (stored in `discover_cache`,
   no migration).
2. **Same name** — ignoring case, punctuation and the word "Program/Programme".
3. **One brand contains the other** — only if exactly one brand fits.
4. Otherwise → **No brand yet**, and the interest is listed under *Interests not matched to a brand*
   with a brand picker.

So a **new brand appears on its own** once leads arrive with a matching interest.

Coverage on 90 days (1,630 leads): 77% match by name. Not matched:
| Interest | Leads | Proposed |
|---|---|---|
| United Arab Emirates | 161 | → Middle East (suggested) |
| IMT Programme | 120 | **? no brand exists** |
| (blank) / Unverified Interest | 76 | No interest — fix in CRM |
| Standard Consulting Program | 9 | **? Australia, UK or USA** |
| USA Integrated Consulting Program | 5 | ? |
| College Predictor | 1 | ? (12thPlus.com?) |
| UK Bundle - 4 | 1 | ? |

### Contacted
Same rule as Sales Hub (`isContacted` in `lib/sales-hub.ts`): a call attempted, a note added, or
status left "New". Hot & interested = Hot lead + Interested statuses.

### Layout (prototype v2 — Scheduler-style, asked for 29 Oct; v1 was a single table)
Period on top: 7d / 30d / 90d / Custom (date boxes open the picker). Then three columns:
1. **Left list** (like Scheduler's Status list): **Brands** — All leads, each brand with leads
   (count + "N not contacted"), "No brand yet"; a quiet line for brands with no leads in the range.
   **Channels** underneath — All channels, Ads & lead forms, DMs, YouTube, Website, Bookings.
   Brand and channel combine; each side's counts follow the other's selection.
2. **Middle**: the selection's leads, newest first — search, All / Not yet / Contacted, each lead
   with a contacted dot, name, date + time (IST), status, counsellor, channel.
3. **Right**: the selection's summary — Leads · Contacted % · Not contacted yet · Hot & interested,
   where they came from (channel bar), follow-up by counsellor; for "No brand yet", the
   interest → brand picker. Clicking a lead shows its details (status, contacted + calls,
   counsellor, brand, interest, CRM source, campaign, days idle, Open in CRM).

Note: YouTube leads mostly arrive with a blank Primary Interest, so they sit in "No brand yet"
until the CRM field is filled.

## Decided (29 Oct 2026)
- **IMT Programme** → its own brand, added to the brand list (`mh_sbus`); its 120 leads (90 days)
  match it by name.
- "Standard Consulting Program" (no country), USA Integrated Consulting Program, College Predictor,
  UK Bundle - 4 → **left in No brand yet** on purpose.
- **YouTube** leads with a blank interest stay in No brand yet — the team fills Primary Interest in
  the CRM; no default brand.

## Still open
- Samvaya kept under **More** for now (its own Airtable base, read-only, as before).
- **Ad spend / cost per lead per brand**: Meta campaigns could be mapped to a brand by the
  interest of their CRM leads, but e.g. "NEET PG Lead Ads_Oct 2026" (141 Meta leads) has no
  leads in the CRM in 90 days — so spend per brand would be partial.
- **Conversions / revenue per brand**: needs the Revenue Tracker to carry the program.
- **Time to first contact**: not shown. Sales Hub's number falls back to the CRM's last-modified
  time, which the automation sets right after creation — 124 of 205 leads read ~0h. Needs the
  Airtable "First Contacted At" field to be real.
