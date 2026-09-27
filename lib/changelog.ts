// What changed in the dashboard, written for the team.
//
// Hand-written on purpose. A changelog generated from commit messages reads like
// engineering notes — it tells you a function was renamed, not that the button you
// press every morning now goes somewhere different. Every entry here says what it is
// now and, where it helps, what it was before, because "what was there and what was
// changed" is the whole point.
//
// Adding a release: put a new object at the TOP of RELEASES. Keep `what` to one
// sentence someone outside this file would understand, and use `before` only when the
// change is confusing without it.

export type ChangeKind = "new" | "fixed" | "changed" | "removed";

export type Change = {
  kind: ChangeKind;
  /** The headline, in the team's language, not the codebase's. */
  what: string;
  /** One or two sentences. Say what it was before if that is what makes it land. */
  detail: string;
  /** Which tab this affects — drives the filter. */
  where: string;
};

export type Release = {
  /** YYYY-MM-DD, the day it reached the live site. */
  date: string;
  title: string;
  summary: string;
  changes: Change[];
};

export const RELEASES: Release[] = [
  {
    date: "2026-09-27",
    title: "Connectors, and a clock",
    summary: "Setting Claude up has its own page now, with the steps for the app and the website — not just the terminal.",
    changes: [
      {
        kind: "new",
        what: "Connectors has its own page under System",
        detail: "Claude sits there with step-by-step setup for whichever one you use: the Claude desktop app, claude.ai in a browser, or Claude Code in a terminal. It also spells out what Claude is and isn't allowed to do here, so nobody has to find out by trying.",
        where: "System",
      },
      {
        kind: "changed",
        what: "Connecting Claude moved off My Account",
        detail: "It used to be a box at the bottom of My Account that only ever explained the terminal, which is no use if you use the Claude app. Same key, same button — it's under System → Connectors now.",
        where: "My Account",
      },
      {
        kind: "new",
        what: "The time, in the Overview header",
        detail: "A plain clock next to the notification bell. It has nothing to do with attendance — it isn't recorded and nobody can see it but you.",
        where: "Overview",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Content Studio, rebuilt",
    summary: "Perplexity checks whether it's true, Claude writes it, and it lands on the board with the caption already in it.",
    changes: [
      {
        kind: "fixed",
        what: "“Write this” now actually goes somewhere",
        detail: "It used to send you to the Scheduler, which ignored everything it was handed — the headline, the source and the brief were thrown away on arrival. It now opens Content Studio with all of it attached.",
        where: "Content Radar",
      },
      {
        kind: "new",
        what: "The facts get checked before anyone writes",
        detail: "On a real story this caught a headline saying the NEET PG answer key was live when NBEMS hadn't released it. It runs on its own the moment you arrive, so there's no button to remember.",
        where: "Content Studio",
      },
      {
        kind: "changed",
        what: "Claude writes the copy now, not Perplexity",
        detail: "Same key, same bill — Claude was already available and unused. You can still take the prompt into the Claude app if you'd rather work on it there.",
        where: "Content Studio",
      },
      {
        kind: "new",
        what: "Nothing reaches the board unseen",
        detail: "Before a task is created you see every field — type, brand, owner, date, caption, source, fact-check — and can change any of them. It flags what's blank, like a time-sensitive piece with no publishing date.",
        where: "Content Studio",
      },
      {
        kind: "new",
        what: "Playbooks are connected to writing at last",
        detail: "The angle you pick in Create is a playbook, and its framework goes into the prompt. Before this the library was fifty documents you could read and nothing that read them.",
        where: "Content Studio",
      },
      {
        kind: "removed",
        what: "The trending strip and the research box",
        detail: "The strip was a second, worse Content Radar — six cards, often the same story three times. The research box charged ₹10–30 a go to do what the Radar already does.",
        where: "Content Studio",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Nothing falls off the Radar unnoticed",
    summary: "Every item now gets an answer, and at 11:59 PM the day is written down — including what nobody touched.",
    changes: [
      {
        kind: "new",
        what: "Thumbs up and down on every row",
        detail: "“Not useful” is a real answer and takes one tap. Before this the only way to clear something was to write the post, so nothing ever got cleared.",
        where: "Content Radar",
      },
      {
        kind: "new",
        what: "Say why you turned something down",
        detail: "Asked after the thumb, never before, and you can skip it — five one-tap reasons or your own words. The report then shows the reason instead of just “not useful”.",
        where: "Content Radar",
      },
      {
        kind: "new",
        what: "The Report and the Log",
        detail: "The Report says what was done about each item, including the ones nobody touched. The Log is the plain record of everything the Radar produced that day. Both download as Markdown or PDF.",
        where: "Content Radar",
      },
      {
        kind: "new",
        what: "A line in My Day when something urgent was missed",
        detail: "One line, once, the next morning: what was time-sensitive yesterday and got nothing. It goes away on its own the day after.",
        where: "My Day",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Google Reviews, connected",
    summary: "4.9 stars from 378 reviews — and, more usefully, the complaints that need answering.",
    changes: [
      {
        kind: "new",
        what: "Complaints rank above everything else on the page",
        detail: "It's the only thing on the Radar where doing nothing keeps costing money. The button says “Reply on Google”, because a complaint has to be answered where it was left.",
        where: "Content Radar",
      },
      {
        kind: "new",
        what: "Good reviews become posts",
        detail: "Recent five-star reviews with actual words are offered as content. A bare rating with no comment isn't — there's nothing to quote.",
        where: "Content Radar",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "The Radar is easier to read",
    summary: "It opens on one source instead of four kinds of row at once, and every row is laid out the same way.",
    changes: [
      {
        kind: "changed",
        what: "It opens on Google News",
        detail: "The mixed list put news, Reddit threads, reviews and rising searches in one column, each with its own shape — noise before it was a ranking. Tap any source tile to switch, or “Show everything” for the old view.",
        where: "Content Radar",
      },
      {
        kind: "changed",
        what: "One refresh button, named after what it refreshes",
        detail: "There were two buttons both called refresh, doing different things. Now there's one, and it says “Refresh Google News” or “Refresh Google Trends” depending on where you are. Reddit and Quora have none — they're searched live every time you open the page, so there's nothing to pull.",
        where: "Content Radar",
      },
      {
        kind: "changed",
        what: "Topics is now Google Alerts",
        detail: "Same screen, familiar name. Each one is searched for news every hour, and the row tells you how many stories it has actually found.",
        where: "Content Radar",
      },
      {
        kind: "fixed",
        what: "Articles open properly again",
        detail: "“Couldn't pull the article body” was the server running a version of Node one release too old for one of the reader's dependencies. The version is now pinned so it can't drift again.",
        where: "Content Radar",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Finding a task, and sharing one",
    summary: "A link you can paste into Slack, and the task you just made no longer disappears into 145 rows.",
    changes: [
      {
        kind: "new",
        what: "Copy a link to any task",
        detail: "Like Airtable's record link. Paste it into Slack or WhatsApp and whoever clicks it lands on that task, instead of searching for it by name.",
        where: "Marketing Hub",
      },
      {
        kind: "fixed",
        what: "Opening a task lands you on the master sheet",
        detail: "It used to open the task over the Workload planner, so closing it dropped you on somebody's day timeline with no sign of what you'd just opened. Fixed everywhere — notifications, My Day, the reports and Team Command.",
        where: "Marketing Hub",
      },
      {
        kind: "new",
        what: "The task you came for stays highlighted",
        detail: "It's scrolled to the middle of the screen and stays marked until you navigate away — not a flash that fades, because you usually look for it a minute later.",
        where: "Marketing Hub",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Playbooks tell the truth now",
    summary: "No more “Verified” on things nothing verified, and no more offering to turn a text message into a carousel.",
    changes: [
      {
        kind: "fixed",
        what: "“Verified” only appears when something was actually verified",
        detail: "The green tick used to show on every result — including a WhatsApp template that cited nothing. A badge that can't tell the difference teaches people to ignore it.",
        where: "Content Studio",
      },
      {
        kind: "fixed",
        what: "No more wrong formats after a copy playbook",
        detail: "After writing three WhatsApp messages it asked whether to turn them into an Instagram carousel or a blog article. Playbooks that write the finished thing now just give you the copy.",
        where: "Content Studio",
      },
      {
        kind: "new",
        what: "Regenerate, in a different tone",
        detail: "Not happy with it? Pick professional, friendly, direct or warm and run it again, from where the result is.",
        where: "Content Studio",
      },
      {
        kind: "new",
        what: "Use your own prompt instead",
        detail: "A button next to Run playbook. Your instructions replace the playbook's; the GooCampus context is still added for you.",
        where: "Content Studio",
      },
      {
        kind: "fixed",
        what: "A rate limit no longer says you're out of credit",
        detail: "Running several playbooks at once used to report “out of quota — top up your plan” on an account with money in it. It now says to wait a few seconds, which is all it needs.",
        where: "Content Studio",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "What the AI has been doing",
    summary: "Every Playbook and Content Studio run, what was asked of it, and what it cost.",
    changes: [
      {
        kind: "new",
        what: "A usage report in Content Studio",
        detail: "Runs, tokens, spend, and how many used a custom prompt. Each row opens to show the full task and the person's own prompt. Admins only.",
        where: "Content Studio",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Published links fill themselves in",
    summary: "When a post goes live, the dashboard finds its link instead of waiting for someone to paste it.",
    changes: [
      {
        kind: "new",
        what: "Instagram, Facebook and LinkedIn links found automatically",
        detail: "A nightly job matches published posts to their tasks and fills in the link. It won't match a reel to a static-post task, or claim a post that already belongs to another task.",
        where: "Marketing Hub",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Tasks, thumbnails and the day's plan",
    summary: "One task form everywhere, and the thumbnail question asked at the right moment.",
    changes: [
      {
        kind: "changed",
        what: "The same New task form everywhere",
        detail: "Including from the Content Calendar, so a task can be raised where the gap actually is.",
        where: "Marketing Hub",
      },
      {
        kind: "new",
        what: "The thumbnail question, asked once",
        detail: "When a reel or YouTube video is created you say whether it needs a thumbnail and who makes it — the editor who claims it, Praveen, or let them decide. Whoever claims it is asked if it was left open.",
        where: "Marketing Hub",
      },
      {
        kind: "changed",
        what: "The activity feed reads top to bottom",
        detail: "Oldest first, as a timeline, with people's real names instead of their keys.",
        where: "Marketing Hub",
      },
    ],
  },
];
