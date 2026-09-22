# Calendar — spec (agreed 22 Sep 2026)

Source: Manya's three comments (21 Sep) + the user's decisions.

## Asks
1. "No need for 2 separate calendars" — merge the **Publishing Calendar** and the **Content calendar** into one.
2. "3 different publishing calendars — main channel, mentorship, 12thplus — right now everything looks mixed up."
3. "Add a plus mark for each date, like the Airtable content calendar, to create the task there by selecting the SBU and format."

## Decisions (revised 22 Sep, after the first build)
- **Two calendars, two jobs** (user): the **Publishing Calendar** (Social Media) stays its own page —
  scheduled + live posts, plus the AI planner. The **Content calendar** (My Workspace,
  `/dashboard/preview/marketing-hub?tab=calendar`) is the writers' calendar: every task on its
  publishing date. Manya's "merge" was about the content calendar being clear, not about losing
  the publishing view. (The first build redirected one to the other — undone.)
- **Account dropdown** on the Content calendar, named by the real Instagram accounts, worked out
  from the SBU (no new field):
  - `@goocampus · Main` — every SBU not below
  - `@goocampusworld · Mentorship` — SBUs `Mentorship Platform`, `10K Mentorship`
  - `@12thplusdotcom · 12th Plus` — SBU `12thPlus.com`
- **SBU dropdown** beside it (with counts), replacing the scrolling brand chips.
- **No live Instagram posts** on the Content calendar — they belong on the Publishing Calendar.
  (Tried: published tasks rarely store their Instagram link, so live posts couldn't be matched to
  tasks and crowded the grid.)
- **+ on each date** (on hover, top-right of the day): New task with the **publishing date filled in**;
  SBU pre-set to the chosen SBU (or `12thPlus.com` on the @12thplusdotcom account). Title + SBU
  required, format (type) optional — same form and rules as "+ New task". Only people with the
  **Create tasks** permission (or admins) see the +.
- "+N more" on a busy day opens that day.
