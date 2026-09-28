// Every rule the Marketing Hub actually runs on, written down in one place.
//
// This is a READ of the system as it stands on 28 Sep 2026, not a second copy of
// it: each entry says where the real rule lives, so a reader can go and check.
// Nothing here changes behaviour — the point is that Praveen asked to see the
// whole set before deciding which ones should become editable rows.
//
// `where` is the file or table that decides. `editable` is the honest answer to
// "can the team change this today, without me?" — today almost nothing is, which
// is exactly the problem this list is meant to make obvious.

export type RuleEditability = "team" | "airtable" | "code" | "database";

// NOTE: the owner and collaborator rules people actually change are NOT in this
// list — they are rows in mh_rules, edited at the top of the page. Describing them
// here as well meant reading the same rule twice, once as a control and once as
// prose (Praveen, 28 Sep).

export type Rule = {
  id: string;
  /** What it does, in the words someone would use to describe it out loud. */
  what: string;
  /** Why it exists, when that is not obvious. */
  why?: string;
  where: string;
  editable: RuleEditability;
};

export type RuleGroup = {
  key: string;
  title: string;
  blurb: string;
  rules: Rule[];
};

export const RULE_GROUPS: RuleGroup[] = [
  {
    key: "owner",
    title: "Who gets the task",
    blurb: "What happens to a task's owner as it moves through the pipeline. These are the ones that go wrong when somebody joins or leaves.",
    rules: [
      {
        id: "owner-writer",
        what: "Below Content - Approved, the task stays with whoever is writing it.",
        why: "Nothing is handed over while the content is still being written.",
        where: "NewTaskForm.tsx · routeFor()",
        editable: "code",
      },
      {
        id: "owner-claim",
        what: "Claiming a task makes the claimer the owner, and the previous owner stays on as a collaborator — unless they are the other editor, who is released.",
        where: "/api/marketing-hub/takeover",
        editable: "code",
      },
      {
        id: "owner-video-types",
        what: "“Video” means: Reel - Original, Reel - Cut, YouTube Long-Form, YouTube Shorts, Story (Video), Meta Ads - Video. Everything else is design.",
        why: "This list decides which of the two rules above applies, so it has to match the trigger's own list exactly.",
        where: "lib/mh-content-types.ts · VIDEO_TYPES, and again inside sql/013",
        editable: "code",
      },
    ],
  },
  {
    key: "collab",
    title: "Who else is attached",
    blurb: "Collaborators are added automatically so the right person keeps an eye on the work.",
    rules: [
      {
        id: "collab-never-owner",
        what: "Nobody is ever both owner and collaborator. If the default collaborator already owns the task, it simply starts with none.",
        where: "lib/task-create.ts",
        editable: "code",
      },
      {
        id: "collab-presenter",
        what: "When one person shot a video and another is cutting it, the person who shot it is kept on as a collaborator.",
        where: "/api/marketing-hub/takeover · custom.presenter_key",
        editable: "code",
      },
      {
        id: "collab-remove",
        what: "Any collaborator can be taken off by hand, from the × on their chip.",
        where: "My Day task detail",
        editable: "team",
      },
    ],
  },
  {
    key: "status",
    title: "Statuses",
    blurb: "The vocabulary a task can move through. Airtable owns this list; the dashboard follows it.",
    rules: [
      {
        id: "status-list",
        what: "Eleven statuses: Content - Pending, In Progress, Needs Approval, Approved · Output - In Progress, Ready · Incorporating Feedback · Ready to Publish · Published/Scheduled · Rejected/Not Published · Failed.",
        why: "Added to the database on 28 Sep. Before that the dashboard held eight and quietly rewrote the other three, so thirteen tasks showed a status Airtable disagreed with.",
        where: "Airtable Content Calendar · Status field, mirrored by the mh_status database type",
        editable: "airtable",
      },
      {
        id: "status-board",
        what: "The Pipeline board shows seven of them as columns. The Master sheet's By status list shows all eleven.",
        why: "A status with no column is exactly the one you go looking for and cannot find.",
        where: "MarketingHub.tsx · PIPELINE_STAGES and ALL_STATUSES",
        editable: "code",
      },
    ],
  },
  {
    key: "sync",
    title: "Airtable sync",
    blurb: "What comes in from Airtable, how often, and what it is allowed to touch.",
    rules: [
      {
        id: "sync-view",
        what: "Only the tasks in Airtable's “Task Dashboard” view are imported. Change that view's filters in Airtable to change what arrives.",
        where: "Airtable view · Content Calendar",
        editable: "airtable",
      },
      {
        id: "sync-hourly",
        what: "The hourly sync only ADDS. It never touches a task already in the dashboard.",
        why: "On a timer it would quietly revert the team's own edits — change a status here and get Airtable's old one back within the hour.",
        where: "/api/cron/import-airtable",
        editable: "code",
      },
      {
        id: "sync-button",
        what: "Pressing Sync from Airtable does a full import: it copies every Airtable field over the dashboard's row.",
        why: "Safe when a person presses it and watches; not safe on a timer.",
        where: "Master sheet · Sync from Airtable",
        editable: "team",
      },
      {
        id: "sync-notitle",
        what: "A record with no title is skipped rather than imported as “(untitled)”.",
        where: "lib/airtable-import.ts",
        editable: "code",
      },
      {
        id: "sync-match",
        what: "Tasks are matched on Airtable's record id, so importing twice updates rather than duplicates.",
        where: "lib/airtable-import.ts",
        editable: "code",
      },
    ],
  },
  {
    key: "time",
    title: "How long work takes",
    blurb: "The day's shape, and what each kind of content is assumed to cost. Everything about capacity is derived from these.",
    rules: [
      {
        id: "time-estimates",
        what: "Thumbnail 30m · Carousel 60m · Reel - Cut 60m · Meta Ads 45m · Reel / Short / Story 90m · YouTube Long-Form 120m · anything else 30m.",
        why: "Used only when nobody has set a duration by hand.",
        where: "lib/task-estimate.ts",
        editable: "code",
      },
      {
        id: "time-day",
        what: "An 8-hour day, a protected lunch from 1 to 2 PM, and the last hour kept free for urgent work.",
        where: "PreviewMyDay.tsx",
        editable: "code",
      },
      {
        id: "time-start",
        what: "The day's plan starts when the person signed in, never before their shift. Manya, Praveen and Nikhil start at 9; Nandu is the late shift.",
        where: "PreviewMyDay.tsx · shiftStartOf()",
        editable: "code",
      },
      {
        id: "time-order",
        what: "Today's plan is ordered overdue first, then Urgent/High, then by publishing date — until somebody drags it, and then their order wins until they press Rearrange.",
        where: "PreviewMyDay.tsx",
        editable: "team",
      },
      {
        id: "time-spill",
        what: "Only what fits the shift is drawn on the timeline. The rest is shown separately as spill rather than crammed in.",
        where: "PreviewMyDay.tsx · fitPlan / spillPlan",
        editable: "code",
      },
    ],
  },
  {
    key: "notify",
    title: "Who hears about what",
    blurb: "Notifications are aimed at a person by a rule, not broadcast.",
    rules: [
      {
        id: "notify-creator",
        what: "Whoever CREATED a task is told each time it changes stage in someone else's hands.",
        why: "This is why the person who files the most tasks gets the most notifications — 20 tasks passing 6 stages is 120 of them.",
        where: "lib/notifications.ts",
        editable: "code",
      },
      {
        id: "notify-owner",
        what: "Whoever OWNS a task is told when it is handed to them, sent back for changes, or waiting in their pipeline.",
        where: "lib/notifications.ts",
        editable: "code",
      },
      {
        id: "notify-pop",
        what: "Only a notification that needs a decision interrupts with a pop-up. Everything else goes to the bell and the unread count.",
        where: "NotificationHost.tsx",
        editable: "code",
      },
      {
        id: "notify-reminder",
        what: "A task due TODAY is nudged in the last three hours of the shift — while there is still time to finish it.",
        where: "PreviewMyDay.tsx",
        editable: "code",
      },
      {
        id: "notify-quiet",
        what: "No pop-ups during quiet hours. The server decides that, in IST.",
        where: "/api/notifications",
        editable: "code",
      },
    ],
  },
  {
    key: "publish",
    title: "Publishing",
    blurb: "Which page a task goes out on, decided by its brand.",
    rules: [
      {
        id: "publish-page",
        what: "Mentorship Platform and 10K Mentorship → GooCampus World. 12thPlus.com and India NEET UG → GooCampus India. Samvaya → none of ours. Everything else → GooCampus Main.",
        where: "lib/sbu-pages.ts",
        editable: "code",
      },
    ],
  },
];
