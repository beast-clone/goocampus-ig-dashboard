// First-run tab intros — "what is this tab, and what do I do here".
//
// State lives in Supabase (discover_cache, key `onboarding:<userId>`) rather than
// localStorage, so dismissing an intro on the office Mac also dismisses it on
// someone's phone. The table is named for its first use but has long been the
// project's general key-value store — account_snapshot, ig_report and the
// monthly report snapshots all live there, none of them caches.
//
// A tab with no entry below simply shows nothing, so adding a tab never breaks
// the dashboard and copy can be written when someone has something to say.

import { getSupabase } from "@/lib/supabase";

export type OnboardingState = {
  seen: string[];      // tabs this person has dismissed
  always: boolean;     // true = show every intro every time, ignoring `seen`
};

export const EMPTY_STATE: OnboardingState = { seen: [], always: false };

const keyFor = (userId: string) => `onboarding:${userId}`;
const SOURCE = "onboarding";

export type Intro = {
  title: string;
  body: string;
  /** Concrete "click this" pointers. Kept to three — a wall of bullets is not a tour. */
  points?: string[];
};

// Written for someone who has never used the dashboard. Each one answers the two
// questions a new person actually has: what am I looking at, and what do I do.
export const TAB_INTRO: Record<string, Intro> = {
  overview: {
    title: "Your month at a glance",
    body: "Followers, reach, engagement and profile visits for the account and date range picked at the top. Every number here is measured from the platform, never estimated.",
    points: [
      "Change the date range with the 7d / 30d / 90d buttons, top right.",
      "The coloured arrow on each tile compares against the previous period of the same length.",
      "Switch between Instagram, Facebook, LinkedIn and YouTube with the tabs above the tiles.",
    ],
  },
  "my-day": {
    title: "What you're working on today",
    body: "Your own tasks, in the order they're due, with a plan for the day. This is the producer's view — Marketing Hub is the manager's.",
    points: [
      "Click a task to open it on the right, then press Start to put the clock on it.",
      "Overdue chips are counted from the publishing date, not the day it was created.",
      "Swap requests from teammates arrive in Requests, top right.",
    ],
  },
  "marketing-hub": {
    title: "Every task, for everyone",
    body: "The master sheet behind the whole content pipeline. Each row is one piece of content moving from written, to designed, to published.",
    points: [
      "Use the tabs to switch between Master sheet, Pipeline, Calendar and Team.",
      "Click any row to open its full detail, brief and creatives.",
      "Saved views remember your filters — make one for the slice you check daily.",
    ],
  },
  radar: {
    title: "What's happening in your industry right now",
    body: "News, rising Google searches and what people are saying about GooCampus online — gathered so you can turn any of it into a post.",
    points: [
      "Make content on a headline starts a draft from that story.",
      "Draft next to a rising search starts a post aimed at what people are already searching.",
      "Manage alerts controls which topics are tracked.",
    ],
  },
  "content-studio": {
    title: "Where drafts get written",
    body: "Give it a topic or pick something from Content Radar and it writes the post, carousel or reel script. Everything it produces is a draft for you to edit.",
    points: [
      "Research & write costs more and takes a few minutes — it reads the web first.",
      "A trending item picked from Radar is faster and cheaper.",
      "Nothing here publishes; send the draft to the Scheduler when it's ready.",
    ],
  },
  scheduler: {
    title: "Queue a post and walk away",
    body: "Pick the creative, write the caption, choose a time. The post goes out on its own — you don't need to be online when it does.",
    points: [
      "One post can go to Instagram, Facebook and LinkedIn together.",
      "LinkedIn carousels must be a PDF — LinkedIn reorders loose images.",
      "The queue below shows what's waiting and what has already gone out.",
    ],
  },
  calendar: {
    title: "Everything that's going out, by date",
    body: "The publishing calendar for all platforms in one month view, so you can see gaps and pile-ups before they happen.",
    points: ["Click any day to see what's scheduled.", "Drag a post to move it to another date."],
  },
  "content-review": {
    title: "Approve before it goes out",
    body: "Drafts waiting on a decision. Approving one moves it down the pipeline and assigns the next person automatically.",
  },
  instagram: {
    title: "How Instagram is actually doing",
    body: "Reach, engagement and follower growth straight from Instagram, plus every post ranked by how it performed.",
    points: [
      "Reach counts people, not views — one person seeing three posts is still one.",
      "Use the date range at the top; Instagram only allows 30 days at a time, so longer ranges are assembled month by month.",
    ],
  },
  linkedin: { title: "LinkedIn performance", body: "Follower growth and post performance for the GooCampus company pages." },
  youtube: { title: "YouTube performance", body: "Views, watch time and subscriber movement across your channels, with every video listed underneath." },
  facebook: { title: "Facebook performance", body: "Page reach, engagement and post performance for the Facebook pages." },
  website: { title: "Who visits the website", body: "Traffic, where people come from and what they do once they arrive, from Google Analytics and Search Console." },
  seo: { title: "How you rank on Google", body: "The searches people use to find you, where you rank for them, and which ones are close to page one." },
  audience: { title: "Who your followers are", body: "Age, gender, country and the hours they're online — useful for deciding when to post." },
  ads: {
    title: "What your ad money is doing",
    body: "Spend, leads and cost per lead across every Meta campaign, with an analyst that reads the numbers and tells you what to fix.",
    points: [
      "Live right now shows only what is switched on today; the range below covers the whole period.",
      "Click a campaign to make the analyst talk about that one campaign.",
      "Cost per lead is the number that matters — it's what one person's contact details cost you.",
    ],
  },
  competitors: { title: "What your competitors are running", body: "Ads your competitors have live right now, pulled from the public Meta ad library." },
  benchmark: { title: "You versus them", body: "Your numbers next to competitors', so growth has something to be measured against." },
  leads: { title: "Leads from social", body: "People who came in through Instagram, Facebook or your ads, and what happened to them since." },
  inbox: { title: "Messages in one place", body: "Instagram and Facebook DMs and comments, so nothing sits unanswered." },
  sales: { title: "The sales pipeline", body: "Every lead, who owns it, and how long it has been waiting. Red timers are leads nobody has contacted yet." },
  "organic-sales": { title: "Leads you didn't pay for", body: "Enquiries that arrived without ad spend behind them — the return on the content work." },
  "ai-insights": { title: "Things worth knowing", body: "Patterns picked out of your own numbers — what's working, what's slipping, and what changed this week." },
  "ai-reports": { title: "The monthly report", body: "A full month on one page, ready to share. Save a snapshot and that month is frozen exactly as it was." },
  integrations: { title: "What's connected", body: "Every platform the dashboard talks to and whether its connection is healthy. Red means data on some tab is stale or missing." },
  diagnostics: { title: "When something looks wrong", body: "Checks each connection and data source, and tells you which one is failing rather than leaving you to guess." },
  team: { title: "Who can sign in", body: "Add people, set their password, and choose which tabs they can open. Section access decides what they see; functions decide what they can change." },
  tools: { title: "Odd jobs", body: "One-off utilities that don't belong on another tab." },
  assistant: { title: "Search everything you have", body: "Finds posts, tasks, reports and leads across the dashboard. Your own data only — it never searches the internet." },
};

export async function readOnboarding(userId: string): Promise<OnboardingState> {
  const db = getSupabase();
  if (!db || !userId) return EMPTY_STATE;
  const { data } = await db
    .from("discover_cache")
    .select("payload")
    .eq("cache_key", keyFor(userId))
    .maybeSingle();
  const p = (data?.payload || {}) as Partial<OnboardingState>;
  return {
    seen: Array.isArray(p.seen) ? p.seen.filter((x): x is string => typeof x === "string") : [],
    always: p.always === true,
  };
}

export async function writeOnboarding(userId: string, state: OnboardingState): Promise<boolean> {
  const db = getSupabase();
  if (!db || !userId) return false;
  const { error } = await db.from("discover_cache").upsert(
    { cache_key: keyFor(userId), source: SOURCE, last_fetched: new Date().toISOString(), payload: state },
    { onConflict: "cache_key" },
  );
  return !error;
}
