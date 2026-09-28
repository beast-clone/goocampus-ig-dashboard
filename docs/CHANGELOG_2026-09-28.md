# Changelog — 28 Sep 2026

Branch **`feat/dashboard-reskin`**, 16 commits, latest `31b27ba`. Pushed to GitHub.

> ## ⚠️ NONE OF THIS IS DEPLOYED
>
> The live site is still on the 25 Sep deploy. Everything below was built and checked
> on **localhost** in Windows Chrome, against the same live Supabase.

---

## ▶ Pick it up on the Mac

```bash
git fetch && git checkout feat/dashboard-reskin && git pull
npm install
npm run dev
```

⚠️ **Don't run `npm run build` while the dev server is running** — they share `.next`
and the build leaves the dev server throwing `Cannot find module './9276.js'` on every
page. If it happens: stop the server, `rm -rf .next`, start again. (Caught myself doing
this three times today. The note was already here. Read it.)

---

## 1. Competitors — a real profile per brand

The tab used to be a grid of cards and nothing else. You asked for something closer to
Content Radar: type a name and get Instagram, YouTube, what people say on Reddit and
Quora, Google reviews — "like a profile that should be completely shown" — plus a way to
compare two of them, with **official logos and names** on the tabs instead of big section
titles, so adding more competitors doesn't break the layout.

Built in three phases.

### Phase 1 — the profile and the tab strip (`b35391c`)

A tab strip above the page: **All**, then one tab per competitor showing their **real
profile picture** and name, truncated, scrolling sideways once there are more than a
handful. Click one and you get that brand alone:

- Their bio, followers, following, total posts, posts/30d, avg likes, avg comments,
  engagement rate against the median of everyone you track
- Their recent posts, clickable
- **YouTube** — subscribers, total views, video count and recent uploads with view
  counts, from `/api/benchmark/youtube-channel`. Public API key, no OAuth. Save the
  channel ID when you track them (a URL or a bare ID both work).

**Facebook is not there on purpose.** Competitor Page data needs *Page Public Content
Access*, which is an App Review submission to Meta. You said leave it and, per your
rule, if the data isn't available it isn't shown rather than displayed empty.

### Phase 2 — what the web says (`579cc8c`)

`/api/benchmark/profile-intel` — mentions grouped by where they are (Reddit, Quora,
MouthShut, ValueMD, YouTube, Web) with a sentiment tag, plus their **Google Maps rating
and reviews**.

Budget is the whole design. Serper is capped at 200 calls a month:

- **One search per competitor**, not one per source — results are grouped by host
  afterwards, which is free, instead of four `site:` queries which are not
- **Cached 24h in Supabase**, so re-opening a profile costs nothing
- Only fetched for the profile **actually on screen**, never for all of them
- At the cap it says so instead of showing an empty panel
- A plain company search returns their own site and directories. Forum threads need a
  query that asks for them, which is a second call — so **"Search forums" is a button**,
  not something every profile view pays for

The competitor's Instagram display name is useless as a search term — "Hello Mentor |
India's #1 Counselling Platform" matches nothing. `searchName()` takes the part before
the first `|`, `–`, `·` or `:`.

### Phase 3 — the read, and Compare (`6149500`)

**The read** — a button on every profile and on Compare. Asks Perplexity what to *do*
about a competitor. Same house rule as the other AI panels: *the reader already sees
every number on screen, so restating them is worth nothing; the entire job is the play
to run.* It gets their captions too, not just their figures, so it can talk about
content. Not loaded until pressed, because it is a paid call; cached 24h keyed on
**rounded** figures, so a follower count ticking up by three doesn't buy a new call.
Rate limited to 10 per 5 minutes.

**Compare** — a tab beside All. One table, us in it as a row rather than a special case,
on followers, posts/30d, avg likes, avg comments and engagement rate, leader of each
column in bold. If you track your own handle it appears **once**, as us, not twice.

Live result, GooCampus vs MOKSH Academy:

| | Followers | Posts/30d | Avg likes | Avg comments | Eng. rate |
|---|---|---|---|---|---|
| GooCampus `us` | **35.5K** | **25** | **47** | **37** | 0.24% |
| MOKSH Academy | 4.9K | 22 | 14 | 5 | **0.39%** |

MOKSH gets nearly double the engagement rate on fewer posts with a seventh of the
audience. That gap is what the read is for — it came back with three concrete plays
(decision-post reels with a named hook, three repeatable series, forced-choice comment
prompts) plus a weekly cadence.

### Two bugs found while testing this

**`Perplexity 400: invalid request body`.** Clipping a caption to 110 characters sliced a
flag emoji in half. The leftover surrogate half makes the JSON body invalid UTF-8 and
Perplexity rejects it. `clip()` drops the stray half. Worth remembering — every
Instagram caption is full of emoji, so any `.slice()` on one is a candidate.

**The model answers in light markdown** (`##`, `-`, `**bold**`) and the panel was
printing the hashes on screen. `AiText` renders those three and leaves the rest as text.

---

## 2. Briefing — it was a worse Content Radar

You looked at it and said it's showing Content Radar. It was.

Two of the four tabs called **the same endpoints Content Radar calls** — "Search trends"
→ `/api/radar/trends`, "What's said" → `/api/radar/search` — with fewer sources, and a
footnote telling you to go to Content Radar to change the keywords. Content Radar does it
with eight sources and 38 headlines; Briefing did it with eight chips.

When you asked me to declutter this page (`9cf2aee`) I put things behind tabs instead of
asking whether they belonged on it. A duplicate behind a tab is still a duplicate.

**Now** (`31b27ba`): two tabs, **Competitors** and **Their posts** — the two things only
this page does. 738 lines to 376. Trends and mentions stay in Content Radar.

Three more fixes on this page:

- **The scoreboard follows what you track** (`c92803c`, `fdbbe46`). You added GooCampus
  and MOKSH and still saw Academically and Hello Mentor. It read a hardcoded list. It
  reads your tracked competitors now — and it does **not** wait on `sql/029`, because the
  page runs in the browser and the competitors were already in the browser.
- **The cards open the full profile** (`1bf84e4`). The scoreboard was a dead end: seven
  numbers and nowhere to go. Each card now links to
  `/benchmark?profile=<handle>`, which opens that brand with its tab selected.
- **Our own posts were being shown as competitor content.** The header says *"everything
  here is about them, not us"* and then listed ten GooCampus posts, because `@goocampus`
  is in the tracked list. Filtered out here; it stays on the Competitors tab, where being
  next to them is the point.
- **`PostModal` was mounted inside the `"mentions"` branch**, so clicking a post card on
  any other tab did nothing at all. Lifted to the top level.

---

## 3. Navigation

- **Content calendar is its own tab** (`6c9756d`), out of My Workspace.
- **Automations moved under System** (`f2620a6`). ⚠️ **System is admin-only** — Manya,
  Nandu, Nikhil and Praveen have lost Automations from their sidebar. Say if that is
  wrong and I'll move it or widen the group.

---

## 4. Comment queue

- **Comment brief field grows as you type**, the dark panel is readable, and tracked
  competitors survive a reload (`6edf8f5`).
- **Content Radar's interest filter was unreachable** (`30ce209`) — `interestChips` was
  computed and never rendered. The filter existed and there was no way to click it.
- **Collaborators can be added and removed** from a task on the Master sheet (`f905c89`).
- **Task content keeps its line breaks** (`0e068c1`) — they were being thrown away.
- **Content Studio asks for the status** before the task goes on the board (`5a5b0a9`).

---

## 5. One thing I broke and repaired

An earlier Briefing commit of mine wrote `CompetitorBriefing.tsx` with **CRLF in the git
blob** and 52 lines ending `\r\r\n`. On the Mac that would have shown as stray `^M`
everywhere. Restored to LF like the rest of the repo.

That is most of the diff on `31b27ba` — **`git diff -w` shows the real change**: 392
lines out, 25 in.

If you see a whole-file diff on a `.tsx` again, this is why: the repo is `autocrlf=true`,
so an edit script that writes CRLF into a file git will convert again produces `\r\r\n`.
One conversion point per script.

---

## ⚠️ Still open

1. **Samvaya YouTube channel ID** — the last unanswered comment (`6083f375`). Needs you.
2. **`sql/029_competitors.sql` has not been run.** Not blocking anything: tracked
   competitors work from browser storage. The table only adds sharing them across people
   and devices. Run it in the Supabase SQL editor when you want that.
3. **Automations is admin-only** — see §3. Confirm or I'll change it.
4. **Facebook competitor data** needs *Page Public Content Access* from Meta App Review.
   Parked at your call.

---

## Files

| New | |
|---|---|
| `app/api/benchmark/profile-ai/route.ts` | the read (Perplexity, cached 24h, rate limited) |
| `app/api/benchmark/profile-intel/route.ts` | mentions by lane + Google reviews (Serper, budget capped) |
| `app/api/benchmark/youtube-channel/route.ts` | one named channel, public API key |
| `app/api/benchmark/tracked/route.ts` | tracked competitors as rows |
| `sql/029_competitors.sql` | **not run** — see above |
| `components/AutoTextarea.tsx` | extracted from the Scheduler |
| `lib/statuses.ts` | one list of task statuses |

| Changed | |
|---|---|
| `.../preview/benchmark/page.tsx` | tab strip, profile, YouTube, intel, the read, Compare, `?profile=` |
| `.../preview/briefing/CompetitorBriefing.tsx` | two tabs, us excluded, cards link out, dead code gone |
| `.../preview/PreviewSidebar.tsx` | Content calendar top-level, Automations under System |
| `lib/google-reviews.ts` | `findPlace`/`getReviews` take a query so a competitor can be looked up |
