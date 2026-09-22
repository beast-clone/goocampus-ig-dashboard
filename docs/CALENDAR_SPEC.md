# Calendar — spec (agreed 22 Sep 2026)

Source: Manya's three comments (21 Sep) + the user's decisions.

## Asks
1. "No need for 2 separate calendars" — merge the **Publishing Calendar** and the **Content calendar** into one.
2. "3 different publishing calendars — main channel, mentorship, 12thplus — right now everything looks mixed up."
3. "Add a plus mark for each date, like the Airtable content calendar, to create the task there by selecting the SBU and format."

## Decisions
- **One calendar** = the Marketing Hub content calendar (`/dashboard/preview/marketing-hub?tab=calendar`,
  `CalendarView` in `MarketingHub.tsx`). It already shows every task (all statuses) on its
  publishing date, with Month / Week / Day / List, drag-to-reschedule and the task popup.
  - Sidebar: **both links stay** — "Content calendar" (My Workspace) and "Publishing Calendar"
    (Social Media) open the same calendar. The old Publishing Calendar page redirects there;
    its **AI planner** stays reachable (`/dashboard/preview/calendar?tab=planner`, linked from the calendar).
- **Channel dropdown**: All · Main channel · Mentorship · 12th Plus — **by SBU** (no new field):
  - 12th Plus = SBU `12thPlus.com`
  - Mentorship = SBUs `Mentorship Platform`, `10K Mentorship`
  - Main channel = every other SBU
- **Live on Instagram** (agreed as "posted outside"): live posts from the three accounts (GooCampus
  Main, GooCampus World, 12Plus / GC India), grey + dashed, with a checkbox to hide them.
  Found while building: published tasks almost never store their Instagram link (only 1 of 50 —
  publishing happens via Airtable/n8n/by hand), so we can't tell which live post is which task.
  They're therefore labelled "Live on Instagram", not "posted outside"; a post whose link
  matches a task's Instagram URL is still not shown twice. Channel: @12thplusdotcom → 12th
  Plus; the others → Main channel. Clicking opens the post on Instagram.
- **+ on each date** (on hover): opens the New task form with the **publishing date filled in**, and
  the SBU pre-set to `12thPlus.com` when the 12th Plus channel is selected. Title + SBU required,
  format (type) optional — same form and rules as "+ New task". Only people with the
  **Create tasks** permission (or admins) see the +.

## Not in scope (for now)
- The old Publishing Calendar's "By format" view and Instagram insights in its popup.
- Moving Mentorship onto its own Instagram account (there isn't one).
