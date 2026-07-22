# GooCampus Marketing OS — Demo Script & Q&A

**Use this as your cheat-sheet.** For each tab: *what to say* · *what to click* · *the value* · *questions they'll ask + how to answer.*

> One-line pitch to open with:
> **"Right now our marketing lives across Airtable, WhatsApp, 5 social platforms and a lot of manual chasing. This is one place to *plan* the work, *produce* it, *publish* it, and *measure* it — with the busy-work automated."**

---

## 0. The golden rules for the room

- **Lead with the pain, then the fix.** Every tab solves a real headache ("who's overloaded?", "did that reel go out?", "what are people saying about us?").
- **Don't over-claim.** If something is still demo/mock data, say "this view is wired, the numbers here are sample data until we point it at the live account." Honesty beats getting caught.
- **When challenged, agree first, then reframe.** "Good question — yes, and here's why it's built this way…"
- **Keep control of the click path.** Follow the order below; don't free-roam into half-finished tabs.

---

## 1. Overview (the landing snapshot)

- **Say:** "This is the morning glance — where does the whole operation stand today."
- **Show:** The top counters and any at-a-glance cards.
- **Value:** A manager sees the state of play in 5 seconds without opening five tools.
- **Q&A:**
  - *"Is this real-time?"* → "It reads from the same live database every other tab writes to, so yes — when a task moves or a post publishes, this reflects it."

---

## 2. My Day  ⭐ (the centrepiece — spend the most time here)

This is the star. Walk the **whole life of one task**.

- **Say:** "Every person opens *their* day here. It's their to-do list, their timeline, and their timer — all driven by the real content pipeline, not a separate list they have to maintain."
- **Show, in this order:**
  1. **Switch people** (Manya → Praveen → Nandu). "Same cockpit, personalised. Manya's a content writer, Praveen's design, Nandu and Nikhil are video."
  2. **Today's plan timeline.** "Their tasks laid out across the workday around a protected lunch. The red line is the current time — it shows what they're on *right now*."
  3. **Shifts.** "Nandu works the late shift, so his day starts at 10 and runs to 7. Others are 9 to 6."
  4. **Create a task** (as Manya) → **approve it** → the **hand-over gate** pops up showing the producer's day. "When Manya approves design work it auto-routes to Praveen — but only if he has room. If he's full, it goes to his **pipeline**, it doesn't get dumped on him."
  5. **Switch to Praveen → Pipeline → Accept.** "He decides when to take it. On accept it joins his board."
  6. **High-priority = red, everywhere.** "Urgent work turns red — a red block on the timeline *and* a red '⚡ High' row at the top of My tasks — so it's unmissable. It slots itself to the front on its own; it won't interrupt whatever's already in progress."
  7. **The timer.** "When he starts, a timer runs against the estimate. Near the end it asks: done, or need more time? He can extend (logged) or mark it Output-ready, which closes it and pushes it to the Scheduler."
- **Value:** "Nothing falls through the cracks, nobody gets silently overloaded, and I can see exactly who's doing what without asking."

### 🔑 How the day auto-prioritises (no buttons)

**Priority is automatic — there's no Auto-plan button.** An urgent (High-priority) task **drops into the day on its own the moment it's accepted**: it jumps ahead of normal work and turns red, but **never interrupts the task someone's actively working on** — it slots in right after the current one.

- *"How do you make sure urgent work gets done first?"*
  → **"It's automatic — the moment an urgent task is accepted it moves to the front of the day and turns red. The only thing it won't do is yank someone off what they're mid-way through; it queues right behind the current task."**

- *"Show me."*
  → *(Switch to Praveen → Pipeline → accept the queued urgent task; it appears red at the top of his day instantly, no button.)*

- *"Is it AI?"*
  → **"It's a clear, predictable rule — priority first, then earliest deadline. Predictable is what people trust in a scheduler. We can layer AI on later to factor in effort and energy."**

---

## 3. Team Capacity (open from My Day → 👥)

- **Say:** "Manya's view of the whole team — who's slammed, who's free, without a stand-up."
- **Show:**
  - **Today:** each person's day as a timeline, a "committed vs free" badge, and *what they're on now*.
  - **Week:** flip to **Week** — "Monday to Friday, each day's load per person, and **today is flagged**. This is how we spot 'Thursday is overloaded' *before* it becomes a fire."
- **Value:** "Load-balancing becomes a glance instead of a guess."
- **Q&A:**
  - *"How does it know each day's load?"* → "It buckets each approved task onto a day by its deadline; anything overdue or undated shows on today, because it needs doing now."

---

## 4. Marketing Hub (the content engine)

Four sub-tabs. Frame it: **"This is the Airtable everyone already knows, but smarter."**

- **Master sheet:** "The full content database — every post, its status, owner, brand, dates — editable inline. Same model as our Airtable, so nobody has to relearn anything."
- **Workload:** "The same team-capacity picture, data-backed — each teammate's day with the live now-line and what they're on." *(This is where the red line lives on the marketing side.)*
- **Pipeline:** "The production flow — what's pending, in progress, in review, ready. You see bottlenecks instantly."
- **Content Calendar:** "The forward view — what's scheduled to go out and when, per brand."
- **Q&A:**
  - *"Does this replace Airtable?"* → "It reads/writes the same data model, so it *can* — but we can also keep Airtable in sync during the transition. No big-bang migration."
  - *"Can they edit here?"* → "Yes, inline — with permissions, so only the right people change the right fields."

---

## 5. Content Radar (social listening)

- **Say:** "What is the internet saying about us — Reddit, Quora, review sites, news — without me manually googling."
- **Show:** The mention lanes (Reddit / Quora / MouthShut / ValueMD) + Google News, opening a mention **inside the dashboard**.
- **Value:** "We catch a bad review or a hot thread early, and we find where our audience actually asks questions."
- **Q&A:**
  - *"Is this live?"* → "It runs on a search API with a monthly cap and caching so it's cheap. Reddit/Quora are login-walled so we show the snippet inline; review sites we read in full."
  - *"How current?"* → "Cached for a few hours to save credits — refreshable on demand."

---

## 6. Publishing: Publishing Calendar · Scheduler · Post Planner

- **Say:** "Once content's ready, it schedules and publishes itself to the channels."
- **Show:** the calendar of upcoming posts / the scheduler.
- **Value:** "No more someone manually posting at 7pm. It goes out at the exact time, to Instagram, Facebook, LinkedIn, YouTube."
- **Q&A:**
  - *"Which platforms actually auto-publish today?"* → **Be precise:** "Instagram and Facebook (image, carousel, reel) and YouTube are proven via the official APIs. LinkedIn is pending platform approval. We never needed a risky App Review — it uses a System User token."
  - *"What if a post fails?"* → "Diagnostics catches it and can retry — see the next tab."

---

## 7. Content Review

- **Say:** "The approval gate before anything publishes — creative + copy reviewed in one place."
- **Value:** "Quality control without a WhatsApp thread of screenshots."

---

## 8. Analytics — Instagram · LinkedIn · YouTube · Facebook · Website · All platforms

Treat these as **one story, shown on one or two channels** (don't click all six).

- **Say:** "Per-channel performance, plus an *All platforms* roll-up, plus AI that tells us *what to do*, not just what happened."
- **Show:** one strong channel (e.g. YouTube or Website) — the metrics + the **AI insights** panel.
- **Value:** "The AI reads the numbers and gives next actions — 'post X more, shift budget to Y' — instead of me staring at charts."
- **Be precise on what's live** (say this if asked):
  - **YouTube:** live for all three channels (GooCampus, 12thplus, Study Abroad).
  - **LinkedIn:** live for GooCampus World.
  - **Website:** live (GA4 + Clarity + Bing) with AI insights.
  - **Instagram / Facebook / main GooCampus LinkedIn:** wired, some still on sample data until we finish connecting the account — **say that plainly** if numbers look placeholder.
- **Q&A:**
  - *"Are these numbers real?"* → "Where I said live, yes, pulled from the platform APIs and cached. Where it's sample, it's the exact layout waiting on the account connection — a config step, not a rebuild."
  - *"How fresh?"* → "Server-cached ~10–30 min so we don't hammer the APIs or hit rate limits."

---

## 9. Ads · Competitor Ads

- **Say:** "Our ad performance, and a window into what competitors are running."
- **Q&A:**
  - *"Meta has an official Ads MCP now — should we use it?"* → **"We looked at it. It's an AI-access layer, not new data — everything it exposes we already get from the Marketing API we use. No data gain for a dashboard. The real win is pointing our AI at the ads data for recommendations, which we can add."** *(You have the full report in the repo: META-ADS-MCP-REPORT.md.)*

---

## 10. Diagnostics (the trust-builder)

- **Say:** "The dashboard checks its own health every morning and fixes what it can."
- **Show:** the health run — integrations status, host metrics (RAM, uptime, latency), and the auto-repair / reconnect controls.
- **Value:** "If a token expires or a post fails, it retries or flags it — and I can reconnect a service *without redeploying the site*."
- **Q&A:**
  - *"What happens when a token expires?"* → "It's caught here; reconnect is a button, backed by a token table — no developer, no redeploy."

---

## 11. Team (permissions)

- **Say:** "Who can do what, and who sees what."
- **Show:** the per-person capability checkboxes + tab access, and the role presets (Producer / Manager / Viewer).
- **Value:** "A video editor can *create* tasks but not edit someone else's; only Manya edits existing tasks. It matches how we actually work."
- **Q&A:**
  - *"Can juniors mess things up?"* → "No — permissions gate every sensitive action, and it's enforced server-side, not just hidden in the UI."

---

## Cross-cutting questions (any tab)

- *"Is our data safe?"* → "Row-level security is on across the database; the app talks to it through a service key that never reaches the browser."
- *"What if the internet/API is down?"* → "Everything's cached, and Diagnostics flags outages with retries — the dashboard degrades gracefully, it doesn't just break."
- *"How much does this cost to run?"* → "Cheap — we cache aggressively and cap the paid APIs. The expensive part (manual coordination) is what we're removing."
- *"Is this replacing people?"* → "No — it's removing the busy-work (chasing, posting, copying between tools) so the team spends time on the actual creative and strategy."
- *"When can we use it for real?"* → "The workflow is live on real data today; the remaining pieces are *account connections and approvals* (LinkedIn, a couple of analytics feeds), not new building."

---

## If you get a question you can't answer

**"Great question — let me confirm the exact number/status after this rather than guess."** Never invent a figure on the spot. It's the one thing that loses a room.
