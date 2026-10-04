# Stop zone (00:00–06:00 IST) — classifying the 51 jobs that still run overnight

**4 October 2026.** The stop zone was applied to the `GC Dashboard —` workflows only.
Of 71 active scheduled n8n workflows, **51 still fire between midnight and 6am** —
about **3,280 executions a night, ~98,400 a month**.

This classifies all 51 by what they would actually lose if they stopped overnight.
Nothing here has been changed yet.

## The test applied

Not "does it sound urgent" but **does the source buffer?**

A job that polls Google Sheets or Airtable for new rows loses nothing by sleeping:
the rows sit there and the 06:00 run collects everything that arrived. A job only
needs to stay awake if its source forgets, or if a human is genuinely waiting on it
between midnight and six — and nobody here works those hours, which is the whole
point of the stop zone.

---

## A. Safe to window — 40 jobs

Poll a buffered source (Sheets/Airtable/Fillout), write to another store, message
nobody. The 06:00 run catches up every row that arrived overnight. **Nothing is lost
and nothing is delayed that anyone was waiting on.**

| Job | Cadence now |
| --- | --- |
| 12th Plus — Trivandrum office walk in | every 1h |
| 12th Plus — Bangalore office walk in | every 1h |
| 12th Plus — Jaipur office walk-in | every 1h |
| 12th Plus — Mumbai office walk-in | every 1h |
| 12th Plus — Vadodara office walk-in | every 1h |
| 12th Plus — Vijayawada office walk-in | every 1h |
| 12th Plus Lead Ads July 2026 | every 1h |
| ALS AD Leads June 2026 | every 1h |
| Apollo Fellowship Programme | every 1h |
| Australia AMC May 2026 Batch | every 1h |
| Australia-PGCP | every 1h |
| Australia-PGCP Open Leads April 2026 | every 1h |
| Australia-PGCP UAE Leads April 2026 | every 1h |
| Australia-PGCP-Revised | every 1h |
| DM Bookings → CRM | every 45 min |
| DM Bookings → Inbound Leads | every 1h |
| DM Upload Leads → CRM | **every 1 min** |
| Engineering and Architecture — India | every 1h |
| GC Consulting → Dec 2025 | every 1h |
| IMT Programme v1.0 — CRM | every 1h |
| IMT Sheets → Upload Leads | every 15 min |
| KL — Nursing and Physiotherapy UG | every 1h |
| Manychat Leads → Inbound Leads | every 1h |
| MBBS UG Ads April 2026 | every 1h |
| Meta Ads → CRM | every 15 min |
| MTE 2026 → Sales Sheet (filtered mirror) | every 15 min |
| MTE 2026 Vadodara — Fillout → Sheet | every 2 min |
| Non-DM Bookings → Inbound Leads | every 1h |
| Non-DM Bookings → Sales Hub | every 45 min |
| NRI Admissions — 12thplus.com | every 1h |
| Offline Event — Ameen Medical College NEET PG | every 1h |
| Samvaya Meta AD Leads June 2026 | every 1h |
| Sheets → USMLE Lead Ads (Aug 2026) | every 1h |
| Study Abroad → Al-Ameen Medical College, Bijapur | every 1h |
| Study Abroad → CRM 2026 | every 1h |
| Study Abroad Enquiry | every 1h |
| Transfer Ownership on CRM | every 20 min |
| Undergraduate Ads Study Abroad MBBS Ads | every 1h |
| University Programs Masters v1.0 | **every 1 min** |
| Uploads Leads → Sales Hub | every 30 min |

---

## B. Window — and the 06:00 run IS the catch-up — 9 jobs

These message a human. None of those humans is awake. Two of them message
**students**, where sending overnight is not neutral but actively worse: a
registration-link WhatsApp at 02:17 looks like spam and wakes someone up.

| Job | Cadence now | Who it messages | Note |
| --- | --- | --- | --- |
| ALS Leads — WhatsApp (Lead + Counsellor Alert) | **every 1 min** | student + counsellor | WhatsApp at 2am is worse than at 6am |
| NEET PG Bijapur — WhatsApp Registration Link | **every 1 min** | student | same |
| New Lead → Telegram Alert | **every 1 min** | internal | nobody reads it until morning |
| Post Scheduler — Telegram Notifier (Broadcast Owl) | **every 1 min** | internal | posts only go out 6am–midnight anyway |
| Content Calendar → Post Scheduler Sync V3 | **every 1 min** | Slack | sync job |
| GC Service Request — email service details | every 3 min | email | Fillout buffers submissions |
| Consultation Form (Australia-PGCP) → Inbound Leads | every 1h | email | Sheets buffers |
| BTA Induction Course → Notify Nandu on Slack | every 1h | internal | — |
| KEA UGNEET 2026 Notification Watcher | every 1h | Slack + email | being retired — replaced by `pmDnLrn2zmZ7uMxX` |

---

## C. Checked specifically because they looked like they had to stay — 2 jobs

Both turn out to be safe, but the reasoning is worth keeping.

### IG/FB Publisher — Supabase v2 (every 5 min)

The one job where sleeping could plausibly mean a **missed post**. It does not:

- `Get Due Posts` queries `mh_posts WHERE publish_status = 'scheduled'` with **no time
  filter**. Due-ness is decided afterwards in the Code node. So an overdue post is
  still picked up on the next run — **late, never lost.**
- Checked the data: only 3 posts carry a real `schedule_time`, at **11:00, 13:00 and
  17:00 IST**. Zero have ever been scheduled between midnight and 6am.
- (`publishing_date` is date-only and reads as 05:00 IST because it is stored as UTC
  midnight. It is not a publish time — do not read an overnight schedule into it.)

**Verdict: window it.** A post scheduled overnight would publish at 06:00 instead of
being skipped. Worth telling the team that overnight slots are not real slots.

### Stuck-at-Publishing Watchdog (every 5 min)

Watches for rows stranded mid-publish and pings Telegram. If the publisher is asleep
nothing can newly strand, and a stall from before midnight is caught at 06:00 instead
of 01:00 — into a Telegram nobody is reading either way. **Verdict: window it.**

---

## Result

**All 51 can be windowed to `6-23`.** Two carry a documented "late, not lost" caveat
(section C). Savings: **~3,280 executions a night, ~98,400 a month.**

## Second finding, separate from the stop zone

**Seven jobs run every single minute, around the clock** — 1,440 executions a day
each, ~10,000 a day between them. Four are pure Sheets↔Airtable sync, where a minute
of freshness buys nothing a human can perceive:

`DM Upload Leads → CRM` · `University Programs Masters v1.0` ·
`Content Calendar → Post Scheduler Sync V3` · `Post Scheduler — Telegram Notifier`

Windowing alone cuts these by a quarter. Dropping them to every 5 minutes would cut
what remains by another 80%, and nobody would be able to tell. The two
student-facing WhatsApp jobs (`ALS Leads`, `NEET PG Bijapur`) are the only ones with
a real argument for one-minute response, and only during working hours.
