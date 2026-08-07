"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSunHigh, IconLayoutGrid, IconChartBar, IconCalendarEvent, IconWand, IconBrandInstagram, IconBrandLinkedin, IconBrandYoutube, IconBrandFacebook, IconUsers, IconSpeakerphone, IconSettings, IconPencil, IconArrowsExchange, IconTrash, IconLink, IconUpload, IconPin, IconBolt, IconFileText } from "@tabler/icons-react";
import { HopeSidebar } from "../HopeSidebar";
import { MemberHub } from "./MemberHub";
import { fmtDateTime } from "@/lib/date";
import type { Capability, Permissions } from "@/lib/permissions";

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
// `photo` is optional: when a profile photo URL is present the avatar shows it,
// otherwise it falls back to the coloured initial. Wired now so photos can be
// dropped in later (from ind_users) with no render changes.
type Person = { name: string; av: string; color: string; photo?: string };

// Shared avatar chip — photo when available, coloured initial otherwise. One place
// so every owner/collaborator/picker chip picks up profile photos the same way.
function Avatar({ p, cls = "av av-sm" }: { p: { name?: string; av: string; color: string; photo?: string }; cls?: string }) {
  if (p.photo) {
    return <span className={cls} title={p.name} style={{ backgroundImage: `url(${p.photo})`, backgroundSize: "cover", backgroundPosition: "center" }} />;
  }
  return <span className={cls} title={p.name} style={{ background: p.color }}>{p.av}</span>;
}
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
// ONLY real mh_status enum values — offering anything else in a picker would 502
// the save (the server now rejects them with a 400). The legacy statuses
// ("Content - Needs Approval", "Output - In Progress", …) stay in the TYPE/map so
// old references render, but they are not selectable.
const CC_STATUS_ORDER: CCStatus[] = [
  "Content - Pending", "Content - In Progress", "Content - Approved", "Output - In Progress",
  "Incorporating Feedback", "Output - Ready", "Ready to Publish", "Published/Scheduled",
];
const STATUS: Record<CCStatus, { label: string; tone: Tone; stage: number; inView: boolean }> = {
  "Content - Pending":        { label: "Content - Pending",        tone: "muted", stage: 0, inView: true },
  "Content - In Progress":    { label: "Content - In Progress",    tone: "warn",  stage: 1, inView: true },
  "Content - Needs Approval": { label: "Content - Needs Approval", tone: "warn",  stage: 1, inView: true },
  "Content - Approved":       { label: "Content - Approved",       tone: "good",  stage: 2, inView: true },
  "Output - In Progress":     { label: "In Progress",              tone: "info",  stage: 3, inView: true },
  "Output - Ready":           { label: "Output - Ready",           tone: "info",  stage: 3, inView: true },
  "Incorporating Feedback":   { label: "Incorporating Feedback",   tone: "warn",  stage: 2, inView: true },
  "Ready to Publish":         { label: "Ready to Publish",         tone: "brand", stage: 4, inView: false },
  "Published/Scheduled":      { label: "Published/Scheduled",      tone: "good",  stage: 4, inView: false },
  "Rejected/Not Published":   { label: "Rejected/Not Published",   tone: "bad",   stage: 4, inView: false },
  "Failed":                   { label: "Failed",                   tone: "bad",   stage: 4, inView: false },
};
// Per-person status tabs (MY_DAY_SPEC §5). Each tab shows exactly ONE stage and
// lists tasks where the person is owner OR collaborator. Manya (the writer) works the
// content stages + watches claims; producers work only their approved output.
type TabDef = { key: string; label: string; statuses: CCStatus[]; videoOnly?: boolean; nonVideoOnly?: boolean };
const MANYA_TABS: TabDef[] = [
  { key: "pending",  label: "Content Pending",        statuses: ["Content - Pending", "Content - In Progress"] },
  { key: "approved", label: "Content Approved",       statuses: ["Content - Approved"], nonVideoOnly: true },
  { key: "feedback", label: "Incorporating Feedback", statuses: ["Incorporating Feedback"] },
  { key: "claimed",  label: "Claimed Task",           statuses: ["Content - Approved"], videoOnly: true },
];
const PRODUCER_TABS: TabDef[] = [
  { key: "approved", label: "Content Approved",       statuses: ["Content - Approved", "Output - In Progress"] },
  { key: "feedback", label: "Incorporating Feedback", statuses: ["Incorporating Feedback"] },
  { key: "output",   label: "Output Ready",           statuses: ["Output - Ready"] },
];
function tabsForPerson(name: string): TabDef[] {
  return name === "Manya" || name === "Maheen" ? MANYA_TABS : PRODUCER_TABS;
}
function isVideoTask(typeLine: string): boolean {
  return (VIDEO_TYPES as readonly string[]).includes(typeLine);
}
function matchesTab(t: { status: string; detail: { typeLine: string } }, tab: TabDef): boolean {
  if (!tab.statuses.includes(t.status as CCStatus)) return false;
  if (tab.videoOnly && !isVideoTask(t.detail.typeLine)) return false;
  if (tab.nonVideoOnly && isVideoTask(t.detail.typeLine)) return false;
  return true;
}
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
    priority: "Urgent" | "High" | "Medium" | "Low"; brand: string;
    duration?: number;                                  // minutes — the producer sets how long it'll take → feeds Today's plan
    content: string;                                    // full write-up (paragraphs split on blank lines)
    creatives: { name: string; type: "image" | "video" | "doc"; url?: string; attId?: string }[]; // post media + uploaded assets
    references?: RefItem[];                             // links + images the team adds for context
    outputLink?: string;                                // the finished-creative link (Drive/Canva) — output_link
    collaborators: Person[];
    activity: { who: string; text: string; time: string }[];
    createdAt?: string; startAt?: string; endAt?: string; // task clock (captured on create → done)
    feedback?: string;                                    // Manya's Incorporating-Feedback notes (spec §7)
  };
};

const PIPELINE = ["Draft", "In progress", "Approved", "Output ready", "Published"];

const TEAM = [
  { key: "manya", name: "Manya", role: "Content writer", av: "M", color: "#E0791F" },
  { key: "praveen", name: "Praveen", role: "Designer", av: "P", color: "#C2410C" },
  { key: "nikhil", name: "Nikhil", role: "Video editor", av: "N", color: "#3A57E8" },
  { key: "nandu", name: "Nandu", role: "Video editor", av: "N", color: "#6E48F8" },
];

const PPL: Record<string, Person> = {
  manya: { name: "Manya", av: "M", color: "#E0791F" },
  praveen: { name: "Praveen", av: "P", color: "#C2410C" },
  nikhil: { name: "Nikhil", av: "N", color: "#3A57E8" },
  nandu: { name: "Nandu", av: "N", color: "#6E48F8" },
  maheen: { name: "Maheen", av: "M", color: "#2F9E6F" },
};

// Today's plan is time-proportional across an 8-hour workday (9 AM–6 PM) with a
// protected 1-hour lunch. Tasks are reorderable — drag a block, or use the ◀ ▸
// nudges to push it front/back.
const DAY_START_H = 9, DAY_END_H = 19;             // 9 AM – 7 PM span (covers both shifts: 9–6 and 10–7)
const DAY_MINS = (DAY_END_H - DAY_START_H) * 60;   // 540 = 8h work + 1h lunch
const LUNCH_MIN = 60;                              // 1-hour lunch, never compromised
const LUNCH_AT = (13 - DAY_START_H) * 60;          // lunch fixed at 1 PM – 2 PM
const fmtDur = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`; };
const fmtDT = (iso?: string) => fmtDateTime(iso, "—");
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
const HOUR_TICKS = ["9 AM", "10", "11", "12", "1 PM", "2", "3", "4", "5", "6"];

type PlanItem = { key: string; taskId: string; label: string; dur: number; at?: number };
// (Today's plan seeds itself from the person's real in-view tasks — no demo plan.)

// REAL team chat (mh_messages via /api/my-day/chat). WhatsApp-style: a Team
// group + 1-on-1 DMs, derived from the fetched messages relative to `person`.
// kind='system' rows are server-posted pipeline events (handoff/claim/publish).
type ChatMsg = { who: string; av: string; color: string; tm: string; body: string; me: boolean; sys?: boolean };
type Convo = { id: string; name: string; group?: boolean; av?: string; color?: string; online?: boolean; unread: number; msgs: ChatMsg[] };
type ServerMsg = { id: string; convo: string; sender: string; body: string; kind: "chat" | "system"; at: string };
const dmConvo = (a: string, b: string) => [a, b].sort().join("~");
const CHAT_IDS = ["manya", "praveen", "nikhil", "nandu", "maheen"] as const;

const TONE: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "#E3F5EA", fg: "#1AA053" },
  info: { bg: "#E1F4F5", fg: "#079AA2" },
  brand: { bg: "#E9ECFB", fg: "#3A57E8" },
  warn: { bg: "#FEF3E2", fg: "#D97706" },
  bad: { bg: "#FBE7E4", fg: "#C03221" },
  muted: { bg: "#F0F2F8", fg: "#8A92A6" },
};

const PRIO: Record<"Urgent" | "High" | "Medium" | "Low", { bg: string; fg: string }> = {
  Urgent: { bg: "#FCE0E6", fg: "#B0203A" },
  High: { bg: "#FBE7E4", fg: "#C03221" },
  Medium: { bg: "#E1F4F5", fg: "#079AA2" },
  Low: { bg: "#F0F2F8", fg: "#8A92A6" },
};
// Urgent + High both count as "hot" — front of the plan + pipeline trigger (spec §9).
const isHot = (p: string) => p === "Urgent" || p === "High";

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
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEK_DAY_CAP = 7 * 60;                       // 7 productive hours per weekday
// Per-person shift start (minutes after 9 AM). Nandu works the LATE shift 10 AM–7 PM,
// so his day lays out from 10 AM; everyone else starts at 9 AM.
const shiftStartOf = (name: string) => (name === "Nandu" ? 60 : 0);
// Whose TIMELINE a task belongs on, by status. Manya (writer) keeps only her
// pre-approval work — the moment she marks it Content-Approved her part is done, so
// it leaves her timeline and lands on the producer's side. Producers get everything
// from Content-Approved onward. (Mirrors the dayFor capacity-board rule.)
const onTimelineFor = (name: string, status: string) =>
  name === "Manya"
    ? status === "Content - Pending" || status === "Content - In Progress"
    : status !== "Content - Pending" && status !== "Content - In Progress";
function estMins(type: string): number {
  const t = (type || "").toLowerCase();
  if (/thumbnail/.test(t)) return 30;         // BEFORE /reel/ — "Reel Thumbnail" is design work, not a 90m video
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
type SwapCand = { id: string; title: string; dur: number; due?: string };
type Notif = { id: string; kind: "urgent" | "claim" | "message" | "freed"; emoji: string; title: string; sub: string; task?: Task; postId?: string; accept?: boolean; swap?: { from: string; candidates: SwapCand[] } };

function greetingFor(h: number) {
  if (h < 5) return { word: "Hello", emoji: "👋" };
  if (h < 12) return { word: "Good morning", emoji: "☀️" };
  if (h < 17) return { word: "Good afternoon", emoji: "👋" };
  if (h < 21) return { word: "Good evening", emoji: "🌆" };
  return { word: "Hello", emoji: "👋" };
}

const BELL = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
const CLIP = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6H9V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m8.5 13 2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const CHATIC = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const CLOCK = <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" /><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
// Inline chrome icons (baseline-aligned) — replace emojis in buttons/labels so the
// whole cockpit uses Hope outline glyphs, never emoji.
const ICLOCK = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "-2px" }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" /><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const IWARN = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "-2px" }}><path d="M12 3 2.5 20h19L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 10v4.5M12 17.6v.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
const IHOURGLASS = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "-2px" }}><path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6-4.5 9s4.5 4 4.5 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const IPOWER = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "-2px" }}><path d="M12 3v8.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /><path d="M7.5 6a7.5 7.5 0 1 0 9 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>;
const IUSERS = <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M15.5 5.9a3 3 0 0 1 0 5.2M16 14.2A5.5 5.5 0 0 1 19.5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
const CHEV = <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "-1px", opacity: 0.55 }}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const IPLAY = <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a1 1 0 0 0 1.52.85l11-6.8a1 1 0 0 0 0-1.7l-11-6.8A1 1 0 0 0 8 5.2Z" /></svg>;
const ISTOP = <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>;

// One due-date chip everywhere so the clock icon + label read uniformly on every
// task card (My tasks, claimable, Output-Ready). Renders nothing when there's no due.
function DueChip({ due, today }: { due: string; today: string }) {
  const di = dueInfo(due, today);
  if (!di.label) return null;
  return <span className={`due-chip ${di.overdue ? "od" : ""}`}>{CLOCK}{di.label}</span>;
}

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
        <span className="status-dd-val">{STATUS[value].label}</span>
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
                  <span className="status-dd-item-lbl">{STATUS[s].label}</span>
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

// Reusable Hope-styled dropdown — replaces native <select> everywhere (the OS
// select can't be themed and looks off-brand). Same menu treatment as the status
// dropdown: rounded capsule button + floating card. `wide` fills a form field.
function MenuDropdown({ value, options, onChange, placeholder = "Select…", icon, wide, align = "right" }: {
  value: string | number | "";
  options: { value: string | number; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string; icon?: React.ReactNode; wide?: boolean; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => String(o.value) === String(value));
  return (
    <div className={`ui-dd ${wide ? "wide" : ""}`}>
      <button type="button" className="ui-dd-btn" onClick={() => setOpen((o) => !o)}>
        {icon && <span className="ui-dd-ic">{icon}</span>}
        <span className="ui-dd-val">{cur ? cur.label : placeholder}</span>
        <span className="ui-dd-caret" />
      </button>
      {open && (
        <>
          <div className="ui-dd-back" onClick={() => setOpen(false)} />
          <div className="ui-dd-menu" style={wide ? { left: 0, right: 0 } : { [align]: 0 }}>
            {options.map((o) => (
              <button type="button" key={String(o.value)} className={`ui-dd-item ${String(o.value) === String(value) ? "on" : ""}`} onClick={() => { onChange(String(o.value)); setOpen(false); }}>
                <span className="ui-dd-item-lbl">{o.label}</span>
                {String(o.value) === String(value) && <span className="ui-dd-check">✓</span>}
              </button>
            ))}
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
          <div key={r.attId || r.url || i} className="thumb ref-thumb" title={r.label}>
            <div className="thumb-img" style={{ backgroundImage: `url(${r.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
            <div className="thumb-name">{r.label}</div>
            <button className="ref-x" onClick={() => remove(i)} title="Remove">✕</button>
          </div>
        ) : (
          <a key={r.url || i} className="ref-link" href={r.url} target="_blank" rel="noreferrer" title={r.url}>
            <span className="ref-link-ic"><IconLink size={14} stroke={1.8} /></span>
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

type CreativeItem = { name: string; type: "image" | "video" | "doc"; url?: string; attId?: string };

// Creatives & files — the task's post media + uploaded creative files. Upload (click
// or drag-drop) persists to mh_attachments (kind='creative') and shows immediately;
// click any creative to open the preview (image / carousel slideshow / video play).
function CreativesSection({ creatives, outputLink, postId, uploadedBy, onSaved }: { creatives: CreativeItem[]; outputLink?: string; postId: string; uploadedBy: string; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [link, setLink] = useState(outputLink || "");   // the output link (Drive/Canva) — output_link
  const [linkInput, setLinkInput] = useState("");
  const viewable = creatives.filter((c) => c.url && c.type !== "doc");
  const saveLink = async (url: string) => {
    setLink(url);
    await fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: postId, actor: uploadedBy, fields: { output_link: url } }) }).catch(() => {});
    onSaved();
  };
  const addLink = () => {
    const raw = linkInput.trim(); if (!raw) return;
    setLinkInput("");
    saveLink(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  };
  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("postId", postId); fd.append("uploadedBy", uploadedBy); fd.append("kind", "creative"); fd.append("file", f);
        await fetch("/api/marketing-hub/attach", { method: "POST", body: fd });
      }
    } finally { setBusy(false); onSaved(); }
  };
  const remove = async (attId: string) => { await fetch(`/api/marketing-hub/attach?id=${attId}`, { method: "DELETE" }); onSaved(); };
  const openPreview = (c: CreativeItem) => { const idx = viewable.indexOf(c); if (idx >= 0) setPreview(idx); };
  return (
    <>
      <div className="section-lbl">Creatives &amp; files</div>
      {creatives.length ? (
        <div className="thumbs">
          {creatives.map((f, i) => (
            <div key={i} className="thumb" title={f.name}>
              <div
                className={`thumb-img ${f.url && f.type !== "doc" ? "clk" : ""}`}
                style={f.url && f.type === "image" ? { backgroundImage: `url(${f.url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: THUMB_BG[i % THUMB_BG.length] }}
                onClick={() => openPreview(f)}
              >
                {f.type === "video" && <span className="thumb-play">▶</span>}
                {f.type === "doc" && <span className="thumb-doc"><IconFileText size={20} stroke={1.7} /></span>}
              </div>
              <div className="thumb-name">{f.name}</div>
              {f.attId && <button className="ref-x" onClick={() => remove(f.attId!)} title="Remove">✕</button>}
            </div>
          ))}
          <label className="thumb thumb-add" title="Add creative">
            <span className="thumb-add-plus">＋</span><span className="thumb-add-lbl">{busy ? "…" : "Add"}</span>
            <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      ) : (
        <label className="upload-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
          <span className="upload-ic"><IconUpload size={18} stroke={1.7} /></span>
          <span><b>{busy ? "Uploading…" : "Upload files"}</b><span className="upload-sub">Drag &amp; drop or click to add creatives</span></span>
          <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      {/* Output link — a task can be delivered as an uploaded file OR a link (Drive/Canva). */}
      {link ? (
        <div className="refs" style={{ marginTop: ".55rem" }}>
          <a className="ref-link" href={link} target="_blank" rel="noreferrer" title={link}>
            <span className="ref-link-ic"><IconLink size={14} stroke={1.8} /></span>
            <span className="ref-link-lbl">{link.replace(/^https?:\/\//i, "")}</span>
            <span className="ref-x sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveLink(""); }} title="Remove">✕</span>
          </a>
        </div>
      ) : (
        <div className="ref-url" style={{ marginTop: ".55rem" }}>
          <input className="nt-input" placeholder="…or paste the output link (Drive / Canva)…" value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
          <button type="button" className="btn primary sm" onClick={addLink} disabled={!linkInput.trim()}>Add link</button>
        </div>
      )}
      {preview !== null && viewable.length > 0 && (
        <CreativePreview items={viewable} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}

// Fullscreen creative preview — image / carousel slideshow (‹ › + dots) / video play.
function CreativePreview({ items, index, onIndex, onClose }: { items: CreativeItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const cur = items[Math.min(index, items.length - 1)];
  const prev = () => onIndex((index - 1 + items.length) % items.length);
  const next = () => onIndex((index + 1) % items.length);
  return (
    <div className="cv-bg" onClick={onClose}>
      <div className="cv-box" onClick={(e) => e.stopPropagation()}>
        <button className="cv-x" onClick={onClose}>×</button>
        <div className="cv-stage">
          {cur.type === "video"
            ? <video className="cv-el" src={cur.url} controls autoPlay playsInline />
            : <img className="cv-el" src={cur.url} alt={cur.name} />}
          {items.length > 1 && (
            <>
              <button className="cv-nav prev" onClick={prev} aria-label="Previous">‹</button>
              <button className="cv-nav next" onClick={next} aria-label="Next">›</button>
              <span className="cv-count">{index + 1}/{items.length}</span>
            </>
          )}
        </div>
        <div className="cv-name">
          <span className="cv-fname">{cur.name}</span>
          {items.length > 1 && <span className="cv-dots">{items.map((_, i) => <button key={i} className={`cv-dot ${i === index ? "on" : ""}`} onClick={() => onIndex(i)} aria-label={`Item ${i + 1}`} />)}</span>}
        </div>
      </div>
    </div>
  );
}

// Extend-time control on the live timer: quick presets + a custom-minutes box.
// Each pick ADDS to the current planned duration (accumulates) → onExtend, which
// persists the new duration and reshuffles Today's plan. The overrun vs the
// original estimate stays visible in the Created/Started/Time-taken record.
function ExtendPicker({ onExtend }: { onExtend: (mins: number) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const add = (m: number) => { if (m > 0) { onExtend(m); setCustom(""); setOpen(false); } };
  return (
    <span className="ext-wrap">
      <button className="btn sm" onClick={() => setOpen((o) => !o)}>+ Extend {CHEV}</button>
      {open && (
        <div className="ext-menu" onClick={(e) => e.stopPropagation()}>
          <div className="ext-row">{[15, 30, 45, 60, 90].map((m) => <button key={m} className="btn sm" onClick={() => add(m)}>+{m}m</button>)}</div>
          <div className="ext-row">
            <input className="nt-input ext-in" inputMode="numeric" placeholder="custom min" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))} />
            <button className="btn sm primary" disabled={!custom} onClick={() => add(parseInt(custom || "0", 10))}>Add time</button>
          </div>
        </div>
      )}
    </span>
  );
}

function TaskBody({ task, label, onStatusChange, onSetDuration, uploadedBy, onSaved, timing, canEdit, canDelete, canAssign, onDeleted }: { task: Task; label?: string; onStatusChange?: (s: CCStatus) => void; onSetDuration?: (mins: number) => void; canSchedule?: boolean; uploadedBy?: string; onSaved?: () => void; timing?: { planned: number; elapsed: number }; canEdit?: boolean; canDelete?: boolean; canAssign?: boolean; onDeleted?: () => void }) {
  // Permission-gated task actions (edit / reassign / delete). Only rendered when
  // the viewed person's Team capabilities allow them.
  const actor = uploadedBy || "maheen";
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prio, setPrio] = useState(task.detail.priority);
  const [due, setDue] = useState(task.due || "");
  const saveEdit = async () => {
    setBusy(true);
    try {
      await fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, actor, fields: { priority: prio, due_date: due || null } }) });
      setEditing(false); onSaved?.();
    } finally { setBusy(false); }
  };
  const reassign = async (key: string) => {
    setBusy(true);
    try {
      await fetch("/api/marketing-hub/takeover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: task.id, newOwnerKey: key }) });
      setAssigning(false); onSaved?.();
    } finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true);
    try {
      await fetch("/api/marketing-hub/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, actor }) });
      setConfirmDel(false); (onDeleted || onSaved)?.();
    } finally { setBusy(false); }
  };
  // Add a collaborator to this task (writes mh_post_collaborators via the CRUD route),
  // then resync so the new avatar chip appears. Same junction table the handoff uses.
  const [addingCollab, setAddingCollab] = useState(false);
  const addCollab = async (key: string) => {
    setBusy(true);
    try {
      await fetch("/api/marketing-hub/collaborators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: task.id, memberKey: key }) });
      setAddingCollab(false); onSaved?.();
    } finally { setBusy(false); }
  };
  const tone = TONE[STATUS[task.status].tone];
  // Collaborators = the writer(s)/helpers on the task — kept separate from Owner
  // (the single person who claimed / does it), mirroring the Airtable model.
  const collabs = task.detail.collaborators;
  // Owner shown with the same avatar chip as collaborators — resolve the name back to
  // a PPL entry for its initials/colour ("Unclaimed" has no chip).
  const ownerP = Object.values(PPL).find((p) => p.name === task.detail.owner);
  // Candidates for the "+ add collaborator" menu: everyone not already the owner or a
  // collaborator on this task.
  const addable = Object.entries(PPL).filter(
    ([, p]) => p.name !== task.detail.owner && !collabs.some((c) => c.name === p.name),
  );
  return (
    <>
      {/* Header — title + sub on the left, STATUS dropdown pinned top-right (above owner) */}
      <div className="d-head">
        <div className="d-head-main">
          {label && <div className="lbl" style={{ marginBottom: ".45rem" }}>{label}</div>}
          <div className="d-title">{task.title}</div>
          <div className="d-sub">{task.detail.typeLine} · {task.detail.brand}</div>
        </div>
        <div className="status-box">
          <div className="status-row">
            {onStatusChange ? (
              <StatusDropdown value={task.status} onChange={onStatusChange} />
            ) : (
              <span className="pill cap" style={{ background: tone.bg, color: tone.fg }}>{STATUS[task.status].label}</span>
            )}
            {onSetDuration && (
              <DurationPicker value={task.detail.duration} onChange={(m) => onSetDuration(m)} />
            )}
            {/* Stopwatch: Content-Approved → Start (begins the clock); running → Stop
                (marks Output-Ready). Sits right after Set duration, per the agreed order. */}
            {onStatusChange && task.status === "Content - Approved" && (
              <button className="cap sw-btn start" title="Start working — starts the timer" onClick={() => onStatusChange("Output - In Progress")}>{IPLAY} Start</button>
            )}
            {onStatusChange && timing && (
              <button className="cap sw-btn stop" title="Mark output ready — stops the timer" onClick={() => onStatusChange("Output - Ready")}>{ISTOP} Stop</button>
            )}
            {/* LIVE COUNTDOWN capsule — same height as the others; only while running */}
            {timing && (
              <span className={`cap cap-timer ${timing.elapsed >= timing.planned ? "over" : ""}`} title="Time left vs the planned duration">
                {ICLOCK} {timing.elapsed >= timing.planned ? `+${fmtMins(timing.elapsed - timing.planned)} over` : `${fmtMins(timing.planned - timing.elapsed)} left`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Owner (claimer) and Collaborators (writer) are distinct fields */}
      <div className="meta-grid" style={{ marginTop: "1.1rem" }}>
        <div>
          <div className="mlbl">Owner</div>
          {ownerP ? (
            <div className="collab-cell">
              <Avatar p={ownerP} />
              <span className="collab-names">{ownerP.name}</span>
            </div>
          ) : <div className="mval">{task.detail.owner}</div>}
        </div>
        <div>
          <div className="mlbl">Collaborators</div>
          <div className="collab-cell" style={{ position: "relative" }}>
            {collabs.map((c, i) => <Avatar key={i} p={c} />)}
            {collabs.length ? (
              <span className="collab-names">{collabs.map((c) => c.name).join(", ")}</span>
            ) : <span className="collab-names" style={{ color: "var(--faint)" }}>None yet</span>}
            {addable.length > 0 && (
              <button
                type="button"
                className="collab-add"
                title="Add a collaborator"
                disabled={busy}
                onClick={() => setAddingCollab((v) => !v)}
              >+</button>
            )}
            {addingCollab && (
              <div className="collab-menu">
                {addable.map(([key, p]) => (
                  <button key={key} type="button" className="collab-opt" disabled={busy} onClick={() => addCollab(key)}>
                    <Avatar p={p} />{p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="mlbl">Priority</div>
          <span className="pill" style={{ background: PRIO[task.detail.priority].bg, color: PRIO[task.detail.priority].fg }}>{task.detail.priority}</span>
        </div>
      </div>

      {/* Task clock — captured on create → done, so you can see how long it took */}
      <div className="meta-grid">
        <div><div className="mlbl">Created</div><div className="mval">{fmtDT(task.detail.createdAt)}</div></div>
        <div><div className="mlbl">Published Date</div><div className="mval" style={{ color: "#2138B0", fontWeight: 500 }}>{task.detail.publishes}</div></div>
        <div><div className="mlbl">{task.detail.endAt ? "Time taken" : "Status"}</div><div className="mval">{task.detail.endAt ? durBetween(task.detail.startAt, task.detail.endAt) : "In progress"}</div></div>
      </div>

      {/* LIVE TIMER — only runs once the task is set to "In Progress" (start_at is
          stamped then). Counts real time vs the planned duration; nearing/over it
          asks INLINE (no popup): finished, or extend? Extending reshuffles the day. */}
      {timing && (
        <div className={`timer-strip ${timing.elapsed >= timing.planned ? "over" : ""}`}>
          <span className="timer-num">{ICLOCK} {fmtMins(timing.planned)} planned · <b>{fmtMins(timing.elapsed)}</b> on the clock</span>
          {timing.elapsed >= timing.planned - 15 && onStatusChange && onSetDuration && (
            <span className="timer-acts">
              <span>{timing.elapsed >= timing.planned ? `Over by ${fmtMins(timing.elapsed - timing.planned)} — wrap up or add time?` : `~${fmtMins(timing.planned - timing.elapsed)} left — done, or need more time?`}</span>
              <button className="btn sm primary" onClick={() => onStatusChange("Output - Ready")}>✓ Output ready</button>
              <ExtendPicker onExtend={(m) => onSetDuration(timing.planned + m)} />
            </span>
          )}
        </div>
      )}

      {/* Incorporating-Feedback notes from Manya (spec §7) — highlighted so the
          producer can't miss what to fix. */}
      {task.status === "Incorporating Feedback" && task.detail.feedback && (
        <div style={{ margin: "0 0 .9rem", padding: ".7rem .85rem", borderRadius: 10, background: "#FCE8EC", border: "1px solid #F3C0CB" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#B0203A", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>{IWARN} Feedback from Manya</div>
          <div style={{ fontSize: 13, color: "#7A1327", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{task.detail.feedback}</div>
        </div>
      )}

      <div className="section-head">
        <span className="section-lbl">Content brief</span>
      </div>
      {/* Full write-up, exactly as typed — every line/paragraph preserved, no inner
          scroll (the section grows; you scroll the card/page to read it all). */}
      <div className="brief brief-full">{task.detail.content}</div>

      <CreativesSection key={`cr-${task.id}`} creatives={task.detail.creatives} outputLink={task.detail.outputLink} postId={task.id} uploadedBy={uploadedBy || "maheen"} onSaved={onSaved || (() => {})} />

      <ReferencesSection key={task.id} initial={task.detail.references || []} postId={task.id} uploadedBy={uploadedBy || "maheen"} onSaved={onSaved || (() => {})} />

      <div className="section-lbl">Recent activity</div>
      <div className="activity">
        {task.detail.activity.map((a, i) => (
          <div key={i} className="act-row"><b>{a.who}</b> {a.text}<span className="act-time"> · {a.time}</span></div>
        ))}
      </div>

      {(canEdit || canAssign || canDelete) && (
        <>
          <div className="section-lbl" style={{ marginTop: ".9rem" }}>Actions</div>
          <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
            {canEdit && <button className="btn sm" onClick={() => { setEditing((e) => !e); setAssigning(false); setConfirmDel(false); }}><IconPencil size={14} stroke={1.8} /> Edit</button>}
            {canAssign && <button className="btn sm" onClick={() => { setAssigning((a) => !a); setEditing(false); setConfirmDel(false); }}><IconArrowsExchange size={14} stroke={1.8} /> Reassign</button>}
            {canDelete && <button className="btn sm" style={{ color: "#C0392B", borderColor: "#F3C6CE" }} onClick={() => { setConfirmDel((c) => !c); setEditing(false); setAssigning(false); }}><IconTrash size={14} stroke={1.8} /> Delete</button>}
          </div>

          {editing && (
            <div style={{ marginTop: ".5rem", border: "1px solid var(--line)", borderRadius: 10, padding: ".7rem" }}>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <div className="mlbl">Priority</div>
                  <div style={{ display: "flex", gap: ".3rem", marginTop: ".3rem" }}>
                    {Object.keys(PRIO).map((k) => (
                      <button key={k} className="btn sm" onClick={() => setPrio(k as typeof prio)} style={k === prio ? { background: PRIO[k as keyof typeof PRIO].bg, color: PRIO[k as keyof typeof PRIO].fg, borderColor: "transparent" } : {}}>{k}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mlbl">Due date</div>
                  <div style={{ marginTop: ".3rem" }}><DatePicker value={due} onChange={setDue} /></div>
                </div>
              </div>
              <div style={{ display: "flex", gap: ".4rem", marginTop: ".7rem" }}>
                <button className="btn sm primary" disabled={busy} onClick={saveEdit}>{busy ? "Saving…" : "Save changes"}</button>
                <button className="btn sm" onClick={() => { setEditing(false); setPrio(task.detail.priority); setDue(task.due || ""); }}>Cancel</button>
              </div>
            </div>
          )}

          {assigning && (
            <div style={{ marginTop: ".5rem", border: "1px solid var(--line)", borderRadius: 10, padding: ".7rem" }}>
              <div className="mlbl" style={{ marginBottom: ".45rem" }}>Reassign to</div>
              <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
                {Object.entries(PPL).map(([key, p]) => (
                  <button key={key} className="btn sm" disabled={busy} onClick={() => reassign(key)}>
                    <span className="av av-sm" style={{ background: p.color, marginRight: ".35rem" }}>{p.av}</span>{p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {confirmDel && (
            <div style={{ marginTop: ".5rem", border: "1px solid #F3C6CE", background: "#FDECEF", borderRadius: 10, padding: ".7rem" }}>
              <div style={{ fontSize: ".82rem", color: "#8a2e28", marginBottom: ".5rem" }}>Delete “{task.title}”? This removes it from the pipeline for everyone.</div>
              <div style={{ display: "flex", gap: ".4rem" }}>
                <button className="btn sm" style={{ background: "#C0392B", color: "#fff", borderColor: "transparent" }} disabled={busy} onClick={doDelete}>{busy ? "Deleting…" : "Yes, delete"}</button>
                <button className="btn sm" onClick={() => setConfirmDel(false)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// Custom Hope-themed date picker (replaces the OS-native <input type=date> calendar).
// Task duration — quick presets PLUS a custom hours/minutes entry (no fixed set).
function DurationPicker({ value, onChange }: { value?: number; onChange: (mins: number) => void }) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const PRESETS = [15, 30, 45, 60, 90, 120, 180];
  const applyCustom = () => {
    const mins = (parseInt(h || "0", 10) || 0) * 60 + (parseInt(m || "0", 10) || 0);
    if (mins > 0) { onChange(mins); setOpen(false); setH(""); setM(""); }
  };
  const chipStyle = (on: boolean): React.CSSProperties => ({ fontSize: 12, fontWeight: 500, padding: "5px 9px", borderRadius: 7, cursor: "pointer", border: on ? "1px solid #3A57E8" : "1px solid #E6E8EE", background: on ? "#3A57E8" : "#fff", color: on ? "#fff" : "#232D42" });
  const S: Record<string, React.CSSProperties> = {
    trigger: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, color: value ? "#232D42" : "#8A92A6", background: "#fff", border: "1px solid #E6E8EE", borderRadius: 8, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap" },
    pop: { position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60, background: "#fff", border: "1px solid #E6E8EE", borderRadius: 12, padding: 12, width: 244, boxShadow: "0 8px 24px rgba(20,30,60,.10)" },
    chips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 },
    row: { display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid #F0F1F5", paddingTop: 10 },
    num: { width: 46, textAlign: "center", fontSize: 13, border: "1px solid #E6E8EE", borderRadius: 7, padding: "5px 4px", outline: "none" },
    set: { marginLeft: "auto", fontSize: 12, fontWeight: 500, background: "#3A57E8", color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer" },
    lbl: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A92A6", marginBottom: 6 },
  };
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" style={S.trigger} onClick={() => setOpen((o) => !o)}>
        <span title="Task duration">{ICLOCK}</span> {value ? fmtDur(value) : "Set duration…"} {CHEV}
      </button>
      {open && (
        <>
          <span style={{ position: "fixed", inset: 0, zIndex: 59 }} onClick={() => setOpen(false)} />
          <div style={S.pop} onClick={(e) => e.stopPropagation()}>
            <div style={S.lbl}>Quick pick</div>
            <div style={S.chips}>
              {PRESETS.map((p) => (
                <button key={p} type="button" style={chipStyle(value === p)} onClick={() => { onChange(p); setOpen(false); }}>{fmtDur(p)}</button>
              ))}
            </div>
            <div style={S.lbl}>Custom</div>
            <div style={S.row}>
              <input type="number" min={0} max={12} value={h} onChange={(e) => setH(e.target.value)} placeholder="0" style={S.num} /><span style={{ fontSize: 12, color: "#8A92A6" }}>h</span>
              <input type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); }} placeholder="0" style={S.num} /><span style={{ fontSize: 12, color: "#8A92A6" }}>m</span>
              <button type="button" style={S.set} onClick={applyCustom}>Set</button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

// One swap candidate in Manya's Requests — she can move it to the default +1-day
// date OR pick ANY custom date, then hand the queued task over.
function SwapCandidateRow({ c, defaultDate, onMove }: { c: SwapCand; defaultDate: string; onMove: (date: string) => void }) {
  const [date, setDate] = useState(defaultDate);
  const todayISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const label = (() => { try { return new Date(date + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" }); } catch { return date; } })();
  return (
    <div className="claim-row" style={{ borderBottom: "none", padding: ".35rem 0", gap: ".5rem", alignItems: "center" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="claim-title">{c.title}</div>
        <div className="claim-meta">{fmtMins(c.dur)}{c.due ? ` · due ${c.due}` : ""} · <b style={{ color: "#3A57E8" }}>→ moves to {label}</b></div>
      </div>
      <input type="date" value={date} min={todayISO} onChange={(e) => setDate(e.target.value)} title="Pick the date to move it to (today or later)" style={{ fontSize: 12, border: "1px solid #E6E8EE", borderRadius: 7, padding: "4px 6px", color: "#232D42" }} />
      <button className="btn primary sm" disabled={!date} onClick={() => onMove(date)}>Move · hand over</button>
    </div>
  );
}

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
// Pending references / output for a NOT-YET-CREATED task. Holds picked images (with a
// local preview) + links in memory; the parent uploads them once the task row exists
// (references → mh_attachments kind='reference' + reference_links; output → kind='creative'
// + output_link). `oneLink` caps output at a single final-creative link (the DB column
// output_link is singular). Mirrors the detail-view ReferencesSection UI + classes.
type PendingFile = { file: File; url: string };
type PendingAsset = { links: string[]; files: PendingFile[] };
export type NewTaskAssets = { refLinks: string[]; refFiles: File[]; outLink: string; outFiles: File[] };
const EMPTY_ASSET: PendingAsset = { links: [], files: [] };

function PendingAssets({ hint, oneLink, value, onChange }: { hint: string; oneLink?: boolean; value: PendingAsset; onChange: (p: PendingAsset) => void }) {
  const [url, setUrl] = useState("");
  const addUrl = () => {
    const raw = url.trim(); if (!raw) return;
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    onChange({ ...value, links: oneLink ? [href] : [...value.links, href] });
    setUrl("");
  };
  const addFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const added = Array.from(files).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    onChange({ ...value, files: [...value.files, ...added] });
  };
  const rmFile = (i: number) => { const f = value.files[i]; if (f) URL.revokeObjectURL(f.url); onChange({ ...value, files: value.files.filter((_, j) => j !== i) }); };
  const rmLink = (i: number) => onChange({ ...value, links: value.links.filter((_, j) => j !== i) });
  return (
    <>
      <div className="refs">
        {value.files.map((f, i) => (
          <div key={i} className="thumb ref-thumb" title={f.file.name}>
            <div className="thumb-img" style={{ backgroundImage: `url(${f.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
            <div className="thumb-name">{f.file.name}</div>
            <button type="button" className="ref-x" onClick={() => rmFile(i)} title="Remove">✕</button>
          </div>
        ))}
        <label className="thumb thumb-add" title="Add image">
          <span className="thumb-add-plus">＋</span><span className="thumb-add-lbl">Image</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {value.links.length > 0 && (
        <div className="refs" style={{ marginTop: ".45rem" }}>
          {value.links.map((l, i) => (
            <a key={i} className="ref-link" href={l} target="_blank" rel="noreferrer" title={l}>
              <span className="ref-link-ic"><IconLink size={14} stroke={1.8} /></span>
              <span className="ref-link-lbl">{l.replace(/^https?:\/\//i, "")}</span>
              <span className="ref-x sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); rmLink(i); }} title="Remove">✕</span>
            </a>
          ))}
        </div>
      )}
      <div className="ref-url" style={{ marginTop: ".45rem" }}>
        <input className="nt-input" placeholder={oneLink ? "Paste the final creative link (Drive / Canva)…" : "Paste a reference URL…"} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} />
        <button type="button" className="btn primary sm" onClick={addUrl} disabled={!url.trim()}>Add link</button>
      </div>
      <div className="nt-hint" style={{ marginTop: ".35rem", display: "block" }}>{hint}</div>
    </>
  );
}

function NewTaskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (t: Task, owner: string, note: string, assets: NewTaskAssets) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("Reel Thumbnail");
  const [sbu, setSbu] = useState<string>(CC_SBUS[0]);
  const [priority, setPriority] = useState<"Urgent" | "High" | "Medium" | "Low">("Medium");
  const [status, setStatus] = useState<CCStatus>("Content - Pending");
  const [content, setContent] = useState("");
  const [publishDate, setPublishDate] = useState(""); // the writer picks it — no auto-date
  const [refs, setRefs] = useState<PendingAsset>(EMPTY_ASSET);       // input references (many links + images)
  const [output, setOutput] = useState<PendingAsset>(EMPTY_ASSET);   // finished creative if Manya does it herself
  const assign = autoAssign(type);
  const canSubmit = !!title.trim() && !!content.trim() && !!publishDate; // required fields
  function create() {
    if (!canSubmit) return;
    const due = publishDate; // the writer's chosen publishing date (no +3 assumption)
    const publishes = new Date(publishDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
    onCreate(t, "Manya", assign.note, {
      refLinks: refs.links,
      refFiles: refs.files.map((f) => f.file),
      outLink: output.links[0] || "",
      outFiles: output.files.map((f) => f.file),
    });
  }
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card nt-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">✕</button>
        <div className="lbl" style={{ marginBottom: ".5rem" }}>New task · created by Manya</div>
        <div className="d-title" style={{ marginBottom: "1.1rem" }}>Create a content task</div>
        <div className="nt-field"><label className="nt-label">Particulars <span className="nt-req">required</span></label><input className="nt-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AMC Exam Guide — Thumbnail" /></div>
        <div className="nt-row">
          <div className="nt-field"><label className="nt-label">Type</label><MenuDropdown wide align="left" value={type} onChange={setType} options={CC_TYPES.map((t) => ({ value: t, label: t }))} /></div>
          <div className="nt-field"><label className="nt-label">Priority</label><MenuDropdown wide align="left" value={priority} onChange={(v) => setPriority(v as "Urgent" | "High" | "Medium" | "Low")} options={["Urgent", "High", "Medium", "Low"].map((p) => ({ value: p, label: p }))} /></div>
        </div>
        <div className="nt-field"><label className="nt-label">Publishing date <span className="nt-req">required</span> <span className="nt-hint">the writer sets this — no auto-date</span></label><DatePicker value={publishDate} onChange={setPublishDate} /></div>
        <div className="nt-row">
          <div className="nt-field"><label className="nt-label">SBU</label><MenuDropdown wide align="left" value={sbu} onChange={setSbu} options={CC_SBUS.map((s) => ({ value: s, label: s }))} /></div>
          <div className="nt-field"><label className="nt-label">Status</label><MenuDropdown wide align="left" value={status} onChange={(v) => setStatus(v as CCStatus)} options={CC_STATUS_ORDER.map((s) => ({ value: s, label: STATUS[s].label }))} /></div>
        </div>
        <div className="nt-field"><label className="nt-label">Content <span className="nt-req">required</span> <span className="nt-hint">the write-up · the main thing</span></label><textarea className="nt-input nt-textarea" value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Write the content / brief here — hook, body, CTA, specs…" /></div>
        <div className="nt-field">
          <label className="nt-label">References <span className="nt-hint">image references or links for the designer</span></label>
          <PendingAssets hint="Moodboard images, examples, or links the designer should see." value={refs} onChange={setRefs} />
        </div>
        <div className="nt-field">
          <label className="nt-label">Output <span className="nt-hint">finishing it yourself? drop the ready creative here</span></label>
          <PendingAssets oneLink hint="Upload the ready creative (images) + its Drive/Canva link — for tasks you can complete without a designer." value={output} onChange={setOutput} />
        </div>
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
            {(n.kind === "urgent" || n.kind === "freed" || n.accept) && (
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
          <span>{ICLOCK}</span>
          {fits
            ? <span>You have <b>{fmtMins(free)}</b> free today — this fits. You'd still finish by <b>{DAY_END_LABEL}</b>.</span>
            : <span>Your day is <b>9:00 AM–{DAY_END_LABEL}</b>. Adding this pushes you to <b className="over">{finish}</b> — you'd work <b>{fmtMins(over)} over</b> your usual checkout.</span>}
        </div>
        <div className="aw-choice">
          <button className="btn primary" onClick={onAcceptWork}>{fits ? "Accept & work" : `Accept & work — finish ${finish}`}</button>
          {/* The swap option is ALWAYS available — and the producer never picks:
              their whole not-started list is sent to MANYA, who chooses the swap. */}
          <div className="aw-or">{fits ? "or, if you'd rather swap" : "or, if you can't stretch"}</div>
          <button className="btn" onClick={onAskManya}>Send my not-started list to Manya — she picks the swap</button>
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
        <div className="mr-ic">{ICLOCK}</div>
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

// The Team-capacity PAGE (opened from the 👥 button, next to the bell) — its own
// screen so Manya never confuses it with her own plan. Each teammate shows their
// day planner (done faded, current highlighted + now-line) and what they're on now.
type CapBlock = { k: string; l: string; f: number; s?: "done" | "now"; start?: number; durMin?: number };
// REAL data: each producer's day is laid out from their actual in-production tasks
// (duration = estimate by type), sequential from 9 AM around the fixed 1 PM lunch.
// done/now flags come from the real clock. No fabricated schedules.
function TeamCapacityPage({ onBack, tasks, nowMin }: { onBack: () => void; tasks: Task[]; nowMin: number | null }) {
  const PRODUCERS = [
    { key: "praveen", name: "Praveen", role: "Designer", av: "P", color: "#C2410C" },
    { key: "nikhil", name: "Nikhil", role: "Video editor", av: "N", color: "#3A57E8" },
    { key: "nandu", name: "Nandu", role: "Video editor", av: "N", color: "#6E48F8" },
  ];
  // Day = what's actually on their plate TODAY (due today / overdue). Week = the
  // whole approved backlog against a 5-day (40h) capacity — one person can't do a
  // week's load in a day, so the two must never be conflated.
  const [span, setSpan] = useState<"today" | "week">("today");
  // Week capacity = Mon–Fri ONLY (no Sat/Sun), 7 productive hours a day with the
  // 1–2 PM lunch excluded → 35h. Today stays the 8h working day.
  const WEEK_MIN = 7 * 60 * 5;
  const capacity = span === "today" ? WORK_MIN : WEEK_MIN;
  const d0 = new Date();
  const todayStr = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`;
  const now = Math.max(0, Math.min(nowMin ?? 0, DAY_MINS));
  const rows = PRODUCERS.map((p) => {
    const mine = tasks
      // Producers work only APPROVED content (role rule) …
      .filter((t) => t.detail.owner === p.name && (t.status === "Content - Approved" || t.status === "Incorporating Feedback"))
      // … and the Day view narrows to what's actually due by today.
      .filter((t) => span === "week" || !t.due || t.due <= todayStr)
      .map((t) => ({ label: t.title, dur: t.detail.duration || estMins(t.detail.typeLine), video: /reel|short|video|long-form/i.test(t.detail.typeLine), due: t.due }));
    const committed = mine.reduce((s, t) => s + t.dur, 0);
    const freeMin = capacity - committed;
    const blocks: CapBlock[] = [];
    let cursor = shiftStartOf(p.name), lunchDone = false, current: { label: string; endsIn: number } | null = null;
    // Week view buckets these into Mon–Fri columns (below). todayCol = live column.
    const todayW = (d0.getDay() + 6) % 7;                 // Mon=0 … Sun=6
    const todayCol = todayW <= 4 ? todayW : 0;            // weekend viewer → Mon
    const weekDays = Array.from({ length: 5 }, () => ({ committed: 0, tasks: [] as { label: string; dur: number; video: boolean }[] }));
    if (span === "today") {
      // Sequential layout from 9 AM. LUNCH IS THE OFFICE STANDARD 1–2 PM — pinned,
      // never floating to wherever the tasks happen to end (tasks split around it,
      // and an early finish gets a Free gap so lunch still sits at 1 PM).
      const LUNCH_END = LUNCH_AT + LUNCH_MIN;
      // Every block carries exact start/duration MINUTES — the track renders them
      // absolutely (left/width %), so Lunch sits pixel-perfect on the 1 PM tick
      // (flex layouts drift: long labels push blocks off the grid).
      const pushTask = (label: string, video: boolean, start: number, dur: number) => {
        const s = start + dur <= now ? "done" : start <= now && now < start + dur ? "now" : undefined;
        if (s === "now") current = { label, endsIn: start + dur - now };
        blocks.push({ k: video ? "reel" : "design", l: label, f: dur / 60, s, start, durMin: dur });
      };
      const pushLunch = () => { blocks.push({ k: "lunch", l: "Lunch", f: 1, start: LUNCH_AT, durMin: LUNCH_MIN }); cursor = LUNCH_END; lunchDone = true; };
      const pushFree = (start: number, dur: number) => blocks.push({ k: "free", l: "Free", f: dur / 60, start, durMin: dur });
      for (const t of mine) {
        let remaining = t.dur;
        if (!lunchDone && cursor >= LUNCH_AT && cursor < LUNCH_END) pushLunch();
        if (!lunchDone && cursor < LUNCH_AT) {
          const before = Math.min(remaining, LUNCH_AT - cursor);
          if (before > 0) { pushTask(t.label, t.video, cursor, before); cursor += before; remaining -= before; }
          if (remaining > 0) pushLunch();
        }
        if (remaining > 0) { pushTask(t.label, t.video, cursor, remaining); cursor += remaining; }
      }
      if (!lunchDone) {
        if (cursor < LUNCH_AT) { pushFree(cursor, LUNCH_AT - cursor); cursor = LUNCH_AT; }
        pushLunch();
      }
      if (cursor < DAY_MINS) pushFree(cursor, DAY_MINS - cursor);
    } else {
      // Week: bucket each approved task into a Mon–Fri column by its due-date weekday.
      // No-due / overdue / weekend-due fall into TODAY's column (it needs doing now).
      for (const t of mine) {
        let col = todayCol;
        if (t.due && t.due >= todayStr) { const w = (new Date(t.due).getDay() + 6) % 7; if (w <= 4) col = w; }
        weekDays[col].committed += t.dur;
        weekDays[col].tasks.push({ label: t.label, dur: t.dur, video: t.video });
      }
    }
    const badge: "free" | "some" | "full" = freeMin >= capacity / 4 ? "free" : freeMin > 0 ? "some" : "full";
    // (cast: TS can't see the closure assignment inside pushTask)
    const cur = current as { label: string; endsIn: number } | null;
    const next = cur || (mine.length ? { label: mine[0].label, endsIn: 0 } : null);
    return { ...p, committed, freeMin, badge, blocks, current: cur, next, overflow: cursor > capacity, weekDays, todayCol };
  });
  return (
    <div className="tcp">
      <div className="tcp-head">
        <button className="tc-back" onClick={onBack} title="Back to My Day">‹</button>
        <div className="tcp-title">Team capacity <span>· {span === "today" ? "due today, vs an 8h day" : "approved backlog, vs a 35h week (Mon–Fri · 7h/day, lunch excluded)"} — from each person&apos;s real tasks</span></div>
        <div className="switch tcp-span" role="tablist">
          <button role="tab" aria-selected={span === "today"} className={span === "today" ? "on" : ""} onClick={() => setSpan("today")}>Today</button>
          <button role="tab" aria-selected={span === "week"} className={span === "week" ? "on" : ""} onClick={() => setSpan("week")}>Week</button>
        </div>
      </div>
      {rows.map((p) => (
        <div key={p.key} className="card pad tcp-card">
          <div className="tcp-top">
            <span className="av" style={{ background: p.color }}>{p.av}</span>
            <div><div className="tcp-n">{p.name}</div><div className="tcp-r">{p.role}</div></div>
            <div className="tcp-status">
              <span className="st-badge working">{fmtMins(p.committed)} committed</span>
              <span className={`cap-badge ${p.badge}`}>{p.freeMin > 0 ? `${fmtMins(p.freeMin)} free` : p.overflow ? `Overbooked · ${fmtMins(-p.freeMin)} over` : "Full"}</span>
            </div>
          </div>
          {span === "today" ? (
            <>
              <div className="tl-ticks tcp-ticks">{HOUR_TICKS.map((t, i) => <span key={i}>{t}</span>)}</div>
              <div className="tcp-track">
                {p.blocks.map((b, i) => (
                  <div
                    key={i}
                    className={`tcp-blk ${b.k} ${b.s || ""}`}
                    style={b.start !== undefined
                      ? { position: "absolute", top: 0, bottom: 0, left: `${(b.start / DAY_MINS) * 100}%`, width: `${((b.durMin || 0) / DAY_MINS) * 100}%` }
                      : { flex: b.f, minWidth: 0 }}
                    title={b.l}
                  >
                    {b.l}{b.s === "done" && <div className="tcp-bm">done</div>}{b.s === "now" && <div className="tcp-bm">now</div>}
                  </div>
                ))}
                {nowMin !== null && nowMin >= 0 && nowMin <= DAY_MINS && <div className="tcp-now-line" style={{ left: `${(now / DAY_MINS) * 100}%` }}><span className="now-tag">● now</span></div>}
              </div>
            </>
          ) : (
            // WEEK: 5 Mon–Fri columns; today's column is flagged live so you see the
            // person's load right now vs across the rest of the week.
            <div className="tcp-week">
              {p.weekDays.map((day, di) => (
                <div key={di} className={`tcp-day ${di === p.todayCol ? "today" : ""} ${day.committed > WEEK_DAY_CAP ? "over" : ""}`}>
                  <div className="tcp-day-h">{WEEKDAYS[di]}{di === p.todayCol && <span className="tcp-day-now">● today</span>}</div>
                  <div className="tcp-day-bar" title={`${WEEKDAYS[di]} · ${day.committed ? fmtMins(day.committed) : "nothing"} of 7h`}>
                    {day.tasks.map((t, ti) => (
                      <div key={ti} className={`tcp-day-seg ${t.video ? "reel" : "design"}`} style={{ height: `${Math.min(100, (t.dur / WEEK_DAY_CAP) * 100)}%` }} title={`${t.label} · ${fmtMins(t.dur)}`} />
                    ))}
                  </div>
                  <div className="tcp-day-f">{day.committed ? fmtMins(day.committed) : "—"}</div>
                </div>
              ))}
            </div>
          )}
          <div className="tcp-now">
            <span className="dot" />
            {span === "week"
              ? (() => { const n = p.weekDays.reduce((s, d) => s + d.tasks.length, 0); return n ? <>This week&apos;s queue: <b>{n} approved task{n > 1 ? "s" : ""}</b> <span className="muted">· {fmtMins(p.committed)} of 35h (Mon–Fri)</span></> : <span className="muted">No approved work queued this week.</span>; })()
              : p.current
              ? <>Currently working on: <b>{p.current.label}</b> <span className="muted">· ~{fmtMins(p.current.endsIn)} left in this block</span></>
              : p.next
              ? <>Up next: <b>{p.next.label}</b></>
              : <span className="muted">Nothing due today — free to take work.</span>}
          </div>
        </div>
      ))}
      <div className="hint" style={{ padding: "0 .3rem" }}>Opened from the Team capacity button — a separate page, so it never gets mixed up with your own plan.</div>
    </div>
  );
}

// End-today wrap-up — confirm what's done; unchecked tasks roll to tomorrow.
function EndTodayModal({ tasks, onEnd, onClose }: { tasks: { id: string; title: string }[]; onEnd: (done: number, roll: number, reasons: Record<string, string>) => void; onClose: () => void }) {
  const [done, setDone] = useState<Set<string>>(new Set(tasks.slice(0, Math.ceil(tasks.length / 2)).map((t) => t.id)));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const toggle = (id: string) => setDone((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const doneN = done.size, rollN = tasks.length - doneN;
  // Spec §10: every task that rolls to tomorrow needs a reason before the day can end.
  const rolling = tasks.filter((t) => !done.has(t.id));
  const missing = rolling.some((t) => !(reasons[t.id] || "").trim());
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card aw-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">✕</button>
        <div className="aw-h">Wrap up your day</div>
        <p className="aw-p">Confirm what you finished. Anything unchecked rolls to tomorrow — say why so it&apos;s tracked.</p>
        {tasks.length === 0 && <div className="empty" style={{ padding: "1rem 0" }}>No tasks on your plate today.</div>}
        {tasks.map((t) => {
          const isDone = done.has(t.id);
          return (
            <div key={t.id}>
              <div className={`eod-row ${isDone ? "" : "roll"}`}>
                <span className={`eod-cb ${isDone ? "on" : ""}`} onClick={() => toggle(t.id)}>{isDone ? "✓" : ""}</span>
                <span className="eod-title">{t.title}</span>
                <span className={`eod-tag ${isDone ? "done" : "roll"}`}>{isDone ? "Done" : "→ Tomorrow"}</span>
              </div>
              {!isDone && (
                <input
                  className="eod-reason"
                  value={reasons[t.id] || ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [t.id]: e.target.value }))}
                  placeholder="Why isn't this done? (required to roll it over)"
                />
              )}
            </div>
          );
        })}
        <div className="eod-foot">
          <span className="m-note">{doneN} done · {rollN} roll to tomorrow</span>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn rose" disabled={missing} title={missing ? "Add a reason for each rolled-over task" : undefined} onClick={() => onEnd(doneN, rollN, reasons)}>End day &amp; log out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type CapEntry = { permissions: Permissions; isAdmin: boolean };

export function HopeMyDay({ initialPerson, isAdmin: viewerIsAdmin = false }: { initialPerson?: string; isAdmin?: boolean } = {}) {
  // `person` = whose day is shown. Seeded from the logged-in user (server-passed);
  // producers are locked to themselves, only admins can switch via the header tabs.
  const [person, setPerson] = useState(initialPerson || "manya");
  // Team-permission capabilities, keyed by first name (lowercase). Drives which
  // action buttons show. Sourced from the roster (admins) so the person switcher
  // previews everyone; falls back to /api/me for the logged-in person.
  const [capByPerson, setCapByPerson] = useState<Record<string, CapEntry>>({});
  useEffect(() => {
    let cancel = false;
    (async () => {
      const map: Record<string, CapEntry> = {};
      try {
        const me = await (await fetch("/api/me", { cache: "no-store" })).json();
        if (me?.user?.first) map[String(me.user.first).toLowerCase()] = { permissions: me.user.permissions || {}, isAdmin: !!me.user.isAdmin };
      } catch { /* ignore */ }
      try {
        const r = await fetch("/api/admin/team", { cache: "no-store" });
        if (r.ok) { const j = await r.json(); for (const u of j.team || []) if (u.first) map[String(u.first).toLowerCase()] = { permissions: u.permissions || {}, isAdmin: !!u.isAdmin }; }
      } catch { /* non-admin: roster stays unfetched, /api/me fallback covers self */ }
      if (!cancel) setCapByPerson(map);
    })();
    return () => { cancel = true; };
  }, []);
  const [sel, setSel] = useState(0);
  const [claimPool, setClaimPool] = useState<Task[]>([]);             // videos up for grabs (live)
  const [showClaimPool, setShowClaimPool] = useState(false);          // editors' claim-pool modal (legacy)
  const [claimedTasks, setClaimedTasks] = useState<Task[]>([]);        // videos I claimed this session
  const [claimConfirm, setClaimConfirm] = useState<string | null>(null); // inline "Claim? Y/N" — the pool-video id being confirmed
  const [tasks, setTasks] = useState<Task[]>([]);                     // my tasks — live from mh_posts (status is mutable)
  const [samvaya, setSamvaya] = useState<Task[]>([]);                 // Nandu's Samvaya / other-platform tasks (spec §14, kept separate)
  const [loading, setLoading] = useState(true);                       // first live load in flight
  const [taskTab, setTaskTab] = useState("approved");                  // status tab (per-person)
  // Personal reminders — REAL per-person notes, persisted in localStorage (a
  // scratchpad, not shared team data — server table only if cross-device matters).
  const [reminders, setReminders] = useState<{ text: string; done: boolean }[]>([]);
  const [dismissedNudges, setDismissedNudges] = useState<string[]>([]); // reminder ids the person dismissed (per person, localStorage)
  const [newRem, setNewRem] = useState("");
  const [chatMsgs, setChatMsgs] = useState<ServerMsg[]>([]);   // live messages (team + my DMs)
  const [chatRead, setChatRead] = useState<Record<string, string>>({}); // convoId → last-read ISO (localStorage)
  const [activeChat, setActiveChat] = useState<string | null>(null); // open thread (null = list)
  const [msg, setMsg] = useState("");
  const [clock, setClock] = useState<{ time: string; date: string; greet: { word: string; emoji: string } } | null>(null);

  const [panel, setPanel] = useState<null | "notif" | "rem">(null); // top-bar popover
  const [planModalId, setPlanModalId] = useState<string | null>(null); // Today's-plan popup
  const [plan, setPlan] = useState<PlanItem[]>([]);   // reorderable plan — seeded from REAL tasks (effect below)
  const dragKey = useRef<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const grabDX = useRef(0);                          // px between the cursor and the block's LEFT edge at grab
  const [dropAt, setDropAt] = useState<number | null>(null); // live guide: where a dragged task would start
  const [nowMin, setNowMin] = useState<number | null>(null);          // minutes since 9 AM (real time)
  const [isWeekend, setIsWeekend] = useState(false);
  const [todayStr, setTodayStr] = useState("");                       // YYYY-MM-DD for due-date sorting
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPinned, setChatPinned] = useState(false);
  const [toast, setToast] = useState<null | { who: string; color: string; av: string; body: string; convo?: string }>(null);
  // ── Undo / redo (My Day, session-scoped multi-step stack) ──────────────
  // Each entry stores the field-map to REVERSE the change (undo) and to RE-APPLY
  // it (redo). Everything goes back through the same update API. Cleared on reload.
  type HistEntry = { id: string; label: string; undo: Record<string, unknown>; redo: Record<string, unknown> };
  const [undoStack, setUndoStack] = useState<HistEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistEntry[]>([]);
  const recordHistory = (e: HistEntry) => { setUndoStack((s) => [...s.slice(-49), e]); setRedoStack([]); };
  // Bare update used by undo/redo — no history push, just persist + resync.
  const rawUpdate = (id: string, fields: Record<string, unknown>) =>
    fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, actor: person, fields }) })
      .then(async (res) => { if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Undo failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); } load(); })
      .catch((e) => { setToast({ who: "Undo failed", color: "#C03221", av: "!", body: String(e) }); load(); });
  const [showNew, setShowNew] = useState(false); // create-task modal (Manya only)
  const [notifs, setNotifs] = useState<Notif[]>([]);   // chat-panel notification stack
  const [acceptTask, setAcceptTask] = useState<Task | null>(null); // Accept & Work modal
  const [askManya, setAskManya] = useState(false);     // Ask-Manya reschedule modal
  // Assign-side capacity warning: "X's day is already full" confirm before an
  // assignment lands on someone whose 8h is committed.
  const [assignWarn, setAssignWarn] = useState<null | { name: string; committed: number; add: number; cta?: string; proceed: () => void }>(null);
  // The urgent-task pipeline state, shared across the editor and Manya views:
  // offered → (editor asks) waiting → (Manya frees room) freed → (editor accepts) done.
  const [pipeline, setPipeline] = useState<"offered" | "waiting" | "freed" | "done">("offered");
  const [movedId, setMovedId] = useState<string | null>(null); // which task Manya slid to tomorrow
  const [screen, setScreen] = useState<"myday" | "team">("myday"); // My Day vs Team-capacity page
  // Workspace tabs — My Day (personal) + the member-scoped Marketing-Hub views.
  const [wsTab, setWsTab] = useState<"myday" | "team" | "master" | "pipeline" | "calendar">("myday");
  const [dayStarted, setDayStarted] = useState(false);  // login = day started (auto, no button)
  const [dayStartAt, setDayStartAt] = useState("");
  const [dayStartMin, setDayStartMin] = useState(0);    // day-start clock-in, minutes since 9AM (anchors Today's plan, spec §10)
  const [loggedOut, setLoggedOut] = useState(false);    // End day → demo logout overlay (no real session end)
  const [profileOpen, setProfileOpen] = useState(false); // header profile chip dropdown
  const [showEod, setShowEod] = useState(false);        // End-today wrap-up modal
  const closedManually = useRef(false);
  // The claim pool surfaces PROMINENTLY on the right first; if ignored for 15s it
  // demotes into the 🔔 bell (badge only shows once demoted).
  const [poolProminent, setPoolProminent] = useState(true);

  useEffect(() => {
    // Tick every minute so the greeting clock stays live (it was set once on mount and
    // froze — showed 1:28 while the wall clock read 1:30).
    const tick = () => {
      const d = new Date();
      setClock({
        time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        date: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        greet: greetingFor(d.getHours()),
      });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // REAL chat: load + poll mh_messages for this person (team + DMs). Per-person
  // read state lives in localStorage (ponytail: per-device unread is enough here;
  // move to a server table if cross-device unread ever matters).
  const personRef = useRef(person); personRef.current = person;
  const loadChat = useCallback(async () => {
    const p = person;
    try {
      const r = await fetch(`/api/my-day/chat?person=${p}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || personRef.current !== p) return; // stale response for a previous person — drop it
      const server = (d.messages as ServerMsg[]) || [];
      // Keep optimistic (tmp-) sends the server hasn't returned yet, so a racing
      // poll can't wipe a just-sent bubble.
      setChatMsgs((prev) => {
        const pending = prev.filter((m) => m.id.startsWith("tmp-") && !server.some((s) => s.sender === m.sender && s.convo === m.convo && s.body === m.body));
        return [...server, ...pending];
      });
    } catch { /* poll again next tick */ }
  }, [person]);
  useEffect(() => {
    loadChat();
    // Skip the poll while the tab is hidden — don't hammer the network in background
    // tabs; the next tick after refocus catches up (≤15s).
    const id = setInterval(() => { if (!document.hidden) loadChat(); }, 15_000);
    return () => clearInterval(id);
  }, [loadChat]);
  useEffect(() => { // person switch: fresh chat buffer + their read-state, reminders and day-clock
    try { setChatRead(JSON.parse(localStorage.getItem(`hmd-chat-read-${person}`) || "{}")); } catch { setChatRead({}); }
    setActiveChat(null);
    setChatMsgs([]);            // never show the previous person's threads while the refetch is in flight
    lastMsgId.current = null;   // and never toast "new message" for their backlog
    setSel(0);                  // task selection is per-person
    try { setReminders(JSON.parse(localStorage.getItem(`hmd-rem-${person}`) || "[]")); } catch { setReminders([]); }
    try { setDismissedNudges(JSON.parse(localStorage.getItem(`hmd-dismissed-${person}`) || "[]")); } catch { setDismissedNudges([]); }
    // Viewing a person = they're logged in → clear any logged-out overlay + close the menu.
    setLoggedOut(false); setProfileOpen(false);
    // LOGIN = DAY START (no manual button). Restore today's clock-in if one exists,
    // otherwise auto-start it now and anchor the plan to this minute. New format is
    // JSON {at, min}; tolerate the older plain string ("9:30 AM").
    // Clock-in is PER DAY. Only restore it if the stored record is from TODAY —
    // otherwise a previous day's clock-in (e.g. "12:55 PM") anchors this morning's
    // plan to the afternoon and leaves the morning wrongly empty. A stale / dateless
    // / plain-string record is ignored, and we auto-start fresh at the current minute
    // so overdue work front-loads into the morning instead of getting stuck late.
    const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
    let restored = false;
    try {
      const j = JSON.parse(localStorage.getItem(`hmd-day-${person}`) || "null");
      if (j && j.date === todayKey) { setDayStarted(true); setDayStartAt(j.at || ""); setDayStartMin(Number(j.min) || 0); restored = true; }
    } catch { /* old/plain/corrupt record → treat as stale */ }
    if (!restored) {
      const d = new Date();
      const min = Math.max(0, Math.min(d.getHours() * 60 + d.getMinutes() - DAY_START_H * 60, DAY_MINS));
      const at = clockOf(min);
      setDayStarted(true); setDayStartAt(at); setDayStartMin(min);
      try { localStorage.setItem(`hmd-day-${person}`, JSON.stringify({ at, min, date: todayKey })); } catch { /* private mode */ }
    }
  }, [person]);
  // Persist reminders as they change (skip the initial empty render).
  const remLoaded = useRef(false);
  useEffect(() => {
    if (!remLoaded.current) { remLoaded.current = true; return; }
    try { localStorage.setItem(`hmd-rem-${person}`, JSON.stringify(reminders)); } catch { /* private mode */ }
  }, [reminders, person]);
  // Toast when a NEW incoming human message lands (not on first load, not my own).
  const lastMsgId = useRef<string | null>(null);
  useEffect(() => {
    const last = chatMsgs[chatMsgs.length - 1];
    if (!last) return;
    if (lastMsgId.current && last.id !== lastMsgId.current && last.sender !== person && last.kind === "chat") {
      const p = PPL[last.sender];
      const cid = last.convo === "team" ? "team" : last.convo.split("~").find((k) => k !== person) || "team";
      setToast({ who: `${p?.name || last.sender} · new message`, color: p?.color || "#3A57E8", av: p?.av || "?", body: last.body, convo: cid });
      if (!closedManually.current) setChatOpen(true);
    }
    lastMsgId.current = last.id;
  }, [chatMsgs, person]);

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

  // Live "now" position for the red line — real system clock, reruns each minute.
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
        setSamvaya((d.samvaya as Task[]) || []);
        // Reconcile the optimistic claim buffer against server truth: drop a claim once
        // the server confirms I own it (it now shows via `tasks`, so keeping it would
        // duplicate the row) or the row is gone — but KEEP a claim the server hasn't yet
        // reflected as mine, so a concurrent refetch can't wipe an in-flight claim.
        setClaimedTasks((prev) => prev.filter((c) => {
          // Search tasks AND the pool — a takeover the server hasn't committed yet
          // still lives in the pool; treating it as "gone" would wipe the in-flight
          // claim from both lists (audit finding).
          const server = fetched.find((t) => t.id === c.id) || ((d.pool as Task[]) || []).find((t) => t.id === c.id);
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
  // PIPELINE — tasks queued for THIS person, waiting for their accept. Data-derived
  // and persistent, so it doubles as the history the transient bell doesn't keep.
  //   Praveen: deferred design handoffs (approved, design-type, not his yet).
  //   Editors: the claim pool (approved videos, unclaimed).
  const pipelineTasks = useMemo(() => {
    if (person === "praveen") return tasks.filter((t) => t.status === "Content - Approved" && !(VIDEO_TYPES as readonly string[]).includes(t.detail.typeLine) && t.detail.owner !== me.name);
    if (isEditor) return claimPool;
    return [];
  }, [tasks, claimPool, person, isEditor, me.name]);
  const [pipeOpen, setPipeOpen] = useState(false);
  // MY DAY = only the SELECTED person's own tasks. A task's Owner (whoever it's
  // assigned to / claimed it) must match the person being viewed — so e.g. a
  // Carousel owned by Praveen never shows up under an editor. Then keep only the
  // statuses that still need work (queued/terminal states drop out of the view).
  // ROLE RULE: producers (Praveen/Nikhil/Nandu) work only APPROVED content —
  // Content-Pending / In-Progress is the writer's phase and must never appear as
  // their work even if the owner field is pre-assigned.
  // Owner OR collaborator (MY_DAY_SPEC §5): after Manya approves + hands off, she
  // becomes the collaborator, so an approved task still shows on her board too.
  const isMine = (t: Task) => t.detail.owner === me.name || (t.detail.collaborators || []).some((c) => c.name === me.name);
  const workingTasks = useMemo(
    () => [...claimedTasks, ...tasks].filter((t) =>
      isMine(t) && STATUS[t.status].inView &&
      (me.name === "Manya" || (t.status !== "Content - Pending" && t.status !== "Content - In Progress"))),
    [claimedTasks, tasks, me.name],
  );
  const myTabs = useMemo(() => tabsForPerson(me.name), [me.name]);
  const tabCounts = useMemo(() => myTabs.map((tb) => ({ ...tb, n: workingTasks.filter((t) => matchesTab(t, tb)).length })), [workingTasks, myTabs]);
  // When the viewed person changes, their tab set changes — snap to the first valid tab.
  useEffect(() => { if (!myTabs.some((tb) => tb.key === taskTab)) setTaskTab(myTabs[0].key); }, [myTabs, taskTab]);
  // Header stat tiles — live, for the person being viewed.
  const stats = useMemo(() => {
    const mine = [...claimedTasks, ...tasks].filter((t) => t.detail.owner === me.name);
    const n = (fn: (s: CCStatus) => boolean) => mine.filter((t) => fn(t.status)).length;
    return {
      // Content phase belongs to the writer (Manya). Producers don't work
      // Content-Pending and their task list hides it, so the stat must too — otherwise
      // it counts tasks they can't see (e.g. legacy thumbnails owned by a designer).
      pending: me.name === "Manya" ? n((s) => s === "Content - Pending" || s === "Content - In Progress") : 0,
      waiting: n((s) => s === "Content - Approved" || s === "Incorporating Feedback"),
      output: n((s) => s === "Output - Ready"),
      toPublish: n((s) => s === "Ready to Publish"),
      done: n((s) => s === "Published/Scheduled"),
    };
  }, [tasks, claimedTasks, me.name]);
  const curTab = myTabs.find((t) => t.key === taskTab) || myTabs[0];
  // Tasks in the current tab, sorted by due date (overdue first → today → later).
  const shownTasks = useMemo(() => {
    const PR: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
    // Priority first (so an urgent task tops the list, matching its red block on the
    // plan), then by due date (overdue → today → later).
    return workingTasks.filter((t) => matchesTab(t, curTab))
      .sort((a, b) => (PR[a.detail.priority] - PR[b.detail.priority]) || (a.due || "9999").localeCompare(b.due || "9999"));
  }, [workingTasks, taskTab]);
  const task = shownTasks[sel] || shownTasks[0] || null;
  // Claimable videos show INLINE in each editor's Content-Approved tab (spec §8) —
  // both Nandu and Nikhil see the same pool; first to claim owns it.
  const claimableHere = useMemo(
    () => (isEditor && curTab.key === "approved") ? claimPool.filter((v) => !claimedTasks.some((c) => c.id === v.id)) : [],
    [isEditor, curTab.key, claimPool, claimedTasks],
  );
  const planModalTask = planModalId ? tasks.find((t) => t.id === planModalId) || null : null;
  // Change a task's status via the card's status dropdown. Two special cases:
  //  • CONTENT-FIRST HANDOFF: when the WRITER's task hits "Content - Approved", it
  //    auto-hands off to the producer by Type — design → Praveen (owner), video →
  //    the editors' claim pool — and Manya stays on as a collaborator.
  //  • Output-ready → Output tab; queued/terminal states leave the working view.
  const withManya = (cs: Person[]) => (cs.some((c) => c.name === "Manya") ? cs : [PPL.manya, ...cs]);
  // Committed load (minutes) for ANY teammate — drives the assign-side "already
  // full" warning. Same filter as Today's plan: own, in-production, not output-ready.
  // Role rule applies here too: a producer's committed load counts ONLY approved
  // work (Content-Approved / Incorporating Feedback) — content-phase tasks are
  // Manya's, whoever the owner field names.
  const committedFor = useCallback((name: string) => [...claimedTasks, ...tasks]
    .filter((t) => t.detail.owner === name && STATUS[t.status].inView && t.status !== "Output - Ready" &&
      (name === "Manya"
        ? (t.status === "Content - Pending" || t.status === "Content - In Progress")
        : (t.status === "Content - Approved" || t.status === "Incorporating Feedback")))
    .reduce((s, t) => s + (t.detail.duration || estMins(t.detail.typeLine)), 0), [claimedTasks, tasks]);
  // Lay out ANY teammate's day from their real working tasks (role rule applied):
  // sequential 9→6 around the pinned 1–2 PM lunch. Powers the approve popup's mini
  // timeline, the working-now inference and the not-started candidate list.
  const dayFor = useCallback((name: string) => {
    const mine = [...claimedTasks, ...tasks]
      .filter((t) => t.detail.owner === name && STATUS[t.status].inView && t.status !== "Output - Ready" &&
        (name === "Manya"
          ? (t.status === "Content - Pending" || t.status === "Content - In Progress")
          : (t.status === "Content - Approved" || t.status === "Incorporating Feedback" || t.status === "Output - In Progress")))
      .map((t) => ({ id: t.id, label: t.title, due: t.due, dur: t.detail.duration || estMins(t.detail.typeLine) }));
    const now = Math.max(0, Math.min(nowMin ?? 0, DAY_MINS));
    const shiftStart = shiftStartOf(name);
    const LUNCH_END = LUNCH_AT + LUNCH_MIN;
    // Anchor the plan to NOW, never the past — time already elapsed can't hold work,
    // so pending tasks lay out from here and the morning that's gone reads as "past",
    // not bookable "free" (which made an already-afternoon day look wide open).
    const anchor = Math.max(shiftStart, now);
    type Blk = { kind: "task" | "lunch" | "free" | "past"; id?: string; label: string; start: number; dur: number };
    const blocks: Blk[] = [];
    if (anchor > shiftStart) blocks.push({ kind: "past", label: "Earlier", start: shiftStart, dur: anchor - shiftStart });
    let cursor = anchor, lunchDone = anchor >= LUNCH_END;      // lunch already over? don't re-draw it
    const pushLunch = () => { blocks.push({ kind: "lunch", label: "Lunch", start: LUNCH_AT, dur: LUNCH_MIN }); cursor = LUNCH_END; lunchDone = true; };
    // Mid-lunch right now → show only the slice still ahead, then resume after 2 PM.
    if (!lunchDone && cursor >= LUNCH_AT && cursor < LUNCH_END) { blocks.push({ kind: "lunch", label: "Lunch", start: cursor, dur: LUNCH_END - cursor }); cursor = LUNCH_END; lunchDone = true; }
    for (const t of mine) {
      let remaining = t.dur;
      if (!lunchDone && cursor >= LUNCH_AT && cursor < LUNCH_END) pushLunch();
      if (!lunchDone && cursor < LUNCH_AT) {
        const before = Math.min(remaining, LUNCH_AT - cursor);
        if (before > 0) { blocks.push({ kind: "task", id: t.id, label: t.label, start: cursor, dur: before }); cursor += before; remaining -= before; }
        if (remaining > 0) pushLunch();
      }
      if (remaining > 0) { blocks.push({ kind: "task", id: t.id, label: t.label, start: cursor, dur: remaining }); cursor += remaining; }
    }
    if (!lunchDone) { if (cursor < LUNCH_AT) { blocks.push({ kind: "free", label: "Free", start: cursor, dur: LUNCH_AT - cursor }); cursor = LUNCH_AT; } pushLunch(); }
    if (cursor < DAY_MINS) blocks.push({ kind: "free", label: "Free", start: cursor, dur: DAY_MINS - cursor });
    const committed = mine.reduce((s, t) => s + t.dur, 0);
    // Free = the open time still AHEAD today (sum of remaining Free blocks), not a
    // whole-day figure — so "Nh free" reflects what's actually left this afternoon.
    const free = blocks.reduce((s, b) => s + (b.kind === "free" ? b.dur : 0), 0);
    const currentBlk = blocks.find((b) => b.kind === "task" && b.start <= now && now < b.start + b.dur) || null;
    const current = currentBlk ? { id: currentBlk.id!, label: currentBlk.label, endsIn: currentBlk.start + currentBlk.dur - now } : null;
    const candidates = mine.filter((t) => t.id !== current?.id);
    return { tasks: mine, blocks, committed, free, current, candidates, now };
  }, [claimedTasks, tasks, nowMin]);

  // APPROVE GATE: approving DESIGN work always shows the target's day first (mini
  // timeline + working-now) — free → approve; full → move a task or queue in
  // pipeline. The producer's day is never force-filled.
  const [approveGate, setApproveGate] = useState<null | { id: string; status: CCStatus; target: string; add: number }>(null);
  // Completeness-gate block (server 422): the move was refused because required fields
  // are missing. `gate` = which transition, `missing` = the human-readable list.
  const [gateBlock, setGateBlock] = useState<null | { gate: "approve" | "output"; missing: string[]; title: string }>(null);
  const setTaskStatus = (id: string, status: CCStatus) => {
    const cur = [...tasks, ...claimedTasks].find((t) => t.id === id);
    if (cur && status === "Content - Approved" && cur.detail.owner === "Manya") {
      const handoff = autoAssign(cur.detail.typeLine);
      if (handoff && !handoff.toPool && handoff.owner !== "Manya") {
        setApproveGate({ id, status, target: handoff.owner, add: cur.detail.duration || estMins(cur.detail.typeLine) });
        return;
      }
    }
    doSetTaskStatus(id, status);
  };
  const doSetTaskStatus = (id: string, status: CCStatus, deferHandoff = false) => {
    // Capture the before-status so this move can be undone (session history).
    const prev = [...tasks, ...claimedTasks].find((t) => t.id === id);
    const prevStatus = prev?.status;
    // Persist to the real pipeline (this drives the same handoff logic the Master
    // sheet & Content Review use), then reconcile the board with server truth.
    fetch("/api/marketing-hub/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fields: { status }, actor: person, deferHandoff }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          // 422 = a completeness gate (approve / output-ready). Show the missing-fields
          // modal instead of a generic error toast, and revert the optimistic move.
          if (res.status === 422 && Array.isArray(j.missing)) {
            setGateBlock({ gate: j.gate === "output" ? "output" : "approve", missing: j.missing as string[], title: prev?.title || "This task" });
          } else {
            setToast({ who: "Save failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` });
          }
          load(); // resync — the optimistic simulation below never persisted, so revert to server truth
          return;
        }
        if (prevStatus && prevStatus !== status) {
          recordHistory({ id, label: `${prev?.title || "Task"}: ${STATUS[prevStatus].label} → ${STATUS[status].label}`, undo: { status: prevStatus }, redo: { status } });
        }
        load();
      })
      .catch((e) => { setToast({ who: "Save failed", color: "#C03221", av: "!", body: String(e) }); load(); });

    const cur = [...tasks, ...claimedTasks].find((t) => t.id === id);
    if (!cur) return;
    // Content-first handoff fires only the first time the writer's own task is approved.
    // Deferred (pipeline-hold) approvals skip it — ownership moves on Accept instead.
    const handoff = status === "Content - Approved" && cur.detail.owner === "Manya" && !deferHandoff ? autoAssign(cur.detail.typeLine) : null;
    if (deferHandoff) setToast({ who: "Queued in pipeline", color: "#D97706", av: "⏳", body: `“${cur.title}” is waiting — it joins their board only when they accept.` });

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

  // Seed/sync Today's plan from REAL tasks: the person's own in-production tasks
  // land on the timeline (duration = producer-set, else estimated by type); tasks
  // that finished or changed hands drop off automatically. Existing entries keep
  // their order, duration and pins. NEW arrivals auto-slot by priority: an urgent
  // (High) task jumps to the FRONT of the day on its own — no Auto-plan click — so
  // priority work surfaces the moment it's assigned; everything else appends.
  useEffect(() => {
    const PRANK: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
    // Same role rule as dayFor: Manya plans only her pre-approval writing; producers
    // plan only approved work. So an approved (even urgent) task leaves Manya's timeline.
    const mine = [...claimedTasks, ...tasks].filter((t) => t.detail.owner === me.name && STATUS[t.status].inView && t.status !== "Output - Ready" &&
      onTimelineFor(me.name, t.status));
    setPlan((p) => {
      const keep = p.filter((x) => mine.some((t) => t.id === x.taskId));
      const missing = mine
        .filter((t) => !keep.some((x) => x.taskId === t.id))
        .sort((a, b) => (PRANK[a.detail.priority] - PRANK[b.detail.priority]) || (a.due || "9999").localeCompare(b.due || "9999"));
      const entry = (t: Task) => ({ key: `pk${t.id}`, taskId: t.id, label: t.title, dur: t.detail.duration || estMins(t.detail.typeLine) });
      const high = missing.filter((t) => isHot(t.detail.priority)).map(entry);   // urgent → front
      const rest = missing.filter((t) => !isHot(t.detail.priority)).map(entry);   // rest → append
      // NEVER displace a task that's actively being worked (Output - In Progress) at the
      // front — the urgent arrival slots right AFTER it, so the current task finishes first.
      let at = 0;
      while (at < keep.length) {
        const t = mine.find((m) => m.id === keep[at].taskId);
        if (t && t.status === "Output - In Progress") at++; else break;
      }
      return keep.length === p.length && missing.length === 0 ? p : [...keep.slice(0, at), ...high, ...keep.slice(at), ...rest];
    });
  }, [tasks, claimedTasks, me.name]);

  // Lay the (reorderable) tasks across the day, dropping the protected 1-hour
  // lunch in around 1 PM and filling the tail with buffer.
  // Today's plan is PER-PERSON: only the current person's own, still-in-production
  // tasks land on their timeline (output-ready/published/other people's are excluded).
  const myPlan = useMemo(() => {
    const all = [...claimedTasks, ...tasks];
    return plan.flatMap((p) => {
      const t = all.find((x) => x.id === p.taskId);
      if (!t || t.detail.owner !== me.name || !STATUS[t.status].inView || t.status === "Output - Ready") return [];
      if (!onTimelineFor(me.name, t.status)) return []; // approved work is off Manya's timeline
      return [{ ...p, high: isHot(t.detail.priority) }];
    });
  }, [plan, tasks, claimedTasks, me.name]);
  // Capacity cap (spec §9, fixes Bug 3): only what fits the 8h shift lands on the
  // timeline; the rest SPILLS OVER (shown separately) instead of cramming 28h into 8h.
  const { fitPlan, spillPlan } = useMemo(() => {
    const fit: typeof myPlan = [], spill: typeof myPlan = [];
    let used = 0;
    for (const p of myPlan) {
      if (fit.length === 0 || used + p.dur <= WORK_MIN) { fit.push(p); used += p.dur; }
      else spill.push(p);
    }
    return { fitPlan: fit, spillPlan: spill };
  }, [myPlan]);
  const spillMin = spillPlan.reduce((s, p) => s + p.dur, 0);
  // Smart reminders (spec §13): Manya — content pending too long; producers — overdue.
  const nudges = useMemo(() => {
    const DAY = 86_400_000;
    const today = new Date(todayStr + "T00:00:00").getTime();
    const out: { id: string; title: string; text: string }[] = [];
    // Drive reminders off workingTasks — the SAME set the task list shows — so a
    // reminder is always a task the person can actually find and act on (a producer's
    // list hides the content phase, so its reminders must too; else you get phantom
    // "overdue" nudges for tasks that never appear in the list).
    for (const t of workingTasks) {
      if (me.name === "Manya" && (t.status === "Content - Pending" || t.status === "Content - In Progress")) {
        const age = t.detail.createdAt ? Math.floor((today - new Date(t.detail.createdAt).getTime()) / DAY) : 0;
        if (age >= 2) out.push({ id: t.id, title: t.title, text: `pending ${age} days — why still open?` });
      } else if (me.name !== "Manya" && t.due && STATUS[t.status].inView) {
        const over = Math.floor((today - new Date(t.due + "T00:00:00").getTime()) / DAY);
        if (over >= 1) out.push({ id: t.id, title: t.title, text: `overdue ${over} day${over > 1 ? "s" : ""} — needs work` });
      }
    }
    return out;
  }, [workingTasks, me.name, todayStr]);
  const planBlocks = useMemo(() => {
    type Blk = { kind: "reel" | "lunch" | "buffer"; key?: string; taskId?: string; label: string; start: number; dur: number; high?: boolean };
    const out: Blk[] = [];
    const LUNCH_END = LUNCH_AT + LUNCH_MIN;
    // Anchor (spec §10): once the day is started, the plan begins at the clock-in
    // minute (login-anchored), not a fixed shift start — log in 9:30 and tasks slide
    // to 9:30. Before starting, preview from the normal shift start.
    const anchor = dayStarted && dayStartMin > shiftStartOf(me.name) ? dayStartMin : shiftStartOf(me.name);
    let cursor = anchor;
    let lunchDone = false;
    const pushLunch = () => { out.push({ kind: "lunch", label: "Lunch", start: LUNCH_AT, dur: LUNCH_MIN }); lunchDone = true; };
    for (const p of fitPlan) {
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
        if (before > 0) { out.push({ kind: "reel", key: p.key, taskId: p.taskId, label: p.label, start: cursor, dur: before, high: p.high }); cursor += before; remaining -= before; }
        // The task runs into lunch → drop the protected lunch and continue after it (SPLIT).
        if (remaining > 0) { pushLunch(); cursor = LUNCH_END; }
      }
      // Remainder after lunch (or the whole task if it's already past 2 PM).
      if (remaining > 0) { out.push({ kind: "reel", key: p.key, taskId: p.taskId, label: p.label, start: cursor, dur: remaining, high: p.high }); cursor += remaining; }
    }
    if (!lunchDone) pushLunch(); // no task reached lunch → still park it at 1 PM
    return out;
  }, [fitPlan, nowMin, dayStarted, dayStartMin, me.name]);
  const workMin = myPlan.reduce((s, p) => s + p.dur, 0);
  // Red now-line shows only inside the working span (9 AM–7 PM, covering both shifts:
  // 9–6 and 10–7). Before 9 or after 7 PM there's simply no line — real clock, no fake.
  const showNow = nowMin !== null && !isWeekend && nowMin >= 0 && nowMin <= DAY_MINS;
  // Live timer — starts ONLY when the producer moves a task to "In Progress"
  // (Output - In Progress), which stamps start_at on the server. Elapsed = real
  // wall-clock minutes since that stamp, with the 1–2 PM lunch subtracted. Shows
  // nothing until they hit In Progress, and stops once it's marked done.
  const taskTiming = (t: Task | null): { planned: number; elapsed: number } | undefined => {
    if (!t || nowMin == null) return undefined;
    if (t.status !== "Output - In Progress" || !t.detail.startAt) return undefined;
    const s = new Date(t.detail.startAt);
    if (Number.isNaN(s.getTime())) return undefined;
    const sStr = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
    if (sStr !== todayStr) return undefined; // only live-tick a task started today
    const startMin = s.getHours() * 60 + s.getMinutes() - DAY_START_H * 60;
    let elapsed = nowMin - startMin;
    const lo = Math.max(startMin, LUNCH_AT), hi = Math.min(nowMin, LUNCH_AT + LUNCH_MIN);
    if (hi > lo) elapsed -= hi - lo; // don't count lunch as work
    const planned = t.detail.duration || estMins(t.detail.typeLine);
    return { planned, elapsed: Math.max(0, elapsed) };
  };
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
  const setDuration = (id: string, mins: number) => {
    const prevT = [...tasks, ...claimedTasks].find((t) => t.id === id);
    const prevDur = prevT?.detail.duration ?? null;
    setTasks((a) => a.map((t) => (t.id === id ? { ...t, detail: { ...t.detail, duration: mins } } : t)));
    setClaimedTasks((a) => a.map((t) => (t.id === id ? { ...t, detail: { ...t.detail, duration: mins } } : t)));
    setPlan((p) => {
      if (p.some((x) => x.taskId === id)) return p.map((x) => (x.taskId === id ? { ...x, dur: mins } : x));
      const t = [...claimedTasks, ...tasks].find((x) => x.id === id);
      return t ? [...p, { key: `pk${id}`, taskId: id, label: t.title, dur: mins }] : p;
    });
    setToast({ who: "Duration set ✓", color: "#3A57E8", av: me.av, body: `${fmtDur(mins)} — slotted into Today's plan.` });
    // Persist so it survives reload (drives the timer's planned time + plan blocks).
    fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, actor: person, fields: { duration_min: mins } }) })
      .then(async (res) => {
        if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Duration save failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); return; }
        if (prevDur !== mins) recordHistory({ id, label: `${prevT?.title || "Task"}: duration ${prevDur ? fmtDur(prevDur) : "unset"} → ${fmtDur(mins)}`, undo: { duration_min: prevDur }, redo: { duration_min: mins } });
      })
      .catch((e) => setToast({ who: "Duration save failed", color: "#C03221", av: "!", body: String(e) }));
  };
  // Current value of a supported field on a task — used by the undo conflict check.
  const fieldNow = (t: Task, field: string): unknown => {
    switch (field) {
      case "status": return t.status;
      case "duration_min": return t.detail.duration ?? null;
      case "priority": return t.detail.priority;
      case "due_date": case "publishing_date": return t.due || "";
      default: return undefined;
    }
  };
  // Apply one history entry, but only if the task hasn't been changed out from
  // under us since (tasks are shared — never clobber someone else's edit).
  const applyHistory = (e: HistEntry, dir: "undo" | "redo"): boolean => {
    const cur = [...tasks, ...claimedTasks].find((t) => t.id === e.id);
    const expect = dir === "undo" ? e.redo : e.undo; // what we last set
    const fields = dir === "undo" ? e.undo : e.redo;
    if (cur && Object.entries(expect).some(([f, v]) => { const now = fieldNow(cur, f); return now !== undefined && now !== v; })) {
      setToast({ who: "Skipped", color: "#D97706", av: "!", body: `“${cur.title || "Task"}” changed since — can't ${dir}.` });
      return false;
    }
    rawUpdate(e.id, fields);
    return true;
  };
  const undo = () => {
    if (!undoStack.length) return;
    const e = undoStack[undoStack.length - 1];
    const ok = applyHistory(e, "undo");
    setUndoStack((s) => s.slice(0, -1));
    if (ok) { setRedoStack((r) => [...r, e]); setToast({ who: "Undone ↩", color: "#3A57E8", av: me.av, body: e.label }); }
  };
  const redo = () => {
    if (!redoStack.length) return;
    const e = redoStack[redoStack.length - 1];
    const ok = applyHistory(e, "redo");
    setRedoStack((s) => s.slice(0, -1));
    if (ok) { setUndoStack((u) => [...u, e]); setToast({ who: "Redone ↪", color: "#3A57E8", av: me.av, body: e.label }); }
  };
  // ⌘Z / ⌘⇧Z (and Ctrl on Windows). Let native undo win inside text fields.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey)) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const k = ev.key.toLowerCase();
      if (k === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); }
      else if ((k === "z" && ev.shiftKey) || k === "y") { ev.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack, tasks, claimedTasks]);
  // (Auto-plan removed — priority now auto-slots on arrival; see the plan-seed effect.)
  // Capability gates now come from Team permissions (per-person toggles), not
  // hardcoded names. Admins implicitly have every capability.
  const activeCaps = capByPerson[person];
  const can = (cap: Capability) => !!activeCaps && (activeCaps.isAdmin || activeCaps.permissions[cap] === true);
  const canCreate = can("create_tasks");      // + New task
  const canSchedule = can("approve_content");  // Send to Scheduler (post)
  const canEditTasks = can("edit_tasks");      // edit priority / due date
  const canDeleteTasks = can("delete_tasks");  // remove a task
  const canAssignTasks = can("assign_tasks");  // hand to a teammate
  const isAdmin = canSchedule; // preserve existing prop name below
  // Create a task → apply the Type→owner routing, drop it where it belongs (design
  // → the owner's My tasks; video → the editors' claim pool), and toast the result.
  // Capacity-gated: a new task starts on Manya (writer) — warn if her day is full.
  const createTask = (t: Task, _owner?: string, _note?: string, assets?: NewTaskAssets) => {
    const add = estMins(t.detail.typeLine);
    const committed = committedFor("Manya");
    if (committed + add > WORK_MIN) {
      setAssignWarn({ name: "Manya", committed, add, cta: "Create anyway", proceed: () => doCreateTask(t, assets) });
      return;
    }
    doCreateTask(t, assets);
  };
  const doCreateTask = (t: Task, assets?: NewTaskAssets) => {
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
        // Now the row exists — persist any references / output the writer attached in the
        // modal (they need the real post id). Links go on the row; images become attachments.
        const postId = j.id as string | undefined;
        if (postId && assets) {
          const fields: Record<string, unknown> = {};
          if (assets.refLinks.length) fields.reference_links = assets.refLinks;
          if (assets.outLink) fields.output_link = assets.outLink;
          if (Object.keys(fields).length) {
            await fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: postId, actor: "manya", fields }) }).catch(() => {});
          }
          const upload = async (file: File, kind: "reference" | "creative") => {
            const fd = new FormData();
            fd.append("postId", postId); fd.append("uploadedBy", "manya"); fd.append("kind", kind); fd.append("file", file);
            await fetch("/api/marketing-hub/attach", { method: "POST", body: fd }).catch(() => {});
          };
          for (const f of assets.refFiles) await upload(f, "reference");
          for (const f of assets.outFiles) await upload(f, "creative");
        }
        const extras = assets ? [assets.refFiles.length + assets.refLinks.length ? "references" : "", assets.outFiles.length + (assets.outLink ? 1 : 0) ? "output" : ""].filter(Boolean).join(" + ") : "";
        setToast({ who: "Created ✓", color: "#3A57E8", av: "M", body: `“${t.title}” added — starts with Manya (Content - Pending)${extras ? ` · ${extras} attached` : ""}.` });
        load();
      })
      .catch((e) => setToast({ who: "Create failed", color: "#C03221", av: "!", body: String(e) }));
  };

  // ── Capacity pipeline (Accept & Work) ──
  // `workMin` (minutes booked on Today's plan) is the person's committed load.
  const addNotif = (n: Notif) => setNotifs((ns) => [n, ...ns.filter((x) => x.id !== n.id)]);
  const dismissNotif = (id: string) => setNotifs((ns) => ns.filter((n) => n.id !== id));
  const onAcceptNotif = (n: Notif) => {
    if (n.task) { setAcceptTask(n.task); return; }
    // Pipelined handoff (server notification with postId): accepting IS the
    // ownership takeover — that's the only way a queued task joins your board.
    if (n.postId) {
      dismissNotif(n.id);
      fetch("/api/marketing-hub/takeover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: n.postId, newOwnerKey: person }) })
        .then(async (res) => {
          if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Accept failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); }
          else setToast({ who: "Accepted ✓", color: "#3A57E8", av: me.av, body: "It's yours now — added to My tasks + Today's plan." });
          load();
        })
        .catch((e) => { setToast({ who: "Accept failed", color: "#C03221", av: "!", body: String(e) }); load(); });
    }
  };
  // Accepting a pipelined/offered task is the REAL ownership takeover — this is the
  // moment a queued handoff actually joins your board (never before).
  const acceptWork = () => {
    const t = acceptTask; if (!t) return;
    setAcceptTask(null);
    setPipeline("done");
    fetch("/api/marketing-hub/takeover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: t.id, newOwnerKey: person }),
    })
      .then(async (res) => {
        if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Accept failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); }
        else setToast({ who: "Accepted ✓", color: "#3A57E8", av: me.av, body: `“${t.title}” is yours now — added to your plan.` });
        load(); // server truth → it appears in My tasks + Today's plan via the sync
      })
      .catch((e) => { setToast({ who: "Accept failed", color: "#C03221", av: "!", body: String(e) }); load(); });
  };
  // "Swap" → the producer does NOT pick. Their whole NOT-STARTED list is sent to
  // Manya automatically ("swap any of these for the incoming task") — SHE picks
  // which one moves, from her Requests. The currently-running block is excluded.
  const askManyaToMove = () => {
    const t = acceptTask; setAcceptTask(null);
    if (!t) return;
    const nowBlk = planBlocks.find((b) => b.kind === "reel" && nowMin != null && b.start <= nowMin && nowMin < b.start + b.dur);
    const all = [...claimedTasks, ...tasks];
    const candidates = myPlan
      .filter((p) => p.taskId !== nowBlk?.taskId)
      .map((p) => ({ id: p.taskId, title: p.label, dur: p.dur, due: all.find((x) => x.id === p.taskId)?.due || "" }));
    if (!candidates.length) { setToast({ who: "Nothing to offer", color: "#D97706", av: "!", body: "Everything left today is already in progress — nothing can be swapped." }); return; }
    fetch("/api/my-day/swap-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pendingId: t.id, from: person, candidates }) })
      .then(async (res) => {
        if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Send failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); }
        else setToast({ who: "Sent to Manya ✓", color: "#3A57E8", av: me.av, body: `Your ${candidates.length} not-started task${candidates.length > 1 ? "s" : ""} were offered — she'll pick which one moves.` });
      })
      .catch((e) => setToast({ who: "Send failed", color: "#C03221", av: "!", body: String(e) }));
  };
  // Day clock — login = start (auto, above), End day = wrap-up then log out.
  // Team-capacity page is Manya-only — snap back to My Day if the view switches away.
  useEffect(() => { if (person !== "manya") setScreen("myday"); }, [person]);
  // "Log back in" from the logged-out overlay: re-anchors the plan to the new login
  // time (demo — no real session change). Mirrors the auto-start on first view.
  const logBackIn = () => {
    const d = new Date();
    const min = Math.max(0, Math.min(d.getHours() * 60 + d.getMinutes() - DAY_START_H * 60, DAY_MINS));
    const at = clockOf(min);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setDayStarted(true); setDayStartAt(at); setDayStartMin(min); setLoggedOut(false);
    try { localStorage.setItem(`hmd-day-${person}`, JSON.stringify({ at, min, date })); } catch { /* private mode */ }
  };
  const endToday = (doneCount: number, rollCount: number) => {
    // End day = wrap-up (already confirmed) → demo logout. Clear the clock so the next
    // login re-anchors; show the logged-out overlay instead of ending the real session.
    setDayStarted(false); setShowEod(false); setDayStartMin(0); setProfileOpen(false);
    try { localStorage.removeItem(`hmd-day-${person}`); } catch { /* private mode */ }
    setToast({ who: "Day wrapped ✓", color: "#1AA053", av: me.av, body: `${doneCount} done · ${rollCount} rolled to tomorrow — logging out.` });
    setLoggedOut(true);
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
    // Skip the data pull while the tab is hidden (background tabs shouldn't poll);
    // the next tick after refocus refreshes (≤20s).
    const id = setInterval(() => { if (!document.hidden) pull(); }, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, [person]);
  // My-tasks row → expands inline in the "Up next" panel (setSel).
  // Today's-plan block → opens the task in a popup (like the original dashboard).
  // Claim a video → you become the owner; it leaves the pool and lands in My tasks.
  // Claiming is self-assignment — same capacity gate: warn if MY 8h is already full.
  const claimVideo = (v: Task) => {
    const add = v.detail.duration || estMins(v.detail.typeLine);
    const committed = committedFor(me.name);
    if (committed + add > WORK_MIN) {
      setAssignWarn({ name: me.name, committed, add, cta: "Claim anyway", proceed: () => doClaimVideo(v) });
      return;
    }
    doClaimVideo(v);
  };
  const doClaimVideo = (v: Task) => {
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
  // Inline claim confirm (spec §8). Nikhil picks how he'll work it (present / edit /
  // both); Nandu just confirms. The role is best-effort persisted to custom.claim_role.
  const confirmClaim = (v: Task, role?: "present" | "edit" | "both") => {
    setClaimConfirm(null);
    if (role) {
      fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, actor: person, fields: { custom: { claim_role: role } } }) }).catch(() => {});
    }
    claimVideo(v);
  };
  const remOpen = reminders.filter((r) => !r.done).length;
  const remDone = reminders.length - remOpen;

  // Conversations derived from the live messages, relative to the viewed person.
  const convos = useMemo<Record<string, Convo>>(() => {
    const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    // online is intentionally NOT set — we have no real presence source, and faking
    // "● online" misleads (frontend-audit finding).
    const out: Record<string, Convo> = {
      team: { id: "team", name: "Team chat", group: true, unread: 0, msgs: [] },
    };
    for (const k of CHAT_IDS) {
      if (k === person) continue;
      out[k] = { id: k, name: PPL[k].name, av: PPL[k].av, color: PPL[k].color, unread: 0, msgs: [] };
    }
    for (const m of chatMsgs) {
      const cid = m.convo === "team" ? "team" : m.convo.split("~").find((k) => k !== person);
      if (!cid || !out[cid]) continue;
      const p = PPL[m.sender];
      const mine = m.sender === person;
      out[cid].msgs.push({ who: mine ? "You" : (p?.name || m.sender), av: p?.av || "?", color: p?.color || "#8A92A6", tm: fmt(m.at), body: m.body, me: mine, sys: m.kind === "system" });
      if (!mine && m.at > (chatRead[cid] || "")) out[cid].unread++;
    }
    if (activeChat && out[activeChat]) out[activeChat].unread = 0; // open thread = read
    return out;
  }, [chatMsgs, person, chatRead, activeChat]);

  const totalUnread = Object.values(convos).reduce((s, c) => s + c.unread, 0);
  const openChat = () => { setChatOpen(true); closedManually.current = false; };
  const closeChat = () => { if (chatPinned) return; setChatOpen(false); closedManually.current = true; };
  const markRead = (cid: string) => setChatRead((r) => {
    const nr = { ...r, [cid]: new Date().toISOString() };
    try { localStorage.setItem(`hmd-chat-read-${person}`, JSON.stringify(nr)); } catch { /* private mode */ }
    return nr;
  });
  const openConvo = (id: string) => { setActiveChat(id); markRead(id); };
  const addReminder = () => { const t = newRem.trim(); if (!t) return; setReminders((r) => [{ text: t, done: false }, ...r]); setNewRem(""); };
  // Dismiss a smart reminder from the strip: hide it here, but keep it in the 📋
  // reminders popover (as a record) so it isn't lost — persisted per person.
  const dismissNudge = (n: { id: string; title: string; text: string }) => {
    setDismissedNudges((d) => { const nx = d.includes(n.id) ? d : [...d, n.id]; try { localStorage.setItem(`hmd-dismissed-${person}`, JSON.stringify(nx)); } catch { /* private mode */ } return nx; });
    const text = `${n.title} — ${n.text}`;
    setReminders((r) => r.some((x) => x.text === text) ? r : [{ text, done: false }, ...r]);
  };
  const visibleNudges = nudges.filter((n) => !dismissedNudges.includes(n.id));
  const send = () => {
    const t = msg.trim(); if (!t || !activeChat) return;
    const convo = activeChat === "team" ? "team" : dmConvo(person, activeChat);
    // Optimistic append; the follow-up loadChat() swaps in server truth.
    setChatMsgs((ms) => [...ms, { id: `tmp-${Date.now()}`, convo, sender: person, body: t, kind: "chat", at: new Date().toISOString() }]);
    setMsg("");
    fetch("/api/my-day/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ convo, sender: person, body: t }) })
      .then(async (res) => {
        if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Message failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); }
      })
      .catch((e) => setToast({ who: "Message failed", color: "#C03221", av: "!", body: String(e) }))
      .finally(() => loadChat());
  };

  return (
    <div className="hmd">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* click-away layer for the top popovers */}
      {panel && <div className="backdrop" onClick={() => setPanel(null)} />}

      {/* Logged-out screen (demo): End day / Log out lands here. "Log back in"
          re-anchors the plan to the new login time. No real session change. */}
      {loggedOut && (
        <div className="logout-screen">
          <div className="logout-card">
            <span className="logout-badge">{me.av}</span>
            <div className="logout-h">You&apos;re logged out</div>
            <div className="logout-p">{me.name}&apos;s day is wrapped up. Log in again to start a fresh day.</div>
            <button className="btn primary" onClick={logBackIn}>Log back in</button>
            <div className="logout-note">Demo — the session stays active; real sign-out comes later.</div>
          </div>
        </div>
      )}

      {/* (Videos-up-for-grabs now surfaces through the chat-panel notification stack.) */}

      <div className="shell">
      {/* ── Shared V2 Hope sidebar — same grouped nav as every other V2 page,
             so every link stays inside /dashboard/hope-preview (no V1 leaks). ── */}
      <HopeSidebar active="my-day" />

      <div className={`main ${chatOpen ? "chatpad" : ""}`}>

        {/* Workspace tabs — My Day (personal) + the member-scoped Marketing-Hub views. */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {(([["myday", "My Day"], ["team", "Workload"], ["master", "Master sheet"], ["pipeline", "Pipeline"], ["calendar", "Content calendar"]]) as [typeof wsTab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setWsTab(k)}
              className={`rounded-xl border px-3.5 py-2 text-[13px] font-medium transition ${wsTab === k ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {wsTab === "myday" ? (<>

        {/* TOP BAR — icon triggers (page title lives in the greeting below) */}
        <div className="topbar">
          <div className="topspacer" />
          <div className="icons">
            {/* Undo / redo are keyboard-only now (Ctrl+Z / Ctrl+Shift+Z, ⌘Z / ⌘⇧Z) —
                the arrow buttons were removed per user request; the shortcuts still work. */}
            {/* Day control — then a divider, so End day sits apart from the
                notification icons + profile and isn't clicked by accident. End day only
                OPENS the wrap-up (a confirm step) — it never logs out on a single tap. */}
            <span className="daybar"><span className="daychip"><span className="pulse" />Started {dayStartAt}</span><button className="btn sm endbtn" onClick={() => setShowEod(true)}>{IPOWER} End day</button></span>
            <span className="topdivider" aria-hidden="true" />
            <button className={`iconbtn ${panel === "notif" ? "on" : ""}`} title="Videos up for grabs" onClick={() => setPanel(panel === "notif" ? null : "notif")}>
              {BELL}{showPool && !poolProminent && <span className="badge">{claimPool.length}</span>}
            </button>
            <button className={`iconbtn ${chatOpen ? "on" : ""}`} title="Team chat" onClick={() => (chatOpen ? closeChat() : openChat())}>
              {CHATIC}{!chatOpen && totalUnread > 0 && <span className="badge rose">{totalUnread}</span>}
            </button>
            <button className={`iconbtn ${panel === "rem" ? "on" : ""}`} title="Reminders" onClick={() => setPanel(panel === "rem" ? null : "rem")}>
              {CLIP}{remOpen > 0 && <span className="badge">{remOpen}</span>}
            </button>

            {/* Profile chip + Log out — the always-visible way to sign out (My Day has
                its own header, so it lacks the shared shell's profile menu). Log out
                runs the same End-day wrap-up → logout flow. */}
            <div className="profwrap">
              <button className={`profchip ${profileOpen ? "on" : ""}`} onClick={() => setProfileOpen((v) => !v)} title="Account">
                <Avatar p={me} cls="av av-xs" />
                <span className="profname">{me.name}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {profileOpen && (
                <>
                  <div className="backdrop" onClick={() => setProfileOpen(false)} />
                  <div className="profmenu">
                    <div className="profhead"><Avatar p={me} cls="av av-sm" /><div><div className="profhead-n">{me.name}</div><div className="profhead-r">{me.role}</div></div></div>
                    <button className="profitem" onClick={() => { setProfileOpen(false); setShowEod(true); }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>

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
          <TeamCapacityPage onBack={() => setScreen("myday")} tasks={tasks} nowMin={nowMin} />
        ) : (
        <>
        {/* 1 · HEADER BAND */}
        <div className="card pad headband">
          <div className="who">
            <div className="hi">{clock ? `${clock.greet.word}, ${me.name}` : `Hello, ${me.name}`}</div>
            <div className="sub">{me.role} · {clock ? `${clock.date} · ${clock.time}` : "—"} · Bengaluru 23° · <span style={{ color: "#1AA053" }}>● live</span></div>
          </div>
          {/* Profile switcher — admins only (Maheen / owner) to view any teammate's
              day. Producers are locked to their own logged-in identity, so it's hidden. */}
          {viewerIsAdmin && (
            <div className="switch" role="tablist" aria-label="Teammate">
              {TEAM.map((t) => <button key={t.key} className={t.key === person ? "on" : ""} onClick={() => setPerson(t.key)}>{t.name}</button>)}
            </div>
          )}
          <div className="stats-wrap">
            {/* Day control + Pipeline live HERE, aligned with the stats (user order
                2026-07-19) — the bell/reminders/chat icons stay up top. */}
            <div className="dayctl">
              {/* Role button lives here now (the day control moved up to the top bar):
                  Manya → Team capacity; editors → Claim pool. */}
              {person === "manya" && (
                <button className="teamcapbtn" onClick={() => setScreen("team")}>
                  <IconUsers size={15} stroke={1.8} /> Team capacity
                </button>
              )}
              {isEditor && (
                <button className={`teamcapbtn ${showClaimPool ? "on" : ""}`} onClick={() => setShowClaimPool(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M16.5 10l5-2.5v9L16.5 14" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
                  Claim pool{claimPool.length > 0 && <span className="teamcap-n">{claimPool.length}</span>}
                </button>
              )}
              {person === "manya" ? (
                /* Manya CREATES the work — no pipeline for her. She gets REQUESTS:
                   any change a producer makes (dates moved, etc.) pops up here. */
                <button className={`teamcapbtn ${pipeOpen ? "on" : ""}`} onClick={() => setPipeOpen(true)} title="Changes the team asked for — date moves, task changes">
                  {BELL} Requests{notifs.length > 0 && <span className="teamcap-n">{notifs.length}</span>}
                </button>
              ) : (
                <button className={`teamcapbtn ${pipeOpen ? "on" : ""}`} onClick={() => setPipeOpen(true)} title="Tasks queued for you — accept when you have room">
                  {IHOURGLASS} Pipeline{pipelineTasks.length > 0 && <span className="teamcap-n">{pipelineTasks.length}</span>}
                </button>
              )}
            </div>
            <div className="stats">
              <div className="stat"><div className="n w">{stats.pending}</div><div className="k">Pending</div></div>
              <div className="stat"><div className="n">{stats.waiting}</div><div className="k">Waiting on me</div></div>
              <div className="stat"><div className="n b">{stats.output}</div><div className="k">Output ready</div></div>
              <div className="stat"><div className="n">{stats.toPublish}</div><div className="k">To publish</div></div>
              <div className="stat"><div className="n g">{stats.done}</div><div className="k">Done · 7d</div></div>
            </div>
          </div>
        </div>

        {/* MANYA — reschedule request when an editor is packed (team capacity moved to its own page) */}
        {person === "manya" && pipeline === "waiting" && (
          <ManyaReschedule task={URGENT_TASK} editorName="Nandu" movedId={movedId} onMove={setMovedId} onConfirm={manyaConfirmMove} />
        )}

        {/* Smart reminders (spec §13) — stale-content / overdue nudges for this person.
            Dismissing one hides it here but keeps it in the 📋 reminders popover. */}
        {visibleNudges.length > 0 && (
          <div className="card pad" style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "#8A92A6", marginBottom: 6 }}>{BELL} {visibleNudges.length} reminder{visibleNudges.length > 1 ? "s" : ""}</div>
            {visibleNudges.map((n) => (
              <div key={n.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "3px 0" }}>
                <div style={{ fontSize: 13, color: "#232D42" }}><b>{n.title}</b> — <span style={{ color: "#B0203A" }}>{n.text}</span></div>
                <button className="btn sm" style={{ flexShrink: 0 }} onClick={() => dismissNudge(n)}>Dismiss</button>
              </div>
            ))}
          </div>
        )}

        {/* 2 · HERO — today's plan */}
        <div className="card pad hero">
          <div className="hero-head">
            <div style={{ display: "flex", alignItems: "baseline", gap: ".7rem", flexWrap: "wrap" }}>
              <h2>Today’s plan</h2>
              <span className="prog"><b style={{ color: "#232D42" }}>{fmtDur(Math.min(workMin, WORK_MIN))}</b> of 8h work · 1h lunch · {fmtDur(Math.max(0, WORK_MIN - workMin))} free
                {spillMin > 0 && <span style={{ marginLeft: 8, color: "#C0201F", fontWeight: 600 }}>· {IWARN} {spillPlan.length} won&apos;t fit ({fmtDur(spillMin)} over) → spills to tomorrow</span>}
              </span>
              <span className="qmark" title="8-hour workday (9 AM–6 PM) with a protected 1-hour lunch. Drag a task along the timeline to start it later; use ‹ › to reorder. Urgent tasks slot in automatically by priority.">?</span>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <div className="legend"><span><i className="dot" style={{ background: "#3A57E8" }} />Reel</span><span><i className="dot" style={{ background: "#E11D48" }} />High priority</span><span><i className="dot" style={{ background: "#D9DEEA" }} />Break</span></div>
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
                  className={`tl-blk ${b.kind} ${b.high ? "high" : ""} ${b.kind === "reel" ? "clickable" : ""}`}
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
                  <div className="tl-m">{b.kind === "reel" ? `${b.high ? "High priority · " : ""}Reel · ${fmtDur(b.dur)}` : b.kind === "lunch" ? "1h · protected" : `Buffer · ${fmtDur(b.dur)}`}</div>
                </div>
              ))}
              {showNow && <div className="now-line" style={{ left: `${(nowMin! / DAY_MINS) * 100}%` }}><span className="now-dot" /><span className="now-tag">● now</span></div>}
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
              {shownTasks.length === 0 && claimableHere.length === 0 && <div className="empty" style={{ padding: "1.6rem 0" }}>Nothing in “{curTab.label}” right now ✓</div>}
              {shownTasks.map((t, i) => {
                const claimed = claimedTasks.some((c) => c.id === t.id);
                const st = STATUS[t.status];
                const di = dueInfo(t.due, todayStr);
                return (
                  <div key={t.id} className={`task ${task && t.id === task.id ? "sel" : ""} ${claimed ? "just-claimed" : ""} ${di.overdue ? "overdue" : ""} ${isHot(t.detail.priority) ? "high" : ""}`} onClick={() => setSel(i)}>
                    <div className="task-top">
                      <div className="tt">{t.title}</div>
                      <DueChip due={t.due} today={todayStr} />
                    </div>
                    <div className="mm">{t.meta}</div>
                    <div style={{ display: "flex", gap: ".35rem", alignItems: "center" }}>
                      {isHot(t.detail.priority) && <span className="pill" style={{ background: PRIO[t.detail.priority].bg, color: PRIO[t.detail.priority].fg, display: "inline-flex", alignItems: "center", gap: 3 }}><IconBolt size={12} stroke={1.9} /> {t.detail.priority}</span>}
                      <span className="pill" style={{ background: TONE[st.tone].bg, color: TONE[st.tone].fg }}>{st.label}</span>
                      {claimed && <span className="pill" style={{ background: "#E9ECFB", color: "#2138B0" }}>Claimed by you</span>}
                    </div>
                  </div>
                );
              })}
              {/* Claimable videos (spec §8) — inline in BOTH editors' Content-Approved
                  tab; first to claim owns it. Nikhil also picks how he'll work it. */}
              {claimableHere.map((v) => {
                const confirming = claimConfirm === v.id;
                return (
                  <div key={v.id} className="task" style={{ borderStyle: "dashed", borderColor: "#B9C0D0", display: "flex", justifyContent: "space-between", gap: ".8rem" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="tt">{v.title}</div>
                      <div className="mm">{v.detail.typeLine} · up for grabs — Nandu or Nikhil</div>
                      {!confirming ? (
                        <span className="pill" style={{ background: "#E3F5EA", color: "#157F3C", display: "inline-block", marginTop: ".45rem" }}>Claimable</span>
                      ) : person === "nikhil" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", marginTop: ".45rem" }}>
                          <span className="lbl">How will you work it?</span>
                          <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
                            <button className="btn primary sm" onClick={() => confirmClaim(v, "present")}>Present on camera</button>
                            <button className="btn primary sm" onClick={() => confirmClaim(v, "edit")}>Edit video</button>
                            <button className="btn primary sm" onClick={() => confirmClaim(v, "both")}>Both</button>
                            <button className="btn sm" onClick={() => setClaimConfirm(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: ".35rem", alignItems: "center", marginTop: ".45rem" }}>
                          <span className="lbl">Claim this?</span>
                          <button className="btn primary sm" onClick={() => confirmClaim(v)}>Yes, it&apos;s mine</button>
                          <button className="btn sm" onClick={() => setClaimConfirm(null)}>No</button>
                        </div>
                      )}
                    </div>
                    {/* Due + Claim stacked on the RIGHT so the action is clear (user request). */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: ".55rem", flexShrink: 0 }}>
                      <DueChip due={v.due} today={todayStr} />
                      {!confirming && <button className="btn primary sm" onClick={() => setClaimConfirm(v.id)}>Claim</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card pad detail">
            {task ? (
              <TaskBody task={task} label="Task · opened" onStatusChange={(s) => setTaskStatus(task.id, s)} onSetDuration={(m) => setDuration(task.id, m)} canSchedule={isAdmin} uploadedBy={person} onSaved={load} timing={taskTiming(task)} canEdit={canEditTasks} canDelete={canDeleteTasks} canAssign={canAssignTasks} onDeleted={() => { setSel(0); load(); }} />
            ) : (
              <div className="empty" style={{ padding: "3.5rem 0" }}>You’re all caught up ✓ — nothing needs work right now.</div>
            )}
          </div>
        </div>

        {/* Nandu's Samvaya / other-platform tasks (spec §14) — a separate, clearly
            labelled section, only on Nandu's board, never mixed with GooCampus. */}
        {person === "nandu" && samvaya.length > 0 && (
          <div className="card pad" style={{ marginTop: "1rem" }}>
            <div className="colhead"><h3>Samvaya · other platforms</h3><span className="lbl">separate from GooCampus — only you see this</span></div>
            <div className="tasklist">
              {samvaya.map((t) => {
                const st = STATUS[t.status];
                return (
                  <div key={t.id} className="task">
                    <div className="task-top"><div className="tt">{t.title}</div><DueChip due={t.due} today={todayStr} /></div>
                    <div className="mm">{t.meta}</div>
                    <span className="pill" style={{ background: TONE[st.tone].bg, color: TONE[st.tone].fg }}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </>
        )}
        </>) : (
          <MemberHub person={person} tab={wsTab} />
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
                    <button className="chat-back" onClick={() => { if (activeChat) markRead(activeChat); setActiveChat(null); }} title="All chats">‹</button>
                    <span className="av av-sm" style={{ background: active.group ? "var(--brand)" : active.color }}>{active.group ? IUSERS : active.av}</span>
                    {active.name}
                    {active.online && <span className="online">● online</span>}
                  </h3>
                ) : (
                  <h3>Chats</h3> /* no fake "N online" — no real presence source */
                )}
                <div className="chat-head-acts">
                  <button className={`pinbtn ${chatPinned ? "on" : ""}`} onClick={() => setChatPinned((p) => !p)} title={chatPinned ? "Unpin" : "Pin open"}>{chatPinned ? <><IconPin size={13} stroke={1.8} /> Pinned</> : "Pin"}</button>
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
                        <span className="av" style={{ background: c.group ? "var(--brand)" : c.color }}>{c.group ? IUSERS : c.av}</span>
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
                    {active.msgs.length === 0 && <div className="empty">No messages yet — say hi</div>}
                    {active.msgs.map((m, i) => m.sys ? (
                      /* server-posted pipeline event (handoff / claim / publish) */
                      <div key={i} className="chat-sys"><span>{m.body}</span><span className="chat-sys-tm">{m.tm}</span></div>
                    ) : (
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
            <TaskBody task={planModalTask} label="Today's plan · task" onStatusChange={(s) => setTaskStatus(planModalTask.id, s)} onSetDuration={(m) => setDuration(planModalTask.id, m)} canSchedule={isAdmin} uploadedBy={person} onSaved={load} timing={taskTiming(planModalTask)} canEdit={canEditTasks} canDelete={canDeleteTasks} canAssign={canAssignTasks} onDeleted={() => { setPlanModalId(null); load(); }} />
            <div className="modal-foot">
              <span className="modal-foot-note">Didn’t finish? Roll it to next week. Done? Mark it complete.</span>
              <div className="modal-foot-acts">
                <button
                  className="btn"
                  onClick={() => {
                    // Roll to next week: push the due date +7d (persists) — the task
                    // drops off today's plan when it leaves the working window.
                    const cur = planModalTask;
                    setPlanModalId(null);
                    if (!cur) return;
                    const base = cur.due ? new Date(cur.due) : new Date();
                    base.setDate(base.getDate() + 7);
                    const next = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
                    setPlan((p) => p.filter((x) => x.taskId !== cur.id)); // off today's timeline immediately
                    fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cur.id, actor: person, fields: { due_date: next } }) })
                      .then(async (res) => {
                        if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Move failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); }
                        else setToast({ who: "Moved ✓", color: "#3A57E8", av: me.av, body: `“${cur.title}” rolled a week — now due ${next}.` });
                        load();
                      })
                      .catch((e) => { setToast({ who: "Move failed", color: "#C03221", av: "!", body: String(e) }); load(); });
                  }}
                >
                  Move to next week
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    // Complete = the producer's output is done → Output - Ready
                    // (real status write; the task leaves the plan automatically).
                    const cur = planModalTask;
                    setPlanModalId(null);
                    if (cur) setTaskStatus(cur.id, "Output - Ready");
                  }}
                >
                  Mark complete
                </button>
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

      {/* MANYA'S REQUESTS — changes the producers asked for (date moves etc.) */}
      {pipeOpen && person === "manya" && (
        <div className="modal" onClick={() => setPipeOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPipeOpen(false)} title="Close">✕</button>
            <div className="lbl" style={{ marginBottom: ".4rem" }}>Requests · from the team</div>
            <div className="d-title" style={{ marginBottom: "1rem" }}>Changes asked of you</div>
            {notifs.length ? (
              <div className="claim-list">
                {notifs.map((n) => (
                  <div key={n.id} className="claim-card" style={n.swap ? { flexDirection: "column", alignItems: "stretch" } : undefined}>
                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".6rem" }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="claim-title">{n.emoji} {n.title}</div>
                        <div className="claim-meta">{n.sub}</div>
                      </div>
                      <button className="btn sm" onClick={() => dismissNotif(n.id)}>Dismiss</button>
                    </div>
                    {/* SWAP REQUEST: the producer's not-started list — MANYA picks the one
                        to move; picking rolls it a day AND hands the pending task over. */}
                    {n.swap && n.postId && (
                      <div style={{ marginTop: ".6rem", display: "flex", flexDirection: "column", gap: ".4rem" }}>
                        {n.swap.candidates.map((c) => {
                          // Default = day after its due date, but NEVER in the past — overdue
                          // tasks (due < today) default to tomorrow. Manya can pick any date.
                          const tmr = new Date(); tmr.setHours(0, 0, 0, 0); tmr.setDate(tmr.getDate() + 1);
                          let roll = tmr;
                          if (c.due) { const r = new Date(c.due + "T00:00:00"); r.setDate(r.getDate() + 1); if (r > tmr) roll = r; }
                          const nextDefault = `${roll.getFullYear()}-${String(roll.getMonth() + 1).padStart(2, "0")}-${String(roll.getDate()).padStart(2, "0")}`;
                          return (
                            <SwapCandidateRow key={c.id} c={c} defaultDate={nextDefault} onMove={(date) => {
                              const label = (() => { try { return new Date(date + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" }); } catch { return date; } })();
                              dismissNotif(n.id);
                              fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, actor: person, fields: { due_date: date } }) })
                                .then(() => fetch("/api/marketing-hub/takeover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: n.postId, newOwnerKey: n.swap!.from }) }))
                                .then(async (res) => {
                                  if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Swap failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); }
                                  else setToast({ who: "Swapped ✓", color: "#1AA053", av: me.av, body: `“${c.title}” moved to ${label} — the queued task is now on ${PPL[n.swap!.from]?.name || n.swap!.from}'s plan.` });
                                  load();
                                })
                                .catch((e) => { setToast({ who: "Swap failed", color: "#C03221", av: "!", body: String(e) }); load(); });
                            }} />
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <div className="empty" style={{ padding: "2.4rem 0" }}>No requests right now ✓</div>}
            <div className="nt-assign" style={{ marginTop: "1rem" }}><span className="status-dot" style={{ background: "#3A57E8" }} /><span>When a producer moves a date or changes a task (e.g. to make room for a queued handoff), it lands here so you always know what shifted.</span></div>
          </div>
        </div>
      )}

      {/* PIPELINE — tasks queued for me, waiting for MY accept (persistent history) */}
      {pipeOpen && person !== "manya" && (
        <div className="modal" onClick={() => setPipeOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPipeOpen(false)} title="Close">✕</button>
            <div className="lbl" style={{ marginBottom: ".4rem" }}>Pipeline · queued for you</div>
            <div className="d-title" style={{ marginBottom: "1rem" }}>Waiting for your accept</div>
            {pipelineTasks.length ? (
              <div className="claim-list">
                {pipelineTasks.map((v) => (
                  <div key={v.id} className="claim-card">
                    <div style={{ minWidth: 0 }}>
                      <div className="claim-title">{v.title}</div>
                      <div className="claim-meta">{v.detail.typeLine} · {v.detail.brand} · ~{fmtMins(v.detail.duration || estMins(v.detail.typeLine))}{v.due ? ` · due ${v.due}` : ""}</div>
                    </div>
                    <button className="btn primary sm" onClick={() => { setPipeOpen(false); setAcceptTask(v); }}>Open</button>
                  </div>
                ))}
              </div>
            ) : <div className="empty" style={{ padding: "2.4rem 0" }}>Nothing queued for you ✓</div>}
            <div className="nt-assign" style={{ marginTop: "1rem" }}><span className="status-dot" style={{ background: "#D97706" }} /><span>Tasks land here when your 8h day is already full. They join your board <b>only when you accept</b> — fits your day → Accept &amp; work; packed → move a not-started task first.</span></div>
          </div>
        </div>
      )}

      {/* APPROVE GATE — the target's day, live, BEFORE Manya approves design work */}
      {approveGate && (() => {
        const g = approveGate;
        const tName = PPL[g.target]?.name || g.target;
        const day = dayFor(tName);
        const fits = g.add <= day.free;   // does it fit in the time still left today?
        const pending = [...tasks, ...claimedTasks].find((t) => t.id === g.id);
        const moveCand = (cid: string, due: string | undefined, next: string) => {
          fetch("/api/marketing-hub/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cid, actor: person, fields: { due_date: next } }) })
            .then(async (res) => {
              if (!res.ok) { const j = await res.json().catch(() => ({})); setToast({ who: "Move failed", color: "#C03221", av: "!", body: j.error || `HTTP ${res.status}` }); }
              else setToast({ who: "Moved ✓", color: "#1AA053", av: me.av, body: `Rescheduled to ${next} — ${tName}'s day just freed up.` });
              load(); // popup stays open; the timeline + numbers refresh from server truth
            })
            .catch((e) => { setToast({ who: "Move failed", color: "#C03221", av: "!", body: String(e) }); load(); });
        };
        const plus1 = (due?: string) => {
          const base = due ? new Date(due) : new Date();
          base.setDate(base.getDate() + 1);
          return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
        };
        return (
          <div className="modal" onClick={() => setApproveGate(null)}>
            <div className="modal-card" style={{ maxWidth: 900, width: "94vw" }} onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setApproveGate(null)} title="Close">✕</button>
              <div className="lbl" style={{ marginBottom: ".4rem" }}>Approve &amp; hand over</div>
              <div className="d-title" style={{ marginBottom: ".8rem" }}>“{pending?.title || "Task"}” → {tName}</div>

              {/* THE DAY, VISUALLY: his real timeline with the live now-line */}
              <div className="lbl" style={{ marginBottom: ".3rem" }}>{tName}&rsquo;s day right now{clock ? ` (${clock.time})` : ""}</div>
              <div className="tl-ticks" style={{ marginBottom: ".2rem" }}>{HOUR_TICKS.map((t, i) => <span key={i}>{t}</span>)}</div>
              <div className="ag-track">
                {day.blocks.map((b, i) => (
                  <div key={i} className={`tcp-blk ${b.kind === "task" ? (b.id === day.current?.id ? "reel now" : "design") : b.kind}`}
                    style={{ position: "absolute", top: 0, bottom: 0, left: `${(b.start / DAY_MINS) * 100}%`, width: `${(b.dur / DAY_MINS) * 100}%` }} title={b.label}>
                    {b.label}{b.id === day.current?.id && <div className="tcp-bm">now</div>}
                  </div>
                ))}
                {nowMin !== null && nowMin >= 0 && nowMin <= DAY_MINS && <div className="tcp-now-line" style={{ left: `${(day.now / DAY_MINS) * 100}%` }}><span className="now-tag">● now</span></div>}
              </div>
              <div className="nt-assign" style={{ margin: ".6rem 0 1rem" }}>
                <span className="status-dot" style={{ background: fits ? "#1AA053" : "#D97706" }} />
                <span>
                  <b>{fmtMins(day.committed)}</b> committed · <b>{fmtMins(Math.max(0, day.free))}</b> free
                  {day.current ? <> · now: <b>{day.current.label}</b> (~{fmtMins(day.current.endsIn)} left)</> : <> · not on a task right now</>}
                  {" — "}this adds <b>{fmtMins(g.add)}</b>{fits ? ". It fits." : <b style={{ color: "#C03221" }}>. He&rsquo;s not free for a while.</b>}
                </span>
              </div>

              {!fits && (
                <>
                  <div className="lbl" style={{ marginBottom: ".3rem" }}>Move one of his NOT-started tasks (the one he&rsquo;s on is locked)</div>
                  <div className="claim-list" style={{ marginBottom: "1rem" }}>
                    {day.candidates.length ? day.candidates.map((c) => (
                      <div key={c.id} className="claim-card">
                        <div style={{ minWidth: 0 }}>
                          <div className="claim-title">{c.label}</div>
                          <div className="claim-meta">{fmtMins(c.dur)}{c.due ? ` · due ${c.due}` : ""}</div>
                        </div>
                        <div style={{ display: "flex", gap: ".4rem", alignItems: "center", flexShrink: 0 }}>
                          <button className="btn primary sm" onClick={() => moveCand(c.id, c.due, plus1(c.due))}>Move → next day</button>
                          <input type="date" className="nt-input" style={{ width: 148, padding: ".3rem .5rem" }} onChange={(e) => { if (e.target.value) moveCand(c.id, c.due, e.target.value); }} title="Pick a date" />
                        </div>
                      </div>
                    )) : <div className="empty" style={{ padding: "1rem 0" }}>Everything he has left is in progress — nothing can move.</div>}
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setApproveGate(null)}>Cancel</button>
                {fits ? (
                  <button className="btn primary" onClick={() => { setApproveGate(null); doSetTaskStatus(g.id, g.status); }}>Approve &amp; hand over</button>
                ) : (
                  <button className="btn primary" style={{ background: "#D97706", borderColor: "#D97706" }} onClick={() => { setApproveGate(null); doSetTaskStatus(g.id, g.status, true); }}>Send anyway → his pipeline</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* COMPLETENESS GATE — required fields missing for approve / output-ready */}
      {gateBlock && (
        <div className="modal" onClick={() => setGateBlock(null)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setGateBlock(null)} title="Close">✕</button>
            <div className="lbl" style={{ marginBottom: ".4rem", color: "#C0392B" }}>Can&apos;t move it yet</div>
            <div className="d-title" style={{ marginBottom: ".6rem" }}>
              {gateBlock.gate === "output" ? "No creative to hand off" : "The brief isn't complete"}
            </div>
            <div style={{ fontSize: ".85rem", color: "#4A5468", marginBottom: ".8rem" }}>
              {gateBlock.gate === "output"
                ? <>“{gateBlock.title}” can&apos;t be marked <b>Output-Ready</b> until there&apos;s a deliverable. Upload the creative, or add the output link (Drive / Canva) in <b>Creatives &amp; files</b>.</>
                : <>“{gateBlock.title}” can&apos;t be <b>Approved</b> until these are filled in:</>}
            </div>
            <ul style={{ margin: "0 0 1rem", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: ".4rem" }}>
              {gateBlock.missing.map((m, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".86rem", color: "#232D42" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: "#C0392B", flexShrink: 0 }} />{m}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn primary" onClick={() => setGateBlock(null)}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN-SIDE CAPACITY WARNING — "X's day is already full" confirm */}
      {assignWarn && (
        <div className="modal" onClick={() => setAssignWarn(null)}>
          <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAssignWarn(null)} title="Close">✕</button>
            <div className="lbl" style={{ marginBottom: ".4rem" }}>Capacity check</div>
            <div className="d-title" style={{ marginBottom: ".7rem" }}>{assignWarn.name}&rsquo;s day is already full</div>
            <div className="nt-assign" style={{ marginBottom: "1.1rem" }}>
              <span className="status-dot" style={{ background: "#D97706" }} />
              <span><b>{fmtDur(assignWarn.committed)}</b> of {assignWarn.name}&rsquo;s 8h is already committed. This task adds <b>{fmtDur(assignWarn.add)}</b> — it will likely slip past 6 PM or roll to tomorrow.</span>
            </div>
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setAssignWarn(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { const go = assignWarn.proceed; setAssignWarn(null); go(); }}>{assignWarn.cta || "Assign anyway"}</button>
            </div>
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
.hmd .icons{display:flex;align-items:center;gap:.5rem;position:relative}
.hmd .topdivider{width:1px;height:22px;background:var(--line);margin:0 .35rem;flex:none}
.hmd .iconbtn{position:relative;width:33px;height:33px;border-radius:10px;border:1px solid var(--line);background:var(--panel);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-soft);box-shadow:var(--shadow);transition:all .12s}
.hmd .iconbtn:hover{border-color:#D9DEEA;color:var(--brand-ink)}
.hmd .iconbtn.on{background:var(--brand-soft);border-color:var(--brand);color:var(--brand-ink)}
.hmd .iconbtn:disabled{opacity:.32;cursor:default;box-shadow:none}
.hmd .iconbtn:disabled:hover{border-color:var(--line);color:var(--ink-soft)}
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
/* Day control (Start day + Pipeline) sits WITH the stats — clear gap between. */
.hmd .stats-wrap{display:flex;align-items:center;justify-content:flex-end;gap:1.6rem;flex-wrap:wrap}
.hmd .dayctl{display:flex;align-items:center;gap:.5rem;padding-right:1.2rem;border-right:1px solid var(--line)}
@media(max-width:900px){.hmd .dayctl{border-right:none;padding-right:0}}
.hmd .who .hi{font-size:1.5rem;font-weight:700;letter-spacing:-.01em;line-height:1.15}
.hmd .who .sub{font-size:.82rem;color:var(--muted);margin-top:.4rem}
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
.hmd .tl-blk.reel.high{background:linear-gradient(135deg,#F4565B,#E11D48)}
.hmd .tl-blk.reel.high:hover{filter:brightness(1.06)}
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
.hmd .now-dot{position:absolute;top:3px;left:-3px;width:8px;height:8px;border-radius:50%;background:#DC2E2E}
.hmd .now-tag{position:absolute;top:2px;left:4px;background:#DC2E2E;color:#fff;font-size:.55rem;font-weight:700;letter-spacing:.03em;padding:1px 5px;border-radius:5px;white-space:nowrap;z-index:6;pointer-events:none}
.hmd .tl-guide{position:absolute;top:0;bottom:0;width:2px;background:#3A57E8;z-index:8;pointer-events:none;box-shadow:0 0 0 1px rgba(58,87,232,.25)}
.hmd .tl-guide-tag{position:absolute;top:4px;left:4px;background:#3A57E8;color:#fff;font-size:.68rem;font-weight:700;padding:2px 6px;border-radius:6px;white-space:nowrap}
.hmd .work{display:grid;grid-template-columns:1fr 1.5fr;gap:1rem;margin-top:1rem;align-items:start}
@media(max-width:980px){.hmd .work{grid-template-columns:1fr}}
/* The task-detail card scrolls INSIDE itself so a long brief/creatives list can
   never push the page into a mile of whitespace — My tasks stays visible. */
.hmd .work .detail{position:sticky;top:.8rem;max-height:calc(100vh - 1.6rem);overflow-y:auto}
.hmd .work .detail::-webkit-scrollbar{width:6px}
.hmd .work .detail::-webkit-scrollbar-thumb{background:#E3E6EE;border-radius:3px}
.hmd .colhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
.hmd .colhead h3{margin:0;font-size:.95rem}
/* Left "My tasks" card fills the column height (mirrors the sticky detail) so the
   list uses the whole screen instead of a fixed 460px box with dead space below.
   The header + tabs stay pinned; only the list scrolls. */
.hmd .work > .card:not(.detail){position:sticky;top:.8rem;max-height:calc(100vh - 1.6rem);display:flex;flex-direction:column;overflow:hidden}
.hmd .tasklist{display:flex;flex-direction:column;gap:.4rem;flex:1;min-height:0;overflow:auto}
.hmd .tasklist::-webkit-scrollbar{width:6px}
.hmd .tasklist::-webkit-scrollbar-thumb{background:#E3E6EE;border-radius:3px}
.hmd .task-tabs{display:flex;gap:.25rem;background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:.2rem;margin-bottom:.7rem}
.hmd .task-tab{flex:1;border:none;background:transparent;font:inherit;font-size:.7rem;font-weight:600;color:var(--muted);padding:.4em .3em;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:.3rem}
.hmd .task-tab.on{background:var(--panel);color:var(--brand-ink);box-shadow:var(--shadow)}
.hmd .task-tab-n{font-size:.58rem;background:#EDEFF4;color:var(--muted);border-radius:7px;padding:0 .35em;min-width:15px;text-align:center}
.hmd .task-tab.on .task-tab-n{background:var(--brand-soft);color:var(--brand-ink)}
.hmd .task{border:1px solid var(--line);border-radius:11px;padding:.6rem .7rem;cursor:pointer;background:var(--panel);transition:all .12s}
.hmd .task:hover{border-color:#D9DEEA;background:var(--panel-2)}
.hmd .task.overdue{background:linear-gradient(180deg,#FDECEA,#FFF7F6);border-color:#F1C4BD}
.hmd .task.high{border-left:3px solid #E11D48}
.hmd .task.overdue:hover{border-color:#EAA99F}
.hmd .task.sel{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
.hmd .task.overdue.sel{border-color:var(--brand)}
.hmd .task-top{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem}
.hmd .av-xs{width:20px;height:20px;font-size:.58rem}
.hmd .profwrap{position:relative}
.hmd .profchip{display:inline-flex;align-items:center;gap:.4rem;height:34px;padding:0 .55rem 0 .35rem;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink-soft);cursor:pointer}
.hmd .profchip:hover,.hmd .profchip.on{border-color:var(--brand);color:var(--brand)}
.hmd .profchip .profname{font-size:.78rem;font-weight:500}
.hmd .profmenu{position:absolute;top:calc(100% + 6px);right:0;z-index:40;background:#fff;border:1px solid var(--line);border-radius:12px;padding:.4rem;min-width:190px;box-shadow:0 10px 28px rgba(23,43,77,.14)}
.hmd .profhead{display:flex;align-items:center;gap:.55rem;padding:.4rem .5rem .6rem;border-bottom:1px solid var(--line-2);margin-bottom:.35rem}
.hmd .profhead-n{font-size:.82rem;font-weight:600;color:var(--ink)}
.hmd .profhead-r{font-size:.7rem;color:var(--muted)}
.hmd .profitem{display:flex;align-items:center;gap:.5rem;width:100%;padding:.5rem .55rem;border:none;background:transparent;border-radius:8px;font-size:.82rem;color:#C03221;cursor:pointer;text-align:left}
.hmd .profitem:hover{background:#FCEBEA}
.hmd .logout-screen{position:fixed;inset:0;z-index:120;background:rgba(246,247,251,.86);backdrop-filter:blur(3px);display:grid;place-items:center}
.hmd .logout-card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:2.4rem 2.6rem;text-align:center;max-width:380px;box-shadow:0 18px 50px rgba(23,43,77,.16)}
.hmd .logout-badge{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--brand);color:#fff;font-size:1.1rem;font-weight:600;margin-bottom:1rem}
.hmd .logout-h{font-size:1.15rem;font-weight:600;color:var(--ink);margin-bottom:.4rem}
.hmd .logout-p{font-size:.86rem;color:var(--muted);line-height:1.55;margin-bottom:1.4rem}
.hmd .logout-card .btn{width:100%;justify-content:center}
.hmd .logout-note{font-size:.68rem;color:var(--faint);margin-top:.9rem}
.hmd .due-chip{display:inline-flex;align-items:center;gap:.25rem;font-size:.6rem;font-weight:600;color:var(--muted);flex-shrink:0;white-space:nowrap}
.hmd .due-chip svg{width:11px;height:11px;flex:none;opacity:.9}
.hmd .due-chip.od{color:#C03221}
.hmd .task .tt{font-weight:600;font-size:.82rem;line-height:1.25}
.hmd .task .mm{font-size:.68rem;color:var(--muted);margin:.2rem 0 .35rem}
.hmd .detail .d-title{font-size:1.1rem;font-weight:700;letter-spacing:-.01em}
.hmd .d-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
.hmd .d-head-main{min-width:0}
.hmd .status-box{flex-shrink:0;text-align:right}
.hmd .status-box .mlbl{margin-bottom:.35rem}
/* task duration control (next to the status dropdown) */
.hmd .dur-ctl{display:inline-flex;align-items:center;gap:.3rem;margin-top:.5rem;margin-left:.5rem;border:1px solid var(--line);border-radius:8px;padding:.25rem .4rem;background:var(--panel-2)}
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
/* header capsule row — In Progress · duration · live countdown, all equal height */
.hmd .status-row{display:flex;align-items:center;justify-content:flex-end;gap:.4rem;flex-wrap:wrap}
.hmd .cap,.hmd .status-dd-btn,.hmd .ui-dd-btn,.hmd .cap-timer{height:32px;box-sizing:border-box}
.hmd .status-box .pill.cap{display:inline-flex;align-items:center}
/* generic Hope dropdown — swaps the off-brand native <select> everywhere */
.hmd .ui-dd{position:relative;display:inline-block}
.hmd .ui-dd.wide{display:block;width:100%}
.hmd .ui-dd-btn{position:relative;display:inline-flex;align-items:center;gap:.4rem;border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:.42rem 1.55rem .42rem .7rem;font:inherit;font-size:.8rem;font-weight:600;color:var(--ink-soft);cursor:pointer}
.hmd .ui-dd.wide .ui-dd-btn{width:100%;justify-content:flex-start}
.hmd .ui-dd-btn:hover{border-color:var(--brand)}
.hmd .ui-dd-val{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hmd .ui-dd-ic{font-size:.8rem;line-height:1}
.hmd .ui-dd-caret{position:absolute;right:.6rem;top:50%;width:0;height:0;margin-top:-2px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--faint);pointer-events:none}
.hmd .ui-dd-back{position:fixed;inset:0;z-index:40}
.hmd .ui-dd-menu{position:absolute;top:calc(100% + 6px);z-index:50;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 46px rgba(20,22,40,.16);padding:.35rem;min-width:180px;max-height:300px;overflow:auto}
.hmd .ui-dd-item{display:flex;align-items:center;gap:.55rem;width:100%;text-align:left;border:none;background:transparent;font:inherit;font-size:.8rem;font-weight:500;color:var(--ink);padding:.5rem .6rem;border-radius:8px;cursor:pointer}
.hmd .ui-dd-item:hover{background:var(--panel-2)}
.hmd .ui-dd-item.on{font-weight:700;background:var(--panel-2)}
.hmd .ui-dd-item-lbl{flex:1;white-space:nowrap}
.hmd .ui-dd-check{color:var(--brand);font-weight:800}
/* live countdown capsule in the task header (brand → amber when over) */
.hmd .sw-btn{display:inline-flex;align-items:center;gap:.35rem;border-radius:9px;padding:0 .8rem;font-size:.8rem;font-weight:600;white-space:nowrap;cursor:pointer;border:1px solid transparent}
.hmd .sw-btn.start{background:var(--brand);color:#fff}
.hmd .sw-btn.start:hover{background:#2138B0}
.hmd .sw-btn.stop{background:#FCEBEC;color:#C0201F;border-color:#F3C6CE}
.hmd .sw-btn.stop:hover{background:#F9DADE}
.hmd .cap-timer{display:inline-flex;align-items:center;border:1px solid #D5DCF8;border-radius:9px;background:var(--brand-soft);color:var(--brand-ink);padding:0 .7rem;font-size:.8rem;font-weight:700;white-space:nowrap}
.hmd .cap-timer.over{background:var(--warn-soft);border-color:#F3D9AE;color:#8A5A00}
.hmd .collab-cell{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap}
.hmd .detail .d-sub{font-size:.76rem;color:var(--muted);margin-top:.3rem}
.hmd .detail .d-meta{font-size:.75rem;color:var(--muted);margin:.25rem 0 .8rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.hmd .meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;padding:1.15rem 0;border-top:1px solid var(--line)}
.hmd .mlbl{font-size:.6rem;color:var(--faint);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem;font-weight:600}
.hmd .mval{font-size:.82rem;color:var(--ink-soft);font-weight:500}
.hmd .collab{display:flex;align-items:center;gap:.4rem;margin-top:.9rem;flex-wrap:wrap}
.hmd .collab .mlbl{margin:0 .3rem 0 0}
.hmd .av-sm{width:24px;height:24px;font-size:.64rem}
.hmd .collab-names{font-size:.78rem;color:var(--ink-soft);margin-left:.3rem}
.hmd .collab-add{width:24px;height:24px;border-radius:50%;border:1px dashed var(--line);background:transparent;color:var(--muted);font-size:1rem;line-height:1;display:grid;place-items:center;cursor:pointer;flex:none}
.hmd .collab-add:hover{border-color:var(--brand);color:var(--brand);border-style:solid}
.hmd .collab-add:disabled{opacity:.4;cursor:default}
.hmd .collab-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:20;background:#fff;border:1px solid var(--line);border-radius:11px;padding:.3rem;min-width:150px;box-shadow:0 6px 20px rgba(23,43,77,.12)}
.hmd .collab-opt{display:flex;align-items:center;gap:.45rem;width:100%;padding:.4rem .5rem;border:none;background:transparent;border-radius:8px;font-size:.8rem;color:var(--ink-soft);cursor:pointer;text-align:left}
.hmd .collab-opt:hover{background:var(--panel-2)}
.hmd .collab-opt:disabled{opacity:.5;cursor:default}
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
.hmd .thumb-img.clk{cursor:zoom-in}
.hmd .thumb-img.clk:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(35,45,66,.12)}
/* creative preview overlay */
.hmd .cv-bg{position:fixed;inset:0;z-index:80;background:rgba(12,14,26,.72);display:flex;align-items:center;justify-content:center;padding:2rem}
.hmd .cv-box{position:relative;max-width:min(560px,92vw);width:100%}
.hmd .cv-x{position:absolute;top:-34px;right:0;border:none;background:none;color:#fff;font-size:1.8rem;line-height:1;cursor:pointer;opacity:.85}
.hmd .cv-x:hover{opacity:1}
.hmd .cv-stage{position:relative;background:#0F1222;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center;max-height:74vh}
.hmd .cv-el{width:100%;max-height:74vh;object-fit:contain;display:block}
.hmd .cv-nav{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;border:none;font-size:1.3rem;display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1}
.hmd .cv-nav.prev{left:10px}.hmd .cv-nav.next{right:10px}
.hmd .cv-nav:hover{background:rgba(0,0,0,.68)}
.hmd .cv-count{position:absolute;top:10px;right:10px;background:rgba(0,0,0,.5);color:#fff;font-size:.66rem;font-weight:600;padding:.15rem .5rem;border-radius:20px}
.hmd .cv-name{display:flex;align-items:center;justify-content:space-between;gap:1rem;color:#fff;font-size:.8rem;padding:.6rem .2rem 0}
.hmd .cv-fname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9}
.hmd .cv-dots{display:flex;gap:5px;flex:0 0 auto}
.hmd .cv-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.45);border:none;padding:0;cursor:pointer}
.hmd .cv-dot.on{background:#fff;width:18px;border-radius:4px}
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
.hmd .chat-sys{display:flex;align-items:center;justify-content:center;gap:.4rem;margin:.45rem 0;text-align:center}
.hmd .chat-sys span:first-child{background:var(--panel-2);border:1px solid var(--line);border-radius:99px;padding:.28rem .7rem;font-size:.7rem;color:var(--ink-soft);max-width:86%}
.hmd .chat-sys-tm{font-size:.6rem;color:var(--faint)}
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
.hmd .endbtn{display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;font-size:.78rem;font-weight:600;background:#FCEBEC;border-color:#F3C6CE;color:#B0203A}
.hmd .endbtn:hover{background:#F9DADE;border-color:#E7A9B3}
.hmd .teamcapbtn{display:inline-flex;align-items:center;gap:.4rem;font-size:.78rem;font-weight:600;border-radius:9px;padding:.5em .8em;border:1px solid #CBD5FA;background:var(--brand-soft);color:var(--brand-ink);cursor:pointer;white-space:nowrap}
.hmd .teamcapbtn:hover{border-color:var(--brand)}
.hmd .teamcapbtn.on{background:var(--brand);color:#fff;border-color:transparent}
/* Team-capacity page */
.hmd .tcp-head{display:flex;align-items:center;gap:.7rem;margin-bottom:1rem}
.hmd .tcp-span{margin-left:auto}
/* approve-gate mini timeline (reuses tcp-blk block styles, absolute layout) */
.hmd .ag-track{position:relative;height:104px;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--panel-2)}
/* live task timer strip + inline finished/extend prompt */
.hmd .timer-strip{display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;background:var(--brand-soft);border:1px solid #D5DCF8;border-radius:10px;padding:.55rem .85rem;margin:.7rem 0 .2rem;font-size:.82rem;color:var(--brand-ink)}
.hmd .timer-strip.over{background:var(--warn-soft);border-color:#F3D9AE;color:#8A5A00}
.hmd .timer-strip.idle{background:var(--panel-2);border-color:var(--line);color:var(--ink-soft)}
.hmd .timer-acts{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;font-weight:600}
.hmd .ext-wrap{position:relative;display:inline-flex}
.hmd .ext-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:20;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(35,45,66,.12);padding:.5rem;display:flex;flex-direction:column;gap:.4rem;min-width:214px}
.hmd .ext-row{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap}
.hmd .ext-in{width:96px;padding:.3rem .5rem}
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
.hmd .tcp-blk.past{background:#EDEEF2;color:var(--faint);font-weight:500;opacity:.7}
.hmd .tcp-now-line{position:absolute;top:0;bottom:0;width:2px;background:#DC2E2E;z-index:3}
.hmd .tcp-week{display:flex;gap:.5rem}
.hmd .tcp-day{flex:1;display:flex;flex-direction:column;gap:.3rem;min-width:0}
.hmd .tcp-day-h{display:flex;align-items:center;justify-content:center;gap:.3rem;font-size:.72rem;color:var(--muted)}
.hmd .tcp-day.today .tcp-day-h{color:var(--ink);font-weight:700}
.hmd .tcp-day-now{color:#DC2E2E;font-size:.58rem;font-weight:700;letter-spacing:.02em}
.hmd .tcp-day-bar{height:64px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);display:flex;flex-direction:column-reverse;overflow:hidden}
.hmd .tcp-day.today .tcp-day-bar{border-color:#DC2E2E;box-shadow:inset 0 0 0 1px #DC2E2E}
.hmd .tcp-day.over .tcp-day-bar{border-color:#E11D48}
.hmd .tcp-day-seg{width:100%;border-bottom:1px solid rgba(255,255,255,.55)}
.hmd .tcp-day-seg.reel{background:linear-gradient(135deg,#5A6FF0,#3A57E8)}
.hmd .tcp-day-seg.design{background:linear-gradient(135deg,#8E7BF0,#6D5CE7)}
.hmd .tcp-day-f{text-align:center;font-size:.68rem;color:var(--ink-soft);font-variant-numeric:tabular-nums}
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
.hmd .eod-reason{width:100%;margin:.1rem 0 .55rem 2rem;max-width:calc(100% - 2rem);border:1px solid var(--line);border-radius:8px;padding:.4rem .55rem;font-size:.78rem;color:var(--ink-soft);background:var(--panel-2)}
.hmd .eod-reason:focus{outline:none;border-color:var(--brand);background:#fff}
.hmd .btn.rose:disabled{opacity:.45;cursor:default}
.hmd .eod-foot{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1.1rem;padding-top:.9rem;border-top:1px solid var(--line)}
.hmd .m-note{font-size:.72rem;color:var(--muted)}
.hmd .btn.rose{background:var(--rose);color:#fff;border-color:transparent}
`;
