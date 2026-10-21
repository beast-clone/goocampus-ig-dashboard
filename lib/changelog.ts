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
    date: "2026-10-08",
    title: "Everything the team reported",
    summary: "Every comment left on the dashboard is now dealt with — the board, the calendar, the review queue, the Radar and the YouTube tab.",
    changes: [
      // ── My Day ──────────────────────────────────────────────────────────────
      {
        kind: "fixed",
        what: "Reference links open",
        detail: "A reference is usually written as a citation with the link inside it, and the whole line was being treated as the address — so clicking it went nowhere. The link inside the text is now the one that opens.",
        where: "My Day",
      },
      {
        kind: "fixed",
        what: "Every status is in the status list",
        detail: "The dropdown offered eight stages when the board has eleven, so the missing ones could not be set from here at all.",
        where: "My Day",
      },
      {
        kind: "new",
        what: "Say you are on camera after a video has been claimed",
        detail: "\"Present on camera\" only ever appeared on videos still sitting unclaimed, so once an editor took one there was no way left to register as the presenter. The task itself now has an On camera row, and choosing it puts you on the task as a collaborator so it shows on your board.",
        where: "My Day",
      },
      {
        kind: "new",
        what: "The two editors pair up by themselves",
        detail: "Pick \"on camera\" on a video nobody has claimed and the editing goes to the other editor; claim the editing while nobody is on camera and the other editor is put on camera. It only ever fills a blank — if somebody already owns it, or is already on camera, that is left alone.",
        where: "My Day",
      },
      {
        kind: "changed",
        what: "Click the owner to hand a task over",
        detail: "Reassigning was only reachable from the header button or by entering edit mode first, so clicking the owner's name — the obvious thing — did nothing.",
        where: "My Day",
      },
      {
        kind: "fixed",
        what: "An empty claim pool says where the work went",
        detail: "A blank Approved tab looked the same whether there was no work or somebody had already taken it, so a claim could look like it had vanished. It now reads \"Nothing up for grabs — Nikhil is working on 1 video\".",
        where: "My Day",
      },
      // ── Marketing Hub ───────────────────────────────────────────────────────
      {
        kind: "fixed",
        what: "Approving no longer asks for a collaborator first",
        detail: "The check was circular: you needed somebody on the task to run the step that puts people on it, and for video it could never be satisfied at all because video is meant to reach the editors' pool unassigned.",
        where: "Marketing Hub",
      },
      {
        kind: "changed",
        what: "The Master sheet reopens the way you left it",
        detail: "Filter, sort, hidden columns, colour and grouping now stay until you change them or press Clear, the way an Airtable view does. Going to the Content Calendar and back no longer resets them. Search is deliberately not kept.",
        where: "Marketing Hub",
      },
      {
        kind: "changed",
        what: "Status colours match Airtable",
        detail: "The old set were pastels at almost the same lightness, so on the calendar everything read as one off-white, and four statuses had no colour at all. They now come from the Content Calendar's own Status field.",
        where: "Marketing Hub",
      },
      {
        kind: "new",
        what: "Filter the calendar by several brands at once, and by status",
        detail: "The brand picker took one at a time, so seeing three meant looking three times, and there was no status filter at all. Both hold what to show, both say what is hidden, and both stay set when you leave the tab.",
        where: "Marketing Hub",
      },
      {
        kind: "fixed",
        what: "Content reads as content, not as symbols",
        detail: "Half the briefs are written with ### and ** around them and none of it was being formatted, so the symbols were printed as typed. Headings, bold, lists and links now render — which is also what makes references read as headings.",
        where: "Marketing Hub",
      },
      {
        kind: "changed",
        what: "A task opens on its content",
        detail: "Opening a task showed the creatives upload box and an empty references panel first, with the writing below the fold. Content and Caption now come first.",
        where: "Marketing Hub",
      },
      {
        kind: "fixed",
        what: "Priority can be changed from the task panel",
        detail: "It was shown but not editable, so changing it meant going back to the grid.",
        where: "Marketing Hub",
      },
      // ── Content Review ──────────────────────────────────────────────────────
      {
        kind: "new",
        what: "Filter the review queue by interest",
        detail: "Chips above the cards, one per brand actually waiting, with its count. These do not stay set between visits on purpose — this is a queue of work waiting on you, and a filter left on could hide something that arrived while you were away.",
        where: "Content Review",
      },
      // ── Scheduler ───────────────────────────────────────────────────────────
      {
        kind: "fixed",
        what: "A video handed over as a link no longer looks lost",
        detail: "Work delivered as a Drive or Canva link showed as an empty \"Upload media\" box from content review onward, so the video appeared to disappear. The card now says it was delivered as a link and names where it points. The file is still needed to publish.",
        where: "Scheduler",
      },
      {
        kind: "fixed",
        what: "Sending a task back keeps the caption",
        detail: "Edits made to the caption were dropped when the task went back for changes, so the work had to be done twice.",
        where: "Scheduler",
      },
      // ── Content Radar ───────────────────────────────────────────────────────
      {
        kind: "new",
        what: "Official sources, told apart from reporting",
        detail: "A dropdown for official sources, third-party, or official first with everything still showing. Official means the body that decides the thing — MCC, NMC, NBEMS, AMC, the GMC — rather than a publication writing about it.",
        where: "Content Radar",
      },
      {
        kind: "new",
        what: "Notices from the authorities themselves",
        detail: "The watchers have been reading the MCC counselling pages every hour and the Radar had no idea they existed. Their notices now appear as their own lane, above everything except an unanswered review. Six more authorities were added to the watch: NMC, NBEMS, NTA, the Australian Medical Council, USMLE and the Medical Council of Ireland.",
        where: "Content Radar",
      },
      // ── YouTube ─────────────────────────────────────────────────────────────
      {
        kind: "fixed",
        what: "The 12thplus tab loads again",
        detail: "It answered \"subscriber count unavailable\" while the credentials were fine. Each request was minting its own access token, and because the channels share one Google account, each new token quietly killed the one another request was still using. The app now holds a single token and retries once if it is revoked.",
        where: "YouTube",
      },
      {
        kind: "new",
        what: "Samvaya has a channel tab",
        detail: "It says \"not connected\" until two things are done: its channel link is supplied, and the dashboard's Google account is added as a manager on the channel in YouTube Studio. It will never show invented numbers.",
        where: "YouTube",
      },
      // ── Signing in ──────────────────────────────────────────────────────────
      {
        kind: "new",
        what: "A way back in when you forget your password",
        detail: "Forgot password? on the sign-in screen emails you a code, you set a new password and you are signed in. Previously somebody had to re-invite you.",
        where: "My Account",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "Connect Claude by signing in",
    summary: "No more keys to copy. Click Connect, sign in, approve — the way Airtable and Notion do it.",
    changes: [
      {
        kind: "new",
        what: "Claude connects with a sign-in, not a key",
        detail: "In Claude, add the connector and click Connect. A GooCampus screen opens, you sign in with the login you already have, click Approve, done. There is no key to copy, keep or lose.",
        where: "Connectors",
      },
      {
        kind: "changed",
        what: "The personal key is now the fallback, not the main way",
        detail: "It still works and existing setups are untouched, but it's tucked behind “I need a personal key instead”. Handing people a secret to carry is how one ended up pasted into a chat window on day one.",
        where: "Connectors",
      },
      {
        kind: "new",
        what: "You can see and cut off what's connected",
        detail: "Connectors lists each Claude that has access and when it connected. “Disconnect everything” kills them all instantly — not at the next expiry, immediately.",
        where: "Connectors",
      },
    ],
  },
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
        kind: "changed",
        what: "The brand picker shows each brand's own logo",
        detail: "It used to badge every brand with an Instagram glyph, which was misleading — the Overview shows Instagram, Facebook, LinkedIn and YouTube together, not just Instagram. GooCampus, GooCampus World, 12thPlus and Samvaya now each carry their real profile picture.",
        where: "Overview",
      },
      {
        kind: "new",
        what: "The time, in the Overview header",
        detail: "A digital clock next to the notification bell showing the day, the full date and the running time, always in IST — it reads the same whatever timezone the laptop is set to. It has nothing to do with attendance: it isn't recorded anywhere.",
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
