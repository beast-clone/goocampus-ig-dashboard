"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconSunHigh, IconLayoutGrid, IconChartBar, IconCalendarEvent, IconWand, IconBrandInstagram, IconBrandLinkedin, IconBrandYoutube, IconBrandFacebook, IconUsers, IconSpeakerphone, IconSettings } from "@tabler/icons-react";

function NavGroup({ label }: { label: string }) { return <div className="navgroup">{label}</div>; }
function NavItem({ icon: Icon, label, active }: { icon: React.ComponentType<{ size?: number; stroke?: number }>; label: string; active?: boolean }) {
  return <div className={`navitem ${active ? "active" : ""}`}><Icon size={16} stroke={1.8} /> <span>{label}</span></div>;
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

type Tone = "good" | "info" | "brand" | "warn";
type Person = { name: string; av: string; color: string };
// Content Calendar Status (Airtable). The WORKING VIEW only shows statuses with
// inView:true — i.e. tasks that still need work. "Output ready" leaves the view
// (goes to the review/schedule queue) and "Published" never shows. `stage` maps to
// the pipeline strip below. Draft/Pending exist upstream but don't reach My Day.
type StatusKey = "in_progress" | "approved" | "feedback" | "output_ready" | "published";
const STATUS: Record<StatusKey, { label: string; tone: Tone; stage: number; inView: boolean }> = {
  in_progress:  { label: "In progress",            tone: "warn",  stage: 1, inView: true },
  approved:     { label: "Content approved",       tone: "good",  stage: 2, inView: true },
  feedback:     { label: "Incorporating feedback", tone: "warn",  stage: 2, inView: true },
  output_ready: { label: "Output ready",           tone: "info",  stage: 3, inView: true },
  published:    { label: "Scheduled",              tone: "brand", stage: 4, inView: false }, // scheduled → leaves the view
};
// The statuses a producer can move a task through from My Day.
const STATUS_ACTIONS: { key: StatusKey; label: string }[] = [
  { key: "in_progress", label: "In progress" },
  { key: "feedback", label: "Incorporating feedback" },
  { key: "output_ready", label: "Output ready" },
];
// Status tabs — output-ready stays visible under its own tab; only "Scheduled"
// (published) drops out of the view entirely.
const TASK_TABS: { key: string; label: string; statuses: StatusKey[] }[] = [
  { key: "active", label: "In progress", statuses: ["in_progress", "approved"] },
  { key: "feedback", label: "Feedback", statuses: ["feedback"] },
  { key: "output", label: "Output ready", statuses: ["output_ready"] },
];
function dueInfo(due: string, today: string): { label: string; overdue: boolean } {
  if (!due) return { label: "", overdue: false };
  const d = Math.round((new Date(due + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86_400_000);
  if (d < 0) return { label: d === -1 ? "Overdue · yesterday" : `Overdue · ${-d} days`, overdue: true };
  if (d === 0) return { label: "Due today", overdue: false };
  if (d === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${d} days`, overdue: false };
}
type Task = {
  id: string; title: string; meta: string;
  status: StatusKey; due: string; // YYYY-MM-DD
  detail: {
    typeLine: string; publishes: string; owner: string;
    priority: "High" | "Medium" | "Low"; brand: string;
    content: string;                                    // full write-up (paragraphs split on blank lines)
    creatives: { name: string; type: "image" | "video" | "doc" }[]; // uploaded assets → thumbnails
    collaborators: Person[];
    activity: { who: string; text: string; time: string }[];
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
  { id: "t1", title: "10k Mentorship — Speaking Reel", meta: "Reel · Original · 15 Jul", status: "in_progress", due: "2026-07-14",
    detail: {
      typeLine: "Reel · Original", publishes: "15 Jul 2026", owner: "You own this", priority: "High", brand: "GooCampus · 10k Mentorship",
      content: "Talking-head reel introducing the 10k Mentorship program.\n\nHook (0–3s): open with a pattern-interrupt — “Most students pick a college blind. Here's how 10,000 of them didn't.” Keep the first frame text-only and high-contrast so it stops the scroll.\n\nBody (3–35s): three crisp benefits, one per beat. 1) A 1-on-1 counsellor who has actually walked the path. 2) Verified cutoff data, not WhatsApp-forward rumours. 3) A private community of 10,000 aspirants going through the same season.\n\nProof: drop the on-screen stat “10,000+ students guided” and a two-second montage of real counsellor-call screenshots so the claim lands.\n\nCTA (35–45s): “Comment or DM the word MENTOR and we'll send you the free starter kit.” End on a clean card with the logo and handle.\n\nSpecs: vertical 9:16, under 45 seconds, subtitles burned in (English). B-roll — campus shots plus the app screen-recording in the shared drive. Music upbeat but under 100 BPM so the voice stays clear.\n\nTone: warm and direct, like a senior telling a junior what they wish they'd known. No jargon, no fear-mongering — just clarity.",
      creatives: [{ name: "cover-frame.png", type: "image" }, { name: "reel-cut-v3.mp4", type: "video" }],
      collaborators: [PPL.manya, PPL.nandu],
      activity: [{ who: "Manya", text: "approved the script", time: "9:12 AM" }, { who: "You", text: "started editing", time: "10:31 AM" }] } },
  { id: "t2", title: "Careers other than NEET — Reel", meta: "Reel Thumbnail · owned by Praveen", status: "output_ready", due: "2026-07-13",
    detail: {
      typeLine: "Reel Thumbnail", publishes: "14 Jul 2026", owner: "Owned by Praveen", priority: "Medium", brand: "GooCampus · Careers",
      content: "Thumbnail and cover frame for the “Careers other than NEET” reel.\n\nOne face, bold high-contrast text hook (“NEET isn't the only door”), brand-blue accent. Keep the face on the right third, text on the left.\n\nDeliver a 9:16 cover plus a 1:1 crop for the grid. Output is ready in the drive — needs a quick review pass before it goes to the Scheduler.",
      creatives: [{ name: "thumb-9x16-final.png", type: "image" }, { name: "thumb-1x1.png", type: "image" }],
      collaborators: [PPL.praveen, PPL.maheen],
      activity: [{ who: "Praveen", text: "uploaded the output", time: "8:40 AM" }, { who: "Praveen", text: "marked output ready", time: "9:05 AM" }] } },
  { id: "t3", title: "Careers other than NEET — Reel", meta: "Reel · Original · 13 Jul", status: "feedback", due: "2026-07-13",
    detail: {
      typeLine: "Reel · Original", publishes: "13 Jul 2026", owner: "You own this", priority: "High", brand: "GooCampus · Careers",
      content: "Full reel cut on career alternatives after NEET — five options in a fast-paced sequence (research, allied health, biotech, data + health, abroad pathways).\n\nQuick jump-cuts, on-screen captions in English and Hindi, upbeat track under 100 BPM. Approved by Manya; currently in editing. Target runtime 40–50 seconds.",
      creatives: [{ name: "reel-cut-final.mp4", type: "video" }, { name: "cover.png", type: "image" }],
      collaborators: [PPL.manya, PPL.nandu],
      activity: [{ who: "Manya", text: "left B-roll notes", time: "10:24 AM" }, { who: "You", text: "accepted the task", time: "10:31 AM" }] } },
  { id: "t4", title: "Salary Tool — text based", meta: "Reel · owned by Manya", status: "published", due: "2026-07-11",
    detail: {
      typeLine: "Reel · Text", publishes: "11 Jul 2026", owner: "Owned by Manya", priority: "Low", brand: "GooCampus · Tools",
      content: "Text-based reel walking through the salary-estimator tool: pick a role, see the median package by city, and share the result.\n\nPublished and performing well (34k reach in 48h). Kept here for reference and as a template for the next tool explainer.",
      creatives: [{ name: "salary-tool-demo.mp4", type: "video" }],
      collaborators: [PPL.manya],
      activity: [{ who: "Manya", text: "published the reel", time: "Jul 11" }, { who: "Maheen", text: "flagged it as a top performer", time: "Jul 12" }] } },
  { id: "t5", title: "MBBS Govt Quota Cutoff — TN", meta: "Reel · owned by Nikhil", status: "published", due: "2026-07-10",
    detail: {
      typeLine: "Reel · Original", publishes: "10 Jul 2026", owner: "Owned by Nikhil", priority: "Medium", brand: "GooCampus · NEET",
      content: "Tamil Nadu government-quota MBBS cutoff explainer — the 2025 closing ranks by community, what changed vs 2024, and how to read the counselling table.\n\nPublished and steady. Use as the reference/template for the next state's cutoff reel (Karnataka is queued).",
      creatives: [{ name: "reel-final.mp4", type: "video" }, { name: "cutoff-card.png", type: "image" }],
      collaborators: [PPL.nikhil, PPL.maheen],
      activity: [{ who: "Nikhil", text: "published the reel", time: "Jul 10" }] } },
  { id: "t6", title: "Germany Approbation — Reel", meta: "Reel · Original · 13 Jul", status: "in_progress", due: "2026-07-13",
    detail: { typeLine: "Reel · Original", publishes: "13 Jul 2026", owner: "You own this", priority: "High", brand: "GooCampus · Study Abroad",
      content: "Reel explaining Germany's Approbation pathway for IMGs — the three steps, the timeline, and the language bar.\n\nApproved and you're mid-edit. It was due yesterday, so it needs wrapping up first.",
      creatives: [{ name: "approbation-cut.mp4", type: "video" }], collaborators: [PPL.manya, PPL.nandu],
      activity: [{ who: "Manya", text: "approved the script", time: "Jul 12" }] } },
  { id: "t7", title: "AMC Exam Guide — Carousel", meta: "Carousel · 15 Jul", status: "approved", due: "2026-07-15",
    detail: { typeLine: "Carousel · Original", publishes: "15 Jul 2026", owner: "You own this", priority: "Medium", brand: "GooCampus · Australia",
      content: "8-slide carousel breaking down the AMC exam pathway — MCQ then clinical, the documents, and the timelines.\n\nJust approved; queued for tomorrow.",
      creatives: [], collaborators: [PPL.manya], activity: [{ who: "Manya", text: "approved the content", time: "Today" }] } },
];

// Videos are NOT auto-assigned — they sit in a shared pool that BOTH editors
// (Nandu long-form, Nikhil short-form) can see and CLAIM. Whoever claims becomes
// the owner. (Design/thumbnail work stays auto-assigned to Praveen.)
const CLAIM_POOL_INIT: Task[] = [
  { id: "v1", title: "NEET PG Strategy — Long-Form", meta: "YouTube Long-Form · unclaimed", status: "approved", due: "2026-07-18",
    detail: { typeLine: "YouTube Long-Form", publishes: "18 Jul 2026", owner: "Unclaimed", priority: "High", brand: "GooCampus · NEET PG",
      content: "Long-form explainer on how to build a NEET-PG counselling strategy — choosing branch vs college, reading closing ranks, and the round-by-round game plan.\n\nApproved script is in the doc. Needs an editor to claim it and cut a 6–8 min video with lower-thirds and chapter markers.",
      creatives: [{ name: "script-final.txt", type: "doc" }, { name: "raw-interview.mp4", type: "video" }],
      collaborators: [PPL.manya], activity: [{ who: "Manya", text: "approved the script", time: "9:40 AM" }] } },
  { id: "v2", title: "Which Branch After NEET — Reel", meta: "Reel - Original · unclaimed", status: "approved", due: "2026-07-16",
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
const LUNCH_AT = (13 - DAY_START_H) * 60;          // drop lunch around 1 PM
const fmtDur = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`; };
const HOUR_TICKS = ["9 AM", "10", "11", "12", "1 PM", "2", "3", "4", "5"];

type PlanItem = { key: string; taskId: string; label: string; dur: number };
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
};

const PRIO: Record<"High" | "Medium" | "Low", { bg: string; fg: string }> = {
  High: { bg: "#FBE7E4", fg: "#C03221" },
  Medium: { bg: "#E1F4F5", fg: "#079AA2" },
  Low: { bg: "#F0F2F8", fg: "#8A92A6" },
};

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

function TaskBody({ task, label }: { task: Task; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copyContent = () => { try { navigator.clipboard?.writeText(task.detail.content); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <>
      {label && <div className="lbl" style={{ marginBottom: ".45rem" }}>{label}</div>}
      <div className="d-title">{task.title}</div>
      <div className="d-sub">{task.detail.typeLine} · {task.detail.brand} · Publishes {task.detail.publishes}</div>

      <div className="meta-grid">
        <div><div className="mlbl">Status</div><span className="pill" style={{ background: TONE[STATUS[task.status].tone].bg, color: TONE[STATUS[task.status].tone].fg }}>{STATUS[task.status].label}</span></div>
        <div><div className="mlbl">Priority</div><span className="pill" style={{ background: PRIO[task.detail.priority].bg, color: PRIO[task.detail.priority].fg }}>{task.detail.priority}</span></div>
        <div><div className="mlbl">Owner</div><div className="mval">{task.detail.owner}</div></div>
      </div>

      <div className="collab">
        <span className="mlbl">Team</span>
        {task.detail.collaborators.map((c, i) => <span key={i} className="av av-sm" style={{ background: c.color }} title={c.name}>{c.av}</span>)}
        <span className="collab-names">{task.detail.collaborators.map((c) => c.name).join(", ")}</span>
      </div>

      <div className="section-head">
        <span className="section-lbl">Content brief</span>
        <button className="copy-btn" onClick={copyContent}>{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      <div className="brief">
        {task.detail.content.split(/\n\n+/).map((p, i) => <p key={i} className="para">{p}</p>)}
      </div>

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

      <div className="section-lbl">Progress</div>
      <div className="mini-tl">
        {PIPELINE.map((s, i) => { const stage = STATUS[task.status].stage; return <div key={s} className={`step ${i < stage ? "done" : i === stage ? "now" : ""}`}><div className="bar" /><span>{s}</span></div>; })}
      </div>

      <div className="section-lbl">Recent activity</div>
      <div className="activity">
        {task.detail.activity.map((a, i) => (
          <div key={i} className="act-row"><b>{a.who}</b> {a.text}<span className="act-time"> · {a.time}</span></div>
        ))}
      </div>
    </>
  );
}

export function HopeMyDay() {
  const [person, setPerson] = useState("nandu");
  const [sel, setSel] = useState(0);
  const [claimPool, setClaimPool] = useState<Task[]>(CLAIM_POOL_INIT); // videos up for grabs
  const [claimedTasks, setClaimedTasks] = useState<Task[]>([]);        // videos I claimed this session
  const [tasks, setTasks] = useState<Task[]>(TASKS);                   // my tasks (status is mutable)
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
  const [nowMin, setNowMin] = useState<number | null>(null);          // minutes since 9 AM
  const [isWeekend, setIsWeekend] = useState(false);
  const [todayStr, setTodayStr] = useState("");                       // YYYY-MM-DD for due-date sorting
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPinned, setChatPinned] = useState(false);
  const [toast, setToast] = useState<null | { who: string; color: string; av: string; body: string; convo?: string }>(null);
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

  const me = useMemo(() => TEAM.find((t) => t.key === person) || TEAM[3], [person]);
  const isEditor = person === "nandu" || person === "nikhil"; // editors claim videos
  const showPool = isEditor && claimPool.length > 0;
  // WORKING VIEW: only tasks that still need work show here (In progress · Approved
  // · Incorporating feedback). Output-ready leaves the view; Published never shows.
  const workingTasks = useMemo(() => [...claimedTasks, ...tasks].filter((t) => STATUS[t.status].inView), [claimedTasks, tasks]);
  const tabCounts = useMemo(() => TASK_TABS.map((tb) => ({ ...tb, n: workingTasks.filter((t) => tb.statuses.includes(t.status)).length })), [workingTasks]);
  const curTab = TASK_TABS.find((t) => t.key === taskTab) || TASK_TABS[0];
  // Tasks in the current tab, sorted by due date (overdue first → today → later).
  const shownTasks = useMemo(() => workingTasks.filter((t) => curTab.statuses.includes(t.status)).sort((a, b) => (a.due || "").localeCompare(b.due || "")), [workingTasks, taskTab]);
  const task = shownTasks[sel] || shownTasks[0] || null;
  const planModalTask = planModalId ? tasks.find((t) => t.id === planModalId) || null : null;
  // Change a task's status. Output-ready → moves to the Output-ready tab; Scheduled → leaves the view.
  const setTaskStatus = (id: string, status: StatusKey) => {
    setTasks((a) => a.map((t) => (t.id === id ? { ...t, status } : t)));
    setClaimedTasks((a) => a.map((t) => (t.id === id ? { ...t, status } : t)));
    setSel(0);
    if (status === "output_ready") setToast({ who: "Output ready ✓", color: "#3A57E8", av: me.av, body: "Moved to the Output ready tab." });
    else if (!STATUS[status].inView) setToast({ who: "Scheduled ✓", color: "#3A57E8", av: me.av, body: "It's left your working view." });
  };

  // Lay the (reorderable) tasks across the day, dropping the protected 1-hour
  // lunch in around 1 PM and filling the tail with buffer.
  const planBlocks = useMemo(() => {
    const out: { kind: "reel" | "lunch" | "buffer"; key?: string; taskId?: string; label: string; start: number; dur: number }[] = [];
    let cursor = 0, lunchDone = false;
    for (const p of plan) {
      if (!lunchDone && cursor >= LUNCH_AT) { out.push({ kind: "lunch", label: "Lunch", start: cursor, dur: LUNCH_MIN }); cursor += LUNCH_MIN; lunchDone = true; }
      out.push({ kind: "reel", key: p.key, taskId: p.taskId, label: p.label, start: cursor, dur: p.dur });
      cursor += p.dur;
    }
    if (!lunchDone) { out.push({ kind: "lunch", label: "Lunch", start: cursor, dur: LUNCH_MIN }); cursor += LUNCH_MIN; }
    if (cursor < DAY_MINS) out.push({ kind: "buffer", label: "Buffer", start: cursor, dur: DAY_MINS - cursor });
    return out;
  }, [plan]);
  const workMin = plan.reduce((s, p) => s + p.dur, 0);
  const showNow = nowMin !== null && !isWeekend && nowMin >= 0 && nowMin <= DAY_MINS;
  const movePlan = (key: string, dir: number) => setPlan((arr) => { const i = arr.findIndex((p) => p.key === key); const j = i + dir; if (i < 0 || j < 0 || j >= arr.length) return arr; const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const dropPlan = (targetKey: string) => { const from = plan.findIndex((p) => p.key === dragKey.current); const to = plan.findIndex((p) => p.key === targetKey); dragKey.current = null; if (from < 0 || to < 0 || from === to) return; setPlan((arr) => { const c = [...arr]; const [m] = c.splice(from, 1); c.splice(to, 0, m); return c; }); };
  const isAdmin = person === "maheen"; // only Maheen (manager) may Send to Scheduler
  // My-tasks row → expands inline in the "Up next" panel (setSel).
  // Today's-plan block → opens the task in a popup (like the original dashboard).
  // Claim a video → you become the owner; it leaves the pool and lands in My tasks.
  const claimVideo = (v: Task) => {
    setClaimPool((p) => p.filter((x) => x.id !== v.id));
    const claimed: Task = { ...v, status: "in_progress", meta: `${v.detail.typeLine} · you claimed this`, detail: { ...v.detail, owner: "You own this — claimed" } };
    setClaimedTasks((c) => [claimed, ...c]);
    setSel(0); // open the freshly claimed task in "Up next"
    setToast({ who: "Claimed ✓", color: me.color, av: me.av, body: `You claimed “${v.title}” — it's yours now, added to My tasks.` });
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

      {/* Videos up for grabs surface prominently on the right first; ignored → demote to 🔔 after 15s */}
      {showPool && poolProminent && (
        <div className="handoff-card">
          <div className="notif">
            <div className="bell">{BELL}</div>
            <div className="txt">
              <b>{claimPool.length} video{claimPool.length === 1 ? "" : "s"} up for grabs.</b> First to claim owns it — long-form &amp; short-form waiting.
              <span className="cap">Open to claim, or this tucks into the 🔔 in 15s.</span>
              <div className="acts">
                <button className="btn primary sm" onClick={() => { setPanel("notif"); setPoolProminent(false); }}>Claim a video</button>
                <button className="btn sm" onClick={() => setPoolProminent(false)}>Later</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="shell">
      {/* ── Sidebar (matches the Overview V2 Hope shell) ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo"><IconBrandInstagram size={16} style={{ transform: "rotate(-45deg)" }} /></span>
          <span className="brandname">GooCampus</span>
        </div>
        <NavGroup label="Content" />
        <NavItem icon={IconSunHigh} label="My Day" active />
        <NavItem icon={IconLayoutGrid} label="Overview" />
        <NavItem icon={IconChartBar} label="Marketing Hub" />
        <NavItem icon={IconCalendarEvent} label="Publishing Calendar" />
        <NavItem icon={IconWand} label="Post Planner" />
        <NavGroup label="Analytics" />
        <NavItem icon={IconBrandInstagram} label="Instagram" />
        <NavItem icon={IconBrandLinkedin} label="LinkedIn" />
        <NavItem icon={IconBrandYoutube} label="YouTube" />
        <NavItem icon={IconBrandFacebook} label="Facebook" />
        <NavGroup label="Audience" />
        <NavItem icon={IconUsers} label="All platforms" />
        <NavGroup label="Ads" />
        <NavItem icon={IconSpeakerphone} label="Ads" />
        <NavGroup label="System" />
        <NavItem icon={IconSettings} label="Integrations" />
      </aside>

      <div className={`main ${chatOpen ? "chatpad" : ""}`}>

        {/* TOP BAR — title + icon triggers */}
        <div className="topbar">
          <p className="banner">
            <b>Hope UI theme · My Day</b>
            <span className="tagchg">Version 2 preview</span>
            <span>collapsible chat · icon inbox · wider workspace</span>
          </p>
          <div className="icons">
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
            <div className="stat"><div className="n w">2</div><div className="k">Pending today</div></div>
            <div className="stat"><div className="n">6</div><div className="k">Waiting on me</div></div>
            <div className="stat"><div className="n b">3</div><div className="k">Output ready</div></div>
            <div className="stat"><div className="n">2</div><div className="k">To publish</div></div>
            <div className="stat"><div className="n g">0</div><div className="k">Done · 7d</div></div>
          </div>
        </div>

        {/* 2 · HERO — today's plan */}
        <div className="card pad hero">
          <div className="hero-head">
            <div style={{ display: "flex", alignItems: "baseline", gap: ".7rem", flexWrap: "wrap" }}>
              <h2>Today’s plan</h2>
              <span className="prog"><b style={{ color: "#232D42" }}>{fmtDur(workMin)}</b> of 8h work · 1h lunch · {fmtDur(Math.max(0, DAY_MINS - workMin - LUNCH_MIN))} buffer</span>
              <span className="qmark" title="8-hour workday (9 AM–6 PM) with a protected 1-hour lunch. Drag a task or use ‹ › to reorder.">?</span>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <div className="legend"><span><i className="dot" style={{ background: "#3A57E8" }} />Reel</span><span><i className="dot" style={{ background: "#D9DEEA" }} />Break</span></div>
              <button className="btn primary sm">✦ Auto-plan</button>
            </div>
          </div>
          <div className="tl-wrap">
            <div className="tl-ticks">{HOUR_TICKS.map((t, i) => <span key={i}>{t}</span>)}</div>
            <div className="tl-track">
              {planBlocks.map((b) => (
                <div
                  key={b.key || `${b.kind}-${b.start}`}
                  className={`tl-blk ${b.kind} ${b.kind === "reel" ? "clickable" : ""}`}
                  draggable={b.kind === "reel"}
                  onDragStart={b.kind === "reel" ? () => { dragKey.current = b.key!; } : undefined}
                  onDragOver={b.kind === "reel" ? (e) => e.preventDefault() : undefined}
                  onDrop={b.kind === "reel" ? () => dropPlan(b.key!) : undefined}
                  onClick={() => b.taskId && setPlanModalId(b.taskId)}
                  style={{ left: `${(b.start / DAY_MINS) * 100}%`, width: `${(b.dur / DAY_MINS) * 100}%` }}
                  title={b.kind === "reel" ? "Drag to reorder · click to open" : b.kind === "lunch" ? "Protected lunch" : undefined}
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
            <div className="colhead"><h3>My tasks</h3><span className="lbl">by due date</span></div>
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
              <>
                <TaskBody task={task} label="Task · opened" />
                <div className="d-actions">
                  <span className="mlbl" style={{ alignSelf: "center", margin: "0 .1rem 0 0" }}>Set status</span>
                  {STATUS_ACTIONS.map((sa) => (
                    <button key={sa.key} className={`btn ${task.status === sa.key ? "primary" : ""}`} onClick={() => setTaskStatus(task.id, sa.key)}>{sa.label}</button>
                  ))}
                  {isAdmin && <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setTaskStatus(task.id, "published")}>Send to Scheduler</button>}
                </div>
              </>
            ) : (
              <div className="empty" style={{ padding: "3.5rem 0" }}>You’re all caught up ✓ — nothing needs work right now.</div>
            )}
          </div>
        </div>
      </div>
      </div>{/* /shell */}

      {/* TEAM CHAT — collapsible slide-in panel */}
      <aside className={`chatpanel ${chatOpen ? "open" : ""}`}>
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
            <TaskBody task={planModalTask} label="Today's plan · task" />
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

      {/* TOAST — new message nudge */}
      {toast && (
        <div className="toast" onClick={() => { openChat(); if (toast.convo) openConvo(toast.convo); setToast(null); }}>
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
.hmd .navitem{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;font-size:.82rem;font-weight:500;color:var(--ink-soft);cursor:pointer;margin-bottom:1px}
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
.hmd .tl-blk{position:absolute;top:11px;height:94px;border-radius:9px;padding:.6rem .6rem;overflow:hidden;display:flex;flex-direction:column;justify-content:center;color:#fff;font-size:.75rem;transition:filter .12s}
.hmd .tl-blk.reel{background:linear-gradient(135deg,#5A6FF0,#3A57E8);cursor:grab;box-shadow:0 2px 6px rgba(58,87,232,.25)}
.hmd .tl-blk.reel:hover{filter:brightness(1.05)}
.hmd .tl-blk.reel:active{cursor:grabbing}
.hmd .tl-blk.lunch{background:repeating-linear-gradient(45deg,#EAEDF5,#EAEDF5 6px,#DFE3EE 6px,#DFE3EE 12px);color:var(--muted);border:1px dashed #C7CEDD}
.hmd .tl-blk.buffer{background:repeating-linear-gradient(45deg,#F3F5F9,#F3F5F9 6px,#E9ECF2 6px,#E9ECF2 12px);color:var(--faint);border:1px dashed var(--line)}
.hmd .tl-t{font-weight:600;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hmd .tl-m{font-size:.62rem;opacity:.85;margin-top:.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hmd .tl-nudge{position:absolute;top:50%;transform:translateY(-50%);width:18px;height:40px;border:none;border-radius:6px;background:rgba(255,255,255,.26);color:#fff;font-size:1.05rem;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;display:flex;align-items:center;justify-content:center;z-index:3;padding:0}
.hmd .tl-blk.reel:hover .tl-nudge{opacity:1}
.hmd .tl-nudge:hover{background:rgba(255,255,255,.5)}
.hmd .tl-nudge.l{left:3px}
.hmd .tl-nudge.r{right:3px}
.hmd .now-line{position:absolute;top:0;bottom:0;width:2px;background:#DC2E2E;z-index:5;pointer-events:none}
.hmd .now-dot{position:absolute;top:-3px;left:-3px;width:8px;height:8px;border-radius:50%;background:#DC2E2E}
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
.hmd .modal{position:fixed;inset:0;background:rgba(20,22,40,.42);display:flex;align-items:flex-start;justify-content:center;padding:clamp(2rem,7vh,5rem) 1rem;z-index:70;animation:hmdfade .16s ease}
@keyframes hmdfade{from{opacity:0}to{opacity:1}}
.hmd .modal-card{position:relative;width:100%;max-width:640px;max-height:86vh;overflow-y:auto;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:0 30px 80px rgba(20,22,40,.3);padding:1.5rem 1.6rem;animation:hmdslide .22s ease}
.hmd .modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
.hmd .modal-close{position:absolute;top:1.1rem;right:1.1rem;width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);cursor:pointer;font-size:.85rem;z-index:2}
.hmd .modal-close:hover{color:var(--ink);border-color:#D9DEEA}
.hmd .modal-card .d-title{padding-right:2rem}
.hmd .modal-foot{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:1.4rem;padding-top:1.1rem;border-top:1px solid var(--line)}
.hmd .modal-foot-note{font-size:.72rem;color:var(--muted)}
.hmd .modal-foot-acts{display:flex;gap:.5rem}
`;
