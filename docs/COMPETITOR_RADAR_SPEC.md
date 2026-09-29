# Competitor Radar — plan

*Written 29 Sep 2026 · status: **plan, not built yet** · branch `feat/dashboard-reskin`*

## What it's for

Know what our competitors are doing **as soon as they do it**, without anyone having to go and look:
a new blog, a webinar or event announced on their website, a new Instagram post or YouTube video,
news or Reddit chatter about them — all in one place, with a notification the moment we spot it.

Two screens, two jobs:

| Screen | Job | Depth |
|---|---|---|
| **Briefing** (My Workspace) | "What did competitors do since I last looked?" | **One line per competitor** — their latest move |
| **Competitor Radar** (today's "Competitors" page, renamed) | Everything, in detail | Live timeline + a full profile per competitor |

---

## What's there today (28 Sep, built on the Windows machine)

- **Briefing** became a "Competitor radar": scoreboard, top competitor posts, latest Instagram posts and YouTube uploads.
- **Competitors page**: a profile per competitor (Instagram + YouTube), "what people say" (Google, Reddit, reviews), an AI read, side-by-side compare.

### Problems to fix first

1. **Hello Mentor and Academically are hard-coded** (`competitors.json`, `competitor-youtube.json`). The dashboard falls back to them whenever the list is empty — which is why they keep coming back.
2. **The competitor list only lives in each person's browser.** The table meant to store it (`sql/029_competitors.sql`) was never created in Supabase. Each person sees a different list; clearing the browser loses it.
3. **Remove** exists only as a small ✕ on cards in the "Tracked" view — not on the profile, not in Briefing.
4. Two bugs that would bite once the table exists:
   - Saving uses a uniqueness rule the database can't match → saves would fail silently.
   - Removing matches handles loosely (`_` acts as a wildcard) → could remove the wrong competitor.
5. **Nothing watches competitor websites**, and nothing sends notifications about competitors.

---

## The plan

### Step 1 — A real, shared competitor list

- Create the competitor table in Supabase (fixed version of `sql/029`), shared by the whole team.
- **Remove all hard-coded competitors.** An empty list shows "Add your first competitor", never a default pair.
- Each competitor has: **name**, **Instagram handle**, **YouTube channel**, **website address**, brand/SBU, notes.
- **Remove** button on every card, on the profile, and in a **Manage competitors** list (with "are you sure?").
- Whatever is currently in your browser's list gets moved into the table once — only deleted from the browser after the save is confirmed.

### Step 2 — The watcher (runs every 5 minutes)

A background check that looks at each competitor and records anything new:

| Source | How we spot something new | How often |
|---|---|---|
| **Website — blogs** | Their sitemap (every site publishes one) gains a new page. *Tested: Hello Mentor lists 251 blog posts this way.* | every 5 min |
| **Website — events / webinars** | Their events / webinar page (e.g. Hello Mentor's `/webinar`) shows an item we haven't seen | every 5 min |
| **Website — big changes** | Their home page changes noticeably (new banner, new course, new offer) | every 30 min |
| **Instagram** | A new post. Captions mentioning *webinar, live, event, register, seminar* are tagged as **events** | every 15–30 min (Instagram limits how often we can ask) |
| **YouTube** | A new upload (YouTube's free channel feed — no quota used) | every 5 min |
| **Google News** | A new news article naming them (free feed) | every 15 min |
| **Reddit** | A new thread mentioning them (via Google search — counts against the Serper budget) | a few times a day |
| **Facebook** | Only their **ads** (Meta Ad Library — already in the dashboard). Normal Facebook posts are **not available**: Meta doesn't give our app that access. | daily |

Everything found is stored as an **event**: who, what kind (blog / event / webinar / post / video / news / Reddit / site change), title, link, when we spotted it.

**Honest timing:** websites don't announce changes to anyone, so we have to check. Checking every 5 minutes is as fast as is safe (faster risks their site blocking us). So a new blog or webinar reaches the dashboard **within about 5 minutes** of going live — not literally seconds.

**Where it runs:** on the n8n server (always on) calling the dashboard every 5 minutes. It only runs automatically **once deployed**; before that I'll trigger it by hand to show it working.

**Being polite to their sites:** one request per page per check, a normal browser identity, and we respect their `robots.txt`.

### Step 3 — Notifications

- Every new event pops up in the **bell** (a new **Competitors** tab in Notifications), within ~30 seconds of being spotted.
- **Events and webinars** are marked as important (they're usually time-sensitive). Ordinary posts go to the bell quietly, without a pop-up — otherwise 10 competitors × several posts a day becomes noise.
- Who receives them: *see open question 2*.

### Step 4 — Briefing: one line per competitor

```
Hello Mentor        New webinar: "…"                               12 min ago  →
Academically        New blog: "…"                                   3 h ago    →
Moksh Academy       Instagram post · 4.2K likes                     yesterday  →
```

Click a line → that competitor's page in Competitor Radar.

### Step 5 — Competitor Radar: the full detail

- **Live timeline** — everything every competitor did, newest first, filterable by competitor and by kind (blogs, events, posts, videos, news, Reddit).
- **Upcoming events** strip — webinars / events they've announced, with dates when we can read them.
- **Per-competitor profile** (what exists today, kept): Instagram stats and posts, YouTube, what people say, AI read, compare.
- **Manage competitors** — add, edit website / handles, remove.

---

## Order of work

1. Shared list + remove + no hard-coding (Step 1) — small, fixes today's annoyances.
2. Watcher for websites, YouTube, Google News (Step 2) — the new part.
3. Notifications (Step 3).
4. Instagram events + Reddit (rest of Step 2).
5. Briefing one-liners + Radar timeline (Steps 4–5).

Each step is pushed to GitHub and shown on your Mac's localhost before the next. Nothing goes live until you say **deploy**.

---

## Open questions (need your answers before Step 2)

1. **Which competitors**, and their **real website addresses**? (Instagram handles aren't websites — "academically.global" is a handle; that web address doesn't exist.)
2. **Who gets the pop-ups** — the whole team, or only some people (e.g. you and Maheen)?
3. **Budget:** Reddit and some Google checks use the Serper allowance (1,500 searches/month is set for launch). OK to spend part of it on competitors?
