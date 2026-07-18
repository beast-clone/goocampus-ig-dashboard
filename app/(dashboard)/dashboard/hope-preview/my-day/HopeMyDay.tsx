"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSunHigh, IconLayoutGrid, IconChartBar, IconCalendarEvent, IconWand, IconBrandInstagram, IconBrandLinkedin, IconBrandYoutube, IconBrandFacebook, IconUsers, IconSpeakerphone, IconSettings } from "@tabler/icons-react";
import { HopeSidebar } from "../HopeSidebar";

function NavGroup({ label }: { label: string }) { return <div className="navgroup">{label}</div>; }
function NavItem({ icon: Icon, label, active, href }: { icon: React.ComponentType<{ size?: number; stroke?: number }>; label: string; active?: boolean; href?: string }) {
  const inner = <><Icon size={16} stroke={1.8} /> <span>{label}</span></>;
  const cls = `navitem ${active ? "active" : ""}`;
  return href ? <a className={cls} href={href}>{inner}</a> : <div className={cls}>{inner}</div>;
}

// ── Hope-themed "My Day" (Version 2 preview) ────────────────────────────────
// Faithful build of the approved decluttered My Day mockup in the exact Hope UI
// theme (blue #3A57E8, Inter). Layout v2 per Praveen:
//   • Team chat is a COLLAPSIBLE right panel (slides in) — closed by default so
//     the work area gets full width; opens on click, auto-opens on a new message
//     (gentle: badge + toast), auto-collapses after you reply, with a Pin to keep
//     it open.
//   • The top bar carries three icon triggers with count badges:
//     🔔 notifications/handoffs · 📋 reminders · 💬 team chat.
//   • Work row is now My tasks | Up next detail (wider); Reminders moved into the
//     📋 popover; handoffs into the 🔔 popover.
// Self-contained sample content so the design/behaviour can be reviewed; real
// task/chat/handoff data wiring is a follow-up. V1 (components/MyDayView.tsx) is
// untouched.

type Tone = "good" | "info" | "brand" | "warn" | "bad" | "muted";
type Person = { name: string; av: string; color: string };
// Status follows the Airtable Content Calendar single-select EXACTLY (the source
// of truth being migrated to Supabase mh_posts). The status dropdown on the task
// card offers this exact list, in this order. `stage` maps to the 5-step pipeline;
// `inView` = still needs work (shows in the working view). Queued/terminal states
// (Ready to Publish, Published, Rejected, Failed) drop out of the working view.
type CCStatus =
  | "Content - Pending" | "Content - In Progress" | "Content - Needs Approval"
  | "Content - Approved" | "Output - In Progress" | "Output - Ready"
  | "Incorporating Feedback" | "Ready to Publish" | "Published/Scheduled"
  | "Rejected/Not Published" | "Failed";
const CC_STATUS_ORDER: CCStatus[] = [
  "Content - Pending", "Content - In Progress", "Content - Needs Approval",
  "Content - Approved", "Output - In Progress", "Output - Ready",
  "Incorporating Feedback", "Ready to Publish", "Published/Scheduled",
  "Rejected/Not Published", "Failed",
];
const STATUS: Record<CCStatus, { label: string; tone: Tone; stage: number; inView: boolean }> = {
  "Content - Pending":        { label: "Content - Pending",        tone: "muted", stage: 0, inView: true },
  "Content - In Progress":    { label: "Content - In Progress",    tone: "warn",  stage: 1, inView: true },
  "Content - Needs Approval": { label: "Content - Needs Approval", tone: "warn",  stage: 1, inView: true },
  "Content - Approved":       { label: "Content - Approved",       tone: "good",  stage: 2, inView: true },
  "Output - In Progress":     { label: "Output - In Progress",     tone: "info",  stage: 3, inView: true },
  "Output - Ready":           { label: "Output - Ready",           tone: "info",  stage: 3, inView: true },
  "Incorporating Feedback":   { label: "Incorporating Feedback",   tone: "warn",  stage: 2, inView: true },
  "Ready to Publish":         { label: "Ready to Publish",         tone: "brand", stage: 4, inView: false },
  "Published/Scheduled":      { label: "Published/Scheduled",      tone: "good",  stage: 4, inView: false },
  "Rejected/Not Published":   { label: "Rejected/Not Published",   tone: "bad",   stage: 4, inView: false },
  "Failed":                   { label: "Failed",                   tone: "bad",   stage: 4, inView: false },
};
// Status tabs in the working view (queued/terminal states drop out of the view).
const TASK_TABS: { key: string; label: string; statuses: CCStatus[] }[] = [
  { key: "active",   label: "In progress", statuses: ["Content - Pending", "Content - In Progress", "Content - Needs Approval", "Content - Approved"] },
  { key: "feedback", label: "Feedback",    statuses: ["Incorporating Feedback"] },
  { key: "output",   label: "Output",      statuses: ["Output - In Progress", "Output - Ready"] },
];
function dueInfo(due: string, today: string): { label: string; overdue: boolean } {
  if (!due) return { label: "", overdue: false };
  const d = Math.round((new Date(due + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86_400_000);
  if (d < 0) return { label: d === -1 ? "Overdue · yesterday" : `Overdue · ${-d} days`, overdue: true };
  if (d === 0) return { label: "Due today", overdue: false };
  if (d === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${d} days`, overdue: false };
}
// A reference the team drops on a task — either a URL (mood board, doc, tweet…) or
// an image. Mirrors the Airtable "References" field.
type RefItem = { kind: "link" | "image"; label: string; url?: string; attId?: string };
type Task = {
  id: string; title: string; meta: string;
  status: CCStatus; due: string; // YYYY-MM-DD
  detail: {
    typeLine: string; publishes: string; owner: string;
    priority: "High" | "Medium" | "Low"; brand: string;
    duration?: number;                                  // minutes — the producer sets how long it'll take → feeds Today's plan
    content: string;                                    // full write-up (paragraphs split on blank lines)
    creatives: { name: string; type: "image" | "video" | "doc" }[]; // uploaded assets → thumbnails
    references?: RefItem[];                             // links + images the team adds for context
    collaborators: Person[];
    activity: { who: string; text: string; time: string }[];
    createdAt?: string; startAt?: string; endAt?: string; // task clock (captured on create → done)
  };
};

const PIPELINE = ["Draft", "In progress", "Approved", "Output ready", "Published"];

const TEAM = [
  { key: "manya", name: "Manya", role: "Content", av: "M", color: "#E0791F" },
  { key: "praveen", name: "Praveen", role: "Ads · Senior Graphic Designer", av: "P", color: "#C2410C" },
  { key: "nikhil", name: "Nikhil", role: "Video editor · short-form", av: "N", color: "#3A57E8" },
  { key: "nandu", name: "Nandu", role: "Video editor · long-form", av: "Nd", color: "#3A57E8" },
];

const PPL: Record<string, Person> = {
  manya: { name: "Manya", av: "M", color: "#E0791F" },
  praveen: { name: "Praveen", av: "P", color: "#C2410C" },
  nikhil: { name: "Nikhil", av: "N", color: "#3A57E8" },
  nandu: { name: "Nandu", av: "Nd", color: "#3A57E8" },
  maheen: { name: "Maheen", av: "Mn", color: "#2F9E6F" },
};

const TASKS: Task[] = [
  { id: "t1", title: "10k Mentorship — Speaking Reel", meta: "Reel · Original · 15 Jul", status: "Content - In Progress", due: "2026-07-14",
    detail: {
      typeLine: "Reel · Original", publishes: "15 Jul 2026", owner: "Nandu", priority: "High", brand: "GooCampus · 10k Mentorship",
      content: "Talking-head reel introducing the 10k Mentorship program.\n\nHook (0–3s): open with a pattern-interrupt — “Most students pick a college blind. Here's how 10,000 of them didn't.” Keep the first frame text-only and high-contrast so it stops the scroll.\n\nBody (3–35s): three crisp benefits, one per beat. 1) A 1-on-1 counsellor who has actually walked the path. 2) Verified cutoff data, not WhatsApp-forward rumours. 3) A private community of 10,000 aspirants going through the same season.\n\nProof: drop the on-screen stat “10,000+ students guided” and a two-second montage of real counsellor-call screenshots so the claim lands.\n\nCTA (35–45s): “Comment or DM the word MENTOR and we'll send you the free starter kit.” End on a clean card with the logo and handle.\n\nSpecs: vertical 9:16, under 45 seconds, subtitles burned in (English). B-roll — campus shots plus the app screen-recording in the shared drive. Music upbeat but under 100 BPM so the voice stays clear.\n\nTone: warm and direct, like a senior telling a junior what they wish they'd known. No jargon, no fear-mongering — just clarity.",
      creatives: [{ name: "cover-frame.png", type: "image" }, { name: "reel-cut-v3.mp4", type: "video" }],
      references: [
        { kind: "link", label: "notion.so/10k-mentorship-brief", url: "https://notion.so" },
        { kind: "link", label: "youtube.com/watch?v=hook-ref", url: "https://youtube.com" },
      ],
      collaborators: [PPL.manya],
      activity: [{ who: "Manya", text: "approved the script", time: "9:12 AM" }, { who: "You", text: "started editing", time: "10:31 AM" }] } },
  { id: "t2", title: "Careers other than NEET — Reel", meta: "Reel Thumbnail · owned by Praveen", status: "Output - Ready", due: "2026-07-13",
    detail: {
      typeLine: "Reel Thumbnail", publishes: "14 Jul 2026", owner: "Praveen", priority: "Medium", brand: "GooCampus · Careers",
      content: "Thumbnail and cover frame for the “Careers other than NEET” reel.\n\nOne face, bold high-contrast text hook (“NEET isn't the only door”), brand-blue accent. Keep the face on the right third, text on the left.\n\nDeliver a 9:16 cover plus a 1:1 crop for the grid. Output is ready in the drive — needs a quick review pass before it goes to the Scheduler.",
      creatives: [{ name: "thumb-9x16-final.png", type: "image" }, { name: "thumb-1x1.png", type: "image" }],
      collaborators: [PPL.manya],
      activity: [{ who: "Praveen", text: "uploaded the output", time: "8:40 AM" }, { who: "Praveen", text: "marked output ready", time: "9:05 AM" }] } },
  { id: "t3", title: "Careers other than NEET — Reel", meta: "Reel · Original · 13 Jul", status: "Incorporating Feedback", due: "2026-07-13",
    detail: {
      typeLine: "Reel · Original", publishes: "13 Jul 2026", owner: "Nandu", priority: "High", brand: "GooCampus · Careers",
      content: "Full reel cut on career alternatives after NEET — five options in a fast-paced sequence (research, allied health, biotech, data + health, abroad pathways).\n\nQuick jump-cuts, on-screen captions in English and Hindi, upbeat track under 100 BPM. Approved by Manya; currently in editing. Target runtime 40–50 seconds.",
      creatives: [{ name: "reel-cut-final.mp4", type: "video" }, { name: "cover.png", type: "image" }],
      collaborators: [PPL.manya],
      activity: [{ who: "Manya", text: "left B-roll notes", time: "10:24 AM" }, { who: "You", text: "accepted the task", time: "10:31 AM" }] } },
  { id: "t4", title: "Salary Tool — text based", meta: "Reel · owned by Manya", status: "Published/Scheduled", due: "2026-07-11",
    detail: {
      typeLine: "Reel · Text", publishes: "11 Jul 2026", owner: "Manya", priority: "Low", brand: "GooCampus · Tools",
      content: "Text-based reel walking through the salary-estimator tool: pick a role, see the median package by city, and share the result.\n\nPublished and performing well (34k reach in 48h). Kept here for reference and as a template for the next tool explainer.",
      creatives: [{ name: "salary-tool-demo.mp4", type: "video" }],
      collaborators: [PPL.manya],
      activity: [{ who: "Manya", text: "published the reel", time: "Jul 11" }, { who: "Maheen", text: "flagged it as a top performer", time: "Jul 12" }] } },
  { id: "t5", title: "MBBS Govt Quota Cutoff — TN", meta: "Reel · owned by Nikhil", status: "Published/Scheduled", due: "2026-07-10",
    detail: {
      typeLine: "Reel · Original", publishes: "10 Jul 2026", owner: "Nikhil", priority: "Medium", brand: "GooCampus · NEET",
      content: "Tamil Nadu government-quota MBBS cutoff explainer — the 2025 closing ranks by community, what changed vs 2024, and how to read the counselling table.\n\nPublished and steady. Use as the reference/template for the next state's cutoff reel (Karnataka is queued).",
      creatives: [{ name: "reel-final.mp4", type: "video" }, { name: "cutoff-card.png", type: "image" }],
      collaborators: [PPL.manya],
      activity: [{ who: "Nikhil", text: "published the reel", time: "Jul 10" }] } },
  { id: "t6", title: "Germany Approbation — Reel", meta: "Reel · Original · 13 Jul", status: "Content - In Progress", due: "2026-07-13",
    detail: { typeLine: "Reel · Original", publishes: "13 Jul 2026", owner: "Nandu", priority: "High", brand: "GooCampus · Study Abroad",
      content: "Reel explaining Germany's Approbation pathway for IMGs — the three steps, the timeline, and the language bar.\n\nApproved and you're mid-edit. It was due yesterday, so it needs wrapping up first.",
      creatives: [{ name: "approbation-cut.mp4", type: "video" }], collaborators: [PPL.manya],
      activity: [{ who: "Manya", text: "approved the script", time: "Jul 12" }] } },
  { id: "t7", title: "AMC Exam Guide — Carousel", meta: "Carousel · 15 Jul", status: "Content - Approved", due: "2026-07-15",
    detail: { typeLine: "Carousel · Original", publishes: "15 Jul 2026", owner: "Praveen", priority: "Medium", brand: "GooCampus · Australia",
      content: "8-slide carousel breaking down the AMC exam pathway — MCQ then clinical, the documents, and the timelines.\n\nJust approved; queued for tomorrow.",
      creatives: [], collaborators: [PPL.manya], activity: [{ who: "Manya", text: "approved the content", time: "Today" }] } },
];

// Videos are NOT auto-assigned — they sit in a shared pool that BOTH editors
// (Nandu long-form, Nikhil short-form) can see and CLAIM. Whoever claims becomes
// the owner. (Design/thumbnail work stays auto-assigned to Praveen.)
const CLAIM_POOL_INIT: Task[] = [
  { id: "v1", title: "NEET PG Strategy — Long-Form", meta: "YouTube Long-Form · unclaimed", status: "Content - Approved", due: "2026-07-18",
    detail: { typeLine: "YouTube Long-Form", publishes: "18 Jul 2026", owner: "Unclaimed", priority: "High", brand: "GooCampus · NEET PG",
      content: "Long-form explainer on how to build a NEET-PG counselling strategy — choosing branch vs college, reading closing ranks, and the round-by-round game plan.\n\nApproved script is in the doc. Needs an editor to claim it and cut a 6–8 min video with lower-thirds and chapter markers.",
      creatives: [{ name: "script-final.txt", type: "doc" }, { name: "raw-interview.mp4", type: "video" }],
      collaborators: [PPL.manya], activity: [{ who: "Manya", text: "approved the script", time: "9:40 AM" }] } },
  { id: "v2", title: "Which Branch After NEET — Reel", meta: "Reel - Original · unclaimed", status: "Content - Approved", due: "2026-07-16",
    detail: { typeLine: "Reel - Original", publishes: "16 Jul 2026", owner: "Unclaimed", priority: "Medium", brand: "GooCampus · NEET UG",
      content: "Fast-paced reel: “Which branch should you pick after NEET?” — 4 factors in 30 seconds, punchy captions, trending audio.\n\nApproved and ready to edit. First editor to claim it owns it.",
      creatives: [{ name: "reel-brief.txt", type: "doc" }], collaborators: [PPL.manya], activity: [{ who: "Manya", text: "moved it to Approved", time: "10:05 AM" }] } },
];

// Today's plan is time-proportional across an 8-hour workday (9 AM–6 PM) with a
// protected 1-hour lunch. Tasks are reorderable — drag a block, or use the ◀ ▸
// nudges to push it front/back.
const DAY_START_H = 9, DAY_END_H = 18;             // 9 AM – 6 PM span
const DAY_MINS = (DAY_END_H - DAY_START_H) * 60;   // 540 = 8h work + 1h lunch
const LUNCH_MIN = 60;                              // 1-hour lunch, never compromised
const LUNCH_AT = (13 - DAY_START_H) * 60;          // lunch fixed at 1 PM – 2 PM
const fmtDur = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`; };
const fmtDT = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
function durBetween(a?: string, b?: string): string {
  if (!a || !b) return "—";
  let ms = new Date(b).getTime() - new Date(a).getTime();
  if (isNaN(ms) || ms < 0) return "—";
  const d = Math.floor(ms / 86_400_000); ms -= d * 86_400_000;
  const h = Math.floor(ms / 3_600_000); ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  return [d && `${d}d`, h && `${h}h`, (!d && m) && `${m}m`].filter(Boolean).join(" ") || "0m";
}
// Minutes-since-9AM → a clock label like "2:00 PM" (for the drag drop-guide).
const clockOf = (m: number) => { const t = DAY_START_H * 60 + m; const h = Math.floor(t / 60), mm = t % 60; const ap = h >= 12 ? "PM" : "AM"; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(mm).padStart(2, "0")} ${ap}`; };
const HOUR_TICKS = ["9 AM", "10", "11", "12", "1 PM", "2", "3", "4", "5"];

type PlanItem = { key: string; taskId: string; label: string; dur: number; at?: number };
const INITIAL_PLAN: PlanItem[] = [
  { key: "p1", taskId: "t1", label: "10k Mentorship — Speaking Reel", dur: 90 },
  { key: "p2", taskId: "t2", label: "Careers other than NEET", dur: 90 },
  { key: "p3", taskId: "t3", label: "Careers — Speaking Reel", dur: 90 },
  { key: "p4", taskId: "t4", label: "Australia Ebook — text", dur: 90 },
  { key: "p5", taskId: "t5", label: "Germany Webinar — Reel", dur: 90 },
];

const CHAT0 = [
  { who: "Maheen", av: "Mn", color: "#2F9E6F", tm: "08:30", body: "Morning team — NEET cutoff post did 34k reach overnight.", me: false },
  { who: "You", av: "Nd", color: "#3A57E8", tm: "08:47", body: "On it — editing the 10k mentorship reel first.", me: true },
  { who: "Praveen", av: "P", color: "#C2410C", tm: "09:12", body: "Thumbnail for the Australia ebook is up in Drive.", me: false },
  { who: "Nikhil", av: "N", color: "#3A57E8", tm: "09:30", body: "Handed the Germany reel to you — accept when free.", me: false },
  { who: "Maheen", av: "Mn", color: "#2F9E6F", tm: "09:58", body: "Push the NEET reel first, ads can wait till noon.", me: false },
  { who: "Manya", av: "M", color: "#E0791F", tm: "10:24", body: "Reel script is final — B-roll notes are in the doc.", me: false },
  { who: "You", av: "Nd", color: "#3A57E8", tm: "10:31", body: "Got it. Germany reel accepted 👍", me: true },
];

// WhatsApp-style: a list of conversations (Team group + 1-on-1 DMs). Click a row
// to open that thread.
type ChatMsg = { who: string; av: string; color: string; tm: string; body: string; me: boolean };
type Convo = { id: string; name: string; group?: boolean; av?: string; color?: string; online?: boolean; unread: number; msgs: ChatMsg[] };
const CONVOS_INIT: Record<string, Convo> = {
  team: { id: "team", name: "Team chat", group: true, online: true, unread: 0, msgs: CHAT0 },
  maheen: { id: "maheen", name: "Maheen Ejaz", av: "Mn", color: "#2F9E6F", online: true, unread: 0, msgs: [
    { who: "Maheen", av: "Mn", color: "#2F9E6F", tm: "09:58", body: "Push the NEET reel first — ads can wait till noon.", me: false },
    { who: "You", av: "Nd", color: "#3A57E8", tm: "10:02", body: "On it 👍", me: true },
  ] },
  manya: { id: "manya", name: "Manya", av: "M", color: "#E0791F", online: true, unread: 0, msgs: [
    { who: "Manya", av: "M", color: "#E0791F", tm: "10:24", body: "Reel script is final — B-roll notes are in the doc.", me: false },
    { who: "You", av: "Nd", color: "#3A57E8", tm: "10:26", body: "Great, starting the cut now.", me: true },
  ] },
  praveen: { id: "praveen", name: "Praveen", av: "P", color: "#C2410C", online: false, unread: 0, msgs: [
    { who: "Praveen", av: "P", color: "#C2410C", tm: "09:12", body: "Thumbnail for the Australia ebook is up in Drive.", me: false },
  ] },
  nikhil: { id: "nikhil", name: "Nikhil", av: "N", color: "#3A57E8", online: true, unread: 1, msgs: [
    { who: "Nikhil", av: "N", color: "#3A57E8", tm: "09:30", body: "Left the Germany short in the pool for you to claim.", me: false },
  ] },
};

const TONE: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "#E3F5EA", fg: "#1AA053" },
  info: { bg: "#E1F4F5", fg: "#079AA2" },
  brand: { bg: "#E9ECFB", fg: "#3A57E8" },
  warn: { bg: "#FEF3E2", fg: "#D97706" },
  bad: { bg: "#FBE7E4", fg: "#C03221" },
  muted: { bg: "#F0F2F8", fg: "#8A92A6" },
};

const PRIO: Record<"High" | "Medium" | "Low", { bg: string; fg: string }> = {
  High: { bg: "#FBE7E4", fg: "#C03221" },
  Medium: { bg: "#E1F4F5", fg: "#079AA2" },
  Low: { bg: "#F0F2F8", fg: "#8A92A6" },
};

// Content Calendar Type options (exact Airtable list). Design/static types route
// to the designer (Praveen); video types drop into the editors' claim pool.
const DESIGN_TYPES = ["Atomic Essay", "Post", "Carousel", "Story (Image)", "Reel Thumbnail", "YouTube Thumbnail", "Meta Ads"] as const;
const VIDEO_TYPES = ["Reel - Original", "Reel - Cut", "YouTube Long-Form", "YouTube Shorts", "Story (Video)"] as const;
const CC_TYPES = [...DESIGN_TYPES, ...VIDEO_TYPES];
const CC_SBUS = [
  "10K Mentorship", "12thPlus.com", "Allied Courses", "Australia-PGCP", "Buckingham Program", "Dr Divij's Course",
  "General Content", "India NEET PG Consulting", "India NEET UG Consulting", "Interview Plus", "ISIP",
  "Mentorship Platform", "Middle East", "Portfolio Plus", "Samvaya", "Special Days", "SSAHE",
  "Standard Consulting Program - Australia", "Standard Consulting Program - UK", "Standard Consulting Program - USA",
  "Study Abroad", "UK ALS Course", "UK-PGCP", "University Programs",
];

// The auto-assignment rule: given a Type, who owns the task? Design/thumbnail work
// auto-assigns to the single designer (Praveen); video work is NOT auto-assigned to
// one editor — it goes into the shared pool that Nikhil & Nandu can claim.
function autoAssign(type: string): { owner: string; toPool: boolean; note: string } {
  if ((DESIGN_TYPES as readonly string[]).includes(type)) return { owner: "Praveen", toPool: false, note: `${type} is design work → auto-assigned to Praveen (designer).` };
  if ((VIDEO_TYPES as readonly string[]).includes(type)) return { owner: "Unclaimed", toPool: true, note: `${type} is video → dropped into the editors' claim pool (Nikhil / Nandu).` };
  return { owner: "Manya", toPool: false, note: "Stays with the writer." };
}

// ── Capacity model ─────────────────────────────────────────────────────────
// An editor's working day is 9 AM–6 PM minus a protected 1h lunch = 8h (480 min).
// A task's estimate is checked against the room left in their Today's plan: if it
// fits it just auto-adds; if it doesn't, it surfaces through the pipeline.
const WORK_MIN = 480;
const DAY_END_LABEL = "6:00 PM";
function estMins(type: string): number {
  const t = (type || "").toLowerCase();
  if (/long-form/.test(t)) return 120;
  if (/reel - cut|cut/.test(t)) return 60;
  if (/reel|short|story|video/.test(t)) return 90;
  if (/carousel/.test(t)) return 60;
  if (/meta ads/.test(t)) return 45;
  return 30;
}
function fmtMins(m: number): string { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`; }
// minutes-past-9AM of the finish time → "6:30 PM"
function finishLabel(committed: number, addMin: number): string {
  const total = 9 * 60 + committed + addMin + 60; // + 1h lunch
  const h = Math.floor(total / 60), mm = total % 60;
  const ap = h >= 12 ? "PM" : "AM"; const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(mm).padStart(2, "0")} ${ap}`;
}

// A seeded urgent task (for the demo) that lands mid-day and doesn't fit — the
// entry point for the Accept & Work pipeline. Kept a 1h "cut" so a packed day
// tips ~30 min over (mirrors the storyboard).
const URGENT_TASK: Task = {
  id: "urgent1", title: "12thPlus Exam Alert — Reel Cut", meta: "Reel - Cut · urgent · today",
  status: "Content - Approved", due: "",
  detail: { typeLine: "Reel - Cut", publishes: "Today", owner: "Unclaimed", priority: "High", brand: "12thPlus.com",
    content: "Exam-notification reel — the board just released dates. Fast turnaround, must publish today.",
    creatives: [], collaborators: [PPL.manya], activity: [{ who: "Manya", text: "flagged this urgent", time: "now" }] },
};
// The editor's low-priority, no-fixed-date tasks Manya could slide to tomorrow.
const MOVABLE = [
  { id: "m1", title: "Evergreen Study Tips — Reel", note: "Evergreen · no fixed date", mins: 90 },
  { id: "m2", title: "Motivation Monday — Reel", note: "Filler content · flexible", mins: 90 },
];

// A notification in the chat-panel stack. `urgent`/`freed` carry an action.
type Notif = { id: string; kind: "urgent" | "claim" | "message" | "freed"; emoji: string; title: string; sub: string; task?: Task };

function greetingFor(h: number) {
  if (h < 5) return { word: "Working late", emoji: "🌙" };
  if (h < 12) return { word: "Good morning", emoji: "☀️" };
  if (h < 17) return { word: "Good afternoon", emoji: "👋" };
  if (h < 21) return { word: "Good evening", emoji: "🌆" };
  return { word: "Working late", emoji: "🌙" };
}

const BELL = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
const CLIP = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6H9V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m8.5 13 2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const CHATIC = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

// The full task detail — shared by the inline "Up next" panel and the Today's-plan
// popup, so both show the complete picture (title, meta, team, content, files,
// progress, activity).
const THUMB_BG = ["linear-gradient(135deg,#3A57E8,#6478F0)", "linear-gradient(135deg,#079AA2,#3AC5CD)", "linear-gradient(135deg,#E83A8A,#F582B0)", "linear-gradient(135deg,#D97706,#F0A94A)"];

// Custom status dropdown — a styled menu (not a native <select>, which can't be
// themed) so it matches the Hope card: each row shows the status's own tone dot.
function StatusDropdown({ value, onChange }: { value: CCStatus; onChange: (s: CCStatus) => void }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[STATUS[value].tone];
  return (
    <div className="status-dd">
      <button className="status-dd-btn" style={{ background: tone.bg, color: tone.fg }} onClick={() => setOpen((o) => !o)}>
        <span className="status-dot" style={{ background: tone.fg }} />
        <span className="status-dd-val">{value}</span>
        <span className="status-caret" style={{ borderTopColor: tone.fg }} />
      </button>
      {open && (
        <>
          <div className="status-dd-back" onClick={() => setOpen(false)} />
          <div className="status-dd-menu">
            {CC_STATUS_ORDER.map((s) => {
              const t = TONE[STATUS[s].tone];
              return (
                <button key={s} className={`status-dd-item ${s === value ? "on" : ""}`} onClick={() => { onChange(s); setOpen(false); }}>
                  <span className="status-dot" style={{ background: t.fg }} />
                  <span className="status-dd-item-lbl">{s}</span>
                  {s === value && <span className="status-dd-check">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// References — links + images the team drops on a task for context. Paste a URL
// or upload image files; both persist to the same backend as the Marketing Hub
// modal (reference links → mh_posts.reference_links, images → mh_attachments
// kind='reference'). Seeded from the task's own references; remounted per task.
function ReferencesSection({ initial, postId, uploadedBy, onSaved }: { initial: RefItem[]; postId: string; uploadedBy: string; onSaved: () => void }) {
  const [refs, setRefs] = useState<RefItem[]>(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const currentLinks = () => refs.filter((r) => r.kind === "link" && r.url).map((r) => r.url!) as string[];
  const saveLinks = (links: string[]) =>
    fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: postId, actor: uploadedBy, fields: { reference_links: links } }) });
  const addUrl = async () => {
    const raw = url.trim(); if (!raw) return;
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setUrl("");
    setRefs((r) => [...r, { kind: "link", label: raw.replace(/^https?:\/\//i, ""), url: href }]);
    await saveLinks([...currentLinks(), href]); onSaved();
  };
  const addImages = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("postId", postId); fd.append("uploadedBy", uploadedBy); fd.append("kind", "reference"); fd.append("file", f);
        await fetch("/api/marketing-hub/attach", { method: "POST", body: fd });
      }
    } finally { setBusy(false); onSaved(); }
  };
  const remove = async (i: number) => {
    const item = refs[i];
    setRefs((r) => r.filter((_, j) => j !== i));
    if (item.kind === "image" && item.attId) await fetch(`/api/marketing-hub/attach?id=${item.attId}`, { method: "DELETE" });
    else if (item.kind === "link" && item.url) await saveLinks(currentLinks().filter((l) => l !== item.url));
    onSaved();
  };
  return (
    <>
      <div className="section-lbl">References</div>
      <div className="refs">
        {refs.map((r, i) => r.kind === "image" ? (
          <div key={i} className="thumb ref-thumb" title={r.label}>
            <div className="thumb-img" style={{ backgroundImage: `url(${r.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
            <div className="thumb-name">{r.label}</div>
            <button className="ref-x" onClick={() => remove(i)} title="Remove">✕</button>
          </div>
        ) : (
          <a key={i} className="ref-link" href={r.url} target="_blank" rel="noreferrer" title={r.url}>
            <span className="ref-link-ic">🔗</span>
            <span className="ref-link-lbl">{r.label}</span>
            <span className="ref-x sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(i); }} title="Remove">✕</span>
          </a>
        ))}
        <label className="thumb thumb-add" title="Add reference image">
          <span className="thumb-add-plus">＋</span><span className="thumb-add-lbl">{busy ? "…" : "Image"}</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      <div className="ref-url">
        <input className="nt-input" placeholder="Paste a reference URL…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} />
        <button className="btn primary sm" onClick={addUrl} disabled={!url.trim()}>Add link</button>
      </div>
    </>
  );
}

function TaskBody({ task, label, onStatusChange, onSetDuration, uploadedBy, onSaved }: { task: Task; label?: string; onStatusChange?: (s: CCStatus) => void; onSetDuration?: (mins: number) => void; canSchedule?: boolean; uploadedBy?: string; onSaved?: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyContent = () => { try { navigator.clipboard?.writeText(task.detail.content); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const tone = TONE[STATUS[task.status].tone];
  // Collaborators = the writer(s)/helpers on the task — kept separate from Owner
  // (the single person who claimed / does it), mirroring the Airtable model.
  const collabs = task.detail.collaborators;
  return (
    <>
      {/* Header — title + sub on the left, STATUS dropdown pinned top-right (above owner) */}
      <div className="d-head">
        <div className="d-head-main">
          {label && <div className="lbl" style={{ marginBottom: ".45rem" }}>{label}</div>}
          <div className="d-title">{task.title}</div>
          <div className="d-sub">{task.detail.typeLine} · {task.detail.brand} · Publishes {task.detail.publishes}</div>
        </div>
        <div className="status-box">
          <div className="mlbl">Status</div>
          {onStatusChange ? (
            <StatusDropdown value={task.status} onChange={onStatusChange} />
          ) : (
            <span className="pill" style={{ background: tone.bg, color: tone.fg }}>{STATUS[task.status].label}</span>
          )}
          {onSetDuration && (
            <div className="dur-ctl">
              <span className="dur-ic" title="Task duration">⏱</span>
              <select className="dur-select" value={task.detail.duration ?? ""} onChange={(e) => onSetDuration(Number(e.target.value))}>
                <option value="" disabled>Set duration…</option>
                {[15, 30, 45, 60, 90, 120, 150, 180, 240].map((m) => <option key={m} value={m}>{fmtDur(m)}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Owner (claimer) and Collaborators (writer) are distinct fields */}
      <div className="meta-grid">
        <div>
          <div className="mlbl">Owner</div>
          <div className="mval">{task.detail.owner}</div>
        </div>
        <div>
          <div className="mlbl">Collaborators</div>
          {collabs.length ? (
            <div className="collab-cell">
              {collabs.map((c, i) => <span key={i} className="av av-sm" style={{ background: c.color }} title={c.name}>{c.av}</span>)}
              <span className="collab-names">{collabs.map((c) => c.name).join(", ")}</span>
            </div>
          ) : <div className="mval" style={{ color: "var(--faint)" }}>—</div>}
        </div>
        <div>
          <div className="mlbl">Priority</div>
          <span className="pill" style={{ background: PRIO[task.detail.priority].bg, color: PRIO[task.detail.priority].fg }}>{task.detail.priority}</span>
        </div>
      </div>

      {/* Task clock — captured on create → done, so you can see how long it took */}
      <div className="meta-grid" style={{ marginTop: ".1rem" }}>
        <div><div className="mlbl">Created</div><div className="mval">{fmtDT(task.detail.createdAt)}</div></div>
        <div><div className="mlbl">Started</div><div className="mval">{fmtDT(task.detail.startAt)}</div></div>
        <div><div className="mlbl">{task.detail.endAt ? "Time taken" : "Status"}</div><div className="mval">{task.detail.endAt ? durBetween(task.detail.startAt, task.detail.endAt) : "In progress"}</div></div>
      </div>

      <div className="section-head">
        <span className="section-lbl">Content brief</span>
        <button className="copy-btn" onClick={copyContent}>{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      {/* Full write-up, exactly as typed — every line/paragraph preserved, no inner
          scroll (the section grows; you scroll the card/page to read it all). */}
      <div className="brief brief-full">{task.detail.content}</div>

      <div className="section-lbl">Creatives &amp; files</div>
      {task.detail.creatives.length ? (
        <div className="thumbs">
          {task.detail.creatives.map((f, i) => (
            <div key={i} className="thumb" title={f.name}>
              <div className="thumb-img" style={{ background: THUMB_BG[i % THUMB_BG.length] }}>
                {f.type === "video" && <span className="thumb-play">▶</span>}
                {f.type === "doc" && <span className="thumb-doc">📄</span>}
              </div>
              <div className="thumb-name">{f.name}</div>
            </div>
          ))}
          <label className="thumb thumb-add"><span className="thumb-add-plus">＋</span><span className="thumb-add-lbl">Add</span></label>
        </div>
      ) : (
        <label className="upload-drop">
          <span className="upload-ic">⬆</span>
          <span><b>Upload files</b><span className="upload-sub">Drag &amp; drop or click to add creatives</span></span>
        </label>
      )}

      <ReferencesSection key={task.id} initial={task.detail.references || []} postId={task.id} uploadedBy={uploadedBy || "maheen"} onSaved={onSaved || (() => {})} />

      <div className="section-lbl">Recent activity</div>
      <div className="activity">
        {task.detail.activity.map((a, i) => (
          <div key={i} className="act-row"><b>{a.who}</b> {a.text}<span className="act-time"> · {a.time}</span></div>
        ))}
      </div>
    </>
  );
}

// Custom Hope-themed date picker (replaces the OS-native <input type=date> calendar).
function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const base = value ? new Date(value + "T00:00:00") : new Date();
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const p2 = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, m: number, d: number) => `${y}-${p2(m + 1)}-${p2(d)}`;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const sel = value ? new Date(value + "T00:00:00") : null;
  const now = new Date();
  const startDow = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const label = sel ? sel.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "";
  const shift = (dir: number) => setView((v) => { const m = v.m + dir; if (m < 0) return { y: v.y - 1, m: 11 }; if (m > 11) return { y: v.y + 1, m: 0 }; return { y: v.y, m }; });
  return (
    <div className="dp">
      <button type="button" className="dp-field" onClick={() => setOpen((o) => !o)}>
        <span className={label ? "" : "dp-ph"}>{label || "Pick a date"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="dp-cal"><rect x="3" y="4.5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M3 9h18M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <>
          <div className="dp-backdrop" onClick={() => setOpen(false)} />
          <div className="dp-pop">
            <div className="dp-head">
              <span className="dp-title">{MONTHS[view.m]} {view.y}</span>
              <div className="dp-nav"><button type="button" onClick={() => shift(-1)}>‹</button><button type="button" onClick={() => shift(1)}>›</button></div>
            </div>
            <div className="dp-grid dp-dow">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="dp-grid">
              {cells.map((d, i) => d === null ? <span key={i} className="dp-empty" /> : (
                <button key={i} type="button"
                  className={`dp-day ${sel && sel.getFullYear() === view.y && sel.getMonth() === view.m && sel.getDate() === d ? "sel" : ""} ${now.getFullYear() === view.y && now.getMonth() === view.m && now.getDate() === d ? "today" : ""}`}
                  onClick={() => { onChange(iso(view.y, view.m, d)); setOpen(false); }}>{d}</button>
              ))}
            </div>
            <div className="dp-foot">
              <button type="button" className="dp-link" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
              <button type="button" className="dp-link" onClick={() => { onChange(iso(now.getFullYear(), now.getMonth(), now.getDate())); setView({ y: now.getFullYear(), m: now.getMonth() }); setOpen(false); }}>Today</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Create-task flow (writer/Manya only). On submit it runs the Type→owner routing
// so you can watch where the task lands — design types to Praveen, video to the
// editors' claim pool. The routing preview updates live as you change the Type.
function NewTaskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (t: Task, owner: string, note: string) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("Reel Thumbnail");
  const [sbu, setSbu] = useState<string>(CC_SBUS[0]);
  const [priority, setPriority] = useState<"High" | "Medium" | "Low">("Medium");
  const [status, setStatus] = useState<CCStatus>("Content - Pending");
  const [content, setContent] = useState("");
  const [publishDate, setPublishDate] = useState(""); // the writer picks it — no auto-date
  const assign = autoAssign(type);
  const canSubmit = !!title.trim() && !!content.trim() && !!publishDate; // required fields
  function create() {
    if (!canSubmit) return;
    const due = publishDate; // the writer's chosen publishing date (no +3 assumption)
    const publishes = new Date(publishDate + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    // Content-first: the task starts with the writer (Manya) in the content phase.
    // It auto-hands off to the producer (Praveen / claim pool) only once she moves
    // it to "Content - Approved" — handled in setTaskStatus.
    const t: Task = {
      id: `t${Date.now()}`,
      title: title.trim(),
      meta: `${type} · content`,
      status,
      due,
      detail: {
        typeLine: type, publishes, owner: "Manya", priority, brand: sbu,
        content: content.trim(),
        creatives: [], collaborators: [],
        activity: [{ who: "Manya", text: "created the task", time: "now" }],
      },
    };
    onCreate(t, "Manya", assign.note);
  }
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card nt-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">✕</button>
        <div className="lbl" style={{ marginBottom: ".5rem" }}>New task · created by Manya</div>
        <div className="d-title" style={{ marginBottom: "1.1rem" }}>Create a content task</div>
        <div className="nt-field"><label className="nt-label">Particulars <span className="nt-req">required</span></label><input className="nt-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AMC Exam Guide — Thumbnail" /></div>
        <div className="nt-row">
          <div className="nt-field"><label className="nt-label">Type</label><select className="nt-input" value={type} onChange={(e) => setType(e.target.value)}>{CC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="nt-field"><label className="nt-label">Priority</label><select className="nt-input" value={priority} onChange={(e) => setPriority(e.target.value as "High" | "Medium" | "Low")}>{["High", "Medium", "Low"].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        </div>
        <div className="nt-field"><label className="nt-label">Publishing date <span className="nt-req">required</span> <span className="nt-hint">the writer sets this — no auto-date</span></label><DatePicker value={publishDate} onChange={setPublishDate} /></div>
        <div className="nt-row">
          <div className="nt-field"><label className="nt-label">SBU</label><select className="nt-input" value={sbu} onChange={(e) => setSbu(e.target.value)}>{CC_SBUS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="nt-field"><label className="nt-label">Status</label><select className="nt-input" value={status} onChange={(e) => setStatus(e.target.value as CCStatus)}>{CC_STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
        <div className="nt-field"><label className="nt-label">Content <span className="nt-req">required</span> <span className="nt-hint">the write-up · the main thing</span></label><textarea className="nt-input nt-textarea" value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Write the content / brief here — hook, body, CTA, specs…" /></div>
        <div className="nt-assign">
          <span className="status-dot" style={{ background: "#8A92A6" }} />
          <span><b>Flow:</b> starts with <b>Manya</b> in the content phase. On <b>Content - Approved</b> it auto-hands off to {assign.toPool ? <b>the editors&apos; claim pool (Nikhil / Nandu)</b> : <b>{assign.owner}</b>} — because {type} is {assign.toPool ? "video" : "design"} work.</span>
        </div>
        <div className="nt-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={create} disabled={!canSubmit}>Create task</button>
        </div>
      </div>
    </div>
  );
}

// The notification stack — sits at the TOP of the chat panel and pushes the chat
// down (never overlays it). Urgent/freed notifications carry an Accept & Work
// action; claims and messages are informational.
function NotificationStack({ notifs, onAccept, onDismiss, onClearAll }: { notifs: Notif[]; onAccept: (n: Notif) => void; onDismiss: (id: string) => void; onClearAll: () => void }) {
  if (!notifs.length) return null;
  return (
    <div className="notif-stack">
      <div className="nstack-head"><span>{notifs.length} notification{notifs.length > 1 ? "s" : ""}</span><button className="nstack-clear" onClick={onClearAll}>Clear all</button></div>
      {notifs.map((n) => (
        <div key={n.id} className={`pnotif ${n.kind}`}>
          <div className={`pn-ic ${n.kind}`}>{n.emoji}</div>
          <div className="pn-body">
            {n.kind === "urgent" && <div className="pn-eyebrow">Urgent · must publish today</div>}
            <div className="pn-title">{n.title}</div>
            <div className="pn-sub">{n.sub}</div>
            {(n.kind === "urgent" || n.kind === "freed") && (
              <div className="pn-acts">
                <button className="btn primary sm" onClick={() => onAccept(n)}>Accept &amp; work</button>
                {n.kind === "urgent" && <button className="btn sm" onClick={() => onDismiss(n.id)}>Later</button>}
              </div>
            )}
          </div>
          <button className="pn-x" onClick={() => onDismiss(n.id)} title="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

// Accept & Work — does the capacity math against the person's Today's plan and
// offers the two honest choices: take the overtime, or ask Manya to free room.
function AcceptWorkModal({ task, committed, onAcceptWork, onAskManya, onClose }: { task: Task; committed: number; onAcceptWork: () => void; onAskManya: () => void; onClose: () => void }) {
  const add = estMins(task.detail.typeLine);
  const free = Math.max(0, WORK_MIN - committed);
  const fits = add <= free;
  const over = Math.max(0, committed + add - WORK_MIN);
  const finish = finishLabel(committed, add);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card aw-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">✕</button>
        <div className="aw-h">Accept this task?</div>
        <div className="aw-task"><div className="tt">{task.title}</div><div className="tm">{task.detail.typeLine} · adds ~{fmtMins(add)} to your day</div></div>
        <div className={`impact ${fits ? "ok" : ""}`}>
          <span>⏱️</span>
          {fits
            ? <span>You have <b>{fmtMins(free)}</b> free today — this fits. You'd still finish by <b>{DAY_END_LABEL}</b>.</span>
            : <span>Your day is <b>9:00 AM–{DAY_END_LABEL}</b>. Adding this pushes you to <b className="over">{finish}</b> — you'd work <b>{fmtMins(over)} over</b> your usual checkout.</span>}
        </div>
        <div className="aw-choice">
          <button className="btn primary" onClick={onAcceptWork}>{fits ? "Accept & work" : `Accept & work — finish ${finish}`}</button>
          {!fits && (<><div className="aw-or">or, if you can't stretch</div><button className="btn" onClick={onAskManya}>I&apos;m packed — ask Manya to free up room</button></>)}
        </div>
      </div>
    </div>
  );
}

// Ask Manya — shows the editor's low-priority, movable tasks so Manya can slide one
// to tomorrow. (Stage 1 simulates her freeing room right after sending.)
function AskManyaModal({ onSend, onClose }: { onSend: () => void; onClose: () => void }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card aw-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">✕</button>
        <div className="aw-h">Ask Manya to free up room</div>
        <p className="aw-p">These of yours can slip to tomorrow — Manya picks one to move so the urgent reel fits. Must-go-today tasks stay put.</p>
        <div className="tchips">
          {MOVABLE.map((m) => (
            <div key={m.id} className="tchip movable"><div className="cmid"><div className="ct">{m.title}</div><div className="cs">{m.note}</div></div><span className="pri low">Low · can move</span></div>
          ))}
        </div>
        <div className="aw-choice"><button className="btn primary" onClick={onSend}>Send request to Manya</button></div>
      </div>
    </div>
  );
}

// Manya's reschedule card — she sees the packed editor's movable tasks, slides one
// to tomorrow, and confirms. Confirming frees room in his plan (pipeline → freed).
function ManyaReschedule({ task, editorName, movedId, onMove, onConfirm }: { task: Task; editorName: string; movedId: string | null; onMove: (id: string) => void; onConfirm: () => void }) {
  return (
    <div className="card pad manya-resched">
      <div className="mr-h">
        <div className="mr-ic">⏱️</div>
        <div><div className="mr-t">{editorName} is packed — needs room for an urgent task</div><div className="mr-d">Slide one of {editorName}&apos;s low-priority reels to tomorrow so <b>{task.title}</b> fits. Must-go-today tasks stay put.</div></div>
      </div>
      <div className="tchips" style={{ marginTop: ".9rem" }}>
        {MOVABLE.map((m) => (
          <div key={m.id} className={`tchip ${movedId === m.id ? "" : "movable"}`}>
            <div className="cmid"><div className="ct">{m.title}</div><div className="cs">{movedId === m.id ? <b style={{ color: "var(--good)" }}>Moved to tomorrow ✓</b> : m.note}</div></div>
            <span className="pri low">Low</span>
            {movedId === m.id ? <span className="cap-badge some">Moved</span> : <button className="btn sm" onClick={() => onMove(m.id)}>Move to tomorrow</button>}
          </div>
        ))}
      </div>
      <div className="mr-foot">
        <span className="mr-note">{movedId ? `Frees ~1h 30m on ${editorName}'s day.` : "Pick one to move to tomorrow."}</span>
        <button className="btn primary" disabled={!movedId} onClick={onConfirm}>✓ Changes done</button>
      </div>
    </div>
  );
}

// The team capacity board on Manya's My Day — each person's day at a glance so she
// assigns with eyes open. (Seeded for the mock.)
const CAP_BOARD: { name: string; role: string; av: string; color: string; badge: "free" | "some" | "full"; free: string; blocks: { k: string; l: string; f: number }[] }[] = [
  { name: "Praveen", role: "Designer", av: "P", color: "#C2410C", badge: "free", free: "2h 30m free", blocks: [{ k: "design", l: "Australia Carousel", f: 2 }, { k: "lunch", l: "Lunch", f: 1 }, { k: "design", l: "NEET Thumbnail", f: 1.5 }, { k: "free", l: "Free", f: 2.5 }] },
  { name: "Nikhil", role: "Editor · short-form", av: "N", color: "#3A57E8", badge: "some", free: "1h 30m free", blocks: [{ k: "reel", l: "Reel A", f: 2 }, { k: "lunch", l: "Lunch", f: 1 }, { k: "reel", l: "Reel B", f: 2 }, { k: "free", l: "Free", f: 1.5 }] },
  { name: "Nandu", role: "Editor · long-form", av: "Nd", color: "#3A57E8", badge: "full", free: "Full", blocks: [{ k: "reel", l: "NEET Cutoff", f: 1.5 }, { k: "reel", l: "Germany", f: 1.5 }, { k: "lunch", l: "Lunch", f: 1 }, { k: "reel", l: "Careers", f: 1.5 }, { k: "reel", l: "Australia", f: 1.5 }, { k: "reel", l: "Motivation", f: 1.5 }] },
];
function TeamCapacityBoard() {
  return (
    <div className="card pad tcb">
      <div className="tcb-head">Team capacity — today <span className="tcb-sub">assign with everyone&apos;s day in view</span></div>
      {CAP_BOARD.map((p) => (
        <div key={p.name} className="tcb-row">
          <div className="tcb-who"><span className="av" style={{ background: p.color }}>{p.av}</span><div><div className="tcb-n">{p.name}</div><div className="tcb-r">{p.role}</div></div></div>
          <div className="tcb-tl">{p.blocks.map((b, i) => <div key={i} className={`tcb-blk ${b.k}`} style={{ flex: b.f }} title={b.l}>{b.k === "free" || b.k === "lunch" ? b.l : b.l}</div>)}</div>
          <span className={`cap-badge ${p.badge}`}>{p.free}</span>
        </div>
      ))}
      <div className="tcb-note">Assigning a video to someone <b>Full</b> pops a <b>&ldquo;send anyway, or route to a freer editor?&rdquo;</b> check — never a silent overload.</div>
    </div>
  );
}

// The Team-capacity PAGE (opened from the 👥 button, next to the bell) — its own
// screen so Manya never confuses it with her own plan. Each teammate shows their
// day planner (done faded, current highlighted + now-line) and what they're on now.
type CapBlock = { k: string; l: string; f: number; s?: "done" | "now" };
type CapPerson = { name: string; role: string; av: string; color: string; started: string; badge: "free" | "some" | "full"; free: string; nowLeft: number; now: { label: string; since: string; left: string }; blocks: CapBlock[] };
const CAP_PAGE: CapPerson[] = [
  { name: "Praveen", role: "Designer", av: "P", color: "#C2410C", started: "9:05 AM", badge: "free", free: "2h 30m free", nowLeft: 47,
    now: { label: "NEET Thumbnail", since: "1:10 PM", left: "~35m left" },
    blocks: [{ k: "design", l: "Australia Carousel", f: 2, s: "done" }, { k: "lunch", l: "Lunch", f: 1 }, { k: "design", l: "NEET Thumbnail", f: 1.5, s: "now" }, { k: "free", l: "Free", f: 2.5 }] },
  { name: "Nikhil", role: "Editor · short-form", av: "N", color: "#3A57E8", started: "9:18 AM", badge: "some", free: "1h 30m free", nowLeft: 52,
    now: { label: "Reel B — Which Branch After NEET", since: "1:40 PM", left: "~50m left" },
    blocks: [{ k: "reel", l: "Reel A", f: 2, s: "done" }, { k: "lunch", l: "Lunch", f: 1 }, { k: "reel", l: "Reel B", f: 2, s: "now" }, { k: "free", l: "Free", f: 1.5 }] },
  { name: "Nandu", role: "Editor · long-form", av: "Nd", color: "#3A57E8", started: "9:12 AM", badge: "full", free: "Full", nowLeft: 28,
    now: { label: "Germany Approbation — Reel", since: "10:40 AM", left: "~40m left" },
    blocks: [{ k: "reel", l: "NEET Cutoff", f: 1.5, s: "done" }, { k: "reel", l: "Germany Reel", f: 1.5, s: "now" }, { k: "lunch", l: "Lunch", f: 1 }, { k: "reel", l: "Careers", f: 1.5 }, { k: "reel", l: "Australia", f: 1.5 }, { k: "reel", l: "Motivation", f: 1.5 }] },
];
function TeamCapacityPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="tcp">
      <div className="tcp-head">
        <button className="tc-back" onClick={onBack} title="Back to My Day">‹</button>
        <div className="tcp-title">Team capacity <span>· today, live — who&apos;s on what</span></div>
      </div>
      {CAP_PAGE.map((p) => (
        <div key={p.name} className="card pad tcp-card">
          <div className="tcp-top">
            <span className="av" style={{ background: p.color }}>{p.av}</span>
            <div><div className="tcp-n">{p.name}</div><div className="tcp-r">{p.role}</div></div>
            <div className="tcp-status"><span className="st-badge working">● Started {p.started}</span><span className={`cap-badge ${p.badge}`}>{p.free}</span></div>
          </div>
          <div className="tl-ticks tcp-ticks">{HOUR_TICKS.map((t, i) => <span key={i}>{t}</span>)}</div>
          <div className="tcp-track">
            {p.blocks.map((b, i) => <div key={i} className={`tcp-blk ${b.k} ${b.s || ""}`} style={{ flex: b.f }} title={b.l}>{b.l}{b.s === "done" && <div className="tcp-bm">done</div>}{b.s === "now" && <div className="tcp-bm">now</div>}</div>)}
            <div className="tcp-now-line" style={{ left: `${p.nowLeft}%` }} />
          </div>
          <div className="tcp-now"><span className="dot" /> Currently working on: <b>{p.now.label}</b> <span className="muted">· since {p.now.since} · {p.now.left}</span></div>
        </div>
      ))}
      <div className="hint" style={{ padding: "0 .3rem" }}>Opened from the 👥 button — a separate page, so it never gets mixed up with your own plan.</div>
    </div>
  );
}

// End-today wrap-up — confirm what's done; unchecked tasks roll to tomorrow.
function EndTodayModal({ tasks, onEnd, onClose }: { tasks: { id: string; title: string }[]; onEnd: (done: number, roll: number) => void; onClose: () => void }) {
  const [done, setDone] = useState<Set<string>>(new Set(tasks.slice(0, Math.ceil(tasks.length / 2)).map((t) => t.id)));
  const toggle = (id: string) => setDone((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const doneN = done.size, rollN = tasks.length - doneN;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card aw-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">✕</button>
        <div className="aw-h">Wrap up your day</div>
        <p className="aw-p">Confirm what you finished today. Anything unchecked rolls to tomorrow.</p>
        {tasks.length === 0 && <div className="empty" style={{ padding: "1rem 0" }}>No tasks on your plate today.</div>}
        {tasks.map((t) => {
          const isDone = done.has(t.id);
          return (
            <div key={t.id} className={`eod-row ${isDone ? "" : "roll"}`}>
              <span className={`eod-cb ${isDone ? "on" : ""}`} onClick={() => toggle(t.id)}>{isDone ? "✓" : ""}</span>
              <span className="eod-title">{t.title}</span>
              <span className={`eod-tag ${isDone ? "done" : "roll"}`}>{isDone ? "Done" : "→ Tomorrow"}</span>
            </div>
          );
        })}
        <div className="eod-foot">
          <span className="m-note">{doneN} done · {rollN} roll to tomorrow</span>
          <div style={{ display: "flex", gap: ".5rem" }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn rose" onClick={() => onEnd(doneN, rollN)}>End today</button></div>
        </div>
      </div>
    </div>
  );
}

export function HopeMyDay() {
  const [person, setPerson] = useState("nandu");
  const [sel, setSel] = useState(0);
  const [claimPool, setClaimPool] = useState<Task[]>([]);             // videos up for grabs (live)
  const [showClaimPool, setShowClaimPool] = useState(false);          // editors' claim-pool modal
  const [claimedTasks, setClaimedTasks] = useState<Task[]>([]);        // videos I claimed this session
  const [tasks, setTasks] = useState<Task[]>([]);                     // my tasks — live from mh_posts (status is mutable)
  const [loading, setLoading] = useState(true);                       // first live load in flight
  const [taskTab, setTaskTab] = useState("active");                    // status tab
  const [reminders, setReminders] = useState([
    { text: "Edit YouTube long-form — “Doctors want to marry doctors”.", done: false },
    { text: "Add captions to Samvaya reel — English + Hindi.", done: false },
    { text: "Render final AMC pathway teaser at 4K.", done: true },
  ]);
  const [newRem, setNewRem] = useState("");
  const [convos, setConvos] = useState(CONVOS_INIT);          // WhatsApp-style conversations
  const [activeChat, setActiveChat] = useState<string | null>(null); // open thread (null = list)
  const [msg, setMsg] = useState("");
  const [clock, setClock] = useState<{ time: string; date: string; greet: { word: string; emoji: string } } | null>(null);

  const [panel, setPanel] = useState<null | "notif" | "rem">(null); // top-bar popover
  const [planModalId, setPlanModalId] = useState<string | null>(null); // Today's-plan popup
  const [plan, setPlan] = useState<PlanItem[]>(INITIAL_PLAN);         // reorderable plan
  const dragKey = useRef<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const grabDX = useRef(0);                          // px between the cursor and the block's LEFT edge at grab
  const [dropAt, setDropAt] = useState<number | null>(null); // live guide: where a dragged task would start
  const [nowMin, setNowMin] = useState<number | null>(null);          // minutes since 9 AM
  const [isWeekend, setIsWeekend] = useState(false);
  const [todayStr, setTodayStr] = useState("");                       // YYYY-MM-DD for due-date sorting
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPinned, setChatPinned] = useState(false);
  const [toast, setToast] = useState<null | { who: string; color: string; av: string; body: string; convo?: string }>(null);
  const [showNew, setShowNew] = useState(false); // create-task modal (Manya only)
  const [notifs, setNotifs] = useState<Notif[]>([]);   // chat-panel notification stack
  const [acceptTask, setAcceptTask] = useState<Task | null>(null); // Accept & Work modal
  const [askManya, setAskManya] = useState(false);     // Ask-Manya reschedule modal
  // The urgent-task pipeline state, shared across the editor and Manya views:
  // offered → (editor asks) waiting → (Manya frees room) freed → (editor accepts) done.
  const [pipeline, setPipeline] = useState<"offered" | "waiting" | "freed" | "done">("offered");
  const [movedId, setMovedId] = useState<string | null>(null); // which task Manya slid to tomorrow
  const [screen, setScreen] = useState<"myday" | "team">("myday"); // My Day vs Team-capacity page
  const [dayStarted, setDayStarted] = useState(false);  // Start day / End today
  const [dayStartAt, setDayStartAt] = useState("");
  const [showEod, setShowEod] = useState(false);        // End-today wrap-up modal
  const closedManually = useRef(false);
  // The claim pool surfaces PROMINENTLY on the right first; if ignored for 15s it
  // demotes into the 🔔 bell (badge only shows once demoted).
  const [poolProminent, setPoolProminent] = useState(true);

  useEffect(() => {
    const d = new Date();
    setClock({
      time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      date: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" }),
      greet: greetingFor(d.getHours()),
    });
  }, []);

  // Gentle auto-open demo: a new message arrives a few seconds in → toast + badge,
  // and the panel slides in (unless the user just closed it by hand).
  useEffect(() => {
    const id = setTimeout(() => {
      const m: ChatMsg = { who: "Manya", av: "M", color: "#E0791F", tm: "now", body: "Ping me when the first cut’s ready 👀", me: false };
      setConvos((cv) => ({ ...cv, manya: { ...cv.manya, msgs: [...cv.manya.msgs, m], unread: cv.manya.unread + 1 } }));
      setToast({ who: "Manya · new message", color: m.color, av: m.av, body: m.body, convo: "manya" });
      if (!closedManually.current) setChatOpen(true);
    }, 3600);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4400);
    return () => clearTimeout(id);
  }, [toast]);

  // Ignored claim pool → demote to the bell after 15s.
  useEffect(() => {
    if (!poolProminent || claimPool.length === 0) return;
    const id = setTimeout(() => setPoolProminent(false), 15000);
    return () => clearTimeout(id);
  }, [poolProminent, claimPool.length]);

  // Live "now" position for the red line — reruns each minute.
  useEffect(() => {
    const upd = () => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes() - DAY_START_H * 60); setIsWeekend(d.getDay() === 0 || d.getDay() === 6); setTodayStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); };
    upd(); const id = setInterval(upd, 60_000); return () => clearInterval(id);
  }, []);

  // Name of the person being viewed, in a ref so load() (a stable useCallback) can
  // read the latest value without being recreated.
  const meNameRef = useRef("");

  // Pull live task + claim-pool data from mh_posts. Called on mount and after any
  // write (status change / claim) so the board always reflects server truth.
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/my-day", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) {
        const fetched = (d.tasks as Task[]) || [];
        setTasks(fetched);
        setClaimPool((d.pool as Task[]) || []);
        // Reconcile the optimistic claim buffer against server truth: drop a claim once
        // the server confirms I own it (it now shows via `tasks`, so keeping it would
        // duplicate the row) or the row is gone — but KEEP a claim the server hasn't yet
        // reflected as mine, so a concurrent refetch can't wipe an in-flight claim.
        setClaimedTasks((prev) => prev.filter((c) => {
          const server = fetched.find((t) => t.id === c.id);
          return !!server && server.detail.owner !== meNameRef.current;
        }));
      }
    } catch { /* keep whatever we last had */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const me = useMemo(() => TEAM.find((t) => t.key === person) || TEAM[3], [person]);
  meNameRef.current = me.name;
  const isEditor = person === "nandu" || person === "nikhil"; // editors claim videos
  const showPool = isEditor && claimPool.length > 0;
  // MY DAY = only the SELECTED person's own tasks. A task's Owner (whoever it's
  // assigned to / claimed it) must match the person being viewed — so e.g. a
  // Carousel owned by Praveen never shows up under an editor. Then keep only the
  // statuses that still need work (queued/terminal states drop out of the view).
  const workingTasks = useMemo(
    () => [...claimedTasks, ...tasks].filter((t) => t.detail.owner === me.name && STATUS[t.status].inView),
    [claimedTasks, tasks, me.name],
  );
  const tabCounts = useMemo(() => TASK_TABS.map((tb) => ({ ...tb, n: workingTasks.filter((t) => tb.statuses.includes(t.status)).length })), [workingTasks]);
  // Header stat tiles — live, for the person being viewed.
  const stats = useMemo(() => {
    const mine = [...claimedTasks, ...tasks].filter((t) => t.detail.owner === me.name);
    const n = (fn: (s: CCStatus) => boolean) => mine.filter((t) => fn(t.status)).length;
    return {
      pending: n((s) => s === "Content - Pending" || s === "Content - In Progress"),
      waiting: n((s) => s === "Content - Approved" || s === "Incorporating Feedback"),
      output: n((s) => s === "Output - Ready" || s === "Output - In Progress"),
      toPublish: n((s) => s === "Ready to Publish"),
      done: n((s) => s === "Published/Scheduled"),
    };
  }, [tasks, claimedTasks, me.name]);
  const curTab = TASK_TABS.find((t) => t.key === taskTab) || TASK_TABS[0];
  // Tasks in the current tab, sorted by due date (overdue first → today → later).
  const shownTasks = useMemo(() => workingTasks.filter((t) => curTab.statuses.includes(t.status)).sort((a, b) => (a.due || "").localeCompare(b.due || "")), [workingTasks, taskTab]);
  const task = shownTasks[sel] || shownTasks[0] || null;
  const planModalTask = planModalId ? tasks.find((t) => t.id === planModalId) || null : null;
  // Change a task's status via the card's status dropdown. Two special cases:
  //  • CONTENT-FIRST HANDOFF: when the WRITER's task hits "Content - Approved", it
  //    auto-hands off to the producer by Type — design → Praveen (owner), video →
  //    the editors' claim pool — and Manya stays on as a collaborator.
  //  • Output-ready → Output tab; queued/terminal states leave the working view.
  const withManya = (cs: Person[]) => (cs.some((c) => c.name === "Manya") ? cs : [PPL.manya, ...cs]);
  const setTaskStatus = (id: string, status: CCStatus) => {
    // Persist to the real pipeline (this drives the same handoff logic the Master
    // sheet & Content Review use), then reconcile the board with server truth.
    fetch("/api/marketing-hub/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fields: { status }, actor: person }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setToast({ who: "Save failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` });
          load(); // resync — the optimistic simulation below never persisted, so revert to server truth
          return;
        }
        load();
      })
      .catch((e) => { setToast({ who: "Save failed", color: "#C03221", av: "!", body: String(e) }); load(); });

    const cur = [...tasks, ...claimedTasks].find((t) => t.id === id);
    if (!cur) return;
    // Content-first handoff fires only the first time the writer's own task is approved.
    const handoff = status === "Content - Approved" && cur.detail.owner === "Manya" ? autoAssign(cur.detail.typeLine) : null;

    if (handoff && handoff.toPool) {
      // Video → drop into the editors' claim pool (Nikhil / Nandu).
      const routed: Task = { ...cur, status, meta: `${cur.detail.typeLine} · unclaimed`, detail: { ...cur.detail, owner: "Unclaimed", collaborators: withManya(cur.detail.collaborators) } };
      setTasks((a) => a.filter((t) => t.id !== id));
      setClaimedTasks((a) => a.filter((t) => t.id !== id));
      setClaimPool((p) => [routed, ...p]);
      setToast({ who: "Approved → claim pool", color: "#3A57E8", av: me.av, body: `${cur.detail.typeLine} handed off to the editors' pool.` });
      return;
    }

    const next: Task = handoff && handoff.owner !== "Manya"
      ? { ...cur, status, meta: `${cur.detail.typeLine} · owned by ${handoff.owner}`, detail: { ...cur.detail, owner: handoff.owner, collaborators: withManya(cur.detail.collaborators) } }
      : { ...cur, status };
    setTasks((a) => a.map((t) => (t.id === id ? next : t)));
    setClaimedTasks((a) => a.map((t) => (t.id === id ? next : t)));

    if (next.detail.owner !== cur.detail.owner) setToast({ who: `Approved → ${next.detail.owner}`, color: "#3A57E8", av: (next.detail.owner[0] || "?").toUpperCase(), body: `${cur.detail.typeLine} handed off to ${next.detail.owner} (design).` });
    else if (status === "Output - Ready" || status === "Output - In Progress") setToast({ who: `${STATUS[status].label} ✓`, color: "#3A57E8", av: me.av, body: "Moved to the Output tab." });
    else if (!STATUS[status].inView) setToast({ who: `${STATUS[status].label} ✓`, color: "#3A57E8", av: me.av, body: "It's left your working view." });
  };

  // Lay the (reorderable) tasks across the day, dropping the protected 1-hour
  // lunch in around 1 PM and filling the tail with buffer.
  // Today's plan is PER-PERSON: only the current person's own, still-in-production
  // tasks land on their timeline (output-ready/published/other people's are excluded).
  const myPlan = useMemo(() => {
    const all = [...claimedTasks, ...tasks];
    return plan.filter((p) => { const t = all.find((x) => x.id === p.taskId); return !!t && t.detail.owner === me.name && STATUS[t.status].inView && t.status !== "Output - Ready"; });
  }, [plan, tasks, claimedTasks, me.name]);
  const planBlocks = useMemo(() => {
    type Blk = { kind: "reel" | "lunch" | "buffer"; key?: string; taskId?: string; label: string; start: number; dur: number };
    const out: Blk[] = [];
    const LUNCH_END = LUNCH_AT + LUNCH_MIN;
    // Remaining work is scheduled from NOW (the morning is already gone), not 9 AM.
    let cursor = Math.max(0, Math.min(nowMin ?? 0, DAY_MINS));
    let lunchDone = false;
    const pushLunch = () => { out.push({ kind: "lunch", label: "Lunch", start: LUNCH_AT, dur: LUNCH_MIN }); lunchDone = true; };
    for (const p of myPlan) {
      let remaining = p.dur;
      // Pinned start (dragged to a specific time) — jump the cursor forward to it,
      // leaving the earlier slot free. Can only push LATER than the natural flow,
      // never earlier (no overlap, no scheduling in the past).
      if (p.at != null) cursor = Math.max(cursor, Math.min(p.at, DAY_MINS));
      // If we're sitting inside the lunch window, jump past the (fixed) 1 PM lunch.
      if (!lunchDone && cursor >= LUNCH_AT && cursor < LUNCH_END) { pushLunch(); cursor = LUNCH_END; }
      // Part that fits before lunch.
      if (!lunchDone && cursor < LUNCH_AT) {
        const before = Math.min(remaining, LUNCH_AT - cursor);
        if (before > 0) { out.push({ kind: "reel", key: p.key, taskId: p.taskId, label: p.label, start: cursor, dur: before }); cursor += before; remaining -= before; }
        // The task runs into lunch → drop the protected lunch and continue after it (SPLIT).
        if (remaining > 0) { pushLunch(); cursor = LUNCH_END; }
      }
      // Remainder after lunch (or the whole task if it's already past 2 PM).
      if (remaining > 0) { out.push({ kind: "reel", key: p.key, taskId: p.taskId, label: p.label, start: cursor, dur: remaining }); cursor += remaining; }
    }
    if (!lunchDone) pushLunch(); // no task reached lunch → still park it at 1 PM
    return out;
  }, [myPlan, nowMin]);
  const workMin = myPlan.reduce((s, p) => s + p.dur, 0);
  const showNow = nowMin !== null && !isWeekend && nowMin >= 0 && nowMin <= DAY_MINS;
  const movePlan = (key: string, dir: number) => setPlan((arr) => { const i = arr.findIndex((p) => p.key === key); const j = i + dir; if (i < 0 || j < 0 || j >= arr.length) return arr; const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  // Where a dragged block's LEFT EDGE would land, given the cursor. We subtract the
  // grab offset (where inside the block you picked it up) so the block tracks the
  // cursor naturally instead of teleporting its edge under the pointer. Snapped to
  // 15 min for precise placement.
  const edgeMinFromCursor = (clientX: number): number | null => {
    const el = trackRef.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    const leftPx = clientX - grabDX.current;
    const mins = ((leftPx - r.left) / r.width) * DAY_MINS;
    return Math.max(0, Math.min(DAY_MINS, Math.round(mins / 15) * 15));
  };
  // Drag a task block onto the track to PIN its start time. Dropping it at/before
  // "now" clears the pin (the task flows normally again).
  const pinPlanAt = (mins: number | null) => {
    const key = dragKey.current; dragKey.current = null;
    setDropAt(null);
    if (!key || mins == null) return;
    const now = Math.max(0, Math.min(nowMin ?? 0, DAY_MINS));
    setPlan((arr) => arr.map((p) => (p.key === key ? { ...p, at: mins <= now ? undefined : mins } : p)));
  };
  // The producer sets how long a task takes → store it AND add/update it on Today's plan.
  const PRIO_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const setDuration = (id: string, mins: number) => {
    setTasks((a) => a.map((t) => (t.id === id ? { ...t, detail: { ...t.detail, duration: mins } } : t)));
    setClaimedTasks((a) => a.map((t) => (t.id === id ? { ...t, detail: { ...t.detail, duration: mins } } : t)));
    setPlan((p) => {
      if (p.some((x) => x.taskId === id)) return p.map((x) => (x.taskId === id ? { ...x, dur: mins } : x));
      const t = [...claimedTasks, ...tasks].find((x) => x.id === id);
      return t ? [...p, { key: `pk${id}`, taskId: id, label: t.title, dur: mins }] : p;
    });
    setToast({ who: "Duration set ✓", color: "#3A57E8", av: me.av, body: `${fmtDur(mins)} — slotted into Today's plan. Hit Auto-plan to reshuffle.` });
  };
  // AUTO-PLAN — currently RULE-BASED (no AI): highest priority first, then earliest
  // due date; tasks then flow sequentially from "now", splitting around the 1 PM lunch.
  // Deterministic and instant — same tasks always produce the same order.
  //
  // FUTURE (deferred, per Praveen 2026-07-15): this can be upgraded to an AI-driven
  // planner — feed the tasks (title, brief, priority, due, effort, the person's
  // meetings/energy) to Claude and let it reason about a smarter schedule (batch
  // similar work, respect dependencies, put creative work in focus blocks, etc.).
  // Keep the rule-based path as the instant/offline fallback. See setPlan sort below.
  const autoPlan = () => {
    setPlan((p) => {
      const all = [...claimedTasks, ...tasks];
      // Reshuffle drops any manual pins — everything re-flows from now.
      return [...p].map((x) => ({ ...x, at: undefined })).sort((a, b) => {
        const ta = all.find((x) => x.id === a.taskId), tb = all.find((x) => x.id === b.taskId);
        const pa = ta ? PRIO_RANK[ta.detail.priority] : 1, pb = tb ? PRIO_RANK[tb.detail.priority] : 1;
        return pa - pb || (ta?.due || "9999").localeCompare(tb?.due || "9999");
      });
    });
    setToast({ who: "Auto-planned ✓", color: "#3A57E8", av: me.av, body: "Reshuffled by priority, then due date." });
  };
  const isAdmin = person === "maheen"; // only Maheen (manager) may Send to Scheduler
  const canCreate = person === "manya"; // the writer creates content tasks
  // Create a task → apply the Type→owner routing, drop it where it belongs (design
  // → the owner's My tasks; video → the editors' claim pool), and toast the result.
  const createTask = (t: Task) => {
    setShowNew(false);
    // Persist to mh_posts. Content-first: every new task starts with the writer
    // (Manya) at "Content - Pending"; the handoff to Praveen / the editors' pool
    // fires later when she moves it to "Content - Approved" (see setTaskStatus).
    fetch("/api/marketing-hub/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: t.title,
        type: t.detail.typeLine,
        sbu: t.detail.brand,
        owner: "manya",
        publishingDate: t.due || undefined,
        dueDate: t.due || undefined,
        priority: t.detail.priority,
        content: t.detail.content,
      }),
    })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setToast({ who: "Create failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); return; }
        setToast({ who: "Created ✓", color: "#3A57E8", av: "M", body: `“${t.title}” added — starts with Manya (Content - Pending).` });
        load();
      })
      .catch((e) => setToast({ who: "Create failed", color: "#C03221", av: "!", body: String(e) }));
  };

  // ── Capacity pipeline (Accept & Work) ──
  // `workMin` (minutes booked on Today's plan) is the person's committed load.
  const addNotif = (n: Notif) => setNotifs((ns) => [n, ...ns.filter((x) => x.id !== n.id)]);
  const dismissNotif = (id: string) => setNotifs((ns) => ns.filter((n) => n.id !== id));
  const onAcceptNotif = (n: Notif) => { if (n.task) setAcceptTask(n.task); };
  const acceptWork = () => {
    const t = acceptTask; if (!t) return;
    setPlan((p) => [...p, { key: `pk${Date.now()}`, taskId: t.id, label: t.title, dur: estMins(t.detail.typeLine) }]);
    setTasks((a) => [{ ...t, status: "Content - In Progress", meta: `${t.detail.typeLine} · you accepted this`, detail: { ...t.detail, owner: me.name } }, ...a]);
    setAcceptTask(null);
    setPipeline("done");
    setToast({ who: "Accepted ✓", color: "#3A57E8", av: me.av, body: `“${t.title}” added to your plan.` });
  };
  const askManyaToMove = () => { setAcceptTask(null); setAskManya(true); };
  // Start day / End today — same control for everyone (Manya, Praveen, Nikhil, Nandu).
  // Team-capacity page is Manya-only — snap back to My Day if the view switches away.
  useEffect(() => { if (person !== "manya") setScreen("myday"); }, [person]);
  const startDay = () => { setDayStarted(true); setDayStartAt(clock?.time || "now"); };
  const endToday = (doneCount: number, rollCount: number) => {
    setDayStarted(false); setShowEod(false);
    setToast({ who: "Day wrapped ✓", color: "#1AA053", av: me.av, body: `${doneCount} done · ${rollCount} rolled to tomorrow.` });
  };
  // Editor sends the reschedule ask → the request goes to Manya (pipeline: waiting).
  const sendToManya = () => {
    setAskManya(false);
    setPipeline("waiting");
    setToast({ who: "Sent to Manya", color: "#3A57E8", av: me.av, body: "She'll free a slot — you'll get a heads-up." });
  };
  // Manya confirms the reschedule → slides the chosen task out, frees room, and the
  // editor's pipeline flips to "freed" (they'll see the follow-up notification).
  const manyaConfirmMove = () => {
    setPlan((p) => (p.length > 1 ? p.slice(0, -1) : p)); // free ~1h 30m on the editor's day
    setPipeline("freed");
    setToast({ who: "Room freed ✓", color: "#1AA053", av: me.av, body: "Slid a low-priority reel to tomorrow — Nandu can take the urgent one now." });
  };
  // Real notifications, polled from the activity log — claims, handoffs, send-backs
  // and pushes-to-schedule relevant to the person being viewed. Refetched on person
  // switch and every 20s so a claim/hand-off shows up shortly after it happens.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch(`/api/my-day/notifications?person=${person}`, { cache: "no-store" });
        const d = await r.json();
        if (alive && r.ok) setNotifs((d.notifs as Notif[]) || []);
      } catch { /* keep the last batch on a transient error */ }
    };
    pull();
    const id = setInterval(pull, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, [person]);
  // My-tasks row → expands inline in the "Up next" panel (setSel).
  // Today's-plan block → opens the task in a popup (like the original dashboard).
  // Claim a video → you become the owner; it leaves the pool and lands in My tasks.
  const claimVideo = (v: Task) => {
    // Optimistic: it leaves the pool and lands in My tasks immediately. Claiming is
    // ownership only — the status STAYS "Content - Approved" (the editor may not start
    // cutting for a while), matching what the takeover write persists on the server.
    setClaimPool((p) => p.filter((x) => x.id !== v.id));
    const claimed: Task = { ...v, status: "Content - Approved", meta: `${v.detail.typeLine} · you claimed this`, detail: { ...v.detail, owner: me.name } };
    setClaimedTasks((c) => [claimed, ...c]);
    setSel(0); // open the freshly claimed task in "Up next"
    setToast({ who: "Claimed ✓", color: me.color, av: me.av, body: `You claimed “${v.title}” — it's yours now, added to My tasks.` });
    // Persist the ownership takeover, then reconcile with server truth. On failure,
    // roll back the optimistic claim (restore it to the pool) and surface the error —
    // never leave the editor believing they own a video the server never took over.
    const rollback = (body: string) => {
      setClaimedTasks((c) => c.filter((x) => x.id !== v.id));
      setClaimPool((p) => (p.some((x) => x.id === v.id) ? p : [v, ...p]));
      setToast({ who: "Claim failed", color: "#C03221", av: "!", body });
    };
    fetch("/api/marketing-hub/takeover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: v.id, newOwnerKey: person }),
    })
      .then(async (res) => {
        if (res.ok) { load(); return; }
        const j = await res.json().catch(() => ({}));
        rollback(j.error || `HTTP ${res.status}`);
      })
      .catch((e) => rollback(String(e)));
  };
  const remOpen = reminders.filter((r) => !r.done).length;
  const remDone = reminders.length - remOpen;

  const totalUnread = Object.values(convos).reduce((s, c) => s + c.unread, 0);
  const openChat = () => { setChatOpen(true); closedManually.current = false; };
  const closeChat = () => { if (chatPinned) return; setChatOpen(false); closedManually.current = true; };
  const openConvo = (id: string) => { setActiveChat(id); setConvos((cv) => ({ ...cv, [id]: { ...cv[id], unread: 0 } })); };
  const addReminder = () => { const t = newRem.trim(); if (!t) return; setReminders((r) => [{ text: t, done: false }, ...r]); setNewRem(""); };
  const send = () => {
    const t = msg.trim(); if (!t || !activeChat) return;
    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const mine: ChatMsg = { who: "You", av: me.av, color: me.color, tm: now, body: t, me: true };
    setConvos((cv) => ({ ...cv, [activeChat]: { ...cv[activeChat], msgs: [...cv[activeChat].msgs, mine] } }));
    setMsg("");
  };

  return (
    <div className="hmd">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* click-away layer for the top popovers */}
      {panel && <div className="backdrop" onClick={() => setPanel(null)} />}

      {/* (Videos-up-for-grabs now surfaces through the chat-panel notification stack.) */}

      <div className="shell">
      {/* ── Shared V2 Hope sidebar — same grouped nav as every other V2 page,
             so every link stays inside /dashboard/hope-preview (no V1 leaks). ── */}
      <HopeSidebar active="my-day" />

      <div className={`main ${chatOpen ? "chatpad" : ""}`}>

        {/* TOP BAR — title + icon triggers */}
        <div className="topbar">
          <p className="banner">
            <b>Hope UI theme · My Day</b>
            <span className="tagchg">Version 2 preview</span>
            <span>collapsible chat · icon inbox · wider workspace</span>
          </p>
          <div className="icons">
            {/* Start / End day — same control for everyone */}
            {!dayStarted ? (
              <button className="daybtn" onClick={startDay}>▶ Start day</button>
            ) : (
              <span className="daybar"><span className="daychip"><span className="pulse" />Started {dayStartAt}</span><button className="btn sm endbtn" onClick={() => setShowEod(true)}>■ End today</button></span>
            )}
            {/* Team capacity — Manya only, a clearly-labelled button next to the day control */}
            {person === "manya" && (
              <button className={`teamcapbtn ${screen === "team" ? "on" : ""}`} onClick={() => setScreen(screen === "team" ? "myday" : "team")}>
                <IconUsers size={15} stroke={1.8} /> {screen === "team" ? "Back to My Day" : "Team capacity"}
              </button>
            )}
            {/* Claim pool — editors (Nikhil / Nandu): the video work they can pick up */}
            {isEditor && (
              <button className={`teamcapbtn ${showClaimPool ? "on" : ""}`} onClick={() => setShowClaimPool(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M16.5 10l5-2.5v9L16.5 14" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
                Claim pool{claimPool.length > 0 && <span className="teamcap-n">{claimPool.length}</span>}
              </button>
            )}
            <button className={`iconbtn ${panel === "notif" ? "on" : ""}`} title="Videos up for grabs" onClick={() => setPanel(panel === "notif" ? null : "notif")}>
              {BELL}{showPool && !poolProminent && <span className="badge">{claimPool.length}</span>}
            </button>
            <button className={`iconbtn ${panel === "rem" ? "on" : ""}`} title="Reminders" onClick={() => setPanel(panel === "rem" ? null : "rem")}>
              {CLIP}{remOpen > 0 && <span className="badge">{remOpen}</span>}
            </button>
            <button className={`iconbtn ${chatOpen ? "on" : ""}`} title="Team chat" onClick={() => (chatOpen ? closeChat() : openChat())}>
              {CHATIC}{!chatOpen && totalUnread > 0 && <span className="badge rose">{totalUnread}</span>}
            </button>

            {/* VIDEOS UP FOR GRABS popover — claim to become the owner */}
            {panel === "notif" && (
              <div className="popover pop-wide">
                <div className="pop-head"><span className="lbl">Videos up for grabs</span>{isEditor && <span className="muted" style={{ fontSize: ".7rem" }}>{claimPool.length} unclaimed</span>}</div>
                {!isEditor ? (
                  <div className="empty">Your work is auto-assigned — nothing to claim.</div>
                ) : claimPool.length ? (
                  claimPool.map((v) => (
                    <div key={v.id} className="claim-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="claim-title">{v.title}</div>
                        <div className="claim-meta">{v.detail.typeLine} · {v.detail.brand}</div>
                      </div>
                      <button className="btn primary sm" onClick={() => claimVideo(v)}>Claim</button>
                    </div>
                  ))
                ) : <div className="empty">All claimed — nothing up for grabs ✓</div>}
              </div>
            )}

            {/* REMINDERS popover */}
            {panel === "rem" && (
              <div className="popover">
                <div className="pop-head"><span className="lbl">Reminders</span><span className="muted" style={{ fontSize: ".7rem" }}>{remOpen} open · {remDone} done</span></div>
                {reminders.map((r, i) => (
                  <div key={i} className={`note ${r.done ? "done" : ""}`} onClick={() => setReminders((arr) => arr.map((x, j) => j === i ? { ...x, done: !x.done } : x))}>
                    <span className="cb" /><span>{r.text}</span>
                  </div>
                ))}
                <div className="compose">
                  <input placeholder="Add a reminder…" value={newRem} onChange={(e) => setNewRem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addReminder()} />
                  <button className="btn primary sm" onClick={addReminder}>Add</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {screen === "team" ? (
          <TeamCapacityPage onBack={() => setScreen("myday")} />
        ) : (
        <>
        {/* 1 · HEADER BAND */}
        <div className="card pad headband">
          <div className="who">
            <div className="hi">{clock ? `${clock.greet.word}, ${me.name}` : `Hello, ${me.name}`}</div>
            <div className="sub">{me.role} · {clock ? `${clock.date}, ${clock.time}` : "—"} · Bengaluru 23° · <span style={{ color: "#1AA053" }}>● live</span></div>
          </div>
          <div className="switch" role="tablist" aria-label="Teammate">
            {TEAM.map((t) => <button key={t.key} className={t.key === person ? "on" : ""} onClick={() => setPerson(t.key)}>{t.name}</button>)}
          </div>
          <div className="stats">
            <div className="stat"><div className="n w">{stats.pending}</div><div className="k">Pending today</div></div>
            <div className="stat"><div className="n">{stats.waiting}</div><div className="k">Waiting on me</div></div>
            <div className="stat"><div className="n b">{stats.output}</div><div className="k">Output ready</div></div>
            <div className="stat"><div className="n">{stats.toPublish}</div><div className="k">To publish</div></div>
            <div className="stat"><div className="n g">{stats.done}</div><div className="k">Done · 7d</div></div>
          </div>
        </div>

        {/* MANYA — reschedule request when an editor is packed (team capacity moved to its own page) */}
        {person === "manya" && pipeline === "waiting" && (
          <ManyaReschedule task={URGENT_TASK} editorName="Nandu" movedId={movedId} onMove={setMovedId} onConfirm={manyaConfirmMove} />
        )}

        {/* 2 · HERO — today's plan */}
        <div className="card pad hero">
          <div className="hero-head">
            <div style={{ display: "flex", alignItems: "baseline", gap: ".7rem", flexWrap: "wrap" }}>
              <h2>Today’s plan</h2>
              <span className="prog"><b style={{ color: "#232D42" }}>{fmtDur(workMin)}</b> of 8h work · 1h lunch · {fmtDur(Math.max(0, DAY_MINS - workMin - LUNCH_MIN))} free</span>
              <span className="qmark" title="8-hour workday (9 AM–6 PM) with a protected 1-hour lunch. Drag a task along the timeline to start it later; use ‹ › to reorder. Auto-plan re-flows everything from now.">?</span>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <div className="legend"><span><i className="dot" style={{ background: "#3A57E8" }} />Reel</span><span><i className="dot" style={{ background: "#D9DEEA" }} />Break</span></div>
              <button className="btn primary sm" onClick={autoPlan}>✦ Auto-plan</button>
            </div>
          </div>
          <div className="tl-wrap">
            <div className="tl-ticks">{HOUR_TICKS.map((t, i) => <span key={i}>{t}</span>)}</div>
            <div
              className="tl-track"
              ref={trackRef}
              onDragOver={(e) => { e.preventDefault(); if (dragKey.current) setDropAt(edgeMinFromCursor(e.clientX)); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDropAt(null); }}
              onDrop={(e) => { e.preventDefault(); pinPlanAt(edgeMinFromCursor(e.clientX)); }}
            >
              {/* Live drop guide — where the block's start edge will land while dragging. */}
              {dropAt !== null && (
                <div className="tl-guide" style={{ left: `${(dropAt / DAY_MINS) * 100}%` }}>
                  <span className="tl-guide-tag">{clockOf(dropAt)}</span>
                </div>
              )}
              {planBlocks.map((b) => (
                <div
                  key={`${b.kind}-${b.key || b.taskId || ""}-${b.start}`}
                  className={`tl-blk ${b.kind} ${b.kind === "reel" ? "clickable" : ""}`}
                  draggable={b.kind === "reel"}
                  onDragStart={b.kind === "reel" ? (e) => { dragKey.current = b.key!; grabDX.current = e.clientX - e.currentTarget.getBoundingClientRect().left; } : undefined}
                  onDragEnd={b.kind === "reel" ? () => { dragKey.current = null; setDropAt(null); } : undefined}
                  onClick={() => b.taskId && setPlanModalId(b.taskId)}
                  style={{ left: `${(b.start / DAY_MINS) * 100}%`, width: `${(b.dur / DAY_MINS) * 100}%` }}
                  title={b.kind === "reel" ? "Drag along the timeline to start it later · click to open" : b.kind === "lunch" ? "Protected lunch" : undefined}
                >
                  {b.kind === "reel" && (
                    <>
                      <button className="tl-nudge l" title="Move earlier" onClick={(e) => { e.stopPropagation(); movePlan(b.key!, -1); }}>‹</button>
                      <button className="tl-nudge r" title="Move later" onClick={(e) => { e.stopPropagation(); movePlan(b.key!, 1); }}>›</button>
                    </>
                  )}
                  <div className="tl-t">{b.label}</div>
                  <div className="tl-m">{b.kind === "reel" ? `Reel · ${fmtDur(b.dur)}` : b.kind === "lunch" ? "1h · protected" : `Buffer · ${fmtDur(b.dur)}`}</div>
                </div>
              ))}
              {showNow && <div className="now-line" style={{ left: `${(nowMin! / DAY_MINS) * 100}%` }}><span className="now-dot" /></div>}
            </div>
          </div>
        </div>

        {/* 3 · WORK ROW — My tasks | Up next detail (wider now) */}
        <div className="work">
          <div className="card pad">
            <div className="colhead"><h3>My tasks</h3>{canCreate ? <button className="btn primary sm" onClick={() => setShowNew(true)}>+ New task</button> : <span className="lbl">by due date</span>}</div>
            <div className="task-tabs">
              {tabCounts.map((tb) => (
                <button key={tb.key} className={`task-tab ${taskTab === tb.key ? "on" : ""}`} onClick={() => { setTaskTab(tb.key); setSel(0); }}>
                  {tb.label}<span className="task-tab-n">{tb.n}</span>
                </button>
              ))}
            </div>
            <div className="tasklist">
              {shownTasks.length === 0 && <div className="empty" style={{ padding: "1.6rem 0" }}>Nothing in “{curTab.label}” right now ✓</div>}
              {shownTasks.map((t, i) => {
                const claimed = claimedTasks.some((c) => c.id === t.id);
                const st = STATUS[t.status];
                const di = dueInfo(t.due, todayStr);
                return (
                  <div key={t.id} className={`task ${task && t.id === task.id ? "sel" : ""} ${claimed ? "just-claimed" : ""} ${di.overdue ? "overdue" : ""}`} onClick={() => setSel(i)}>
                    <div className="task-top">
                      <div className="tt">{t.title}</div>
                      <span className={`due-chip ${di.overdue ? "od" : ""}`}>{di.label}</span>
                    </div>
                    <div className="mm">{t.meta}</div>
                    <div style={{ display: "flex", gap: ".35rem", alignItems: "center" }}>
                      <span className="pill" style={{ background: TONE[st.tone].bg, color: TONE[st.tone].fg }}>{st.label}</span>
                      {claimed && <span className="pill" style={{ background: "#E9ECFB", color: "#2138B0" }}>Claimed by you</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card pad detail">
            {task ? (
              <TaskBody task={task} label="Task · opened" onStatusChange={(s) => setTaskStatus(task.id, s)} onSetDuration={(m) => setDuration(task.id, m)} canSchedule={isAdmin} uploadedBy={person} onSaved={load} />
            ) : (
              <div className="empty" style={{ padding: "3.5rem 0" }}>You’re all caught up ✓ — nothing needs work right now.</div>
            )}
          </div>
        </div>
        </>
        )}
      </div>
      </div>{/* /shell */}

      {/* TEAM CHAT — collapsible slide-in panel */}
      <aside className={`chatpanel ${chatOpen ? "open" : ""}`}>
        <NotificationStack notifs={notifs} onAccept={onAcceptNotif} onDismiss={dismissNotif} onClearAll={() => setNotifs([])} />
        {(() => {
          const active = activeChat ? convos[activeChat] : null;
          return (
            <>
              <div className="chat-head">
                {active ? (
                  <h3>
                    <button className="chat-back" onClick={() => setActiveChat(null)} title="All chats">‹</button>
                    <span className="av av-sm" style={{ background: active.group ? "var(--brand)" : active.color }}>{active.group ? "👥" : active.av}</span>
                    {active.name}
                    {active.online && <span className="online">● online</span>}
                  </h3>
                ) : (
                  <h3>Chats <span className="online">● 4 online</span></h3>
                )}
                <div className="chat-head-acts">
                  <button className={`pinbtn ${chatPinned ? "on" : ""}`} onClick={() => setChatPinned((p) => !p)} title={chatPinned ? "Unpin" : "Pin open"}>{chatPinned ? "📌 Pinned" : "Pin"}</button>
                  <button className="closebtn" onClick={() => { setChatPinned(false); setChatOpen(false); closedManually.current = true; }} title="Close">✕</button>
                </div>
              </div>

              {!active ? (
                /* CONVERSATION LIST */
                <div className="chat-list">
                  {Object.values(convos).map((c) => {
                    const last = c.msgs[c.msgs.length - 1];
                    return (
                      <button key={c.id} className="chat-list-row" onClick={() => openConvo(c.id)}>
                        <span className="av" style={{ background: c.group ? "var(--brand)" : c.color }}>{c.group ? "👥" : c.av}</span>
                        <div className="cl-mid">
                          <div className="cl-name">{c.name}{c.online && <span className="cl-dot" />}</div>
                          <div className="cl-last">{last ? (last.me ? "You: " : "") + last.body : "No messages yet"}</div>
                        </div>
                        <div className="cl-right">
                          <div className="cl-time">{last?.tm}</div>
                          {c.unread > 0 && <span className="cl-unread">{c.unread}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* THREAD */
                <>
                  <div className="chat-scroll thread">
                    <div className="chat-day">Today</div>
                    {active.msgs.map((m, i) => (
                      <div key={i} className={`bubble-row ${m.me ? "me" : ""}`}>
                        {!m.me && active.group && <span className="av bubble-av" style={{ background: m.color }}>{m.av}</span>}
                        <div className="bubble">
                          {!m.me && active.group && <div className="bubble-who" style={{ color: m.color }}>{m.who}</div>}
                          <span className="bubble-body">{m.body}</span>
                          <span className="bubble-tm">{m.tm}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="chat-foot">
                    <div className="compose">
                      <input placeholder={`Message ${active.group ? "the team" : active.name}…`} value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                      <button className="btn primary sm" onClick={send}>Send</button>
                    </div>
                  </div>
                </>
              )}
            </>
          );
        })()}
      </aside>

      {/* TODAY'S-PLAN POPUP — clicking a time-blocked plan item opens the full task */}
      {planModalTask && (
        <div className="modal" onClick={() => setPlanModalId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPlanModalId(null)} title="Close">✕</button>
            <TaskBody task={planModalTask} label="Today's plan · task" onStatusChange={(s) => setTaskStatus(planModalTask.id, s)} canSchedule={isAdmin} uploadedBy={person} onSaved={load} />
            <div className="modal-foot">
              <span className="modal-foot-note">Didn’t finish? Roll it to next week. Done? Mark it complete.</span>
              <div className="modal-foot-acts">
                <button className="btn">Move to next week</button>
                <button className="btn primary">Mark complete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE-TASK MODAL — writer only; runs the Type→owner routing on submit */}
      {showNew && <NewTaskModal onClose={() => setShowNew(false)} onCreate={createTask} />}

      {/* CLAIM POOL modal — editors pick up video work; claiming moves it to My tasks */}
      {showClaimPool && (
        <div className="modal" onClick={() => setShowClaimPool(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowClaimPool(false)} title="Close">✕</button>
            <div className="lbl" style={{ marginBottom: ".4rem" }}>Claim pool · video work up for grabs</div>
            <div className="d-title" style={{ marginBottom: "1rem" }}>Pick up a video</div>
            {claimPool.length ? (
              <div className="claim-list">
                {claimPool.map((v) => (
                  <div key={v.id} className="claim-card">
                    <div style={{ minWidth: 0 }}>
                      <div className="claim-title">{v.title}</div>
                      <div className="claim-meta">{v.detail.typeLine} · {v.detail.brand} · {STATUS[v.status].label}</div>
                    </div>
                    <button className="btn primary sm" onClick={() => { claimVideo(v); if (claimPool.length <= 1) setShowClaimPool(false); }}>Claim</button>
                  </div>
                ))}
              </div>
            ) : <div className="empty" style={{ padding: "2.4rem 0" }}>Nothing to claim right now ✓</div>}
            <div className="nt-assign" style={{ marginTop: "1rem" }}><span className="status-dot" style={{ background: "#8A92A6" }} /><span>Claim a video and it lands in your <b>My tasks</b> as <b>In progress</b> — you become the owner.</span></div>
          </div>
        </div>
      )}

      {/* ACCEPT & WORK — capacity-aware accept dialog */}
      {acceptTask && <AcceptWorkModal task={acceptTask} committed={workMin} onAcceptWork={acceptWork} onAskManya={askManyaToMove} onClose={() => setAcceptTask(null)} />}
      {askManya && <AskManyaModal onSend={sendToManya} onClose={() => setAskManya(false)} />}

      {/* END TODAY — wrap-up checklist */}
      {showEod && <EndTodayModal tasks={workingTasks.map((t) => ({ id: t.id, title: t.title }))} onEnd={endToday} onClose={() => setShowEod(false)} />}

      {/* TOAST — new message nudge */}
      {toast && (
        <div className="toast" onClick={() => { if (toast.convo) { openChat(); openConvo(toast.convo); } setToast(null); }}>
          <span className="av" style={{ background: toast.color }}>{toast.av}</span>
          <div><div className="who2">{toast.who}</div><div className="body">{toast.body}</div></div>
          <span className="toast-cta">Open</span>
        </div>
      )}

    </div>
  );
}

const CSS = `
.hmd{
  --bg:#F5F6FA;--panel:#FFFFFF;--panel-2:#F7F8FC;
  --ink:#232D42;--ink-soft:#4A5468;--muted:#8A92A6;--faint:#A6ACBE;
  --line:#EEF0F4;--line-2:#F3F5F9;
  --brand:#3A57E8;--brand-soft:#E9ECFB;--brand-ink:#2138B0;
  --good:#1AA053;--good-soft:#E3F5EA;--warn:#D97706;--warn-soft:#FEF3E2;--rose:#E11D48;
  --shadow:0 10px 30px rgba(35,45,66,0.06);
  --mono:ui-monospace,"SF Mono",Menlo,monospace;
  color:var(--ink);background:var(--bg);min-height:100vh;font-size:14.5px;
}
.hmd *{box-sizing:border-box}
.hmd .shell{display:flex;align-items:stretch;min-height:100vh}
.hmd .sidebar{width:228px;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--panel);border-right:1px solid var(--line);padding:0 11px 16px}
@media(max-width:980px){.hmd .sidebar{display:none}}
.hmd .sidebar-brand{display:flex;align-items:center;gap:10px;padding:20px 8px 16px}
.hmd .sidebar-brand .logo{width:32px;height:32px;border-radius:9px;background:var(--brand);display:grid;place-items:center;color:#fff;transform:rotate(45deg);flex:0 0 32px}
.hmd .sidebar-brand .logo svg{color:#fff}
.hmd .sidebar-brand .brandname{font-weight:700;font-size:1.05rem;color:var(--ink)}
.hmd .navgroup{font-family:var(--mono);font-size:.58rem;text-transform:uppercase;letter-spacing:.09em;color:var(--faint);font-weight:700;padding:13px 10px 5px}
.hmd .navitem{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;font-size:.82rem;font-weight:500;color:var(--ink-soft);cursor:pointer;margin-bottom:1px;text-decoration:none}
.hmd .navitem:hover{background:var(--panel-2)}
.hmd .navitem.active{background:var(--brand);color:#fff;box-shadow:0 6px 14px rgba(58,87,232,.24)}
.hmd .main{flex:1;min-width:0;padding:clamp(1rem,2.2vw,2.2rem);transition:padding-right .28s ease}
@media(min-width:1100px){.hmd .main.chatpad{padding-right:calc(clamp(296px,19vw,348px) + 1.6rem)}}
.hmd .banner{font-size:.82rem;color:var(--muted);margin:0;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
.hmd .banner b{color:var(--ink-soft)}
.hmd .tagchg{font-family:var(--mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:var(--brand-ink);background:var(--brand-soft);border-radius:5px;padding:.15em .5em;font-weight:600}
.hmd .topbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.hmd .icons{display:flex;gap:.5rem;position:relative}
.hmd .iconbtn{position:relative;width:33px;height:33px;border-radius:10px;border:1px solid var(--line);background:var(--panel);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-soft);box-shadow:var(--shadow);transition:all .12s}
.hmd .iconbtn:hover{border-color:#D9DEEA;color:var(--brand-ink)}
.hmd .iconbtn.on{background:var(--brand-soft);border-color:var(--brand);color:var(--brand-ink)}
.hmd .badge{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--brand);color:#fff;font-size:.6rem;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--panel)}
.hmd .badge.rose{background:var(--rose)}
.hmd .backdrop{position:fixed;inset:0;z-index:30}
.hmd .popover{position:absolute;top:46px;right:0;width:300px;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 46px rgba(20,22,40,.16);padding:.9rem;z-index:50}
.hmd .popover.pop-wide{width:340px}
.hmd .pop-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem}
.hmd .empty{font-size:.82rem;color:var(--muted);padding:.6rem 0;text-align:center}
.hmd .claim-row{display:flex;align-items:center;gap:.6rem;padding:.55rem .1rem;border-bottom:1px solid var(--line-2)}
.hmd .claim-row:last-child{border-bottom:0}
.hmd .claim-title{font-size:.82rem;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hmd .claim-meta{font-size:.68rem;color:var(--muted);margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hmd .claim-row .btn{margin-left:auto;flex-shrink:0}
.hmd .task.just-claimed{border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-soft)}
.hmd .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}
.hmd .pad{padding:1rem 1.15rem}
.hmd .muted{color:var(--muted)}
.hmd .lbl{font-family:var(--mono);font-size:.64rem;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:600}
.hmd .pill{display:inline-flex;align-items:center;gap:.3em;font-size:.68rem;font-weight:600;padding:.16em .5em;border-radius:6px;white-space:nowrap}
.hmd .dot{width:8px;height:8px;border-radius:3px;display:inline-block}
.hmd .btn{font-size:.8rem;font-weight:600;border-radius:9px;padding:.5em .9em;border:1px solid var(--line);background:var(--panel);color:var(--ink-soft);cursor:pointer;transition:all .12s}
.hmd .btn:hover{border-color:#D9DEEA}
.hmd .btn.primary{background:var(--brand);color:#fff;border-color:transparent;box-shadow:0 6px 14px rgba(58,87,232,.24)}
.hmd .btn.primary:hover{background:var(--brand-ink)}
.hmd .btn.sm{font-size:.74rem;padding:.35em .7em}
.hmd .headband{display:grid;grid-template-columns:1.1fr auto 1.6fr;gap:1.2rem;align-items:center}
@media(max-width:900px){.hmd .headband{grid-template-columns:1fr;gap:.9rem}}
.hmd .who .hi{font-size:1.15rem;font-weight:700;letter-spacing:-.01em}
.hmd .who .sub{font-size:.8rem;color:var(--muted);margin-top:.15rem}
.hmd .switch{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:.2rem;gap:.15rem}
.hmd .switch button{border:0;background:transparent;font:inherit;font-size:.78rem;font-weight:600;color:var(--muted);padding:.32em .7em;border-radius:7px;cursor:pointer}
.hmd .switch button.on{background:var(--panel);color:var(--brand-ink);box-shadow:var(--shadow)}
.hmd .stats{display:flex;gap:1.4rem;justify-content:flex-end;flex-wrap:wrap}
@media(max-width:900px){.hmd .stats{justify-content:flex-start}}
.hmd .stat .n{font-size:1.35rem;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
.hmd .stat .n.g{color:var(--good)}.hmd .stat .n.w{color:var(--warn)}.hmd .stat .n.b{color:var(--brand)}
.hmd .stat .k{font-size:.66rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:.3rem}
.hmd .hero{margin-top:1rem}
.hmd .hero-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:.8rem}
.hmd .hero-head h2{margin:0;font-size:1.05rem}
.hmd .hero-head .prog{font-size:.78rem;color:var(--muted)}
.hmd .qmark{cursor:help;font-size:.75rem;border:1px solid var(--line);border-radius:50%;width:17px;height:17px;display:inline-flex;align-items:center;justify-content:center;color:var(--muted)}
.hmd .legend{display:flex;gap:.8rem;font-size:.7rem;color:var(--muted);align-items:center}
.hmd .legend span{display:inline-flex;gap:.3em;align-items:center}
.hmd .timeline{display:flex;gap:.4rem;height:74px}
.hmd .blk{flex:1;border-radius:10px;padding:.5rem .6rem;font-size:.72rem;color:#fff;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
.hmd .blk .t{font-weight:600;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hmd .blk .m{font-size:.64rem;opacity:.85}
.hmd .blk.reel{background:linear-gradient(135deg,#5A6FF0,#3A57E8)}
.hmd .blk.reel2{background:linear-gradient(135deg,#7385F2,#4C63E8)}
.hmd .blk.gap{background:repeating-linear-gradient(45deg,var(--panel-2),var(--panel-2) 6px,var(--line-2) 6px,var(--line-2) 12px);color:var(--muted);border:1px dashed var(--line);flex:.5}
.hmd .blk.clickable{cursor:pointer;transition:transform .12s,box-shadow .12s}
.hmd .blk.clickable:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(58,87,232,.28)}
.hmd .hours{display:flex;gap:.4rem;margin-top:.4rem}
.hmd .hours span{flex:1;font-size:.62rem;color:var(--faint);font-family:var(--mono)}
.hmd .hours span.g{flex:.5}
/* time-proportional timeline with drag-reorder + red now-line */
.hmd .tl-wrap{margin-top:.2rem}
.hmd .tl-ticks{display:flex;margin-bottom:.35rem;padding:0 1px}
.hmd .tl-ticks span{flex:1;font-size:.62rem;color:var(--faint);font-family:var(--mono)}
.hmd .tl-track{position:relative;height:116px;border-radius:11px;border:1px solid var(--line);background:var(--panel-2);overflow:hidden}
.hmd .tl-blk{position:absolute;top:0;height:100%;border-radius:0;padding:.6rem .7rem;overflow:hidden;display:flex;flex-direction:column;justify-content:center;color:#fff;font-size:.75rem;transition:filter .12s;border-right:1px solid rgba(255,255,255,.16)}
.hmd .tl-blk:last-child{border-right:0}
.hmd .tl-blk.reel{background:linear-gradient(135deg,#5A6FF0,#3A57E8);cursor:grab}
.hmd .tl-blk.reel:hover{filter:brightness(1.05)}
.hmd .tl-blk.reel:active{cursor:grabbing}
.hmd .tl-blk.lunch{background:repeating-linear-gradient(45deg,#EAEDF5,#EAEDF5 6px,#DFE3EE 6px,#DFE3EE 12px);color:var(--muted);border-right:1px solid rgba(255,255,255,.5)}
.hmd .tl-blk.buffer{background:repeating-linear-gradient(45deg,#F3F5F9,#F3F5F9 6px,#E9ECF2 6px,#E9ECF2 12px);color:var(--faint)}
.hmd .tl-t{font-weight:600;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hmd .tl-m{font-size:.62rem;opacity:.85;margin-top:.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hmd .tl-nudge{position:absolute;top:50%;transform:translateY(-50%);width:18px;height:40px;border:none;border-radius:6px;background:rgba(255,255,255,.26);color:#fff;font-size:1.05rem;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;display:flex;align-items:center;justify-content:center;z-index:3;padding:0}
.hmd .tl-blk.reel:hover .tl-nudge{opacity:1}
.hmd .tl-nudge:hover{background:rgba(255,255,255,.5)}
.hmd .tl-nudge.l{left:3px}
.hmd .tl-nudge.r{right:3px}
.hmd .now-line{position:absolute;top:0;bottom:0;width:2px;background:#DC2E2E;z-index:5;pointer-events:none}
.hmd .now-dot{position:absolute;top:-3px;left:-3px;width:8px;height:8px;border-radius:50%;background:#DC2E2E}
.hmd .tl-guide{position:absolute;top:0;bottom:0;width:2px;background:#3A57E8;z-index:8;pointer-events:none;box-shadow:0 0 0 1px rgba(58,87,232,.25)}
.hmd .tl-guide-tag{position:absolute;top:4px;left:4px;background:#3A57E8;color:#fff;font-size:.68rem;font-weight:700;padding:2px 6px;border-radius:6px;white-space:nowrap}
.hmd .work{display:grid;grid-template-columns:1fr 1.5fr;gap:1rem;margin-top:1rem;align-items:start}
@media(max-width:980px){.hmd .work{grid-template-columns:1fr}}
.hmd .colhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem}
.hmd .colhead h3{margin:0;font-size:.95rem}
.hmd .tasklist{display:flex;flex-direction:column;gap:.4rem;max-height:460px;overflow:auto}
.hmd .task-tabs{display:flex;gap:.25rem;background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:.2rem;margin-bottom:.7rem}
.hmd .task-tab{flex:1;border:none;background:transparent;font:inherit;font-size:.7rem;font-weight:600;color:var(--muted);padding:.4em .3em;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:.3rem}
.hmd .task-tab.on{background:var(--panel);color:var(--brand-ink);box-shadow:var(--shadow)}
.hmd .task-tab-n{font-size:.58rem;background:#EDEFF4;color:var(--muted);border-radius:7px;padding:0 .35em;min-width:15px;text-align:center}
.hmd .task-tab.on .task-tab-n{background:var(--brand-soft);color:var(--brand-ink)}
.hmd .task{border:1px solid var(--line);border-radius:11px;padding:.6rem .7rem;cursor:pointer;background:var(--panel);transition:all .12s}
.hmd .task:hover{border-color:#D9DEEA;background:var(--panel-2)}
.hmd .task.overdue{background:linear-gradient(180deg,#FDECEA,#FFF7F6);border-color:#F1C4BD}
.hmd .task.overdue:hover{border-color:#EAA99F}
.hmd .task.sel{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
.hmd .task.overdue.sel{border-color:var(--brand)}
.hmd .task-top{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem}
.hmd .due-chip{font-size:.6rem;font-weight:600;color:var(--muted);flex-shrink:0;white-space:nowrap}
.hmd .due-chip.od{color:#C03221}
.hmd .task .tt{font-weight:600;font-size:.82rem;line-height:1.25}
.hmd .task .mm{font-size:.68rem;color:var(--muted);margin:.2rem 0 .35rem}
.hmd .detail .d-title{font-size:1.1rem;font-weight:700;letter-spacing:-.01em}
.hmd .d-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
.hmd .d-head-main{min-width:0}
.hmd .status-box{flex-shrink:0;text-align:right}
.hmd .status-box .mlbl{margin-bottom:.35rem}
/* task duration control (next to the status dropdown) */
.hmd .dur-ctl{display:inline-flex;align-items:center;gap:.3rem;margin-top:.5rem;border:1px solid var(--line);border-radius:8px;padding:.25rem .4rem;background:var(--panel-2)}
.hmd .dur-ic{font-size:.8rem}
.hmd .dur-select{border:none;background:transparent;font:inherit;font-size:.74rem;font-weight:600;color:var(--ink-soft);cursor:pointer;outline:none}
/* claim-pool modal + claim-pool button badge */
.hmd .teamcap-n{background:var(--brand);color:#fff;font-size:.6rem;font-weight:700;border-radius:8px;min-width:16px;height:16px;padding:0 4px;display:inline-flex;align-items:center;justify-content:center;margin-left:.1rem}
.hmd .claim-list{display:flex;flex-direction:column;gap:.5rem;max-height:52vh;overflow:auto}
.hmd .claim-card{display:flex;align-items:center;gap:.7rem;border:1px solid var(--line);border-radius:11px;padding:.7rem .85rem}
.hmd .claim-card:hover{border-color:#D9DEEA;background:var(--panel-2)}
.hmd .claim-card .btn{margin-left:auto;flex-shrink:0}
.hmd .status-dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px}
.hmd .status-caret{position:absolute;right:.65rem;top:50%;width:0;height:0;margin-top:-2px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;pointer-events:none}
.hmd .status-dd{position:relative;display:inline-block}
.hmd .status-dd-btn{position:relative;display:inline-flex;align-items:center;gap:.45rem;border:1px solid rgba(35,45,66,.08);border-radius:9px;padding:.42rem 1.55rem .42rem .65rem;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
.hmd .status-dd-val{white-space:nowrap}
.hmd .status-dd-back{position:fixed;inset:0;z-index:40}
.hmd .status-dd-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:50;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 46px rgba(20,22,40,.16);padding:.35rem;min-width:238px;max-height:344px;overflow:auto}
.hmd .status-dd-item{display:flex;align-items:center;gap:.55rem;width:100%;text-align:left;border:none;background:transparent;font:inherit;font-size:.8rem;font-weight:500;color:var(--ink);padding:.5rem .6rem;border-radius:8px;cursor:pointer}
.hmd .status-dd-item:hover{background:var(--panel-2)}
.hmd .status-dd-item.on{font-weight:700;background:var(--panel-2)}
.hmd .status-dd-item-lbl{flex:1;white-space:nowrap}
.hmd .status-dd-check{color:var(--brand);font-weight:800}
.hmd .collab-cell{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap}
.hmd .detail .d-sub{font-size:.76rem;color:var(--muted);margin-top:.3rem}
.hmd .detail .d-meta{font-size:.75rem;color:var(--muted);margin:.25rem 0 .8rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.hmd .meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line)}
.hmd .mlbl{font-size:.6rem;color:var(--faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem;font-weight:600}
.hmd .mval{font-size:.82rem;color:var(--ink-soft);font-weight:500}
.hmd .collab{display:flex;align-items:center;gap:.4rem;margin-top:.9rem;flex-wrap:wrap}
.hmd .collab .mlbl{margin:0 .3rem 0 0}
.hmd .av-sm{width:24px;height:24px;font-size:.64rem}
.hmd .collab-names{font-size:.78rem;color:var(--ink-soft);margin-left:.3rem}
.hmd .section-lbl{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin:1.15rem 0 .5rem}
.hmd .brief{background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:.8rem .9rem;font-size:.84rem;color:var(--ink-soft);line-height:1.6}
.hmd .brief-full{white-space:pre-wrap;word-break:break-word}
.hmd .section-head{display:flex;align-items:center;justify-content:space-between;margin:1.15rem 0 .5rem}
.hmd .section-head .section-lbl{margin:0}
.hmd .copy-btn{font-size:.66rem;font-weight:600;color:var(--brand-ink);background:var(--brand-soft);border:1px solid transparent;border-radius:7px;padding:.3em .65em;cursor:pointer;transition:background .12s}
.hmd .copy-btn:hover{background:#DCE1FA}
.hmd .brief .para{margin:0 0 .7rem}
.hmd .brief .para:last-child{margin-bottom:0}
.hmd .thumbs{display:flex;flex-wrap:wrap;gap:.7rem;align-items:flex-start}
.hmd .thumb{width:104px;cursor:pointer}
.hmd .thumb-img{position:relative;width:104px;height:132px;border-radius:10px;border:1px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;transition:transform .12s,box-shadow .12s}
.hmd .thumb:hover .thumb-img{transform:translateY(-2px);box-shadow:0 8px 18px rgba(20,22,40,.16)}
.hmd .thumb-play{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.92);color:#232D42;display:flex;align-items:center;justify-content:center;font-size:.75rem;padding-left:3px}
.hmd .thumb-doc{font-size:1.6rem}
.hmd .thumb-name{font-size:.68rem;color:var(--ink-soft);margin-top:.35rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.hmd .thumb-add{width:104px;height:132px;border:1.5px dashed #C7CEDD;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15rem;color:var(--muted);cursor:pointer;background:var(--panel-2);transition:all .12s}
.hmd .thumb-add:hover{border-color:var(--brand);color:var(--brand-ink)}
.hmd .thumb-add-plus{font-size:1.25rem;line-height:1}
.hmd .thumb-add-lbl{font-size:.66rem;font-weight:600}
.hmd .upload-drop{display:flex;align-items:center;gap:.85rem;border:1.5px dashed #C7CEDD;border-radius:12px;padding:1rem 1.1rem;cursor:pointer;background:var(--panel-2);transition:border-color .12s}
.hmd .upload-drop:hover{border-color:var(--brand)}
.hmd .upload-ic{font-size:1.35rem;color:var(--muted)}
.hmd .upload-drop b{color:var(--ink);font-size:.85rem}
.hmd .upload-sub{display:block;font-size:.72rem;color:var(--muted);margin-top:.15rem}
.hmd .activity{display:flex;flex-direction:column;gap:.4rem}
.hmd .act-row{font-size:.78rem;color:var(--muted);line-height:1.4}
.hmd .act-row b{color:var(--ink-soft);font-weight:600}
.hmd .act-time{color:var(--faint)}
.hmd .mini-tl{display:flex;gap:.3rem;margin-top:.9rem}
.hmd .step{flex:1;text-align:center;font-size:.66rem;color:var(--muted)}
.hmd .step .bar{height:5px;border-radius:4px;background:var(--line);margin-bottom:.35rem}
.hmd .step.done .bar{background:var(--good)}.hmd .step.now .bar{background:var(--brand)}
.hmd .step.done{color:var(--good)}.hmd .step.now{color:var(--brand-ink);font-weight:600}
.hmd .d-actions{display:flex;gap:.5rem;margin-top:1.1rem;flex-wrap:wrap}
.hmd .note{display:flex;gap:.5rem;align-items:flex-start;font-size:.8rem;padding:.42rem 0;border-bottom:1px solid var(--line-2);cursor:pointer}
.hmd .note:last-of-type{border-bottom:0}
.hmd .note .cb{width:15px;height:15px;border-radius:4px;border:1.5px solid #D9DEEA;margin-top:.15rem;flex:0 0 15px}
.hmd .note.done{color:var(--faint);text-decoration:line-through}
.hmd .note.done .cb{background:var(--good);border-color:var(--good)}
.hmd .compose{display:flex;gap:.4rem;margin-top:.6rem}
.hmd .compose input{flex:1;font:inherit;font-size:.78rem;border:1px solid var(--line);border-radius:8px;padding:.4em .6em;background:var(--panel-2);color:var(--ink);outline:none}
.hmd .compose input:focus{border-color:var(--brand)}
.hmd .notif{display:flex;align-items:flex-start;gap:.7rem;padding:.2rem}
.hmd .notif .bell{width:32px;height:32px;border-radius:9px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 32px}
.hmd .notif .txt{flex:1;min-width:0;font-size:.8rem;color:var(--ink)}
.hmd .notif .txt b{color:var(--brand-ink)}
.hmd .notif .cap{display:block;font-size:.68rem;color:var(--muted);margin-top:.15rem}
.hmd .notif .acts{display:flex;gap:.4rem;margin-top:.55rem}
/* collapsible chat panel */
.hmd .chatpanel{position:fixed;top:0;right:0;height:100vh;width:clamp(296px,19vw,348px);background:var(--panel);border-left:1px solid var(--line);box-shadow:-14px 0 44px rgba(20,22,40,.10);display:flex;flex-direction:column;transform:translateX(101%);transition:transform .28s cubic-bezier(.4,0,.2,1);z-index:40}
.hmd .chatpanel.open{transform:translateX(0)}
.hmd .chat-head{display:flex;align-items:center;justify-content:space-between;padding:.9rem 1.1rem .75rem;border-bottom:1px solid var(--line)}
.hmd .chat-head h3{margin:0;font-size:.98rem;display:flex;align-items:center;gap:.5rem}
.hmd .chat-head-acts{display:flex;align-items:center;gap:.4rem}
.hmd .pinbtn{font-size:.7rem;font-weight:600;border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:7px;padding:.3em .55em;cursor:pointer}
.hmd .pinbtn.on{background:var(--brand-soft);border-color:var(--brand);color:var(--brand-ink)}
.hmd .closebtn{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--muted);cursor:pointer;font-size:.8rem}
.hmd .closebtn:hover{color:var(--ink);border-color:#D9DEEA}
.hmd .online{font-size:.66rem;color:var(--good);font-weight:600}
.hmd .chat-scroll{flex:1;min-height:0;overflow:auto;padding:.3rem 1.1rem}
.hmd .chat-foot{padding:.7rem 1.1rem;border-top:1px solid var(--line)}
.hmd .chat-day{text-align:center;font-size:.64rem;color:var(--faint);margin:.7rem 0 .3rem;font-family:var(--mono);text-transform:uppercase;letter-spacing:.06em}
.hmd .chat-msg{display:flex;gap:.5rem;padding:.28rem 0;font-size:.8rem;border-bottom:1px solid var(--line-2)}
.hmd .chat-msg:last-child{border-bottom:0}
.hmd .chat-msg.me .body{color:var(--brand-ink)}
.hmd .chat-scroll{padding:.2rem 1rem}
.hmd .av{width:26px;height:26px;border-radius:50%;flex:0 0 26px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#fff}
.hmd .chat-msg .who2{font-weight:600;font-size:.78rem}.hmd .chat-msg .tm{color:var(--faint);font-size:.66rem;margin-left:.35rem}
.hmd .chat-msg .body{color:var(--ink-soft);line-height:1.35}
/* WhatsApp-style thread bubbles — mine right (blue), theirs left (white) */
.hmd .chat-scroll.thread{background:var(--bg);padding:.5rem .8rem}
.hmd .bubble-row{display:flex;align-items:flex-end;gap:.35rem;margin:.3rem 0}
.hmd .bubble-row.me{justify-content:flex-end}
.hmd .bubble-av{flex:0 0 22px;width:22px;height:22px;font-size:.56rem;margin-bottom:1px}
.hmd .bubble{max-width:78%;padding:.4rem .55rem .3rem;border-radius:13px;font-size:.8rem;line-height:1.35;box-shadow:0 1px 1px rgba(20,22,40,.05)}
.hmd .bubble-row:not(.me) .bubble{background:var(--panel);border:1px solid var(--line);border-bottom-left-radius:4px;color:var(--ink)}
.hmd .bubble-row.me .bubble{background:var(--brand);color:#fff;border-bottom-right-radius:4px}
.hmd .bubble-who{font-size:.65rem;font-weight:700;margin-bottom:.05rem}
.hmd .bubble-body{white-space:pre-wrap;word-break:break-word}
.hmd .bubble-tm{display:block;text-align:right;font-size:.56rem;margin-top:.1rem}
.hmd .bubble-row.me .bubble-tm{color:rgba(255,255,255,.8)}
.hmd .bubble-row:not(.me) .bubble-tm{color:var(--faint)}
/* WhatsApp-style conversation list */
.hmd .chat-back{border:none;background:transparent;font-size:1.4rem;line-height:1;color:var(--muted);cursor:pointer;padding:0 .2rem 0 0;margin-right:.1rem}
.hmd .chat-back:hover{color:var(--ink)}
.hmd .chat-head h3 .av-sm{width:26px;height:26px;font-size:.66rem}
.hmd .chat-list{flex:1;min-height:0;overflow:auto;padding:.3rem .4rem}
.hmd .chat-list-row{display:flex;align-items:center;gap:.65rem;width:100%;text-align:left;border:none;background:transparent;padding:.6rem .55rem;border-radius:10px;cursor:pointer}
.hmd .chat-list-row:hover{background:var(--panel-2)}
.hmd .chat-list-row .av{width:38px;height:38px;font-size:.8rem;flex:0 0 38px}
.hmd .cl-mid{flex:1;min-width:0}
.hmd .cl-name{font-size:.85rem;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:.35rem}
.hmd .cl-dot{width:7px;height:7px;border-radius:50%;background:var(--good);flex:0 0 7px}
.hmd .cl-last{font-size:.75rem;color:var(--muted);margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hmd .cl-right{display:flex;flex-direction:column;align-items:flex-end;gap:.3rem;flex-shrink:0}
.hmd .cl-time{font-size:.62rem;color:var(--faint)}
.hmd .cl-unread{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--brand);color:#fff;font-size:.62rem;font-weight:700;display:flex;align-items:center;justify-content:center}
/* toast */
.hmd .toast{position:fixed;bottom:22px;right:22px;width:308px;background:var(--panel);border:1px solid var(--line);border-radius:13px;box-shadow:0 18px 48px rgba(20,22,40,.18);padding:.7rem .85rem;display:flex;gap:.6rem;align-items:center;z-index:60;cursor:pointer;animation:hmdslide .3s ease}
@keyframes hmdslide{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
.hmd .toast .who2{font-weight:600;font-size:.76rem;color:var(--ink)}
.hmd .toast .body{font-size:.78rem;color:var(--ink-soft);line-height:1.3}
.hmd .toast-cta{margin-left:auto;font-size:.72rem;font-weight:700;color:var(--brand-ink)}
/* prominent handoff card (right side, before demoting to the bell) */
.hmd .handoff-card{position:fixed;top:74px;right:22px;width:320px;background:var(--panel);border:1px solid var(--brand);border-radius:14px;box-shadow:0 20px 50px rgba(58,87,232,.20);padding:.9rem 1rem;z-index:55;animation:hmdslide .3s ease}
/* task popup */
.hmd .modal{position:fixed;inset:0;background:rgba(20,22,40,.42);display:flex;align-items:flex-start;justify-content:center;padding:clamp(2rem,7vh,5rem) 1rem;z-index:70;animation:hmdfade .16s ease;overflow-y:auto}
@keyframes hmdfade{from{opacity:0}to{opacity:1}}
.hmd .modal-card{position:relative;width:100%;max-width:640px;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:0 30px 80px rgba(20,22,40,.3);padding:1.5rem 1.6rem;animation:hmdslide .22s ease}
.hmd .modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
.hmd .modal-close{position:absolute;top:1.1rem;right:1.1rem;width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);cursor:pointer;font-size:.85rem;z-index:2}
.hmd .modal-close:hover{color:var(--ink);border-color:#D9DEEA}
.hmd .modal-card .d-title{padding-right:2rem}
.hmd .modal-foot{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:1.4rem;padding-top:1.1rem;border-top:1px solid var(--line)}
.hmd .modal-foot-note{font-size:.72rem;color:var(--muted)}
.hmd .modal-foot-acts{display:flex;gap:.5rem}
.hmd .nt-card{max-width:520px}
.hmd .nt-field{margin-bottom:.9rem}
.hmd .nt-row{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}
.hmd .nt-label{display:block;font-size:.66rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:.35rem}
.hmd .nt-input{width:100%;font:inherit;font-size:.85rem;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:.55rem .65rem;outline:none}
.hmd .nt-input:focus{border-color:var(--brand)}
.hmd .nt-textarea{resize:vertical;min-height:98px;line-height:1.5}
.hmd .nt-hint{font-weight:400;font-size:.62rem;color:var(--faint);text-transform:none;letter-spacing:0;margin-left:.4rem}
.hmd .nt-req{font-weight:600;font-size:.58rem;color:#C03221;background:#FBE7E4;border-radius:5px;padding:.05em .4em;text-transform:uppercase;letter-spacing:.03em;margin-left:.35rem}
.hmd .btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
/* custom Hope-themed date picker */
.hmd .dp{position:relative}
.hmd .dp-field{width:100%;display:flex;align-items:center;justify-content:space-between;gap:.5rem;font:inherit;font-size:.82rem;border:1px solid var(--line);border-radius:9px;padding:.55rem .7rem;background:var(--panel-2);color:var(--ink);cursor:pointer;text-align:left}
.hmd .dp-field:hover{border-color:#D9DEEA}
.hmd .dp-ph{color:var(--faint)}
.hmd .dp-cal{color:var(--muted);flex-shrink:0}
.hmd .dp-backdrop{position:fixed;inset:0;z-index:80}
.hmd .dp-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:81;width:266px;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 46px rgba(20,22,40,.18);padding:.8rem;animation:hmdslide .16s ease}
.hmd .dp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem}
.hmd .dp-title{font-size:.85rem;font-weight:700;color:var(--ink)}
.hmd .dp-nav{display:flex;gap:.3rem}
.hmd .dp-nav button{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--ink-soft);cursor:pointer;font-size:1rem;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}
.hmd .dp-nav button:hover{background:var(--panel-2);color:var(--brand-ink);border-color:#D9DEEA}
.hmd .dp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.hmd .dp-dow{margin-bottom:2px}
.hmd .dp-dow span{text-align:center;font-size:.58rem;font-weight:700;color:var(--faint);text-transform:uppercase;padding:.25rem 0}
.hmd .dp-day{aspect-ratio:1;border:none;background:transparent;border-radius:8px;font:inherit;font-size:.74rem;color:var(--ink-soft);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .1s}
.hmd .dp-day:hover{background:var(--brand-soft);color:var(--brand-ink)}
.hmd .dp-day.today{color:var(--brand-ink);font-weight:700;box-shadow:inset 0 0 0 1.5px var(--brand-soft)}
.hmd .dp-day.sel{background:var(--brand);color:#fff;font-weight:700;box-shadow:0 4px 10px rgba(58,87,232,.3)}
.hmd .dp-empty{aspect-ratio:1}
.hmd .dp-foot{display:flex;justify-content:space-between;margin-top:.6rem;padding-top:.55rem;border-top:1px solid var(--line-2)}
.hmd .dp-link{border:none;background:transparent;font:inherit;font-size:.72rem;font-weight:600;color:var(--brand-ink);cursor:pointer}
.hmd .dp-link:hover{text-decoration:underline}
.hmd .nt-assign{display:flex;align-items:flex-start;gap:.5rem;font-size:.8rem;color:var(--ink-soft);line-height:1.4;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:.65rem .75rem;margin:.3rem 0 1.2rem}
.hmd .nt-assign .status-dot{margin-top:.35rem}
.hmd .nt-assign b{color:var(--ink)}
.hmd .nt-actions{display:flex;justify-content:flex-end;gap:.6rem}
.hmd .refs{display:flex;flex-wrap:wrap;gap:.7rem;align-items:flex-start}
.hmd .refs .ref-thumb{position:relative}
.hmd .ref-thumb .thumb-img{background-color:var(--panel-2)}
.hmd .ref-link{display:inline-flex;align-items:center;gap:.4rem;max-width:230px;height:34px;background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:0 .35rem 0 .6rem;font-size:.76rem;font-weight:500;color:var(--brand-ink);text-decoration:none}
.hmd .ref-link:hover{border-color:var(--brand)}
.hmd .ref-link-ic{flex:0 0 auto;font-size:.72rem}
.hmd .ref-link-lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hmd .ref-x{border:none;background:rgba(20,22,40,.55);color:#fff;border-radius:50%;width:17px;height:17px;font-size:.6rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 17px}
.hmd .ref-thumb .ref-x{position:absolute;top:5px;right:5px;opacity:0;transition:opacity .12s}
.hmd .ref-thumb:hover .ref-x{opacity:1}
.hmd .ref-link .ref-x{background:transparent;color:var(--faint);width:16px;height:16px}
.hmd .ref-link .ref-x:hover{color:var(--rose)}
.hmd .ref-url{display:flex;gap:.5rem;margin-top:.7rem;max-width:540px}
.hmd .ref-url .nt-input{flex:1}
/* notification stack — sits at the top of the chat panel, pushes chat down */
.hmd .notif-stack{flex:0 0 auto;max-height:44%;overflow:auto;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#F3F1FE,transparent);padding:.6rem .6rem .5rem}
.hmd .nstack-head{display:flex;align-items:center;justify-content:space-between;padding:0 .25rem .45rem;font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
.hmd .nstack-clear{border:none;background:transparent;font-size:.66rem;color:var(--brand-ink);cursor:pointer;font-weight:600;text-transform:none;letter-spacing:0}
.hmd .pnotif{display:flex;gap:.55rem;align-items:flex-start;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:.55rem .6rem;margin-bottom:.45rem;box-shadow:0 3px 10px rgba(35,45,66,.05);animation:hmdslide .26s ease}
.hmd .pnotif:last-child{margin-bottom:0}
.hmd .pnotif.urgent{border-color:#F4C4C9;background:linear-gradient(180deg,#FEF3F4,var(--panel))}
.hmd .pn-ic{width:28px;height:28px;border-radius:8px;flex:0 0 28px;display:flex;align-items:center;justify-content:center;font-size:.8rem;color:#fff}
.hmd .pn-ic.urgent{background:var(--rose)} .hmd .pn-ic.claim{background:var(--good)} .hmd .pn-ic.freed{background:var(--good)} .hmd .pn-ic.message{background:var(--brand)}
.hmd .pn-body{flex:1;min-width:0}
.hmd .pn-eyebrow{font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#C0201F}
.hmd .pn-title{font-size:.8rem;font-weight:600;line-height:1.25;margin-top:.05rem}
.hmd .pn-sub{font-size:.71rem;color:var(--muted);margin-top:.12rem;line-height:1.35}
.hmd .pn-acts{display:flex;gap:.4rem;margin-top:.5rem}
.hmd .pn-x{border:none;background:transparent;color:var(--faint);cursor:pointer;font-size:.85rem;line-height:1;padding:.1rem .2rem;flex:0 0 auto}
.hmd .pn-x:hover{color:var(--ink)}
/* accept & work / ask-manya modals */
.hmd .aw-card{max-width:440px}
.hmd .aw-h{font-size:1rem;font-weight:700}
.hmd .aw-p{font-size:.8rem;color:var(--muted);line-height:1.45;margin:.4rem 0 .9rem}
.hmd .aw-task{background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:.65rem .75rem;margin:.85rem 0}
.hmd .aw-task .tt{font-size:.86rem;font-weight:600}
.hmd .aw-task .tm{font-size:.72rem;color:var(--muted);margin-top:.12rem}
.hmd .impact{display:flex;gap:.55rem;align-items:flex-start;font-size:.8rem;line-height:1.45;background:var(--warn-soft);border:1px solid #F3DCB4;border-radius:10px;padding:.65rem .75rem;color:#7A4E0B}
.hmd .impact.ok{background:var(--good-soft);border-color:#BFE6CD;color:#155E37}
.hmd .impact b{color:#5A3906}.hmd .impact.ok b{color:#0E4A2A}.hmd .impact .over{color:#C0201F}
.hmd .aw-choice{display:flex;flex-direction:column;gap:.55rem;margin-top:1rem}
.hmd .aw-or{text-align:center;font-size:.64rem;color:var(--faint);text-transform:uppercase;letter-spacing:.08em}
.hmd .tchips{display:flex;flex-direction:column;gap:.5rem}
.hmd .tchip{display:flex;align-items:center;gap:.6rem;border:1px solid var(--line);border-radius:10px;padding:.55rem .65rem;background:var(--panel)}
.hmd .tchip.movable{border-style:dashed;border-color:#C7CEDD}
.hmd .tchip .cmid{flex:1;min-width:0}
.hmd .tchip .ct{font-size:.8rem;font-weight:600}
.hmd .tchip .cs{font-size:.7rem;color:var(--muted);margin-top:.1rem}
.hmd .pri{font-size:.6rem;font-weight:700;padding:.14em .5em;border-radius:6px;white-space:nowrap}
.hmd .pri.low{background:#EEF0F5;color:#7A8296}
/* Manya reschedule card */
.hmd .manya-resched{border-color:#F4C4C9;background:linear-gradient(180deg,#FEF6F0,var(--panel))}
.hmd .mr-h{display:flex;gap:.7rem;align-items:flex-start}
.hmd .mr-ic{width:34px;height:34px;border-radius:9px;flex:0 0 34px;background:#FEE9D6;display:flex;align-items:center;justify-content:center;font-size:1rem}
.hmd .mr-t{font-size:.92rem;font-weight:700}
.hmd .mr-d{font-size:.78rem;color:var(--muted);margin-top:.15rem;line-height:1.45}
.hmd .mr-foot{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:1rem;padding-top:.9rem;border-top:1px solid var(--line)}
.hmd .mr-note{font-size:.75rem;color:var(--muted)}
.hmd .cap-badge{font-size:.64rem;font-weight:700;padding:.22em .55em;border-radius:7px;white-space:nowrap}
.hmd .cap-badge.full{background:var(--rose-soft,#FCEBEC);color:#C0201F}
.hmd .cap-badge.some{background:var(--warn-soft);color:#7A4E0B}
.hmd .cap-badge.free{background:var(--good-soft);color:var(--good)}
/* team capacity board */
.hmd .tcb-head{font-size:.95rem;font-weight:700;margin-bottom:.6rem}
.hmd .tcb-sub{font-size:.72rem;font-weight:400;color:var(--muted);margin-left:.5rem}
.hmd .tcb-row{display:grid;grid-template-columns:158px 1fr auto;gap:.8rem;align-items:center;padding:.55rem 0;border-top:1px solid var(--line-2)}
.hmd .tcb-row:first-of-type{border-top:0}
.hmd .tcb-who{display:flex;align-items:center;gap:.55rem}
.hmd .tcb-who .av{width:30px;height:30px;font-size:.72rem;flex:0 0 30px}
.hmd .tcb-n{font-size:.82rem;font-weight:600}
.hmd .tcb-r{font-size:.66rem;color:var(--muted)}
.hmd .tcb-tl{display:flex;height:40px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel-2)}
.hmd .tcb-blk{color:#fff;font-size:.62rem;font-weight:600;padding:0 .5rem;display:flex;align-items:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-right:1px solid rgba(255,255,255,.16)}
.hmd .tcb-blk:last-child{border-right:0}
.hmd .tcb-blk.reel{background:linear-gradient(135deg,#5A6FF0,#3A57E8)}
.hmd .tcb-blk.design{background:linear-gradient(135deg,#8E7BF0,#6D5CE7)}
.hmd .tcb-blk.lunch{background:repeating-linear-gradient(45deg,#EAEDF5,#EAEDF5 5px,#DFE3EE 5px,#DFE3EE 10px);color:var(--muted)}
.hmd .tcb-blk.free{background:repeating-linear-gradient(45deg,#F3F5F9,#F3F5F9 5px,#E9ECF2 5px,#E9ECF2 10px);color:var(--faint)}
.hmd .tcb-note{font-size:.75rem;color:var(--ink-soft);background:var(--brand-soft);border:1px solid #D5DCFB;border-radius:10px;padding:.6rem .75rem;margin-top:.85rem;line-height:1.45}
.hmd .tcb-note b{color:var(--brand-ink)}
/* Start / End day control */
.hmd .daybtn{display:inline-flex;align-items:center;gap:.4rem;font-size:.78rem;font-weight:600;border-radius:9px;padding:.5em .8em;border:1px solid transparent;background:var(--good);color:#fff;cursor:pointer}
.hmd .daybtn:hover{background:#158A46}
.hmd .daybar{display:inline-flex;align-items:center;gap:.4rem}
.hmd .daychip{display:inline-flex;align-items:center;gap:.4rem;font-size:.74rem;font-weight:600;border-radius:9px;padding:.45em .7em;background:var(--good-soft);color:#0F6E3C;border:1px solid #BFE6CD;white-space:nowrap}
.hmd .daychip .pulse{width:8px;height:8px;border-radius:50%;background:var(--good);animation:hmdpl 1.6s infinite}
@keyframes hmdpl{0%{box-shadow:0 0 0 0 rgba(26,160,83,.45)}70%{box-shadow:0 0 0 6px rgba(26,160,83,0)}100%{box-shadow:0 0 0 0 rgba(26,160,83,0)}}
.hmd .endbtn{white-space:nowrap}
.hmd .teamcapbtn{display:inline-flex;align-items:center;gap:.4rem;font-size:.78rem;font-weight:600;border-radius:9px;padding:.5em .8em;border:1px solid #CBD5FA;background:var(--brand-soft);color:var(--brand-ink);cursor:pointer;white-space:nowrap}
.hmd .teamcapbtn:hover{border-color:var(--brand)}
.hmd .teamcapbtn.on{background:var(--brand);color:#fff;border-color:transparent}
/* Team-capacity page */
.hmd .tcp-head{display:flex;align-items:center;gap:.7rem;margin-bottom:1rem}
.hmd .tc-back{width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--panel);cursor:pointer;font-size:1.1rem;color:var(--ink-soft)}
.hmd .tc-back:hover{border-color:#D9DEEA}
.hmd .tcp-title{font-size:1.2rem;font-weight:700}
.hmd .tcp-title span{font-size:.8rem;font-weight:500;color:var(--muted);margin-left:.4rem}
.hmd .tcp-card{margin-bottom:1rem}
.hmd .tcp-top{display:flex;align-items:center;gap:.7rem;margin-bottom:.7rem}
.hmd .tcp-n{font-size:.9rem;font-weight:700}
.hmd .tcp-r{font-size:.68rem;color:var(--muted)}
.hmd .tcp-status{margin-left:auto;display:flex;align-items:center;gap:.5rem}
.hmd .st-badge{font-size:.64rem;font-weight:700;padding:.22em .55em;border-radius:7px}
.hmd .st-badge.working{background:var(--good-soft);color:#0F6E3C}
.hmd .tcp-ticks{display:flex;padding:0 1px;margin-bottom:.3rem}
.hmd .tcp-track{position:relative;display:flex;height:56px;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--panel-2)}
.hmd .tcp-blk{color:#fff;font-size:.66rem;font-weight:600;padding:.35rem .5rem;display:flex;flex-direction:column;justify-content:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-right:1px solid rgba(255,255,255,.16);position:relative}
.hmd .tcp-blk:last-child{border-right:0}
.hmd .tcp-bm{font-size:.56rem;opacity:.85;font-weight:500}
.hmd .tcp-blk.reel{background:linear-gradient(135deg,#5A6FF0,#3A57E8)}
.hmd .tcp-blk.design{background:linear-gradient(135deg,#8E7BF0,#6D5CE7)}
.hmd .tcp-blk.done{opacity:.48}
.hmd .tcp-blk.now{outline:2px solid #fff;outline-offset:-3px}
.hmd .tcp-blk.lunch{background:repeating-linear-gradient(45deg,#EAEDF5,#EAEDF5 5px,#DFE3EE 5px,#DFE3EE 10px);color:var(--muted)}
.hmd .tcp-blk.free{background:repeating-linear-gradient(45deg,#F3F5F9,#F3F5F9 5px,#E9ECF2 5px,#E9ECF2 10px);color:var(--faint)}
.hmd .tcp-now-line{position:absolute;top:0;bottom:0;width:2px;background:#DC2E2E;z-index:3}
.hmd .tcp-now-line::before{content:"";position:absolute;top:-3px;left:-3px;width:8px;height:8px;border-radius:50%;background:#DC2E2E}
.hmd .tcp-now{display:flex;align-items:center;gap:.55rem;margin-top:.65rem;font-size:.79rem;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:.55rem .7rem}
.hmd .tcp-now .dot{width:8px;height:8px;border-radius:50%;background:#DC2E2E;flex:0 0 8px}
.hmd .tcp-now b{color:var(--ink)}.hmd .tcp-now .muted{color:var(--muted)}
/* End-today modal rows */
.hmd .eod-row{display:flex;align-items:center;gap:.6rem;padding:.5rem 0;border-bottom:1px solid var(--line-2);font-size:.83rem}
.hmd .eod-row:last-of-type{border-bottom:0}
.hmd .eod-row.roll{color:var(--muted)}
.hmd .eod-cb{width:18px;height:18px;border-radius:5px;border:1.6px solid #CBD2E0;flex:0 0 18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:.68rem;color:#fff}
.hmd .eod-cb.on{background:var(--good);border-color:var(--good)}
.hmd .eod-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hmd .eod-tag{font-size:.6rem;font-weight:700;padding:.14em .5em;border-radius:6px;white-space:nowrap}
.hmd .eod-tag.done{background:var(--good-soft);color:#0F6E3C}.hmd .eod-tag.roll{background:var(--warn-soft);color:#7A4E0B}
.hmd .eod-foot{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1.1rem;padding-top:.9rem;border-top:1px solid var(--line)}
.hmd .m-note{font-size:.72rem;color:var(--muted)}
.hmd .btn.rose{background:var(--rose);color:#fff;border-color:transparent}
`;
