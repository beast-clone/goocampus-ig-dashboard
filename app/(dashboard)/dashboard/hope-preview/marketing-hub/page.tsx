"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { HopeSelect } from "@/app/(dashboard)/dashboard/hope-preview/HopeSelect";
import { LiveIndicator } from "@/components/LiveIndicator";
import { NewTaskButton } from "@/components/NewTaskModal";
import { useApi } from "@/lib/use-api";
import { IconSearch, IconPaperclip, IconBrandInstagram, IconBrandFacebook, IconBrandLinkedin, IconBrandYoutube, IconFilter, IconLayoutList, IconPalette, IconBookmark, IconDeviceFloppy, IconUser, IconUsers, IconLock, IconDots, IconPencil, IconFileDescription, IconCopy, IconClipboardCopy, IconUserShare, IconDownload, IconPrinter, IconTrash, IconCheck, IconPlus, IconPhoto, IconCloudUpload, IconMessageCircle2, IconHistory, IconCalendarEvent, IconExternalLink, IconFileText, IconChevronLeft, IconChevronRight, IconChevronDown, IconX, IconPlayerPlay, IconArrowsSort, IconColumns } from "@tabler/icons-react";

type Row = {
  id: string;
  particulars: string;
  type: string;
  status: string;
  sbu: string;
  owner: string;
  collaborators: string[];
  platforms: string[];
  publishTo: string;
  publishToPage: string;
  priority: string;
  publishingDate: string;
  dueDate: string;
  completionTime: string;
  createdDate: string;
  lastModified: string;
  startAt: string;
  endAt: string;
  needsReview: boolean;
  syncedToScheduler: boolean;
  caption: string;
  content: string;
  additionalInfo: string;
  outputLink: string;
  instagramUrl: string;
  facebookUrl: string;
  linkedinUrl: string;
  link: string;
  slackLink: string;
  attachments: { url: string; filename: string; type?: string }[];
  custom?: Record<string, unknown>;
};

type Facets = {
  sbu: string[]; type: string[]; status: string[]; owner: string[];
  priority: string[]; platforms: string[]; publishTo: string[];
};

type Data = {
  range: { from: string; to: string; days: number };
  totalInRange: number;
  rows: Row[];
  facets: Facets;
  generatedAt: string;
  latencyMs: number;
  cached?: boolean;
  openId?: string | null;
};

// One color per SBU — stable across renders so the calendar reads consistently.
const SBU_COLORS = ["#378ADD", "#5DCAA5", "#EF9F27", "#D4537E", "#7F77DD", "#F5C4B3", "#9FE1CB", "#FAC775", "#B5D4F4", "#F4C0D1", "#B4B2A9", "#F0997B"];

function sbuColor(sbu: string, all: string[]): string {
  const i = all.indexOf(sbu);
  if (i < 0) return "#B4B2A9";
  return SBU_COLORS[i % SBU_COLORS.length];
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-IN");
}

// Friendly date: "2026-07-06" → "6 Jul 2026" (the format the team uses).
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string | null | undefined): string {
  const d = (iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  const [y, m, day] = d.split("-");
  return `${parseInt(day, 10)} ${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`;
}

type Role = "writer" | "designer" | "editor" | "manager";
type TeamMember = { key: string; label: string; role: Role; aliases: string[]; color: string; displayRole: string; av: string };

// Same roster + roles/colours/avatars as the My Day team (HopeMyDay.tsx), so the
// workload reads consistently with the team's day view. Maheen assigns work, doesn't
// receive it — kept out of the workload cards.
const TEAM: TeamMember[] = [
  { key: "manya", label: "Manya", role: "writer",   aliases: ["Manya B M", "Manya"],                                color: "#E0791F", displayRole: "Content", av: "M" },
  { key: "praveen", label: "Praveen", role: "designer", aliases: ["Praveen L", "Praveen"],                          color: "#C2410C", displayRole: "Ads · Senior Graphic Designer", av: "P" },
  { key: "nikhil", label: "Nikhil", role: "editor", aliases: ["NIKHI Shyamraj", "Nikhil Shyamraj", "Nikhil"],       color: "#3A57E8", displayRole: "Video editor · short-form", av: "N" },
  { key: "nandu", label: "Nandu", role: "editor", aliases: ["Nandu C", "Nandu"],                                   color: "#3A57E8", displayRole: "Video editor · long-form", av: "Nd" },
];

const ROLE_LABEL: Record<Role, string> = {
  writer: "Content writer",
  designer: "Graphic designer",
  editor: "Video editor",
  manager: "Manager",
};

const ROLE_HIGHLIGHT: Record<Role, string> = {
  writer: "Content pending",
  designer: "Designs pending",
  editor: "Videos to edit",
  manager: "Awaiting approval",
};

function ownerMatches(owner: string, m: TeamMember): boolean {
  if (!owner) return false;
  return m.aliases.some((a) => owner.toLowerCase() === a.toLowerCase());
}

const PENDING_STATUSES = ["Content - Pending", "Content - Approved"];
const DONE_STATUSES = ["Ready to Publish", "Published/Scheduled"];

const VIDEO_TYPES = ["Reel - Cut", "Reel - Original", "YouTube Long-Form", "YouTube Shorts"];
const DESIGN_TYPES = ["Post", "Carousel", "Reel Thumbnail", "YouTube Thumbnail", "Meta Ads", "Story (Image)"];

// --- Planned-day timeline (Workload tab) ---------------------------------------
// The team doesn't log start/stop times, so we lay each person's real pending tasks
// into a suggested day-plan (9 AM–6 PM, 1h lunch). It's a PLAN, not live tracking.
const WORK_START_H = 9, WORK_END_H = 18;   // 9 AM – 6 PM
const SPAN_MIN = (WORK_END_H - WORK_START_H) * 60; // 540
const LUNCH_AT_MIN = 240;                  // ~1 PM
const LUNCH_MIN = 60;
const HOUR_TICKS = ["9 AM", "10", "11", "12", "1 PM", "2", "3", "4", "5", "6"];

// Rough time each content type takes to produce — just for laying out the plan bar.
function taskDurMin(type: string): number {
  if (VIDEO_TYPES.includes(type)) return 90;
  if (type === "Carousel") return 60;
  if (/Thumbnail/i.test(type)) return 30;
  if (/Story/i.test(type) || type === "Post" || type === "Meta Ads") return 45;
  return 60;
}
function blockColor(type: string): { bg: string; fg: string } {
  if (VIDEO_TYPES.includes(type)) return { bg: "#DDE3FB", fg: "#2A3EA8" };  // blue — video
  if (DESIGN_TYPES.includes(type)) return { bg: "#EDE9FE", fg: "#5B4AC4" }; // violet — design
  return { bg: "#E1F5EE", fg: "#0F6E56" };                                   // teal — writing/other
}

// Muted, cohesive stage palette (all one tone — no neon, no harsh navy).
const PIPELINE_STAGES = [
  { key: "Content - Pending",     label: "Content Pending",     color: "#94A3B8" },
  { key: "Content - Approved",    label: "Approved",            color: "#D9A05B" },
  { key: "Output - Ready",        label: "Output Ready",        color: "#6F9BD1" },
  { key: "Ready to Publish",      label: "Ready to Publish",    color: "#5FB196" },
  { key: "Published/Scheduled",   label: "Published",           color: "#7A74C9" },
];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Subtab → breadcrumb label, so the header reads "Marketing Hub › Pipeline" etc.
// and you always know which subtab you're on.
const SUBTAB_LABEL: Record<string, string> = {
  team: "Workload", master: "Master sheet", pipeline: "Pipeline", calendar: "Content Calendar",
};
const SUBTAB_SUBTITLE: Record<string, string> = {
  team: "Each teammate's plan and capacity for the day.",
  master: "The master sheet — every task, every column. Filter, sort, save views.",
  pipeline: "Where every task sits in production — spot what's stuck.",
  calendar: "The team's publishing schedule, month at a glance — drag to reschedule.",
};

function MarketingHubShell() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "team";
  const tab = ["team", "master", "pipeline", "calendar"].includes(tabParam) ? tabParam : "master";
  return (
    <HopeDashboardShell
      active="marketing-hub"
      title={`Marketing Hub › ${SUBTAB_LABEL[tab]}`}
      subtitle={SUBTAB_SUBTITLE[tab]}
      hideAccountPicker
      hideRange
    >
      {({ range, setRange }) => <Inner range={range} setRange={setRange} />}
    </HopeDashboardShell>
  );
}

export default function MarketingHubPage() {
  return (
    <Suspense fallback={null}>
      <MarketingHubShell />
    </Suspense>
  );
}

function Inner({ range, setRange }: { range: { from: string; to: string }; setRange: (r: { from: string; to: string }) => void }) {
  // Deep-link: /dashboard/marketing-hub?open=<mh_posts.id> opens that task.
  const openParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("open") || "" : "";

  // Sub-tab is driven by ?tab= so the sidebar folder (Master sheet · Team ·
  // Pipeline · Content calendar · Next 7 days) deep-links reactively — Next's
  // <Link> updates useSearchParams without a reload (a URL #hash would not fire
  // a hashchange on Link's pushState, so tabs wouldn't switch until refresh).
  const searchParams = useSearchParams();
  const TABS = ["team", "master", "pipeline", "calendar"];
  const tabParam = searchParams.get("tab") || "team";
  const tab = TABS.includes(tabParam) ? tabParam : "master";

  // The Content Calendar is forward-looking: it must show UPCOMING scheduled
  // content, not the retrospective "last N days" window (to = today) that the
  // Master/Workload/Pipeline tabs share. Without this the whole future half of
  // the visible month renders empty even though posts are scheduled there.
  // Fetch a wide past+future window instead (mh_posts is small, so this is cheap).
  // ponytail: fixed ±window; months outside it render empty (see byDay note ~L1070).
  const fetchRange = tab === "calendar"
    ? { from: ymd(new Date(Date.now() - 180 * 86_400_000)), to: ymd(new Date(Date.now() + 365 * 86_400_000)) }
    : range;
  const qs = new URLSearchParams({ from: fetchRange.from, to: fetchRange.to, ...(openParam ? { open: openParam } : {}) }).toString();
  const { data, isLoading, refresh } = useApi<Data>(`/api/marketing-hub?${qs}`);

  const [filters, setFilters] = useState<{ sbu: string; type: string; status: string; owner: string; priority: string }>({
    sbu: "", type: "", status: "", owner: "", priority: "",
  });
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (filters.sbu && r.sbu !== filters.sbu) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.owner && r.owner !== filters.owner) return false;
      if (filters.priority && r.priority !== filters.priority) return false;
      if (q) {
        const hay = `${r.particulars} ${r.caption} ${r.content} ${r.sbu}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, filters, search]);

  const openRow = openId ? data?.rows.find((r) => r.id === openId) || null : null;

  // Auto-open the deep-linked task (from /me), once, when its row arrives.
  useEffect(() => {
    if (openParam && data?.openId) {
      setOpenId(data.openId);
      // strip ?open so closing the modal doesn't reopen it and a manual refresh stays put
      if (typeof window !== "undefined") {
        const u = new URL(window.location.href);
        u.searchParams.delete("open");
        window.history.replaceState({}, "", u.pathname + (u.search ? u.search : ""));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.openId]);

  return (
    <div className="space-y-6">
      {/* Top bar: entries count · global search · live. Workload + Master drive their
          own filtering (person cards / views rail), so they hide the count + search. */}
      <div className="flex items-center gap-4">
        {tab !== "team" && tab !== "master" && (
          <>
            <div className="text-base text-gray-500 flex-shrink-0">
              {data ? <>{fmtInt(filtered.length)} of {fmtInt(data.totalInRange)} entries in this range{data.cached ? " · cached" : ""}</> : isLoading ? "Loading…" : ""}
            </div>
            <div className="relative flex-1 max-w-md">
              <IconSearch size={16} stroke={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks by title, caption…"
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </>
        )}
        <div className="ml-auto flex-shrink-0">
          <LiveIndicator isLoading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      {/* The Content Calendar filters inside its own card (brand chips + view toggle),
          so there's no redundant floating filter row above it — matches the Publishing
          Calendar's clean layout. Master/Workload/Pipeline have their own controls. */}

      {tab === "master" && (
        <MasterTab allRows={data?.rows || []} facets={data?.facets} range={range} setRange={setRange} onOpen={setOpenId} onSaved={refresh} loading={isLoading} />
      )}

      {tab === "team" && (
        <TeamView rows={filtered} allRows={data?.rows || []} facets={data?.facets} onOpen={setOpenId} loading={isLoading} range={range} setRange={setRange} />
      )}

      {tab === "pipeline" && (
        <PipelineView rows={filtered} facets={data?.facets} onOpen={setOpenId} loading={isLoading} />
      )}

      {tab === "calendar" && (
        <CalendarView rows={filtered} facets={data?.facets} onOpen={setOpenId} onSaved={refresh} loading={isLoading} />
      )}

      {openRow && <DetailModal row={openRow} onClose={() => setOpenId(null)} />}

      <NewTaskButton facets={data?.facets} onCreated={refresh} />

      {data && (
        <div className="text-xs text-gray-400 text-right">
          Generated {new Date(data.generatedAt).toLocaleString("en-IN")} · {data.latencyMs}ms
        </div>
      )}
    </div>
  );
}

// Was a native <select>, which renders the OS widget and reads as V1 on sight.
// HopeSelect is the themed one the Scheduler already uses.
function CompactFacet({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <HopeSelect
      value={value}
      onChange={onChange}
      placeholder={label}
      options={options.map((o) => ({ value: o, label: o }))}
    />
  );
}

// TEAM sub-tab — one card per teammate; click a card to open their full task
// list INLINE below the cards (all statuses), not a pop-up.
function TeamView({ rows, allRows, facets, onOpen, loading, range, setRange }: { rows: Row[]; allRows: Row[]; facets?: Facets; onOpen: (id: string) => void; loading: boolean; range: { from: string; to: string }; setRange: (r: { from: string; to: string }) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"today" | "week">("today");
  const daysRange = (n: number) => ({ from: ymd(new Date(Date.now() - (n - 1) * 86_400_000)), to: ymd(new Date()) });
  const activeDays = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
  const today = ymd(new Date());
  const weekAhead = ymd(new Date(Date.now() + 7 * 86_400_000));
  const weekAgo = ymd(new Date(Date.now() - 7 * 86_400_000));

  const teamCards = useMemo(() => TEAM.map((m) => {
    const mine = rows.filter((r) => ownerMatches(r.owner, m));
    let today_ = 0, week = 0, overdue_ = 0, done_ = 0, roleHighlight = 0;
    for (const r of mine) {
      const pd = r.publishingDate?.slice(0, 10) || "";
      const dd = r.dueDate?.slice(0, 10) || "";
      const isDone = DONE_STATUSES.includes(r.status);
      if (pd === today && !isDone) today_ += 1;
      if (pd && pd >= today && pd <= weekAhead && !isDone) week += 1;
      // Overdue = past its due date OR its publishing date, and not yet done.
      if (!isDone && ((dd && dd < today) || (pd && pd < today))) overdue_ += 1;
      if (r.completionTime && r.completionTime.slice(0, 10) >= weekAgo) done_ += 1;
    }
    if (m.role === "writer") {
      roleHighlight = mine.filter((r) => r.status === "Content - Pending").length;
    } else if (m.role === "designer") {
      roleHighlight = mine.filter((r) => DESIGN_TYPES.includes(r.type) && PENDING_STATUSES.includes(r.status)).length;
    } else if (m.role === "editor") {
      roleHighlight = mine.filter((r) => VIDEO_TYPES.includes(r.type) && PENDING_STATUSES.includes(r.status)).length;
    } else if (m.role === "manager") {
      roleHighlight = rows.filter((r) => r.needsReview).length;
    }
    return { member: m, mine, today: today_, week, overdue: overdue_, done: done_, roleHighlight };
  }), [rows, today, weekAgo, weekAhead]);

  if (loading && rows.length === 0) {
    return <div className="bg-white border border-gray-100 rounded-lg p-10 text-center text-gray-400">Loading team…</div>;
  }

  const selMember = selected ? TEAM.find((m) => m.key === selected) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
          <button onClick={() => setView("today")} className={`text-xs font-medium px-3.5 py-1.5 rounded-md transition ${view === "today" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>Today</button>
          <button onClick={() => setView("week")} className={`text-xs font-medium px-3.5 py-1.5 rounded-md transition ${view === "week" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>Tasks</button>
        </div>
        <span className="text-[11px] text-gray-400">{view === "today" ? "Each person's plan for today — timeline + tasks." : "Click a person to open their full task list for the selected range."}</span>
        {view === "week" && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
              {[7, 30, 60, 90].map((n) => (
                <button key={n} onClick={() => setRange(daysRange(n))}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition ${activeDays === n ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"}`}>{n}d</button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ from: e.target.value, to: range.to })}
                className="border border-gray-200 rounded-md px-2 py-1 text-[11px] text-gray-700" />
              <span>→</span>
              <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ from: range.from, to: e.target.value })}
                className="border border-gray-200 rounded-md px-2 py-1 text-[11px] text-gray-700" />
            </div>
          </div>
        )}
      </div>

      {view === "today" ? (
        <div className="space-y-3">
          {teamCards.map((c) => <PersonTimelineRow key={c.member.key} card={c} />)}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {teamCards.map((c) => (
              <TeamMemberCard
                key={c.member.key}
                card={c}
                selected={c.member.key === selected}
                onOpenPanel={() => setSelected((prev) => (prev === c.member.key ? null : c.member.key))}
              />
            ))}
          </div>
          {selMember && (
            <PersonPanel member={selMember} allRows={allRows} facets={facets} onOpen={onOpen} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </div>
  );
}

// One teammate as a full-width row: a planned day-plan timeline built from their real
// pending tasks (like the My Day "Team capacity" view, but data-backed), plus the
// now/next line and the real Today / This week / Overdue / Done counts.
function blockGradient(type: string): string {
  if (VIDEO_TYPES.includes(type)) return "linear-gradient(135deg,#5A6FF0,#3A57E8)";   // video — blue
  if (DESIGN_TYPES.includes(type)) return "linear-gradient(135deg,#8E7BF0,#6D5CE7)";  // design — violet
  return "linear-gradient(135deg,#2FB98D,#0F9E75)";                                    // writing/other — teal
}
const fmtDur = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${h ? h + "h " : ""}${mm}m`; };

function PersonTimelineRow({ card }: {
  card: { member: TeamMember; mine: Row[]; today: number; week: number; overdue: number; done: number; roleHighlight: number };
}) {
  const { member, mine, today, week, overdue, done, roleHighlight } = card;

  // Today's queue = not-done tasks, most urgent (soonest due) first.
  const queue = mine
    .filter((r) => !DONE_STATUSES.includes(r.status))
    .map((r) => ({ r, due: (r.dueDate || r.publishingDate || "").slice(0, 10) || "9999" }))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));

  type Blk = { kind: "task" | "lunch" | "free"; label: string; dur: number; row?: Row; start: number };
  const blocks: Blk[] = [];
  let cur = 0, lunchDone = false, overflow = 0;
  for (const q of queue) {
    if (!lunchDone && cur >= LUNCH_AT_MIN) { blocks.push({ kind: "lunch", label: "Lunch", dur: LUNCH_MIN, start: cur }); cur += LUNCH_MIN; lunchDone = true; }
    if (cur >= SPAN_MIN - (lunchDone ? 0 : LUNCH_MIN)) { overflow++; continue; }
    const d = taskDurMin(q.r.type);
    blocks.push({ kind: "task", label: q.r.particulars || q.r.type || "Task", dur: d, row: q.r, start: cur });
    cur += d;
  }
  if (!lunchDone) { blocks.push({ kind: "lunch", label: "Lunch", dur: LUNCH_MIN, start: cur }); cur += LUNCH_MIN; }
  const free = Math.max(0, SPAN_MIN - cur);
  if (free > 0) blocks.push({ kind: "free", label: "Free", dur: free, start: cur });
  const taskBlocks = blocks.filter((b) => b.kind === "task");

  const now = new Date();
  const nowMin = (now.getHours() - WORK_START_H) * 60 + now.getMinutes();
  const nowPct = nowMin >= 0 && nowMin <= SPAN_MIN ? (nowMin / SPAN_MIN) * 100 : null;
  const currentBlk = blocks.find((b) => b.kind === "task" && nowMin >= b.start && nowMin < b.start + b.dur) || null;
  const nextBlk = blocks.find((b) => b.kind === "task" && b.start >= nowMin) || blocks.find((b) => b.kind === "task") || null;
  const focus = currentBlk || nextBlk;

  const freeH = Math.floor(free / 60);
  const SLOT_MIN = 60;                                  // rough size of "one more task"
  const roomForMore = Math.floor(free / SLOT_MIN);      // how many extra tasks would still fit today
  // Badge: overbooked (tasks spilling to later this week) → red; fully booked → red;
  // otherwise how much of the 9h day is still open.
  const badge = overflow > 0
    ? { text: `Overbooked · ${overflow} spill over`, cls: "bg-rose-50 text-rose-700" }
    : free <= 0
    ? { text: "Fully booked", cls: "bg-rose-50 text-rose-700" }
    : { text: `${fmtDur(free)} free`, cls: freeH >= 2 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700" };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-2.5">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-semibold flex-shrink-0" style={{ background: member.color }}>{member.av}</span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-gray-900 leading-tight">{member.label}</div>
          <div className="text-[11px] text-gray-500">{member.displayRole} · <span className="font-medium text-gray-700">{roleHighlight}</span> {ROLE_HIGHLIGHT[member.role].toLowerCase()}</div>
        </div>
        <span className={`ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.text}</span>
      </div>

      {/* Timeline bar — matches My Day "Today's plan": tall 116px track, gradient
          blocks with a name + "Type · duration" meta line, hatched lunch/free. */}
      <div className="flex font-mono text-[10px] text-gray-400 mb-1.5 select-none px-px">
        {HOUR_TICKS.map((h, i) => <div key={i} className="flex-1 text-left">{h}</div>)}
      </div>
      <div className="relative flex h-28 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
        {blocks.map((b, i) => {
          if (b.kind === "lunch") return (
            <div key={i} style={{ flexGrow: b.dur }} className="min-w-0 flex flex-col justify-center px-3 text-gray-500 border-r border-white/50 bg-[repeating-linear-gradient(45deg,#EAEDF5,#EAEDF5_6px,#DFE3EE_6px,#DFE3EE_12px)]">
              <span className="text-[13px] font-semibold leading-tight truncate">Lunch</span>
              <span className="text-[10px] opacity-90 mt-0.5 truncate">1h · protected</span>
            </div>
          );
          if (b.kind === "free") return (
            <div key={i} style={{ flexGrow: b.dur }} className="min-w-0 flex flex-col justify-center px-3 text-gray-400 bg-[repeating-linear-gradient(45deg,#F3F5F9,#F3F5F9_6px,#E9ECF2_6px,#E9ECF2_12px)]">
              <span className="text-[13px] font-semibold leading-tight truncate">Free</span>
              <span className="text-[10px] opacity-90 mt-0.5 truncate">{fmtDur(b.dur)} open</span>
            </div>
          );
          const isNow = b === currentBlk;
          return (
            <div key={i} style={{ flexGrow: b.dur, backgroundImage: blockGradient(b.row?.type || "") }}
              className={`min-w-0 flex flex-col justify-center px-3 text-white border-r border-white/20 ${isNow ? "ring-2 ring-inset ring-white/70" : ""}`} title={b.label}>
              <span className="text-[13px] font-semibold leading-tight truncate">{b.label}</span>
              <span className="text-[10px] opacity-85 mt-0.5 truncate">{b.row?.type || "Task"} · {fmtDur(b.dur)}{isNow ? " · now" : ""}</span>
            </div>
          );
        })}
        {nowPct != null && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-[#DC2E2E] z-10" style={{ left: `${nowPct}%` }}>
            <span className="absolute -top-[3px] -left-[3px] w-2 h-2 rounded-full bg-[#DC2E2E]" />
          </div>
        )}
      </div>

      {/* Currently on / next */}
      <div className="mt-2 text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
        {focus
          ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 align-middle mr-1.5" />{currentBlk ? "Now" : "Next up"}: <b className="text-gray-900">{focus.label}</b></>
          : <span className="text-gray-400">Nothing pending — all clear.</span>}
      </div>

      {/* Task list — always visible: name · primary interest · time */}
      {taskBlocks.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
            Today&apos;s tasks{overflow > 0 && <span className="normal-case tracking-normal text-rose-500"> · {overflow} more queued this week</span>}
          </div>
          <div className="space-y-2">
            {taskBlocks.map((b, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundImage: blockGradient(b.row?.type || "") }} />
                <span className="text-gray-800 font-medium truncate flex-1 min-w-0" title={b.label}>{i + 1}. {b.label}</span>
                <span className="text-gray-500 flex-shrink-0 whitespace-nowrap">{b.row?.sbu || "—"}</span>
                <span className="text-gray-400 tabular-nums flex-shrink-0 w-16 text-right">{fmtDur(b.dur)}</span>
              </div>
            ))}
          </div>

          {/* Capacity / free-time line — can this person take on more today? */}
          <div className="mt-2.5 pt-2.5 border-t border-dashed border-gray-200 flex items-center gap-2 text-[12.5px]">
            {overflow > 0 ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-rose-500" />
                <span className="text-rose-700 font-medium">Fully booked</span>
                <span className="text-gray-500">— {overflow} task{overflow > 1 ? "s" : ""} pushed to later this week</span>
              </>
            ) : free > 0 ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-emerald-500" />
                <span className="text-emerald-700 font-medium">Free time · {fmtDur(free)} open</span>
                <span className="text-gray-500">
                  — room for {roomForMore >= 1 ? `~${roomForMore} more task${roomForMore > 1 ? "s" : ""}` : "a short task"}
                </span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-amber-500" />
                <span className="text-amber-700 font-medium">Fully booked for today</span>
                <span className="text-gray-500">— no free slots left</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* No tasks today — still surface that they're free to take work on */}
      {taskBlocks.length === 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3 flex items-center gap-2 text-[12.5px]">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-emerald-500" />
          <span className="text-emerald-700 font-medium">Fully free today</span>
          <span className="text-gray-500">— available for a full day of work</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 mt-2.5 pt-2.5 border-t border-gray-100 text-[11px] text-gray-500 tabular-nums">
        <span>Today <b className="text-gray-900">{today}</b></span>
        <span>This week <b className="text-gray-900">{week}</b></span>
        <span>Overdue <b className={overdue ? "text-rose-600" : "text-gray-900"}>{overdue}</b></span>
        <span>Done · 7d <b className="text-gray-900">{done}</b></span>
      </div>
    </div>
  );
}

// PIPELINE sub-tab — team-wide stat strip + a proportional pipeline bar; click a
// stage to drill into a table of every task at that stage across all SBUs.
function PipelineView({ rows, facets, onOpen, loading }: { rows: Row[]; facets?: Facets; onOpen: (id: string) => void; loading: boolean }) {
  const today = ymd(new Date());
  const weekAgo = ymd(new Date(Date.now() - 7 * 86_400_000));
  const allSbus = facets?.sbu || [];

  const totals = useMemo(() => {
    let publishingToday = 0, overdue = 0, awaitingApproval = 0, completedThisWeek = 0, inProgress = 0;
    for (const r of rows) {
      const pd = r.publishingDate?.slice(0, 10) || "";
      const dd = r.dueDate?.slice(0, 10) || "";
      const isDone = DONE_STATUSES.includes(r.status);
      if (pd === today && !isDone) publishingToday += 1;
      if (dd && dd < today && !isDone) overdue += 1;
      if (r.needsReview) awaitingApproval += 1;
      if (r.completionTime && r.completionTime.slice(0, 10) >= weekAgo) completedThisWeek += 1;
      if (r.status === "Content - Approved") inProgress += 1;
    }
    return { publishingToday, overdue, awaitingApproval, completedThisWeek, inProgress };
  }, [rows, today, weekAgo]);

  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of PIPELINE_STAGES) counts[s.key] = 0;
    for (const r of rows) if (counts[r.status] !== undefined) counts[r.status] += 1;
    return PIPELINE_STAGES.map((s) => ({ ...s, count: counts[s.key] }));
  }, [rows]);
  const total = pipeline.reduce((a, s) => a + s.count, 0);

  // Bottleneck signal — how long in-production work has sat untouched. We don't
  // track per-stage entry times, so age = days since last modified (fallback:
  // created). Per non-done stage: avg age + count stale (>7d); plus the oldest.
  const attention = useMemo(() => {
    const active = rows.filter((r) => !DONE_STATUSES.includes(r.status));
    const ageDays = (r: Row) => {
      const base = (r.lastModified || r.createdDate || "").slice(0, 10);
      if (!base) return 0;
      return Math.max(0, Math.round((Date.parse(today) - Date.parse(base)) / 86_400_000));
    };
    const perStage = PIPELINE_STAGES.filter((s) => !DONE_STATUSES.includes(s.key)).map((s) => {
      const inStage = active.filter((r) => r.status === s.key);
      const avg = inStage.length ? Math.round(inStage.reduce((a, r) => a + ageDays(r), 0) / inStage.length) : 0;
      const stale = inStage.filter((r) => ageDays(r) >= 7).length;
      return { ...s, count: inStage.length, avg, stale };
    });
    const oldest = [...active]
      .map((r) => ({ r, age: ageDays(r) }))
      .sort((a, b) => b.age - a.age)
      .slice(0, 5);
    return { perStage, oldest };
  }, [rows, today]);

  const [selected, setSelected] = useState<string>(PIPELINE_STAGES[0].key);
  const stage = PIPELINE_STAGES.find((s) => s.key === selected) || PIPELINE_STAGES[0];
  const stageRows = rows.filter((r) => r.status === selected);

  if (loading && rows.length === 0) {
    return <div className="bg-white border border-gray-100 rounded-lg p-10 text-center text-gray-400">Loading pipeline…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Team-wide totals */}
      <div className="grid grid-cols-5 gap-4">
        <BigStat label="Publishing today" value={totals.publishingToday} accent="#378ADD" />
        <BigStat label="Approved" value={totals.inProgress} accent="#EF9F27" />
        <BigStat label="Overdue" value={totals.overdue} accent="#D4537E" alarm />
        <BigStat label="Awaiting approval" value={totals.awaitingApproval} accent="#7F77DD" />
        <BigStat label="Completed this week" value={totals.completedThisWeek} accent="#5DCAA5" />
      </div>

      {/* Stage cards — one card per pipeline stage; click to drill in. */}
      <div className="bg-white border border-gray-100 rounded-lg p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-lg font-medium">Content pipeline</div>
            <div className="text-sm text-gray-500">Where everything sits right now — click a stage to see its tasks.</div>
          </div>
          <div className="text-sm text-gray-400">{fmtInt(total)} total</div>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {pipeline.map((s) => {
            const isSel = s.key === selected;
            const pct = total ? Math.round((s.count / total) * 100) : 0;
            return (
              <button
                key={s.key}
                onClick={() => setSelected(s.key)}
                className={`text-left rounded-xl border p-4 flex flex-col gap-2 transition-colors ${isSel ? "border-gray-300 bg-gray-50" : "border-gray-100 hover:bg-gray-50/60"}`}
              >
                <span className="text-xs text-gray-500 truncate">{s.label}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-medium text-gray-900 leading-none">{fmtInt(s.count)}</span>
                  <span className="text-xs text-gray-400">{pct}%</span>
                </span>
                <span className="h-1 rounded mt-1" style={{ background: s.color }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottleneck insight — where in-production work is sitting untouched */}
      <div className="bg-white border border-gray-100 rounded-lg p-5">
        <div className="text-lg font-medium mb-1">Where it&apos;s stuck</div>
        <div className="text-sm text-gray-500 mb-4">How long in-production work has sat untouched — chase the oldest first.</div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {attention.perStage.map((s) => (
            <div key={s.key} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <div><span className="text-2xl font-medium">{s.avg}</span><span className="text-xs text-gray-400 ml-1">avg days</span></div>
                {s.stale > 0
                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">{s.stale} stale · &gt;7d</span>
                  : s.count > 0 ? <span className="text-xs text-gray-400">{s.count} moving</span> : <span className="text-xs text-gray-300">empty</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Oldest waiting</div>
        {attention.oldest.length === 0 ? (
          <div className="text-sm text-gray-400 py-2">Nothing in production right now. Team is clear.</div>
        ) : (
          <div className="space-y-1">
            {attention.oldest.map(({ r, age }) => (
              <button key={r.id} onClick={() => onOpen(r.id)} className="w-full text-left flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                <span className={`text-sm font-medium w-12 text-right tabular-nums ${age >= 7 ? "text-rose-600" : "text-gray-700"}`}>{age}d</span>
                <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{r.particulars || "(untitled)"}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{r.status} · {r.owner || "Unassigned"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drill-down table — tasks at the selected stage, all SBUs */}
      <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: stage.color }} />
            <span className="text-base font-medium">{stage.label}</span>
            <span className="text-sm text-gray-400">· {fmtInt(stageRows.length)} tasks · all SBUs</span>
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 sticky top-0">
              <tr className="text-gray-500 text-left">
                <th className="px-4 py-2.5 font-normal">Publish</th>
                <th className="px-4 py-2.5 font-normal">SBU</th>
                <th className="px-4 py-2.5 font-normal">Title</th>
                <th className="px-4 py-2.5 font-normal">Type</th>
                <th className="px-4 py-2.5 font-normal">Owner</th>
                <th className="px-4 py-2.5 font-normal">Priority</th>
              </tr>
            </thead>
            <tbody>
              {stageRows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Nothing sitting at this stage.</td></tr>
              )}
              {stageRows.map((r) => (
                <tr key={r.id} onClick={() => onOpen(r.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(r.publishingDate)}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sbuColor(r.sbu, allSbus) }} />
                      {r.sbu || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{r.particulars || "(untitled)"}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.type || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.owner || "—"}</td>
                  <td className="px-4 py-2.5">{r.priority || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, value, accent, alarm }: { label: string; value: number; accent: string; alarm?: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-medium mt-2" style={alarm && value > 0 ? { color: accent } : { color: "#111" }}>
        {fmtInt(value)}
      </div>
      <div className="h-1 rounded mt-3" style={{ background: accent + (value > 0 ? "" : "44") }} />
    </div>
  );
}

function TeamMemberCard({ card, onOpenPanel, selected }: {
  card: { member: TeamMember; mine: Row[]; today: number; week: number; overdue: number; done: number; roleHighlight: number };
  onOpenPanel: () => void;
  selected?: boolean;
}) {
  const { member: m } = card;

  return (
    <div
      onClick={onOpenPanel}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenPanel(); } }}
      className={`bg-white border rounded-lg p-5 flex flex-col cursor-pointer hover:border-brand hover:shadow-sm transition ${selected ? "border-brand ring-1 ring-brand/30" : "border-gray-100"}`}
    >
      <div className="flex items-center gap-3 mb-4 w-full">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0" style={{ background: m.color }}>
          {m.av}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium">{m.label}</div>
          <div className="text-xs text-gray-500 truncate">{m.displayRole}</div>
        </div>
        <div className={`text-xs ${selected ? "text-brand font-medium" : "text-gray-400"}`}>{selected ? "Showing ↓" : "Open ↓"}</div>
      </div>

      <div className="rounded p-3 mb-3" style={{ background: m.color + "11" }}>
        <div className="text-xs uppercase tracking-wide" style={{ color: m.color }}>{ROLE_HIGHLIGHT[m.role]}</div>
        <div className="text-2xl font-medium mt-1">{fmtInt(card.roleHighlight)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <MiniStat label="Today" value={card.today} />
        <MiniStat label="This week" value={card.week} />
        <MiniStat label="Overdue" value={card.overdue} alarm={card.overdue > 0} />
        <MiniStat label="Done · 7d" value={card.done} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-medium mt-0.5 ${alarm ? "text-rose-600" : ""}`}>{fmtInt(value)}</div>
    </div>
  );
}

const DATE_PRESETS: [string, string][] = [
  ["all", "All"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["yesterday", "Yesterday"],
  ["last3", "Last 3 days"], ["week", "This week"], ["custom", "Custom"],
];
function statusColor(status: string): string {
  return PIPELINE_STAGES.find((s) => s.key === status)?.color || "#94A3B8";
}
function priorityColor(p: string): string {
  const v = (p || "").toLowerCase();
  if (v.includes("high") || v.includes("urgent")) return "#E24B4A";
  if (v.includes("med")) return "#EF9F27";
  return "#B4B2A9";
}

// Renders INLINE below the team cards (not a modal): one person's whole workload
// — colored KPI chips, a date filter (presets + custom range), a Group-by
// dropdown, status pills, and a colour-differentiated task table.
function PersonPanel({ member, allRows, facets, onOpen, onClose }: {
  member: TeamMember;
  allRows: Row[];
  facets?: Facets;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const allSbus = facets?.sbu || [];
  const todayStr = ymd(new Date());
  const weekAhead = ymd(new Date(Date.now() + 7 * 86_400_000));
  const weekAgo = ymd(new Date(Date.now() - 7 * 86_400_000));
  const off = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));

  const mine = useMemo(() => allRows.filter((r) => ownerMatches(r.owner, member)), [allRows, member]);

  // Mutually-exclusive urgency buckets for the drill-down. A task lands in exactly
  // one of: overdue → due today → this week → upcoming; done (completed) is separate.
  const sections = useMemo(() => {
    const overdue: Row[] = [], today_: Row[] = [], week: Row[] = [], upcoming: Row[] = [], done: Row[] = [];
    for (const r of mine) {
      if (DONE_STATUSES.includes(r.status)) { done.push(r); continue; }
      const pd = r.publishingDate?.slice(0, 10) || "";
      const dd = r.dueDate?.slice(0, 10) || "";
      const ref = pd || dd;
      // Overdue = past its due date OR its publishing date (whichever exists).
      if ((dd && dd < todayStr) || (pd && pd < todayStr)) overdue.push(r);
      else if (ref && ref === todayStr) today_.push(r);
      else if (ref && ref > todayStr && ref <= weekAhead) week.push(r);
      else upcoming.push(r);
    }
    const byRef = (a: Row, b: Row) => (a.publishingDate || a.dueDate || "9999").localeCompare(b.publishingDate || b.dueDate || "9999");
    // Sort overdue by the earliest past date (most overdue first).
    const overdueKey = (r: Row) => {
      const past = [(r.dueDate || "").slice(0, 10), (r.publishingDate || "").slice(0, 10)].filter((d) => d && d < todayStr).sort();
      return past[0] || "9999";
    };
    overdue.sort((a, b) => overdueKey(a).localeCompare(overdueKey(b)));
    [today_, week, upcoming].forEach((g) => g.sort(byRef));
    done.sort((a, b) => (b.completionTime || "").localeCompare(a.completionTime || ""));
    return { overdue, today: today_, week, upcoming, done };
  }, [mine, todayStr, weekAhead]);

  const openCount = sections.overdue.length + sections.today.length + sections.week.length + sections.upcoming.length;

  const renderRow = (r: Row, opts?: { overdue?: boolean; done?: boolean }) => {
    const sp = statusPill(r.status);
    // Days overdue counts from the earliest past date (due date or publishing date).
    const pastRef = [(r.dueDate || "").slice(0, 10), (r.publishingDate || "").slice(0, 10)].filter((d) => d && d < todayStr).sort()[0] || null;
    const daysOver = opts?.overdue && pastRef ? Math.max(0, Math.round((Date.parse(todayStr) - Date.parse(pastRef)) / 86_400_000)) : null;
    const dateShown = opts?.done ? r.completionTime : (r.publishingDate || r.dueDate);
    return (
      <div key={r.id} onClick={() => onOpen(r.id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
        <span className="text-sm text-gray-800 flex-1 min-w-0 truncate" title={r.particulars}>{r.particulars || <span className="text-gray-400 italic">Untitled</span>}</span>
        <span className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap hidden sm:inline">{r.sbu || "—"}</span>
        {r.status && <span className="text-xs px-2 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap" style={{ background: sp.bg, color: sp.text }}>{r.status}</span>}
        {daysOver != null && <span className="text-xs px-2 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap bg-rose-100 text-rose-700">{daysOver}d overdue</span>}
        <span className="text-xs text-gray-400 flex-shrink-0 w-24 text-right">{opts?.done ? "done · " : ""}{fmtDate(dateShown)}</span>
      </div>
    );
  };

  const GROUPS: { key: string; label: string; dot: string; text: string; bg: string; rows: Row[]; opts?: { overdue?: boolean; done?: boolean } }[] = [
    { key: "overdue", label: "Overdue", dot: "#D8342F", text: "#B4231F", bg: "#FCEBEC", rows: sections.overdue, opts: { overdue: true } },
    { key: "today", label: "Due today", dot: "#3A57E8", text: "#2138B0", bg: "#E6F1FB", rows: sections.today },
    { key: "week", label: "This week", dot: "#6D5CE7", text: "#4F3FC0", bg: "#EEEDFE", rows: sections.week },
    { key: "upcoming", label: "Upcoming", dot: "#7A8290", text: "#5A6472", bg: "#F1F2F5", rows: sections.upcoming },
    { key: "done", label: "Done", dot: "#0F9E75", text: "#0F6E56", bg: "#E1F5EE", rows: sections.done, opts: { done: true } },
  ];

  return (
    <div className="space-y-3">
      {/* Header bar (its own box) */}
      <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: member.color }}>
            {member.av}
          </div>
          <div>
            <div className="text-base font-medium">{member.label} · full task list</div>
            <div className="text-sm text-gray-500">{member.displayRole} · everything in the selected range</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-md px-2.5 py-1 whitespace-nowrap">{openCount} open · <span className={sections.overdue.length ? "text-rose-600 font-medium" : ""}>{sections.overdue.length} overdue</span></span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="Close">×</button>
        </div>
      </div>

      {/* One separate box per urgency group: Overdue → Due today → This week → Upcoming → Done */}
      {openCount === 0 && sections.done.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-10 text-center text-gray-400 text-sm">No tasks for {member.label} in this range.</div>
      ) : GROUPS.map((g) => g.rows.length > 0 && (
        <div key={g.key} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100" style={{ background: g.bg }}>
            <span className="w-2 h-2 rounded-full" style={{ background: g.dot }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: g.text }}>{g.label}</span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-white/70" style={{ color: g.text }}>{g.rows.length}</span>
          </div>
          <div className="divide-y divide-gray-50">{g.rows.map((r) => renderRow(r, g.opts))}</div>
        </div>
      ))}
    </div>
  );
}

const MHCAL_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MHCAL_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Status → pill palette. Mirrors the Hope UI publishing calendar's approach: soft-tinted
// bg + matching border + colored text so status is legible at a glance across the grid.
// Unmapped statuses fall through to the neutral gray.
// Near-white fills (a hint of tint, never a saturated block) + a matching border and
// DARK text — so a bar reads white-ish at a glance but still colour-codes its status.
const CAL_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Content - Pending":     { bg: "#F8F9FC", text: "#3F4757", border: "#DDE1E9" },
  "Content - Approved":    { bg: "#F1FBF7", text: "#0E6A52", border: "#C7E7DA" },
  "Output - Ready":        { bg: "#F2F6FF", text: "#1E338F", border: "#CFD9F7" },
  "Ready to Publish":      { bg: "#F1FBF5", text: "#146F36", border: "#CBE9D9" },
  "Published/Scheduled":   { bg: "#F5F4FE", text: "#372F80", border: "#DAD7FB" },
};
function calStatusStyle(s: string): { bg: string; text: string; border: string } {
  return CAL_STATUS_COLORS[s] || { bg: "#F1F3F8", text: "#5B6472", border: "#D3D8E1" };
}

// Mirrors the Publishing Calendar (calendar/HopeCalendar.tsx / Hope reference) so the two
// pages read as siblings: soft-tinted event bars with dark readable text, a toolbar INSIDE
// the card (‹ › Today · title · Month/Week/Day/List), taller cells. Tokens hardcoded to the
// HopeShell values since the Marketing Hub renders under HopeDashboardShell.
const MHCAL_CSS = `
.mhcal{color:#232D42}
.mhcal button{font-family:inherit;cursor:pointer}
/* Hero band — indigo→violet ramp, distinct from the publishing calendar's blue */
.mhcal-hero{position:relative;background:linear-gradient(115deg,#4C4CE2 0%,#6F5BEA 50%,#8B6DF2 100%);border-radius:16px;padding:1.35rem 1.7rem 3.2rem;color:#fff;overflow:hidden;display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
.mhcal-hero::after{content:"";position:absolute;right:-40px;top:-60px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.16),transparent 62%)}
.mhcal-hero::before{content:"";position:absolute;right:120px;bottom:-90px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.10),transparent 62%)}
.mhcal-hero-txt{position:relative;z-index:1;max-width:640px}
.mhcal-hero-tag{display:inline-block;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;background:rgba(255,255,255,.22);padding:.22rem .6rem;border-radius:20px;margin-bottom:.5rem}
.mhcal-hero-txt h1{margin:0;font-size:1.6rem;font-weight:800;letter-spacing:-.018em;line-height:1.15;color:#fff}
.mhcal-hero-txt p{margin:.32rem 0 0;font-size:.88rem;color:rgba(255,255,255,.95);line-height:1.45}
.mhcal-hero-stat{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-end;gap:.15rem;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);padding:.7rem 1rem;border-radius:12px;backdrop-filter:blur(2px);min-width:125px}
.mhcal-hero-statv{font-size:1.55rem;font-weight:800;letter-spacing:-.02em;line-height:1}
.mhcal-hero-statl{font-size:.64rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.82)}
/* Title card, pulled up to overlap the hero — mirrors the reference's "Calendar" card */
.mhcal-titlecard{position:relative;z-index:2;margin:-2.35rem 1rem 0;background:#fff;border:1px solid #EEF0F4;border-radius:14px;box-shadow:0 10px 30px rgba(35,45,66,.06);padding:.9rem 1.3rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}
.mhcal-titlecard h4{margin:0;font-size:1.15rem;font-weight:700;color:#232D42;letter-spacing:-.012em}
.mhcal-live{display:inline-flex;align-items:center;gap:.4rem;font-size:.76rem;font-weight:600;color:#8A92A6}
.mhcal-live .dot{width:7px;height:7px;border-radius:50%;background:#1AA053}
/* Brand filter — pill chips, one-click SBU isolate */
.mhcal-brands{display:flex;align-items:center;gap:.4rem;margin-top:.8rem;padding:.65rem .8rem;background:#fff;border:1px solid #EEF0F4;border-radius:12px;overflow-x:auto;scrollbar-width:thin}
.mhcal-brands::-webkit-scrollbar{height:6px}
.mhcal-brands::-webkit-scrollbar-thumb{background:#D3D8E1;border-radius:3px}
.mhcal-brands-lbl{font-size:.66rem;text-transform:uppercase;letter-spacing:.09em;color:#A6ACBE;font-weight:700;padding-right:.5rem;flex:0 0 auto}
.mhcal-brand{display:inline-flex;align-items:center;gap:.42rem;padding:.4rem .78rem;border-radius:99px;background:#F7F8FC;color:#4A5468;font-size:.75rem;font-weight:500;border:1px solid transparent;flex:0 0 auto;transition:.15s;white-space:nowrap}
.mhcal-brand:hover{background:#EDEFF5;color:#232D42}
.mhcal-brand.on{background:#232D42;color:#fff}
.mhcal-brand .bdot{width:8px;height:8px;border-radius:50%;flex:0 0 8px}
.mhcal-brand .bcount{opacity:.7;font-weight:500;font-size:.68rem;font-variant-numeric:tabular-nums}
.mhcal-brand.on .bcount{opacity:.85}
/* Calendar card + toolbar (toolbar INSIDE the card, like the reference) */
.mhcal-card{background:#fff;border:1px solid #EEF0F4;border-radius:16px;box-shadow:0 10px 30px rgba(35,45,66,.06);overflow:hidden;margin-top:.9rem}
.mhcal-toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.1rem;flex-wrap:wrap}
.mhcal-nav{display:flex;align-items:center;gap:.4rem}
.mhcal-navbtn{width:34px;height:34px;border-radius:9px;border:none;background:#3A57E8;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(58,87,232,.22)}
.mhcal-navbtn:hover{background:#2f49c9}
.mhcal-today{border:none;background:#E9ECFB;color:#2138B0;font-weight:600;font-size:.78rem;padding:.5rem .9rem;border-radius:9px;margin-left:.2rem}
.mhcal-today:hover{background:#dfe3fa}
.mhcal-title{font-size:1.35rem;font-weight:700;color:#232D42;text-align:center;flex:1;min-width:180px}
.mhcal-views{display:flex;background:#F7F8FC;border:1px solid #EEF0F4;border-radius:10px;padding:3px;gap:2px}
.mhcal-viewbtn{border:none;background:none;font-size:.76rem;font-weight:600;color:#4A5468;padding:.38rem .75rem;border-radius:7px}
.mhcal-viewbtn:hover{color:#232D42}
.mhcal-viewbtn.on{background:#3A57E8;color:#fff;box-shadow:0 3px 8px rgba(58,87,232,.24)}
/* month grid */
.mhcal-dow{display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid #EEF0F4;background:#F7F8FC}
.mhcal-dow span{padding:.55rem .6rem;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8A92A6;border-right:1px solid #EEF0F4}
.mhcal-dow span:last-child{border-right:none}
.mhcal-grid{display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:minmax(134px,1fr)}
.mhcal-cell{border-right:1px solid #EEF0F4;border-top:1px solid #EEF0F4;padding:.35rem;position:relative;min-width:0;transition:background .15s}
.mhcal-cell:nth-child(7n){border-right:none}
.mhcal-cell.out{background:#F7F8FC}
.mhcal-cell.today{background:rgba(58,87,232,.05)}
.mhcal-cell.over{background:rgba(58,87,232,.10);box-shadow:inset 0 0 0 2px rgba(58,87,232,.35)}
.mhcal-daynum{text-align:right;font-size:.74rem;font-weight:600;color:#4A5468;padding:.05rem .25rem .2rem;font-variant-numeric:tabular-nums}
.mhcal-cell.out .mhcal-daynum{color:#A6ACBE}
.mhcal-cell.today .mhcal-daynum{display:inline-flex;float:right;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:#3A57E8;color:#fff}
.mhcal-events{display:flex;flex-direction:column;gap:3px;clear:both}
/* Event bar — soft-tinted fill + matching border + DARK readable text (matches the
   reference exactly). SBU shows as a small left dot; brand lives in the filter chips. */
.mhcal-ev{display:flex;align-items:center;gap:6px;width:100%;text-align:left;border:1px solid;border-radius:6px;padding:4px 8px;overflow:hidden;transition:filter .1s;cursor:grab}
.mhcal-ev:hover{filter:brightness(.97)}
.mhcal-ev:active{cursor:grabbing}
.mhcal-ev.block .mhcal-evtitle{white-space:normal}
.mhcal-evdot{width:8px;height:8px;border-radius:2px;flex:0 0 8px}
.mhcal-evtitle{font-size:.82rem;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-.006em}
.mhcal-more{border:none;background:none;font-size:.64rem;color:#8A92A6;text-align:left;padding:1px 5px;font-weight:600}
.mhcal-more:hover{color:#3A57E8}
/* week */
.mhcal-week{display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid #EEF0F4}
.mhcal-weekcol{border-right:1px solid #EEF0F4;min-height:360px;transition:background .15s}
.mhcal-weekcol:last-child{border-right:none}
.mhcal-weekcol.today{background:rgba(58,87,232,.04)}
.mhcal-weekcol.over{background:rgba(58,87,232,.09);box-shadow:inset 0 0 0 2px rgba(58,87,232,.3)}
.mhcal-weekhead{display:flex;flex-direction:column;align-items:center;gap:2px;padding:.5rem;border-bottom:1px solid #EEF0F4}
.mhcal-weekdow{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8A92A6}
.mhcal-weeknum{font-size:1rem;font-weight:700;color:#232D42}
.mhcal-weeknum.today{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#3A57E8;color:#fff}
.mhcal-weekbody{display:flex;flex-direction:column;gap:4px;padding:.45rem}
.mhcal-empty{color:#A6ACBE;font-size:.78rem;text-align:center;padding-top:.6rem}
/* day */
.mhcal-day{border-top:1px solid #EEF0F4;padding:.7rem 1rem 1rem}
.mhcal-dayrow{display:flex;align-items:center;gap:.8rem;width:100%;text-align:left;border-bottom:1px solid #F3F5F9;padding:.55rem .2rem}
.mhcal-dayempty{padding:2.5rem 1rem;text-align:center;color:#8A92A6;font-size:.85rem}
/* list / agenda */
.mhcal-agenda{border-top:1px solid #EEF0F4;padding:.4rem 0}
.mhcal-agroup{display:flex;gap:1rem;padding:.7rem 1.1rem;border-bottom:1px solid #F3F5F9}
.mhcal-adate{display:flex;flex-direction:column;align-items:center;flex:0 0 46px;padding-top:.2rem}
.mhcal-adow{font-size:.6rem;font-weight:700;text-transform:uppercase;color:#8A92A6}
.mhcal-aday{font-size:1.25rem;font-weight:800;color:#232D42;line-height:1.1}
.mhcal-amon{font-size:.6rem;color:#A6ACBE;text-transform:uppercase}
.mhcal-aitems{flex:1;display:flex;flex-direction:column;gap:.35rem}
.mhcal-arow{display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;background:none;border:none;padding:.3rem .1rem;border-radius:8px}
.mhcal-arow:hover{background:#F7F8FC}
.mhcal-abar{width:4px;height:26px;border-radius:2px;flex:0 0 4px}
.mhcal-atitle{font-size:.86rem;font-weight:500;color:#232D42;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mhcal-apill{font-size:.62rem;font-weight:600;padding:.1rem .45rem;border-radius:20px;flex:0 0 auto}
.mhcal-aowner{font-size:.68rem;color:#8A92A6;flex:0 0 auto}
@media(max-width:640px){.mhcal-apill,.mhcal-aowner{display:none}}
/* Status legend — compact strip so the bar colour→meaning is obvious */
.mhcal-slegend{margin-top:.75rem;padding:.7rem 1rem;background:#fff;border:1px solid #EEF0F4;border-radius:12px;display:flex;flex-wrap:wrap;gap:.6rem 1.1rem;font-size:.72rem;color:#4A5468;font-weight:500}
.mhcal-slegend-item{display:inline-flex;align-items:center;gap:.45rem}
.mhcal-slegend-chip{width:14px;height:14px;border-radius:4px;border:1px solid;flex:0 0 14px}
`;

const MHCAL_DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MHCAL_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type CalView = "month" | "week" | "day" | "list";

function CalendarView({ rows, facets, onOpen, onSaved, loading }: { rows: Row[]; facets?: Facets; onOpen: (id: string) => void; onSaved: () => void; loading: boolean }) {
  // Brand quick-filter — "" = All. Isolates a single SBU across the whole grid without
  // touching the master hub-level filter, so the calendar can drill into one brand cheaply.
  const [activeBrand, setActiveBrand] = useState<string>("");
  const [view, setView] = useState<CalView>("month");
  // Anchor date drives every view; ‹ › shifts by month/week/day, Today resets it.
  const [anchor, setAnchor] = useState(() => new Date());

  // Drag-to-reschedule: drop a task on a day to set its publishing date there.
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dropOn = async (e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const row = rows.find((r) => r.id === id);
    if (row && row.publishingDate?.slice(0, 10) === dayKey) return; // no-op: same day
    const ok = await saveField(id, { publishing_date: dayKey });
    if (ok) onSaved();
  };

  // Filter by active brand first, then bucket by yyyy-mm-dd.
  const filteredRows = useMemo(() => activeBrand ? rows.filter((r) => r.sbu === activeBrand) : rows, [rows, activeBrand]);
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filteredRows) {
      const d = r.publishingDate?.slice(0, 10);
      if (!d) continue;
      let list = m.get(d);
      if (!list) { list = []; m.set(d, list); }
      list.push(r);
    }
    return m;
  }, [filteredRows]);

  // Per-brand counts across the current (unfiltered) range — powers the chip badges.
  const brandCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.sbu, (m.get(r.sbu) || 0) + 1);
    return m;
  }, [rows]);

  // Which statuses actually exist in the current view — legend only surfaces those.
  const statusesInView = useMemo(() => {
    const s = new Set<string>();
    for (const r of filteredRows) if (r.status) s.add(r.status);
    return Array.from(s);
  }, [filteredRows]);

  // 42-cell month grid (always 6 full rows, prev/next-month spillover greyed out).
  const monthGrid = useMemo(() => {
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - firstOfMonth.getDay());
    const today = ymd(new Date());
    const cells: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      cells.push({ date: d, inMonth: d.getMonth() === anchor.getMonth(), isToday: ymd(d) === today });
    }
    return cells;
  }, [anchor]);

  const weekDays = useMemo(() => {
    const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [anchor]);

  // List view: every dated day in the anchor month that has tasks.
  const agenda = useMemo(() => {
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const days: { date: Date; items: Row[] }[] = [];
    for (let day = 1; day <= 31; day++) {
      const d = new Date(y, m, day); if (d.getMonth() !== m) break;
      const items = byDay.get(ymd(d)) || [];
      if (items.length) days.push({ date: d, items });
    }
    return days;
  }, [anchor, byDay]);

  const shift = (dir: number) => setAnchor((cur) => {
    const d = new Date(cur);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else if (view === "day") d.setDate(d.getDate() + dir);
    else d.setMonth(d.getMonth() + dir);
    return d;
  });
  const jumpToday = () => setAnchor(new Date());

  const title = useMemo(() => {
    if (view === "day") return `${MHCAL_DAY_FULL[anchor.getDay()]}, ${MHCAL_MONTH_ABBR[anchor.getMonth()]} ${anchor.getDate()}`;
    if (view === "week") {
      const s = weekDays[0], e = weekDays[6];
      const sM = MHCAL_MONTH_ABBR[s.getMonth()], eM = MHCAL_MONTH_ABBR[e.getMonth()];
      return sM === eM ? `${sM} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}` : `${sM} ${s.getDate()} – ${eM} ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${MHCAL_MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }, [view, anchor, weekDays]);

  const allSbus = facets?.sbu || [];

  // Shared soft-tinted event bar (dark readable text). Draggable so any view that
  // shows day cells can reschedule.
  const EvBar = (r: Row, block?: boolean) => {
    const st = calStatusStyle(r.status);
    return (
      <button
        key={r.id}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; }}
        onClick={() => onOpen(r.id)}
        title={`${r.particulars} · ${r.type} · ${r.sbu} · ${r.owner || "—"} — drag to reschedule`}
        className={`mhcal-ev${block ? " block" : ""}`}
        style={{ background: st.bg, borderColor: st.border, color: st.text }}
      >
        <span className="mhcal-evdot" style={{ background: sbuColor(r.sbu, allSbus) }} />
        <span className="mhcal-evtitle">{r.particulars || "(untitled)"}</span>
      </button>
    );
  };

  return (
    <div className="mhcal">
      <style dangerouslySetInnerHTML={{ __html: MHCAL_CSS }} />

      {/* Hero */}
      <div className="mhcal-hero">
        <div className="mhcal-hero-txt">
          <span className="mhcal-hero-tag">Team calendar</span>
          <h1>Content Calendar</h1>
          <p>Everything the marketing team is on — click to open, drag to reschedule.</p>
        </div>
        <div className="mhcal-hero-stat">
          <div className="mhcal-hero-statv">{fmtInt(filteredRows.length)}</div>
          <div className="mhcal-hero-statl">{activeBrand ? `${activeBrand} tasks` : "Tasks in view"}</div>
        </div>
      </div>

      {/* Title card overlapping the hero — mirrors the Publishing Calendar's "Calendar" card */}
      <div className="mhcal-titlecard">
        <h4>Calendar</h4>
        <span className="mhcal-live"><span className="dot" />{loading ? "Syncing…" : "Live"}</span>
      </div>

      {/* Brand quick-filter — one-click SBU isolate (lives inside the calendar, not a top filter) */}
      {allSbus.length > 0 && (
        <div className="mhcal-brands">
          <span className="mhcal-brands-lbl">Brand</span>
          <button className={`mhcal-brand ${activeBrand === "" ? "on" : ""}`} onClick={() => setActiveBrand("")}>
            All <span className="bcount">{rows.length}</span>
          </button>
          {allSbus.map((s) => {
            const n = brandCounts.get(s) || 0;
            if (n === 0) return null;
            const active = activeBrand === s;
            return (
              <button key={s} className={`mhcal-brand ${active ? "on" : ""}`} onClick={() => setActiveBrand((prev) => prev === s ? "" : s)}>
                <span className="bdot" style={{ background: sbuColor(s, allSbus) }} />
                {s}
                <span className="bcount">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Calendar card — toolbar INSIDE the card, then the active view */}
      <div className="mhcal-card">
        <div className="mhcal-toolbar">
          <div className="mhcal-nav">
            <button className="mhcal-navbtn" onClick={() => shift(-1)} aria-label="Previous">‹</button>
            <button className="mhcal-navbtn" onClick={() => shift(1)} aria-label="Next">›</button>
            <button className="mhcal-today" onClick={jumpToday}>Today</button>
          </div>
          <div className="mhcal-title">{title}</div>
          <div className="mhcal-views">
            {(["month", "week", "day", "list"] as CalView[]).map((v) => (
              <button key={v} className={`mhcal-viewbtn ${view === v ? "on" : ""}`} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {view === "month" && (
          <>
            <div className="mhcal-dow">{MHCAL_DAY_LABELS.map((d) => <span key={d}>{d}</span>)}</div>
            <div className="mhcal-grid">
              {monthGrid.map((cell) => {
                const key = ymd(cell.date);
                const list = byDay.get(key) || [];
                const cls = `mhcal-cell${cell.inMonth ? "" : " out"}${cell.isToday ? " today" : ""}${dragOver === key ? " over" : ""}`;
                return (
                  <div key={key} className={cls}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                    onDragLeave={() => setDragOver((prev) => (prev === key ? null : prev))}
                    onDrop={(e) => dropOn(e, key)}>
                    <div className="mhcal-daynum">{cell.date.getDate()}</div>
                    <div className="mhcal-events">
                      {list.slice(0, 4).map((r) => EvBar(r))}
                      {list.length > 4 && (
                        <button className="mhcal-more" onClick={() => { const first = list[4]; if (first) onOpen(first.id); }}>
                          +{list.length - 4} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === "week" && (
          <div className="mhcal-week">
            {weekDays.map((d) => {
              const key = ymd(d);
              const list = byDay.get(key) || [];
              const isToday = key === ymd(new Date());
              return (
                <div key={key} className={`mhcal-weekcol${isToday ? " today" : ""}${dragOver === key ? " over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                  onDragLeave={() => setDragOver((prev) => (prev === key ? null : prev))}
                  onDrop={(e) => dropOn(e, key)}>
                  <div className="mhcal-weekhead">
                    <span className="mhcal-weekdow">{MHCAL_DAY_LABELS[d.getDay()]}</span>
                    <span className={`mhcal-weeknum${isToday ? " today" : ""}`}>{d.getDate()}</span>
                  </div>
                  <div className="mhcal-weekbody">
                    {list.length === 0 ? <span className="mhcal-empty">—</span> : list.map((r) => EvBar(r, true))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "day" && (
          <div className="mhcal-day">
            {(() => {
              const list = byDay.get(ymd(anchor)) || [];
              if (list.length === 0) return <div className="mhcal-dayempty">No tasks scheduled for this day.</div>;
              return list.map((r) => <div key={r.id} className="mhcal-dayrow">{EvBar(r, true)}</div>);
            })()}
          </div>
        )}

        {view === "list" && (
          <div className="mhcal-agenda">
            {agenda.length === 0 ? <div className="mhcal-dayempty">No tasks this month.</div>
              : agenda.map(({ date, items }) => (
                <div key={ymd(date)} className="mhcal-agroup">
                  <div className="mhcal-adate">
                    <span className="mhcal-adow">{MHCAL_DAY_LABELS[date.getDay()]}</span>
                    <span className="mhcal-aday">{date.getDate()}</span>
                    <span className="mhcal-amon">{MHCAL_MONTH_ABBR[date.getMonth()]}</span>
                  </div>
                  <div className="mhcal-aitems">
                    {items.map((r) => {
                      const st = calStatusStyle(r.status);
                      return (
                        <button key={r.id} className="mhcal-arow" onClick={() => onOpen(r.id)}>
                          <span className="mhcal-abar" style={{ background: sbuColor(r.sbu, allSbus) }} />
                          <span className="mhcal-atitle">{r.particulars || "(untitled)"}</span>
                          <span className="mhcal-apill" style={{ background: st.bg, color: st.text }}>{r.status}</span>
                          <span className="mhcal-aowner">{r.owner || "—"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Status legend — only surfaces statuses actually present in the current view */}
      {statusesInView.length > 0 && (
        <div className="mhcal-slegend">
          {statusesInView.map((s) => {
            const st = calStatusStyle(s);
            return (
              <div key={s} className="mhcal-slegend-item">
                <span className="mhcal-slegend-chip" style={{ background: st.bg, borderColor: st.border }} />
                {s}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Status → pill colours (mirrors the pipeline stage palette; unknown = neutral).
const STATUS_PILL: Record<string, { bg: string; text: string }> = {
  "Content - Pending":     { bg: "#F1EFE8", text: "#444441" },
  "Content - Approved":    { bg: "#E1F5EE", text: "#0F6E56" },
  "Output - Ready":        { bg: "#E6F1FB", text: "#0C447C" },
  "Ready to Publish":      { bg: "#E1F5EE", text: "#0F6E56" },
  "Published/Scheduled":   { bg: "#EEEDFE", text: "#3C3489" },
};
function statusPill(s: string) { return STATUS_PILL[s] || { bg: "#F1EFE8", text: "#5F5E5A" }; }
function priorityPill(p: string): { bg: string; text: string } {
  const v = p.toLowerCase();
  if (v.includes("high") || v.includes("urgent")) return { bg: "#FCEBEB", text: "#A32D2D" };
  if (v.includes("med")) return { bg: "#FAEEDA", text: "#854F0B" };
  return { bg: "#F1EFE8", text: "#5F5E5A" };
}
function PlatformIcons({ platforms }: { platforms: string[] }) {
  if (!platforms.length) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {platforms.map((p, i) => {
        const k = p.toLowerCase();
        if (k.includes("insta")) return <IconBrandInstagram key={i} size={15} className="text-gray-400" />;
        if (k.includes("face")) return <IconBrandFacebook key={i} size={15} className="text-gray-400" />;
        if (k.includes("linked")) return <IconBrandLinkedin key={i} size={15} className="text-gray-400" />;
        if (k.includes("you")) return <IconBrandYoutube key={i} size={15} className="text-gray-400" />;
        return <span key={i} className="text-[10px] text-gray-400">{p}</span>;
      })}
    </span>
  );
}

// Persist a single field edit to Supabase (whitelisted update API), then refresh.
async function saveField(id: string, fields: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/marketing-hub/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fields }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Click-to-edit cell — shows `display`; clicking swaps in `editControl`. All
// clicks stopPropagation so editing never fires the row's open-modal handler.
function EditableCell({ display, editControl }: { display: React.ReactNode; editControl: (done: () => void) => React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <span onClick={(e) => e.stopPropagation()}>{editControl(() => setEditing(false))}</span>;
  }
  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="cursor-pointer rounded px-1 -mx-1 hover:bg-gray-100 hover:ring-1 hover:ring-gray-200 inline-flex items-center"
      title="Click to edit"
    >
      {display}
    </span>
  );
}

const EDIT_SELECT_CLS = "border border-gray-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand/30";

// MASTER SHEET sub-tab — the single source of truth: every creative, every SBU,
// mirrored from Airtable. Status · Owner · Priority · Date edit inline; click a
// row (title/type/etc.) to open the full task.
// Views layer over the Master sheet — an Airtable-style left rail of views. Defaults
// (All + per-teammate + by status + by content type) sit alongside "My views": shared,
// user-saved filter sets persisted in mh_views (Supabase). A 7/30/90d/1y period switcher
// drives the fetch range. The table + inline editing come from MasterSheet (bare).
type MasterDraft = { owner: string; status: string; type: string; sbu: string; priority: string };
type MasterViewDef = { id: string; label: string; av?: string; color?: string; match?: (r: Row) => boolean; filter?: FilterModel };
type ViewAccess = "personal" | "collaborative" | "locked";
type SavedView = { id: string; name: string; section: string; config: { filter?: FilterModel; filters?: Partial<MasterDraft>; sorts?: SortSpec[]; hiddenCols?: string[]; color?: string; search?: string; rangeDays?: number }; position: number; access: ViewAccess; description: string | null; created_by: string | null; canEdit: boolean; canManage: boolean };
const ACCESS_META: Record<ViewAccess, { label: string; hint: string; icon: typeof IconBookmark }> = {
  personal: { label: "Personal view", hint: "Only you can edit the view configuration", icon: IconUser },
  collaborative: { label: "Collaborative view", hint: "Any teammate can edit the view configuration", icon: IconUsers },
  locked: { label: "Locked view", hint: "Nobody can edit the view configuration", icon: IconLock },
};

// CSV of the given rows for a view's Download CSV action.
function viewRowsToCsv(rows: Row[]): string {
  const cols: [string, (r: Row) => string | undefined][] = [
    ["Particulars", (r) => r.particulars], ["SBU", (r) => r.sbu], ["Type", (r) => r.type],
    ["Status", (r) => r.status], ["Owner", (r) => r.owner], ["Priority", (r) => r.priority],
    ["Publishing Date", (r) => r.publishingDate?.slice(0, 10)], ["Due Date", (r) => r.dueDate?.slice(0, 10)],
  ];
  const esc = (s?: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  return [cols.map((c) => esc(c[0])).join(","), ...rows.map((r) => cols.map((c) => esc(c[1](r))).join(","))].join("\n");
}
function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Airtable-style filter engine ────────────────────────────────────────────
// A view's filter is a set of conditions (Field → Operator → Value) joined by
// AND/OR. Operators adapt to the field's type. Pure + data-driven so the same
// model powers the builder UI, row filtering, and saved-view config.
type FieldType = "text" | "select" | "owner" | "date" | "checkbox";
type FilterOp =
  | "is" | "isNot" | "isAnyOf" | "isNoneOf"
  | "contains" | "doesNotContain"
  | "isEmpty" | "isNotEmpty"
  | "isBefore" | "isAfter"
  | "isChecked" | "isNotChecked";
type FilterCondition = { field: string; op: FilterOp; value?: string | string[] };
type FilterModel = { conjunction: "and" | "or"; conditions: FilterCondition[] };
const EMPTY_FILTER: FilterModel = { conjunction: "and", conditions: [] };

type FilterFieldDef = { key: string; label: string; type: FieldType; get: (r: Row) => string | boolean; options?: string[]; custom?: boolean };
const FILTER_FIELDS: FilterFieldDef[] = [
  { key: "particulars", label: "Task name", type: "text", get: (r) => r.particulars || "" },
  { key: "status", label: "Status", type: "select", get: (r) => r.status || "" },
  { key: "type", label: "Type", type: "select", get: (r) => r.type || "" },
  { key: "sbu", label: "SBU / interest", type: "select", get: (r) => r.sbu || "" },
  { key: "owner", label: "Owner", type: "owner", get: (r) => r.owner || "" },
  { key: "priority", label: "Priority", type: "select", get: (r) => r.priority || "" },
  { key: "publishingDate", label: "Publishing date", type: "date", get: (r) => (r.publishingDate || "").slice(0, 10) },
  { key: "dueDate", label: "Due date", type: "date", get: (r) => (r.dueDate || "").slice(0, 10) },
  { key: "caption", label: "Caption", type: "text", get: (r) => r.caption || "" },
  { key: "needsReview", label: "Needs review", type: "checkbox", get: (r) => !!r.needsReview },
];
const OPS_BY_TYPE: Record<FieldType, { op: FilterOp; label: string; arity: "none" | "one" | "many" }[]> = {
  text: [{ op: "contains", label: "contains", arity: "one" }, { op: "doesNotContain", label: "does not contain", arity: "one" }, { op: "is", label: "is", arity: "one" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  select: [{ op: "is", label: "is", arity: "one" }, { op: "isNot", label: "is not", arity: "one" }, { op: "isAnyOf", label: "is any of", arity: "many" }, { op: "isNoneOf", label: "is none of", arity: "many" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  owner: [{ op: "is", label: "is", arity: "one" }, { op: "isAnyOf", label: "is any of", arity: "many" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  date: [{ op: "is", label: "is", arity: "one" }, { op: "isBefore", label: "is before", arity: "one" }, { op: "isAfter", label: "is after", arity: "one" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  checkbox: [{ op: "isChecked", label: "is checked", arity: "none" }, { op: "isNotChecked", label: "is unchecked", arity: "none" }],
};
const ownerMatchesKey = (owner: string, key: string) => { const m = TEAM.find((t) => t.key === key); return m ? ownerMatches(owner, m) : false; };
function evalCondition(r: Row, c: FilterCondition, fields: FilterFieldDef[] = FILTER_FIELDS): boolean {
  const def = fields.find((f) => f.key === c.field);
  if (!def) return true;
  const raw = def.get(r);
  const s = typeof raw === "boolean" ? "" : raw;
  const one = String(c.value ?? "");
  const many = Array.isArray(c.value) ? c.value : [];
  const isOwner = def.type === "owner";
  const eq = (v: string) => (isOwner ? ownerMatchesKey(s, v) : s === v);
  switch (c.op) {
    case "isEmpty": return typeof raw === "boolean" ? !raw : !s;
    case "isNotEmpty": return typeof raw === "boolean" ? !!raw : !!s;
    case "isChecked": return raw === true;
    case "isNotChecked": return raw !== true;
    case "contains": return s.toLowerCase().includes(one.toLowerCase());
    case "doesNotContain": return !s.toLowerCase().includes(one.toLowerCase());
    case "isBefore": return !!s && s < one;
    case "isAfter": return !!s && s > one;
    case "is": return eq(one);
    case "isNot": return !eq(one);
    case "isAnyOf": return many.some(eq);
    case "isNoneOf": return !many.some(eq);
    default: return true;
  }
}
function evalFilter(r: Row, f: FilterModel, fields: FilterFieldDef[] = FILTER_FIELDS): boolean {
  if (!f.conditions.length) return true;
  const res = f.conditions.map((c) => evalCondition(r, c, fields));
  return f.conjunction === "or" ? res.some(Boolean) : res.every(Boolean);
}
// Back-compat: convert the old simple {owner,status,type,sbu,priority} to a FilterModel.
function legacyToFilter(f?: Partial<MasterDraft>): FilterModel {
  if (!f) return EMPTY_FILTER;
  const conds: FilterCondition[] = [];
  (["owner", "status", "type", "sbu", "priority"] as const).forEach((k) => { if (f[k]) conds.push({ field: k, op: "is", value: f[k] }); });
  return { conjunction: "and", conditions: conds };
}
// Human summary of a filter's conditions (for the New-view "Captures" chips).
function summarizeFilter(f: FilterModel, fields: FilterFieldDef[] = FILTER_FIELDS): string[] {
  return f.conditions.map((c) => {
    const def = fields.find((d) => d.key === c.field);
    const label = def?.label || c.field;
    const opLabel = (OPS_BY_TYPE[def?.type || "text"].find((o) => o.op === c.op)?.label) || c.op;
    const val = Array.isArray(c.value)
      ? c.value.map((v) => (def?.type === "owner" ? TEAM.find((m) => m.key === v)?.label || v : v)).join(", ")
      : def?.type === "owner" ? (TEAM.find((m) => m.key === c.value)?.label || String(c.value ?? "")) : String(c.value ?? "");
    return `${label} ${opLabel}${val ? ` ${val}` : ""}`.trim();
  });
}

// ── Sort (multi-field) ──────────────────────────────────────────────────────
type SortSpec = { field: string; dir: "asc" | "desc" };
function sortRows(rows: Row[], sorts: SortSpec[], fields: FilterFieldDef[] = FILTER_FIELDS): Row[] {
  if (!sorts.length) return rows;
  const idx = rows.map((r, i) => [r, i] as const);
  idx.sort(([a, ai], [b, bi]) => {
    for (const s of sorts) {
      const def = fields.find((f) => f.key === s.field);
      if (!def) continue;
      const av = def.get(a), bv = def.get(b);
      let cmp: number;
      if (typeof av === "boolean" || typeof bv === "boolean") cmp = (av === true ? 1 : 0) - (bv === true ? 1 : 0);
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      if (cmp !== 0) return s.dir === "desc" ? -cmp : cmp;
    }
    return ai - bi;
  });
  return idx.map(([r]) => r);
}

// ── Grid columns (order + labels; render lives in MasterSheet) ──────────────
const MASTER_COLUMNS: { key: string; label: string }[] = [
  { key: "particulars", label: "Task name" },
  { key: "sbu", label: "SBU / interest" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "owner", label: "Owner" },
  { key: "priority", label: "Priority" },
  { key: "publishingDate", label: "Publishing" },
  { key: "dueDate", label: "Due date" },
  { key: "platforms", label: "Platforms" },
  { key: "attachments", label: "Files" },
  { key: "caption", label: "Caption" },
  { key: "needsReview", label: "Needs review" },
];
// Fields you can colour rows by (each has a colour map).
const COLOR_FIELDS: { key: string; label: string }[] = [
  { key: "status", label: "Status" }, { key: "sbu", label: "SBU / interest" }, { key: "priority", label: "Priority" },
];

// ── Custom columns (Phase 2) — user-defined fields stored in mh_posts.custom ─
type CustomColType = "text" | "number" | "select" | "date" | "checkbox";
type CustomColumn = { id: string; key: string; label: string; type: CustomColType; options: string[]; canDelete?: boolean };
const customFieldType = (t: CustomColType): FieldType => (t === "select" ? "select" : t === "date" ? "date" : t === "checkbox" ? "checkbox" : "text");
function customFieldDefs(cols: CustomColumn[]): FilterFieldDef[] {
  return cols.map((c) => ({
    key: c.key, label: c.label, type: customFieldType(c.type), custom: true, options: c.options,
    get: (r: Row) => { const v = (r.custom || {})[c.key]; return c.type === "checkbox" ? !!v : String(v ?? ""); },
  }));
}
const customVal = (r: Row, key: string) => (r.custom || {})[key];

// Per-view ⋯ menu (mirrors Airtable): access level, reassign, rename, description,
// duplicate, copy-another-view's-config, download CSV, print, delete. Edit actions
// disable when the API says the current user can't edit/manage this view.
function ViewMenu({ view, otherViews, onAction }: {
  view: SavedView; otherViews: SavedView[]; onAction: (action: string, payload?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<null | "copy" | "reassign">(null);
  const close = () => { setOpen(false); setSub(null); };
  const act = (a: string, p?: string) => { close(); onAction(a, p); };
  const { canEdit, canManage } = view;

  const item = (key: string, Ic: typeof IconPencil, label: string, onClick: () => void, opts: { disabled?: boolean; danger?: boolean } = {}) => (
    <button key={key} disabled={opts.disabled} onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-left ${opts.disabled ? "text-gray-300 cursor-not-allowed" : opts.danger ? "text-rose-600 hover:bg-rose-50" : "text-gray-700 hover:bg-gray-50"}`}>
      <Ic size={15} stroke={1.7} className="flex-shrink-0" />{label}
    </button>
  );

  return (
    <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} title="View options"
        className={`${open ? "flex" : "hidden group-hover:flex"} text-gray-400 hover:text-gray-700`}><IconDots size={15} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-6 z-50 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
            <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Access</div>
            {(["personal", "collaborative", "locked"] as ViewAccess[]).map((a) => {
              const M = ACCESS_META[a]; const Ic = M.icon; const cur = view.access === a;
              return (
                <button key={a} disabled={!canManage} onClick={() => act("access", a)}
                  className={`w-full flex items-start gap-2.5 px-3 py-1.5 text-left ${!canManage ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>
                  <Ic size={15} stroke={1.7} className="flex-shrink-0 mt-0.5 text-gray-600" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-[12.5px] text-gray-800">{M.label}{cur && <IconCheck size={13} className="text-brand" />}</span>
                    <span className="block text-[11px] text-gray-400 leading-tight">{M.hint}</span>
                  </span>
                </button>
              );
            })}
            <div className="my-1 border-t border-gray-100" />
            {item("reassign", IconUserShare, "Reassign to someone else", () => setSub(sub === "reassign" ? null : "reassign"), { disabled: !canManage })}
            {sub === "reassign" && (
              <div className="pl-8 pr-2 pb-1">
                {TEAM.map((m) => <button key={m.key} onClick={() => act("reassign", m.key)} className="w-full text-left px-2 py-1 text-[12px] rounded hover:bg-gray-50">{m.label}</button>)}
              </div>
            )}
            {item("rename", IconPencil, "Rename view", () => act("rename"), { disabled: !canEdit })}
            {item("description", IconFileDescription, "Edit view description", () => act("description"), { disabled: !canEdit })}
            <div className="my-1 border-t border-gray-100" />
            {item("duplicate", IconCopy, "Duplicate view", () => act("duplicate"))}
            {item("copy", IconClipboardCopy, "Copy another view's configuration", () => setSub(sub === "copy" ? null : "copy"), { disabled: !canEdit || otherViews.length === 0 })}
            {sub === "copy" && (
              <div className="pl-8 pr-2 pb-1 max-h-40 overflow-auto">
                {otherViews.map((v) => <button key={v.id} onClick={() => act("copyConfig", v.id)} className="w-full text-left px-2 py-1 text-[12px] rounded hover:bg-gray-50 truncate">{v.name}</button>)}
              </div>
            )}
            <div className="my-1 border-t border-gray-100" />
            {item("csv", IconDownload, "Download CSV", () => act("csv"))}
            {item("print", IconPrinter, "Print view", () => act("print"))}
            <div className="my-1 border-t border-gray-100" />
            {item("delete", IconTrash, "Delete view", () => act("delete"), { danger: true, disabled: !canManage })}
          </div>
        </>
      )}
    </div>
  );
}

// Multi-select checklist (for "is any of" / "is none of") — compact dropdown.
function FilterMultiSelect({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-left bg-white">
        <span className="truncate text-gray-700">{value.length ? `${value.length} selected` : "Select…"}</span>
        <IconChevronDown size={13} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+4px)] z-[56] bg-white border border-gray-200 rounded-lg shadow-lg p-1 min-w-[170px] max-h-56 overflow-auto">
            {options.length === 0 && <div className="px-2 py-1.5 text-[12px] text-gray-400">No options</div>}
            {options.map((o) => (
              <button key={o.value} onClick={() => toggle(o.value)} className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-gray-50 text-left">
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${value.includes(o.value) ? "bg-brand border-brand text-white" : "border-gray-300"}`}>{value.includes(o.value) && <IconCheck size={10} stroke={3} />}</span>
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Airtable-style filter builder popover — rows of Field · Operator · Value joined
// by a top-level AND/OR. Operators + value control adapt to the field type.
function FilterBuilder({ filter, facets, fields, onChange }: {
  filter: FilterModel; facets?: Facets; fields: FilterFieldDef[]; onChange: (f: FilterModel) => void;
}) {
  const optionsFor = (fieldKey: string): { value: string; label: string }[] => {
    const def = fields.find((f) => f.key === fieldKey);
    if (!def) return [];
    if (def.type === "owner") return TEAM.map((m) => ({ value: m.key, label: m.label }));
    if (def.options && def.options.length) return def.options.map((o) => ({ value: o, label: o }));
    if (def.type === "select") {
      const src = fieldKey === "status" ? (facets?.status || PIPELINE_STAGES.map((s) => s.key))
        : fieldKey === "type" ? (facets?.type || [])
        : fieldKey === "sbu" ? (facets?.sbu || [])
        : fieldKey === "priority" ? (facets?.priority || ["Urgent", "High", "Medium", "Low"]) : [];
      return src.map((o) => ({ value: o, label: o }));
    }
    return [];
  };
  const update = (i: number, patch: Partial<FilterCondition>) => onChange({ ...filter, conditions: filter.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const remove = (i: number) => onChange({ ...filter, conditions: filter.conditions.filter((_, idx) => idx !== i) });
  const add = () => onChange({ ...filter, conditions: [...filter.conditions, { field: "status", op: "is", value: "" }] });

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-[560px] max-w-[92vw]">
      {filter.conditions.length === 0 && <div className="text-[12px] text-gray-400 px-1 pb-2">No conditions — showing every task. Add one below.</div>}
      <div className="space-y-2">
        {filter.conditions.map((c, i) => {
          const def = fields.find((f) => f.key === c.field);
          const ops = OPS_BY_TYPE[def?.type || "text"];
          const opDef = ops.find((o) => o.op === c.op) || ops[0];
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="w-[52px] flex-shrink-0 text-[12px]">
                {i === 0 ? <span className="text-gray-400 pl-1">Where</span>
                  : i === 1 ? <HopeSelect value={filter.conjunction} onChange={(v) => onChange({ ...filter, conjunction: v as "and" | "or" })} options={[{ value: "and", label: "and" }, { value: "or", label: "or" }]} />
                  : <span className="text-gray-400 pl-1">{filter.conjunction}</span>}
              </div>
              <div className="w-[130px] flex-shrink-0">
                <HopeSelect value={c.field} onChange={(v) => { const nd = fields.find((f) => f.key === v)!; const first = OPS_BY_TYPE[nd.type][0]; update(i, { field: v, op: first.op, value: first.arity === "many" ? [] : first.arity === "none" ? undefined : "" }); }} options={fields.map((f) => ({ value: f.key, label: f.label }))} />
              </div>
              <div className="w-[130px] flex-shrink-0">
                <HopeSelect value={c.op} onChange={(v) => { const a = ops.find((o) => o.op === v)!.arity; update(i, { op: v as FilterOp, value: a === "many" ? [] : a === "none" ? undefined : (Array.isArray(c.value) ? "" : c.value || "") }); }} options={ops.map((o) => ({ value: o.op, label: o.label }))} />
              </div>
              <div className="flex-1 min-w-0">
                {opDef.arity === "none" ? <span className="text-[12px] text-gray-300 pl-1">—</span>
                  : def?.type === "date" ? <input type="date" value={String(c.value || "")} onChange={(e) => update(i, { value: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-brand" />
                  : def?.type === "text" ? <input value={String(c.value || "")} onChange={(e) => update(i, { value: e.target.value })} placeholder="value" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-brand" />
                  : opDef.arity === "many" ? <FilterMultiSelect options={optionsFor(c.field)} value={Array.isArray(c.value) ? c.value : []} onChange={(vals) => update(i, { value: vals })} />
                  : <HopeSelect value={String(c.value || "")} onChange={(v) => update(i, { value: v })} placeholder="Select…" options={[{ value: "", label: "Select…" }, ...optionsFor(c.field)]} />}
              </div>
              <button onClick={() => remove(i)} className="text-gray-400 hover:text-rose-500 flex-shrink-0"><IconTrash size={14} /></button>
            </div>
          );
        })}
      </div>
      <button onClick={add} className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-brand"><IconPlus size={14} />Add condition</button>
    </div>
  );
}

// Toolbar button + popover wrapper (Filter / Sort / Columns / Colour).
function ToolButton({ icon: Ic, label, active, open, onToggle, children }: {
  icon: typeof IconFilter; label: string; active: boolean; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button onClick={onToggle} className={`flex items-center gap-1.5 text-[12px] font-medium rounded-lg border px-3 py-1.5 ${active ? "border-brand/40 bg-brand-light/50 text-brand" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
        <Ic size={14} />{label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50">{children}</div>
        </>
      )}
    </div>
  );
}

// Multi-field sort builder.
function SortBuilder({ sorts, fields, onChange }: { sorts: SortSpec[]; fields: FilterFieldDef[]; onChange: (s: SortSpec[]) => void }) {
  const update = (i: number, patch: Partial<SortSpec>) => onChange(sorts.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-[380px] max-w-[92vw]">
      {sorts.length === 0 && <div className="text-[12px] text-gray-400 px-1 pb-2">No sort — default order.</div>}
      <div className="space-y-2">
        {sorts.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 w-8">{i === 0 ? "Sort" : "then"}</span>
            <div className="flex-1 min-w-0"><HopeSelect value={s.field} onChange={(v) => update(i, { field: v })} options={fields.map((f) => ({ value: f.key, label: f.label }))} /></div>
            <div className="w-[132px] flex-shrink-0"><HopeSelect value={s.dir} onChange={(v) => update(i, { dir: v as "asc" | "desc" })} options={[{ value: "asc", label: "First → last" }, { value: "desc", label: "Last → first" }]} /></div>
            <button onClick={() => onChange(sorts.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-rose-500 flex-shrink-0"><IconTrash size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...sorts, { field: "publishingDate", dir: "asc" }])} className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-brand"><IconPlus size={14} />Add sort</button>
    </div>
  );
}

// Show/hide columns + add / delete custom columns.
function ColumnsMenu({ columns, hidden, onChange, onAddColumn, onDeleteColumn }: { columns: { key: string; label: string; custom?: boolean; id?: string; canDelete?: boolean }[]; hidden: string[]; onChange: (h: string[]) => void; onAddColumn: () => void; onDeleteColumn: (id: string, label: string) => void }) {
  const toggle = (k: string) => onChange(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 w-[250px] max-h-80 overflow-auto">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Columns</div>
      {columns.map((c) => {
        const show = !hidden.includes(c.key);
        return (
          <div key={c.key} className="group w-full flex items-center gap-2.5 px-2 py-1.5 text-[12.5px] rounded hover:bg-gray-50">
            <button onClick={() => toggle(c.key)} disabled={c.key === "particulars"} className="flex items-center gap-2.5 flex-1 min-w-0 text-left disabled:opacity-50">
              <span className={`relative w-8 h-4 rounded-full flex-shrink-0 transition ${show ? "bg-brand" : "bg-gray-200"}`}><span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${show ? "left-[18px]" : "left-0.5"}`} /></span>
              <span className="text-gray-700 flex-1 truncate">{c.label}</span>
            </button>
            {c.custom && <span className="text-[9px] text-brand bg-brand-light/60 rounded px-1 flex-shrink-0">custom</span>}
            {c.custom && c.id && c.canDelete && <button onClick={() => onDeleteColumn(c.id!, c.label)} title="Delete column" className="hidden group-hover:flex text-gray-400 hover:text-rose-500 flex-shrink-0"><IconTrash size={13} /></button>}
          </div>
        );
      })}
      <div className="border-t border-gray-100 my-1" />
      <button onClick={onAddColumn} className="w-full flex items-center gap-2 px-2 py-1.5 text-[12.5px] rounded hover:bg-gray-50 text-left font-medium text-brand"><IconPlus size={14} />Add column</button>
    </div>
  );
}

// Colour rows by a select field.
function ColorMenu({ colorField, onChange }: { colorField: string; onChange: (f: string) => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 w-[210px]">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Colour rows by</div>
      <button onClick={() => onChange("")} className="w-full flex items-center gap-2 px-2 py-1.5 text-[12.5px] rounded hover:bg-gray-50 text-left text-gray-700">
        <span className="w-3.5 h-3.5 rounded border border-gray-300 flex-shrink-0" />None{colorField === "" && <IconCheck size={13} className="text-brand ml-auto" />}
      </button>
      {COLOR_FIELDS.map((f) => (
        <button key={f.key} onClick={() => onChange(f.key)} className="w-full flex items-center gap-2 px-2 py-1.5 text-[12.5px] rounded hover:bg-gray-50 text-left text-gray-700">
          <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ background: "linear-gradient(90deg,#3A57E8,#0F9E75)" }} />{f.label}{colorField === f.key && <IconCheck size={13} className="text-brand ml-auto" />}
        </button>
      ))}
    </div>
  );
}

// Define a new custom column (name + type + options).
function AddColumnModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomColType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const create = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const options = type === "select" ? optionsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : [];
      const res = await fetch("/api/marketing-hub/columns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim(), type, options }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not add column."); return; }
      onCreated();
    } finally { setSaving(false); }
  };
  const TYPE_META: { t: CustomColType; label: string }[] = [{ t: "text", label: "Text" }, { t: "number", label: "Number" }, { t: "select", label: "Select" }, { t: "date", label: "Date" }, { t: "checkbox", label: "Checkbox" }];
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-6 hope-scope" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2"><IconPlus size={18} className="text-brand" /><h2 className="text-[16px] font-semibold text-[#232D42]">Add column</h2></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#232D42] mb-1.5">Column name</label>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Campaign, Est. hours, Reviewed by"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#232D42] mb-1.5">Type</label>
            <div className="grid grid-cols-5 gap-1.5">
              {TYPE_META.map((tm) => (
                <button key={tm.t} onClick={() => setType(tm.t)} className={`rounded-lg border px-1 py-2 text-[11px] font-medium transition ${type === tm.t ? "border-brand bg-brand-light/50 text-brand" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>{tm.label}</button>
              ))}
            </div>
          </div>
          {type === "select" && (
            <div>
              <label className="block text-[12px] font-medium text-[#232D42] mb-1.5">Options <span className="text-gray-400 font-normal">(one per line or comma-separated)</span></label>
              <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={3} placeholder={"Option A\nOption B"} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-brand" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-[13px] font-medium text-gray-600 hover:text-gray-900 px-3 py-2">Cancel</button>
          <button onClick={create} disabled={saving || !label.trim()} className="bg-brand text-white text-[13px] font-medium rounded-lg px-4 py-2 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed">{saving ? "Adding…" : "Add column"}</button>
        </div>
      </div>
    </div>
  );
}

function MasterTab({ allRows, facets, range, setRange, onOpen, onSaved, loading }: {
  allRows: Row[]; facets?: Facets; range: { from: string; to: string }; setRange: (r: { from: string; to: string }) => void;
  onOpen: (id: string) => void; onSaved: () => void; loading: boolean;
}) {
  const [activeId, setActiveId] = useState("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<FilterModel>(EMPTY_FILTER);
  const [sorts, setSorts] = useState<SortSpec[]>([]);
  const [hiddenCols, setHiddenCols] = useState<string[]>([]);
  const [colorField, setColorField] = useState<string>("");
  const [openTool, setOpenTool] = useState<null | "filter" | "sort" | "cols" | "color">(null);
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [addColOpen, setAddColOpen] = useState(false);
  const { data: viewsData, refresh: refreshViews } = useApi<{ views: SavedView[]; me: string | null }>("/api/marketing-hub/views");
  const custom = viewsData?.views || [];
  const { data: colsData, refresh: refreshCols } = useApi<{ columns: CustomColumn[] }>("/api/marketing-hub/columns");
  const customCols = useMemo(() => colsData?.columns || [], [colsData]);
  const fields = useMemo(() => [...FILTER_FIELDS, ...customFieldDefs(customCols)], [customCols]);
  const columns = useMemo(() => [...MASTER_COLUMNS.map((c) => ({ key: c.key, label: c.label, custom: false })), ...customCols.map((c) => ({ key: c.key, label: c.label, custom: true, id: c.id, canDelete: c.canDelete }))], [customCols]);

  const daysRange = (n: number) => ({ from: ymd(new Date(Date.now() - (n - 1) * 86_400_000)), to: ymd(new Date()) });
  const activeDays = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;

  const oneCond = (field: string, value: string): FilterModel => ({ conjunction: "and", conditions: [{ field, op: "is", value }] });
  const allView: MasterViewDef = { id: "all", label: "Master sheet", color: "#3A57E8", filter: EMPTY_FILTER };
  const teamViews: MasterViewDef[] = TEAM.map((m) => ({ id: `team-${m.key}`, label: `${m.label}'s work`, av: m.av, color: m.color, filter: oneCond("owner", m.key) }));
  const statusViews: MasterViewDef[] = PIPELINE_STAGES.map((s) => ({ id: `status-${s.key}`, label: s.label, color: s.color, filter: oneCond("status", s.key) }));
  const typeViews: MasterViewDef[] = [
    { id: "type-reel", label: "Reels", color: "#3A57E8", match: (r) => /reel/i.test(r.type) },
    { id: "type-carousel", label: "Carousels", color: "#6D5CE7", match: (r) => /carousel/i.test(r.type) },
    { id: "type-video", label: "Long videos", color: "#2138B0", match: (r) => /youtube|long-form|short-form/i.test(r.type) },
    { id: "type-thumb", label: "Thumbnails", color: "#0F9E75", match: (r) => /thumbnail/i.test(r.type) },
    { id: "type-post", label: "Posts & stories", color: "#E0791F", match: (r) => /post|story|\btext\b/i.test(r.type) },
  ];
  const everyDef = [allView, ...teamViews, ...statusViews, ...typeViews];
  const curDef = everyDef.find((v) => v.id === activeId);
  const activeCustom = custom.find((c) => c.id === activeId);

  const matchFn = curDef?.match ? curDef.match : (r: Row) => evalFilter(r, draft, fields);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = allRows.filter(matchFn).filter((r) => !q || `${r.particulars} ${r.caption} ${r.sbu} ${r.type} ${r.owner}`.toLowerCase().includes(q));
    return sortRows(filtered, sorts, fields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, activeId, draft, search, sorts, fields]);
  const visibleCols = columns.filter((c) => !hiddenCols.includes(c.key)).map((c) => c.key);
  const currentConfig = { filter: draft, sorts, hiddenCols, color: colorField, rangeDays: activeDays };

  const countOf = (v: MasterViewDef) => allRows.filter(v.match ? v.match : (r) => evalFilter(r, v.filter || EMPTY_FILTER, fields)).length;
  const countCustom = (c: SavedView) => allRows.filter((r) => evalFilter(r, c.config.filter || legacyToFilter(c.config.filters), fields)).length;

  const selectDef = (v: MasterViewDef) => { setActiveId(v.id); setDraft(v.filter || EMPTY_FILTER); setSorts([]); setHiddenCols([]); setColorField(""); };
  const selectCustom = (c: SavedView) => {
    setActiveId(c.id);
    setDraft(c.config.filter || legacyToFilter(c.config.filters));
    setSorts(c.config.sorts || []); setHiddenCols(c.config.hiddenCols || []); setColorField(c.config.color || "");
    if (c.config.rangeDays) setRange(daysRange(c.config.rangeDays));
  };
  const setFilter = (f: FilterModel) => { setDraft(f); setActiveId("draft"); };
  const hasFilter = draft.conditions.length > 0;
  const dirty = hasFilter || sorts.length > 0 || hiddenCols.length > 0 || !!colorField;

  // "New view" / "Save as view" open the branded builder modal (no native prompt).
  const newView = () => setNewViewOpen(true);
  const saveView = () => setNewViewOpen(true);
  const deleteView = async (id: string) => {
    const res = await fetch(`/api/marketing-hub/views?id=${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not delete view."); return; }
    if (activeId === id) { setActiveId("all"); setDraft(EMPTY_FILTER); setSorts([]); setHiddenCols([]); setColorField(""); }
    await refreshViews();
  };
  const deleteColumn = async (id: string, label: string) => {
    if (!window.confirm(`Delete the column "${label}"? Its values are removed from the sheet for everyone.`)) return;
    const res = await fetch(`/api/marketing-hub/columns?id=${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not delete column."); return; }
    await refreshCols();
  };

  // Per-view menu actions (Airtable's ⋯ menu). Config/name/desc edits and access
  // changes are permission-gated in the API; on 403 we surface the message.
  const patchView = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/marketing-hub/views", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not update view."); return; }
    await refreshViews();
  };
  const rowsForConfig = (cfg: SavedView["config"]) => allRows.filter((r) => evalFilter(r, cfg.filter || legacyToFilter(cfg.filters), fields));
  const doViewAction = async (action: string, v: SavedView, payload?: string) => {
    switch (action) {
      case "access": await patchView(v.id, { access: payload }); break;
      case "rename": { const n = window.prompt("Rename view", v.name); if (n && n.trim()) await patchView(v.id, { name: n.trim() }); break; }
      case "description": { const d = window.prompt("View description", v.description || ""); if (d !== null) await patchView(v.id, { description: d }); break; }
      case "duplicate":
        await fetch("/api/marketing-hub/views", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${v.name} copy`, config: v.config, description: v.description, access: "personal" }) });
        await refreshViews();
        break;
      case "copyConfig": { const src = custom.find((c) => c.id === payload); if (src) await patchView(v.id, { config: src.config }); break; }
      case "reassign": await patchView(v.id, { createdBy: payload }); break;
      case "csv": downloadText(`${v.name.replace(/[^a-z0-9]+/gi, "-")}.csv`, viewRowsToCsv(rowsForConfig(v.config))); break;
      case "print": selectCustom(v); setTimeout(() => window.print(), 150); break;
      case "delete": if (window.confirm(`Delete view "${v.name}"?`)) await deleteView(v.id); break;
    }
  };

  const RailItem = ({ v }: { v: MasterViewDef }) => {
    const on = v.id === activeId;
    return (
      <button onClick={() => selectDef(v)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition ${on ? "bg-brand-light text-brand font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
        {v.av
          ? <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-semibold flex-shrink-0" style={{ background: v.color }}>{v.av}</span>
          : <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: v.color || "#94A3B8" }} />}
        <span className="truncate flex-1 text-left">{v.label}</span>
        <span className={`text-[11px] ${on ? "text-brand/70" : "text-gray-400"}`}>{countOf(v)}</span>
      </button>
    );
  };
  const Section = ({ title, views }: { title: string; views: MasterViewDef[] }) => (
    <div className="mb-2">
      <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      {views.map((v) => <RailItem key={v.id} v={v} />)}
    </div>
  );

  const title = curDef ? curDef.label : activeCustom ? activeCustom.name : "Custom filter";
  const headColor = curDef?.color || "#3A57E8";
  const headAv = curDef?.av;

  return (
    <div className="flex gap-4 items-start">
      {/* Views rail */}
      <div className="w-56 flex-shrink-0 bg-white border border-gray-100 rounded-xl p-2">
        <button onClick={() => newView()}
          className="w-full flex items-center justify-center gap-1.5 mb-1 bg-brand text-white rounded-lg py-2 text-[12.5px] font-medium hover:brightness-105">
          <IconPlus size={15} stroke={2} />New view
        </button>
        <Section title="Default" views={[allView]} />
        <Section title="Team" views={teamViews} />
        <Section title="By status" views={statusViews} />
        <Section title="By content type" views={typeViews} />
        {custom.length > 0 && (
          <div className="mb-2">
            <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">My views</div>
            {custom.map((c) => {
              const on = c.id === activeId;
              const AccessIcon = ACCESS_META[c.access].icon;
              return (
                <div key={c.id} className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] ${on ? "bg-brand-light text-brand font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                  <button onClick={() => selectCustom(c)} className="flex items-center gap-2 flex-1 min-w-0 text-left" title={c.description || undefined}>
                    <AccessIcon size={13} stroke={1.8} className="flex-shrink-0" />
                    <span className="truncate flex-1">{c.name}</span>
                  </button>
                  <span className={`text-[11px] ${on ? "text-brand/70" : "text-gray-400"} group-hover:hidden`}>{countCustom(c)}</span>
                  <ViewMenu view={c} otherViews={custom.filter((v) => v.id !== c.id)} onAction={(a, p) => doViewAction(a, c, p)} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active view */}
      <div className="flex-1 min-w-0 bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 flex-wrap">
          {headAv
            ? <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0" style={{ background: headColor }}>{headAv}</span>
            : <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: headColor }} />}
          <div>
            <div className="text-base font-medium">{title}</div>
            <div className="text-[11px] text-gray-500">{fmtInt(rows.length)} tasks · last {activeDays} days</div>
          </div>
          <div className="ml-auto inline-flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
            {([[7, "7d"], [30, "30d"], [90, "90d"], [365, "1y"]] as [number, string][]).map(([n, lab]) => (
              <button key={n} onClick={() => setRange(daysRange(n))}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition ${activeDays === n ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"}`}>{lab}</button>
            ))}
          </div>
        </div>

        {/* Search bar — searches the whole Master sheet (task name · interest · type · owner). */}
        <div className="px-5 py-2.5 border-b border-gray-100">
          <div className="relative">
            <IconSearch size={16} stroke={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the Marketing Hub — task, interest, type, owner…"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>}
          </div>
        </div>

        {/* Toolbar — Airtable-style Filter / Sort / Columns / Colour; save the result as a view */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 flex-wrap">
          <ToolButton icon={IconFilter} active={hasFilter} label={hasFilter ? `Filtered · ${draft.conditions.length}` : "Filter"} open={openTool === "filter"} onToggle={() => setOpenTool(openTool === "filter" ? null : "filter")}>
            <FilterBuilder filter={draft} facets={facets} fields={fields} onChange={setFilter} />
          </ToolButton>
          <ToolButton icon={IconArrowsSort} active={sorts.length > 0} label={sorts.length ? `Sorted · ${sorts.length}` : "Sort"} open={openTool === "sort"} onToggle={() => setOpenTool(openTool === "sort" ? null : "sort")}>
            <SortBuilder sorts={sorts} fields={fields} onChange={setSorts} />
          </ToolButton>
          <ToolButton icon={IconColumns} active={hiddenCols.length > 0} label={hiddenCols.length ? `Columns · ${columns.length - hiddenCols.length}` : "Columns"} open={openTool === "cols"} onToggle={() => setOpenTool(openTool === "cols" ? null : "cols")}>
            <ColumnsMenu columns={columns} hidden={hiddenCols} onChange={setHiddenCols} onAddColumn={() => { setOpenTool(null); setAddColOpen(true); }} onDeleteColumn={(id, label) => { setOpenTool(null); deleteColumn(id, label); }} />
          </ToolButton>
          <ToolButton icon={IconPalette} active={!!colorField} label={colorField ? `Colour · ${COLOR_FIELDS.find((f) => f.key === colorField)?.label || colorField}` : "Colour"} open={openTool === "color"} onToggle={() => setOpenTool(openTool === "color" ? null : "color")}>
            <ColorMenu colorField={colorField} onChange={setColorField} />
          </ToolButton>
          {dirty && <button onClick={() => selectDef(allView)} className="text-[12px] text-gray-500 hover:text-gray-800 px-1">Clear</button>}
          <button onClick={saveView} disabled={!dirty}
            className="ml-auto flex items-center gap-1.5 text-[12px] font-medium text-brand disabled:text-gray-300 disabled:cursor-not-allowed">
            <IconDeviceFloppy size={14} />Save as view
          </button>
        </div>

        <MasterSheet rows={rows} facets={facets} onOpen={onOpen} onSaved={onSaved} loading={loading} bare visibleCols={visibleCols} colorField={colorField} customCols={customCols} />
      </div>

      {newViewOpen && (
        <NewViewModal
          config={currentConfig} fields={fields} totalCols={columns.length}
          onClose={() => setNewViewOpen(false)}
          onCreated={() => { setNewViewOpen(false); refreshViews(); }}
        />
      )}
      {addColOpen && <AddColumnModal onClose={() => setAddColOpen(false)} onCreated={() => { setAddColOpen(false); refreshCols(); onSaved(); }} />}
    </div>
  );
}

// Branded "New view" builder — replaces the native window.prompt. Names the view,
// picks an access level + optional description, and shows exactly what it captures.
function NewViewModal({ config, fields, totalCols, onClose, onCreated }: {
  config: { filter: FilterModel; sorts: SortSpec[]; hiddenCols: string[]; color: string; rangeDays: number }; fields: FilterFieldDef[]; totalCols: number; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [access, setAccess] = useState<ViewAccess>("personal");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chips = summarizeFilter(config.filter, fields);
  if (!chips.length) chips.push("All tasks");
  if (config.sorts.length) chips.push(`Sorted · ${config.sorts.length}`);
  if (config.hiddenCols.length) chips.push(`${totalCols - config.hiddenCols.length} columns`);
  if (config.color) chips.push(`Coloured by ${COLOR_FIELDS.find((f) => f.key === config.color)?.label || config.color}`);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/marketing-hub/views", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, access, config }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not create view."); return; }
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-6 hope-scope" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2"><IconPlus size={18} className="text-brand" /><h2 className="text-[16px] font-semibold text-[#232D42]">New view</h2></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#232D42] mb-1.5">View name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              placeholder="e.g. Manya · approved reels"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#232D42] mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="What is this view for?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#232D42] mb-1.5">Access</label>
            <div className="grid grid-cols-3 gap-2">
              {(["personal", "collaborative", "locked"] as ViewAccess[]).map((a) => {
                const M = ACCESS_META[a]; const Ic = M.icon; const on = access === a;
                return (
                  <button key={a} onClick={() => setAccess(a)} title={M.hint}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] font-medium transition ${on ? "border-brand bg-brand-light/50 text-brand" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    <Ic size={16} />{M.label.replace(" view", "")}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-gray-400 mt-1.5">{ACCESS_META[access].hint}</div>
          </div>
          <div className="rounded-lg bg-[#F6F7FB] border border-gray-100 px-3 py-2.5">
            <div className="text-[11px] font-medium text-[#8A92A6] uppercase tracking-wide mb-1.5">Captures</div>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c, i) => <span key={i} className="text-[11px] bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-700">{c}</span>)}
              <span className="text-[11px] bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-700">Last {config.rangeDays} days</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-[13px] font-medium text-gray-600 hover:text-gray-900 px-3 py-2">Cancel</button>
          <button onClick={create} disabled={saving || !name.trim()}
            className="bg-brand text-white text-[13px] font-medium rounded-lg px-4 py-2 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? "Creating…" : "Create view"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MasterSheet({ rows, facets, onOpen, onSaved, loading, bare, visibleCols, colorField, customCols }: { rows: Row[]; facets?: Facets; onOpen: (id: string) => void; onSaved: () => void; loading: boolean; bare?: boolean; visibleCols?: string[]; colorField?: string; customCols?: CustomColumn[] }) {
  const allSbus = facets?.sbu || [];
  const statusOptions = facets?.status || PIPELINE_STAGES.map((s) => s.key);
  const priorityOptions = facets?.priority || ["Urgent", "High", "Medium", "Low"];
  const save = async (id: string, fields: Record<string, unknown>) => {
    const ok = await saveField(id, fields);
    if (ok) onSaved();
  };
  const saveCustom = async (id: string, key: string, value: unknown) => {
    const res = await fetch("/api/marketing-hub/set-custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: id, key, value }) });
    if (res.ok) onSaved();
  };
  const customByKey = new Map((customCols || []).map((c) => [c.key, c]));
  const allCols = [...MASTER_COLUMNS, ...(customCols || []).map((c) => ({ key: c.key, label: c.label }))];
  const cols = allCols.filter((c) => !visibleCols || visibleCols.includes(c.key));
  const colorOf = (r: Row): string | undefined =>
    colorField === "status" ? statusColor(r.status)
    : colorField === "sbu" ? sbuColor(r.sbu, allSbus)
    : colorField === "priority" ? priorityColor(r.priority) : undefined;

  const customCell = (cc: CustomColumn, r: Row) => {
    const v = r.custom?.[cc.key];
    if (cc.type === "checkbox") return <button onClick={(e) => { e.stopPropagation(); saveCustom(r.id, cc.key, !v); }} className={`w-4 h-4 rounded border flex items-center justify-center ${v ? "bg-brand border-brand text-white" : "border-gray-300"}`}>{v ? <IconCheck size={11} stroke={3} /> : null}</button>;
    return <EditableCell display={v != null && v !== "" ? <span className="text-gray-700">{cc.type === "date" ? fmtDate(String(v)) : String(v)}</span> : <span className="text-gray-300">—</span>} editControl={(done) => (
      cc.type === "select" ? <select autoFocus defaultValue={String(v ?? "")} onBlur={done} className={EDIT_SELECT_CLS} onChange={async (e) => { await saveCustom(r.id, cc.key, e.target.value); done(); }}><option value="">—</option>{cc.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
      : cc.type === "date" ? <input type="date" autoFocus defaultValue={String(v ?? "").slice(0, 10)} onBlur={done} className={EDIT_SELECT_CLS} onChange={async (e) => { await saveCustom(r.id, cc.key, e.target.value); done(); }} />
      : <input type={cc.type === "number" ? "number" : "text"} autoFocus defaultValue={String(v ?? "")} onBlur={done} className={EDIT_SELECT_CLS} onChange={async (e) => { await saveCustom(r.id, cc.key, e.target.value); done(); }} />
    )} />;
  };

  const cell = (key: string, r: Row) => {
    const custom = customByKey.get(key);
    if (custom) return customCell(custom, r);
    const sp = statusPill(r.status); const pp = priorityPill(r.priority);
    const ownerKey = TEAM.find((m) => ownerMatches(r.owner, m))?.key ?? "";
    switch (key) {
      case "particulars": return <span className="text-gray-800 block max-w-[280px] truncate">{r.particulars || "(untitled)"}</span>;
      case "sbu": return <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: sbuColor(r.sbu, allSbus) }} />{r.sbu || "—"}</span>;
      case "type": return <span className="text-gray-600">{r.type || "—"}</span>;
      case "status": return <EditableCell display={r.status ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: sp.bg, color: sp.text }}>{r.status}</span> : <span className="text-gray-300">— set</span>} editControl={(done) => (<select autoFocus defaultValue={r.status} onBlur={done} className={EDIT_SELECT_CLS} onChange={async (e) => { await save(r.id, { status: e.target.value }); done(); }}>{statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select>)} />;
      case "owner": return <EditableCell display={r.owner ? <span className="inline-flex items-center gap-2"><span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium" style={{ background: "#EEEDFE", color: "#3C3489" }}>{r.owner.trim().slice(0, 1).toUpperCase()}</span>{r.owner}</span> : <span className="text-gray-300">— assign</span>} editControl={(done) => (<select autoFocus defaultValue={ownerKey} onBlur={done} className={EDIT_SELECT_CLS} onChange={async (e) => { await save(r.id, { owner_key: e.target.value || null }); done(); }}><option value="">Unassigned</option>{TEAM.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>)} />;
      case "priority": return <EditableCell display={r.priority ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: pp.bg, color: pp.text }}>{r.priority}</span> : <span className="text-gray-300">— set</span>} editControl={(done) => (<select autoFocus defaultValue={r.priority} onBlur={done} className={EDIT_SELECT_CLS} onChange={async (e) => { await save(r.id, { priority: e.target.value }); done(); }}>{priorityOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select>)} />;
      case "publishingDate": return <EditableCell display={r.publishingDate ? <span className="text-gray-500">{fmtDate(r.publishingDate)}</span> : <span className="text-gray-300">— set date</span>} editControl={(done) => (<input type="date" autoFocus defaultValue={r.publishingDate?.slice(0, 10) || ""} onBlur={done} className={EDIT_SELECT_CLS} onChange={async (e) => { await save(r.id, { publishing_date: e.target.value || null }); done(); }} />)} />;
      case "dueDate": return <span className="text-gray-500">{r.dueDate ? fmtDate(r.dueDate) : "—"}</span>;
      case "platforms": return <PlatformIcons platforms={r.platforms} />;
      case "attachments": return r.attachments.length ? <span className="inline-flex items-center gap-0.5 text-gray-400"><IconPaperclip size={13} />{r.attachments.length}</span> : <span className="text-gray-300">—</span>;
      case "caption": return <span className="text-gray-500 block max-w-[220px] truncate">{r.caption || "—"}</span>;
      case "needsReview": return r.needsReview ? <span className="text-[11px] bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">Yes</span> : <span className="text-gray-300">—</span>;
      default: return <span className="text-gray-300">—</span>;
    }
  };

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead className="border-b border-gray-100 bg-gray-50">
          <tr className="text-gray-500 text-left">
            {cols.map((c) => <th key={c.key} className="px-4 py-2.5 font-normal">{c.key === "attachments" ? <IconPaperclip size={14} className="text-gray-400" /> : c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-gray-400">{loading ? "Loading…" : "No entries match"}</td></tr>
          )}
          {rows.map((r) => {
            const cc = colorOf(r);
            return (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" style={cc ? { boxShadow: `inset 3px 0 0 ${cc}` } : undefined}>
                {cols.map((c) => <td key={c.key} className="px-4 py-2.5">{cell(c.key, r)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (bare) return table;
  return (
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="text-base font-medium">Master sheet</div>
        <div className="text-sm text-gray-400">{fmtInt(rows.length)} records · edit inline · click a row to open</div>
      </div>
      {table}
    </div>
  );
}

type DetailAttachment = { id: string; filename: string; storage_path: string; mime_type: string | null; kind?: string };
type TaskDetail = {
  content: string; caption: string; notes: string;
  instagramUrl?: string; facebookUrl?: string; linkedinUrl?: string; outputLink?: string; platforms?: string[]; referenceLinks?: string[];
  collaborators: { key: string; name: string; role: string | null }[];
  attachments: DetailAttachment[];
  comments: { id: string; body: string; resolved: boolean; created_at: string; authorName: string; author_key: string }[];
  activity: { id: string; action: string; from_value: string | null; to_value: string | null; created_at: string; actorName: string; actor_key: string | null }[];
  scheduler: { syncedToScheduler: boolean; startAt: string | null };
  me?: string | null;
};
const COMMENT_KEYS = new Set(["manya", "praveen", "nikhil", "nandu", "maheen"]);
const fmtWhen = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
// How long a task took (start → end), e.g. "2h 15m" or "3d 4h".
function durationBetween(start?: string | null, end?: string | null): string {
  if (!start || !end) return "";
  let ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const d = Math.floor(ms / 86_400_000); ms -= d * 86_400_000;
  const h = Math.floor(ms / 3_600_000); ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  const parts = [d && `${d}d`, h && `${h}h`, (!d && m) && `${m}m`].filter(Boolean);
  return parts.join(" ") || "0m";
}
const isImageCreative = (name: string, type: string) => type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(name);
type CreativeKind = "image" | "video" | "pdf" | "file";
const creativeKind = (name: string, type: string): CreativeKind => {
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name)) return "image";
  if (type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(name)) return "video";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  return "file";
};
type Creative = { id: string | undefined; url: string; name: string; type: string; removable: boolean };

// In-dashboard creative viewer: images/videos render large; PDFs open in an
// embedded iframe (never a new tab); prev/next arrows + ←/→ keys for multiple.
function CreativeViewer({ creatives, index, setIndex, onClose }: {
  creatives: Creative[]; index: number; setIndex: (i: number) => void; onClose: () => void;
}) {
  const many = creatives.length > 1;
  const go = (d: number) => setIndex((index + d + creatives.length) % creatives.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) setIndex((index + 1) % creatives.length);
      else if (e.key === "ArrowLeft" && many) setIndex((index - 1 + creatives.length) % creatives.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, many, creatives.length, onClose, setIndex]);

  const c = creatives[index];
  const kind = creativeKind(c.name, c.type);
  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-6" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white p-1"><IconX size={26} /></button>
      <div className="absolute top-5 left-5 text-white/80 text-[13px] font-medium">{index + 1} / {creatives.length}</div>
      {many && <button onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/25 text-white rounded-full p-2.5"><IconChevronLeft size={24} /></button>}
      <div className="max-w-[92vw] max-h-[88vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.url} alt={c.name} className="max-w-[92vw] max-h-[82vh] object-contain rounded-lg" />
        ) : kind === "video" ? (
          <video src={c.url} controls autoPlay className="max-w-[92vw] max-h-[82vh] rounded-lg bg-black" />
        ) : kind === "pdf" ? (
          <iframe src={c.url} title={c.name} className="w-[90vw] h-[84vh] bg-white rounded-lg" />
        ) : (
          <div className="bg-white rounded-xl px-8 py-10 text-center">
            <IconFileText size={40} className="text-gray-400 mx-auto mb-3" />
            <div className="text-sm text-gray-700 mb-3">{c.name}</div>
            <a href={c.url} download className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand"><IconDownload size={15} />Download</a>
          </div>
        )}
        <div className="mt-3 text-white/80 text-[12px] truncate max-w-[80vw]">{c.name}</div>
      </div>
      {many && <button onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/25 text-white rounded-full p-2.5"><IconChevronRight size={24} /></button>}
    </div>
  );
}

// Hope-UI card: white surface, hairline border, rounded-xl, labelled header (optional
// brand accent + trailing slot). The building block that gives the modal real sections.
function Panel({ icon: Ic, title, right, accent, children }: {
  icon?: typeof IconPhoto; title: string; right?: React.ReactNode; accent?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 ${accent ? "bg-brand-light/80" : "bg-brand-light/40"}`}>
        {Ic && <Ic size={17} stroke={1.8} className="text-brand" />}
        <span className="text-[14px] font-medium text-[#232D42]">{title}</span>
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------- Activity feed (Airtable-style: who · what changed · when) ----------
// Fixed per-person avatar colours (like Airtable's coloured initials).
const PERSON_AV: Record<string, [string, string]> = {
  manya: ["#FCEEE0", "#B45309"], praveen: ["#FDEBE3", "#C2410C"],
  nikhil: ["#E4ECFF", "#2138B0"], nandu: ["#E7EEFE", "#1E3FA8"], maheen: ["#EEEDFE", "#3C3489"],
};
const FEED_AV = ["#EEEDFE:#3C3489", "#E1F5EE:#0F6E56", "#E4ECFF:#2138B0", "#FDECEC:#B4232D", "#FDF2E2:#9A6212", "#E9F6FE:#0E5E86"];
// system = an un-attributed / imported change (Airtable shows these as "Automations").
function feedAvatar(key: string | null, name: string): { bg: string; fg: string; initials: string; system: boolean } {
  const k = (key || "").toLowerCase();
  const nameOk = !!name && name !== "—" && name !== "?";
  if (!k && !nameOk) return { bg: "#EEF0F4", fg: "#8A92A6", initials: "", system: true };
  const initials = (name || k).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
  const pc = PERSON_AV[k];
  if (pc) return { bg: pc[0], fg: pc[1], initials, system: false };
  const s = (k || name).toLowerCase(); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const [bg, fg] = FEED_AV[h % FEED_AV.length].split(":");
  return { bg, fg, initials, system: false };
}
function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
// Word-level diff: added words green, removed words red-strikethrough (LCS).
function wordDiff(oldStr: string, newStr: string): React.ReactNode {
  const a = (oldStr || "").split(/(\s+)/), b = (newStr || "").split(/(\s+)/);
  const n = a.length, m = b.length;
  if (n * m > 400_000) { // too large to diff cheaply — show before/after blocks
    return (
      <div className="space-y-1">
        {oldStr && <div className="bg-red-50 text-red-600 line-through rounded px-1.5 py-1 whitespace-pre-wrap break-words">{oldStr}</div>}
        {newStr && <div className="bg-emerald-50 text-emerald-700 rounded px-1.5 py-1 whitespace-pre-wrap break-words">{newStr}</div>}
      </div>
    );
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: React.ReactNode[] = []; let i = 0, j = 0, k = 0;
  const push = (t: string, cls: string) => { if (t) out.push(<span key={k++} className={cls}>{t}</span>); };
  while (i < n && j < m) {
    if (a[i] === b[j]) { push(a[i], ""); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push(a[i], "bg-red-50 text-red-600 line-through"); i++; }
    else { push(b[j], "bg-emerald-50 text-emerald-700"); j++; }
  }
  while (i < n) { push(a[i], "bg-red-50 text-red-600 line-through"); i++; }
  while (j < m) { push(b[j], "bg-emerald-50 text-emerald-700"); j++; }
  return <span className="whitespace-pre-wrap break-words leading-relaxed">{out}</span>;
}
const ACT_VERB: Record<string, string> = {
  created: "created this", status_changed: "changed the status", owner_changed: "reassigned this",
  rescheduled: "rescheduled this", due_date_changed: "changed the due date", renamed: "renamed this",
  priority_changed: "changed the priority", type_changed: "changed the type", content_edited: "edited the content",
  caption_edited: "edited the caption", notes_edited: "edited the notes", sbu_changed: "changed the brand",
  platforms_changed: "changed platforms", review_changed: "toggled review", output_link_changed: "updated the output link",
  creative_added: "added a creative", creative_removed: "removed a creative", claim: "claimed this",
  reference_added: "added a reference", reference_removed: "removed a reference", reference_links_changed: "updated the references",
  instagram_url_changed: "updated the Instagram link", facebook_url_changed: "updated the Facebook link", linkedin_url_changed: "updated the LinkedIn link",
};
const DIFF_FIELDS = new Set(["content_edited", "caption_edited", "notes_edited"]);
const PILL_FIELDS = new Set(["status_changed"]);
type FeedItem =
  | { id: string; kind: "activity"; at: string; name: string; key: string | null; action: string; from: string | null; to: string | null }
  | { id: string; kind: "comment"; at: string; name: string; key: string | null; body: string; resolved: boolean };

function DetailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: Creative[]; index: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Inline editing for the Content brief + Caption. Saving writes to mh_posts,
  // which the activity trigger records (content_edited / caption_edited).
  const [editSection, setEditSection] = useState<"content" | "caption" | null>(null);
  const [draft, setDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // Unified activity feed: filter (All activity / Revision history / Comments),
  // resolved toggle, expand-diff set, and a Show-more cap.
  const [feedFilter, setFeedFilter] = useState<"all" | "revisions" | "comments">("all");
  const [showResolved, setShowResolved] = useState(true);
  const [feedFilterOpen, setFeedFilterOpen] = useState(false);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());
  const [feedLimit, setFeedLimit] = useState(25);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadDetail = async () => {
    setLoadingDetail(true);
    try { const r = await fetch(`/api/marketing-hub/task-detail?id=${row.id}`); setDetail(r.ok ? await r.json() : null); }
    catch { setDetail(null); }
    finally { setLoadingDetail(false); }
  };
  useEffect(() => { loadDetail(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [row.id]);

  const content = (detail?.content || row.content || "").trim();
  const caption = (detail?.caption ?? row.caption ?? "").trim();
  const notes = (detail?.notes || row.additionalInfo || "").trim();

  // Merge activity + comments into one chronological feed, honouring the filter.
  const feed = useMemo<FeedItem[]>(() => {
    const acts: FeedItem[] = (detail?.activity || []).map((a) => ({ id: a.id, kind: "activity", at: a.created_at, name: a.actorName, key: a.actor_key, action: a.action, from: a.from_value, to: a.to_value }));
    const coms: FeedItem[] = (detail?.comments || []).filter((c) => showResolved || !c.resolved).map((c) => ({ id: `c${c.id}`, kind: "comment", at: c.created_at, name: c.authorName, key: c.author_key, body: c.body, resolved: c.resolved }));
    let items: FeedItem[] = [...acts, ...coms];
    if (feedFilter === "revisions") items = items.filter((i) => i.kind === "activity");
    else if (feedFilter === "comments") items = items.filter((i) => i.kind === "comment");
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [detail, feedFilter, showResolved]);
  const collaborators = detail?.collaborators?.length ? detail.collaborators : null;
  const isDone = DONE_STATUSES.includes(row.status) || !!row.completionTime;
  const sp = statusPill(row.status);
  const pp = priorityPill(row.priority);
  const uploaderKey = TEAM.find((m) => ownerMatches(row.owner, m))?.key || "maheen";
  // Account-specific: every comment + edit is stamped with the LOGGED-IN user
  // (detail.me from the session), never a manual picker. Whoever is signed in owns
  // the action, so the feed reads by their real name.
  const activeAuthor = (detail?.me && COMMENT_KEYS.has(detail.me)) ? detail.me : "maheen";
  const AUTHOR_LABELS: Record<string, string> = { manya: "Manya", praveen: "Praveen", nikhil: "Nikhil", nandu: "Nandu", maheen: "Maheen" };
  const authorLabel = (k: string) => AUTHOR_LABELS[k] || k;

  // Editable post URLs + platforms (Instagram / Facebook / LinkedIn). Read fresh
  // from detail after a save, falling back to the list row.
  const igUrl = detail?.instagramUrl ?? row.instagramUrl ?? "";
  const fbUrl = detail?.facebookUrl ?? row.facebookUrl ?? "";
  const liUrl = detail?.linkedinUrl ?? row.linkedinUrl ?? "";
  const platformsCur = detail?.platforms ?? row.platforms ?? [];
  const [urlEdit, setUrlEdit] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const saveOne = async (field: string, value: unknown) => {
    const res = await fetch("/api/marketing-hub/update", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, actor: activeAuthor, fields: { [field]: value } }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not save."); return; }
    await loadDetail();
  };
  const togglePlatform = (p: string) => {
    const next = platformsCur.includes(p) ? platformsCur.filter((x) => x !== p) : [...platformsCur, p];
    saveOne("platforms", next);
  };
  const platformChips = Array.from(new Set(["Instagram", "Facebook", "LinkedIn", ...platformsCur]));
  const urlRow = (field: string, label: string, value: string, Icon?: typeof IconBrandInstagram) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0 text-[14px]">
      <span className="text-[#8A92A6] flex items-center gap-2 flex-shrink-0">{Icon && <Icon size={16} stroke={1.8} />}{label}</span>
      {urlEdit === field ? (
        <span className="flex-1 flex items-center gap-1 min-w-0">
          <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} autoFocus placeholder="Paste URL…"
            onKeyDown={(e) => { if (e.key === "Enter") { setUrlEdit(null); saveOne(field, urlDraft.trim() || null); } if (e.key === "Escape") setUrlEdit(null); }}
            className="flex-1 min-w-0 border border-gray-200 rounded px-1.5 py-1 text-[13px] outline-none focus:border-brand" />
          <button onClick={() => { setUrlEdit(null); saveOne(field, urlDraft.trim() || null); }} className="text-brand flex-shrink-0"><IconCheck size={14} /></button>
        </span>
      ) : value ? (
        <span className="flex items-center gap-1.5 min-w-0">
          <a href={value} target="_blank" rel="noreferrer" className="text-brand truncate hover:underline inline-flex items-center gap-1"><IconExternalLink size={13} />Open</a>
          <button onClick={() => { setUrlDraft(value); setUrlEdit(field); }} className="text-gray-400 hover:text-brand flex-shrink-0"><IconPencil size={12} /></button>
        </span>
      ) : (
        <button onClick={() => { setUrlDraft(""); setUrlEdit(field); }} className="text-gray-300 hover:text-brand">+ Add</button>
      )}
    </div>
  );

  // Attachments split by kind: creatives (the deliverable) vs references (mood-board).
  const attMap = (a: DetailAttachment) => ({ id: a.id as string | undefined, url: a.storage_path, name: a.filename, type: a.mime_type || "", removable: true });
  const creatives = [
    ...(detail?.attachments || []).filter((a) => a.kind !== "reference").map(attMap),
    ...row.attachments.map((a) => ({ id: undefined as string | undefined, url: a.url, name: a.filename, type: a.type || "", removable: false })),
  ];
  const refImages = (detail?.attachments || []).filter((a) => a.kind === "reference").map(attMap);
  const refLinks = detail?.referenceLinks ?? [];

  const upload = async (files: FileList, kind: "creative" | "reference" = "creative") => {
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("postId", row.id); fd.append("uploadedBy", uploaderKey); fd.append("file", f); fd.append("kind", kind);
        const res = await fetch("/api/marketing-hub/attach", { method: "POST", body: fd });
        if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Upload failed"); }
      }
      await loadDetail();
    } finally { setUploading(false); }
  };
  const removeCreative = async (id: string) => {
    const res = await fetch(`/api/marketing-hub/attach?id=${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not remove."); return; }
    await loadDetail();
  };
  const refFileRef = useRef<HTMLInputElement>(null);
  const [refLinkAdd, setRefLinkAdd] = useState(false);
  const [refLinkDraft, setRefLinkDraft] = useState("");
  const addRefLink = async () => {
    const v = refLinkDraft.trim(); if (!v) { setRefLinkAdd(false); return; }
    await saveOne("reference_links", [...refLinks, v]);
    setRefLinkDraft(""); setRefLinkAdd(false);
  };
  const removeRefLink = async (link: string) => { await saveOne("reference_links", refLinks.filter((l) => l !== link)); };
  const startEdit = (section: "content" | "caption", current: string) => { setDraft(current); setEditSection(section); };
  const saveEdit = async () => {
    if (!editSection) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/marketing-hub/update", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, actor: activeAuthor, fields: { [editSection]: draft } }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not save."); return; }
      setEditSection(null);
      await loadDetail(); // refreshes the field + surfaces the new Activity entry
    } finally { setSavingEdit(false); }
  };
  const editBtn = (section: "content" | "caption", current: string) =>
    editSection !== section ? (
      <button onClick={() => startEdit(section, current)} className="text-[11px] text-brand hover:underline flex items-center gap-1"><IconPencil size={12} stroke={2} />Edit</button>
    ) : null;
  const editBox = (rows: number, placeholder: string) => (
    <div className="space-y-2">
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={rows} autoFocus placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg p-2.5 text-[15px] leading-relaxed font-normal focus:outline-none focus:ring-1 focus:ring-brand" />
      <div className="flex items-center gap-2">
        <button onClick={saveEdit} disabled={savingEdit} className="text-[12px] font-medium bg-brand text-white rounded-lg px-3 py-1.5 disabled:opacity-60">{savingEdit ? "Saving…" : "Save"}</button>
        <button onClick={() => setEditSection(null)} className="text-[12px] text-gray-500 hover:text-gray-800 px-2">Cancel</button>
      </div>
    </div>
  );

  // Post a comment as the selected author (the "acting as" picker).
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const postComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await fetch("/api/marketing-hub/comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: row.id, authorKey: activeAuthor, body: text }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || "Could not post comment."); return; }
      setCommentText("");
      await loadDetail();
    } finally { setPosting(false); }
  };

  const detailRow = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-[14px] text-[#8A92A6]">{label}</span>
      <span className="text-[14px] text-[#232D42] text-right min-w-0">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6 hope-scope" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header — Hope-UI hero band: brand-tinted, large title */}
        <div className="relative flex items-start justify-between gap-4 px-7 py-6 border-b border-gray-100 flex-shrink-0 bg-gradient-to-r from-brand-light/70 via-brand-light/30 to-transparent">
          <span className="absolute left-0 top-5 bottom-5 w-1 rounded-r-full bg-brand" />
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-[22px] font-semibold text-[#232D42] leading-tight tracking-[-0.01em]">{row.particulars || "(untitled)"}</h2>
              {row.status && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1" style={{ background: sp.bg, color: sp.text }}>
                  {isDone && <IconCheck size={12} stroke={2.5} />}{row.status}
                </span>
              )}
              {row.needsReview && <span className="text-[11px] font-medium bg-amber-50 text-amber-700 rounded-full px-2.5 py-1">Needs review</span>}
            </div>
            <div className="flex items-center gap-2 mt-2 text-[13px] text-[#8A92A6] flex-wrap">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: sbuColor(row.sbu, []) }} />{row.sbu || "—"}</span>
              <span className="text-gray-300">·</span><span>{row.type || "—"}</span>
              <span className="text-gray-300">·</span><span className="inline-flex items-center gap-1"><IconCalendarEvent size={14} />Publishing {fmtDate(row.publishingDate)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0">×</button>
        </div>

        {/* Body — light canvas so the white cards read as real sections.
            Creatives sits in the content column (compact), so the Details + Activity
            column reaches the top and the feed is visible without deep scrolling. */}
        <div className="flex-1 overflow-auto bg-[#F6F7FB] p-5">
          <div className="grid md:grid-cols-5 gap-5 items-start">
            <div className="md:col-span-3 space-y-4">
              <Panel icon={IconPhoto} title="Creatives" accent
                right={<>
                  <span className="text-[11px] text-gray-400">{creatives.length || ""}</span>
                  {creatives.length > 0 && <button onClick={() => fileRef.current?.click()} className="text-[12px] font-medium text-brand inline-flex items-center gap-1"><IconPlus size={13} />Add</button>}
                </>}>
                <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf" className="hidden"
                  onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.currentTarget.value = ""; }} />
                {creatives.length > 0 ? (
                  <div className="flex flex-wrap gap-2.5">
                    {creatives.map((c, i) => {
                      const kind = creativeKind(c.name, c.type);
                      return (
                        <div key={c.id || i} role="button" tabIndex={0} onClick={() => setLightbox({ items: creatives, index: i })} onKeyDown={(e) => { if (e.key === "Enter") setLightbox({ items: creatives, index: i }); }}
                          className="group relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-100 cursor-pointer">
                          {kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.url} alt={c.name} className="w-full h-full object-cover" />
                          ) : kind === "video" ? (
                            <>
                              <video src={c.url} muted className="w-full h-full object-cover" />
                              <span className="absolute inset-0 flex items-center justify-center"><span className="bg-black/50 text-white rounded-full p-2"><IconPlayerPlay size={18} /></span></span>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1"><IconFileText size={26} /><span className="text-[10px] uppercase tracking-wide">{kind === "pdf" ? "PDF" : (c.type || "file").split("/")[1] || "file"}</span></div>
                          )}
                          <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium bg-black/60 text-white rounded px-1.5 py-0.5">{i + 1}</span>
                          {c.removable && c.id && (
                            <button onClick={(e) => { e.stopPropagation(); removeCreative(c.id!); }} title="Remove" className="absolute top-1.5 right-1.5 hidden group-hover:flex bg-white/95 shadow-sm rounded-full p-1 text-gray-500 hover:text-rose-600"><IconTrash size={13} /></button>
                          )}
                        </div>
                      );
                    })}
                    <button onClick={() => fileRef.current?.click()} className="w-24 h-24 flex-shrink-0 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-brand hover:text-brand transition">
                      <IconPlus size={18} /><span className="text-[10px] mt-1">{uploading ? "…" : "Add"}</span>
                    </button>
                  </div>
                ) : (
                  <div onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) upload(e.dataTransfer.files); }}
                    className="border-2 border-dashed border-brand/30 bg-brand-light/40 rounded-xl py-5 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-brand-light/70 transition">
                    <IconCloudUpload size={24} className="text-brand mb-1.5" stroke={1.6} />
                    <div className="text-[13px] font-medium text-[#232D42]">{uploading ? "Uploading…" : "Upload creatives"}</div>
                    <div className="text-[11px] text-[#8A92A6] mt-0.5">Drag &amp; drop or click to browse</div>
                  </div>
                )}
              </Panel>

              {/* References — mood-board (above Content): reference images and/or links */}
              <Panel icon={IconBookmark} title="References">
                <input ref={refFileRef} type="file" multiple accept="image/*,video/*,.pdf" className="hidden"
                  onChange={(e) => { if (e.target.files?.length) upload(e.target.files, "reference"); e.currentTarget.value = ""; }} />
                {refImages.length > 0 && (
                  <div className="flex flex-wrap gap-2.5 mb-3">
                    {refImages.map((c, i) => {
                      const kind = creativeKind(c.name, c.type);
                      return (
                        <div key={c.id || i} className="group relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-100">
                          {kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.url} alt={c.name} onClick={() => setLightbox({ items: refImages, index: i })} className="w-full h-full object-cover cursor-pointer" />
                          ) : (
                            <a href={c.url} target="_blank" rel="noreferrer" className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1"><IconFileText size={22} /><span className="text-[9px] uppercase">{kind === "pdf" ? "PDF" : "file"}</span></a>
                          )}
                          {c.id && <button onClick={() => removeCreative(c.id!)} title="Remove" className="absolute top-1 right-1 hidden group-hover:flex bg-white/95 shadow-sm rounded-full p-1 text-gray-500 hover:text-rose-600"><IconTrash size={12} /></button>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {refLinks.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {refLinks.map((l) => (
                      <div key={l} className="flex items-center gap-2 text-[14px] group">
                        <IconExternalLink size={14} className="text-gray-400 flex-shrink-0" />
                        <a href={l} target="_blank" rel="noreferrer" className="text-brand truncate hover:underline flex-1 min-w-0">{l}</a>
                        <button onClick={() => removeRefLink(l)} title="Remove" className="text-gray-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 flex-shrink-0"><IconTrash size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {refLinkAdd && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <input value={refLinkDraft} onChange={(e) => setRefLinkDraft(e.target.value)} autoFocus placeholder="Paste a reference link…"
                      onKeyDown={(e) => { if (e.key === "Enter") addRefLink(); if (e.key === "Escape") setRefLinkAdd(false); }}
                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[14px] outline-none focus:border-brand" />
                    <button onClick={addRefLink} className="text-[12px] font-medium bg-brand text-white rounded-lg px-3 py-1.5">Add</button>
                    <button onClick={() => setRefLinkAdd(false)} className="text-[12px] text-gray-500 px-1">Cancel</button>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <button onClick={() => refFileRef.current?.click()} className="text-[13px] font-medium text-brand inline-flex items-center gap-1.5"><IconPhoto size={15} />{uploading ? "Uploading…" : "Add image"}</button>
                  <button onClick={() => { setRefLinkDraft(""); setRefLinkAdd(true); }} className="text-[13px] font-medium text-brand inline-flex items-center gap-1.5"><IconExternalLink size={15} />Add link</button>
                </div>
                {refImages.length === 0 && refLinks.length === 0 && !refLinkAdd && <div className="text-[14px] text-gray-400 italic mt-2.5">No references yet — add an image or a link.</div>}
              </Panel>

              <Panel icon={IconFileText} title="Content" right={editBtn("content", content)}>
                {editSection === "content" ? editBox(14, "Write the content brief…")
                  : content ? <div className="text-[15px] leading-relaxed prose prose-sm max-w-none text-gray-800 [&_*]:text-[15px] [&_*]:leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />
                  : loadingDetail ? <div className="text-[15px] text-gray-400">Loading content…</div>
                  : <div className="text-[15px] text-gray-400 italic">No content written yet.</div>}
              </Panel>

              <Panel icon={IconMessageCircle2} title="Caption" right={editBtn("caption", caption)}>
                {editSection === "caption" ? editBox(5, "Write the post caption…")
                  : caption ? <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-gray-800">{caption}</div>
                  : <div className="text-[15px] text-gray-400 italic">No caption yet.</div>}
              </Panel>

              {notes && (
                <Panel icon={IconFileDescription} title="Additional info">
                  <div className="text-[15px] prose prose-sm max-w-none [&_*]:text-[15px]" dangerouslySetInnerHTML={{ __html: notes }} />
                </Panel>
              )}

            </div>

            <div className="md:col-span-2 space-y-4">
              <Panel title="Details">
                {detailRow("Status", row.status ? <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5" style={{ background: sp.bg, color: sp.text }}>{isDone && <IconCheck size={11} stroke={2.5} />}{row.status}</span> : null)}
                {detailRow("Owner", row.owner ? <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium" style={{ background: "#EEEDFE", color: "#3C3489" }}>{row.owner.trim().slice(0, 1).toUpperCase()}</span>{row.owner}</span> : null)}
                {detailRow("Priority", row.priority ? <span className="text-[11px] font-medium rounded-full px-2 py-0.5" style={{ background: pp.bg, color: pp.text }}>{row.priority}</span> : null)}
                {detailRow("Publish to page", row.publishToPage)}
                {detailRow("Platforms", (
                  <div className="flex flex-wrap gap-1 justify-end">
                    {platformChips.map((p) => {
                      const on = platformsCur.includes(p);
                      return <button key={p} onClick={() => togglePlatform(p)} className={`text-[10.5px] px-2 py-0.5 rounded-full border transition ${on ? "bg-brand-light text-brand border-brand/30" : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"}`}>{p}</button>;
                    })}
                  </div>
                ))}
                {detailRow("Due date", fmtDate(row.dueDate))}
                {detailRow("Completed", row.completionTime ? fmtWhen(row.completionTime) : null)}
                {detailRow("Publishing", fmtDate(row.publishingDate))}
                {detailRow("Start", row.startAt ? fmtWhen(row.startAt) : null)}
                {detailRow("End", row.endAt ? fmtWhen(row.endAt) : null)}
                {row.startAt && row.endAt && detailRow("Time taken", durationBetween(row.startAt, row.endAt))}
                {detailRow("Created", row.createdDate ? fmtWhen(row.createdDate) : null)}
                {detailRow("Last modified", row.lastModified ? fmtWhen(row.lastModified) : null)}
              </Panel>

              {collaborators && (
                <Panel icon={IconUsers} title="Collaborators">
                  <div className="space-y-2">
                    {collaborators.map((c) => (
                      <div key={c.key} className="flex items-center gap-2 text-[14px]">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0" style={{ background: "#EEEDFE", color: "#3C3489" }}>{c.name.trim().slice(0, 1).toUpperCase()}</span>
                        <span className="text-[#232D42]">{c.name}</span>{c.role && <span className="text-[11px] text-gray-400">· {c.role}</span>}
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {/* Published-post links — its own section. Paste the live URL once published;
                  a weekly job can later find these + compress the creative images. */}
              <Panel icon={IconExternalLink} title="Published links">
                {urlRow("instagram_url", "Instagram", igUrl, IconBrandInstagram)}
                {urlRow("facebook_url", "Facebook", fbUrl, IconBrandFacebook)}
                {urlRow("linkedin_url", "LinkedIn", liUrl, IconBrandLinkedin)}
              </Panel>

              {/* Unified activity feed — edits + comments, filterable (Airtable-style) */}
              <Panel icon={IconHistory} title="Activity" right={
                <div className="relative">
                  <button onClick={() => setFeedFilterOpen((v) => !v)} className="text-[11px] text-gray-500 hover:text-gray-800 flex items-center gap-1 border border-gray-200 rounded-md px-2 py-1">
                    {feedFilter === "all" ? "All activity" : feedFilter === "revisions" ? "Revision history" : "Comments"}
                    <IconChevronDown size={12} />
                  </button>
                  {feedFilterOpen && (
                    <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-100 rounded-lg shadow-sm z-30 py-1 text-[12.5px]">
                      {(([["all", "All activity"], ["revisions", "Revision history"], ["comments", "Comments"]]) as [typeof feedFilter, string][]).map(([v, l]) => (
                        <button key={v} onClick={() => { setFeedFilter(v); setFeedFilterOpen(false); }} className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center justify-between ${feedFilter === v ? "text-brand font-medium" : "text-gray-700"}`}>{l}{feedFilter === v && <IconCheck size={13} />}</button>
                      ))}
                      <div className="border-t border-gray-100 my-1" />
                      <button onClick={() => setShowResolved((s) => !s)} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center justify-between text-gray-700">Show resolved comments{showResolved && <IconCheck size={13} />}</button>
                    </div>
                  )}
                </div>
              }>
                {loadingDetail ? <div className="text-sm text-gray-400">Loading…</div>
                  : feed.length === 0 ? <div className="text-sm text-gray-400 italic py-2">No activity yet.</div>
                  : (
                    <div className="space-y-4">
                      {feed.slice(0, feedLimit).map((it) => {
                        const av = feedAvatar(it.key, it.name);
                        const stFrom = it.kind === "activity" && PILL_FIELDS.has(it.action) ? calStatusStyle(it.from || "") : null;
                        const stTo = it.kind === "activity" && PILL_FIELDS.has(it.action) ? calStatusStyle(it.to || "") : null;
                        return (
                          <div key={it.id} className="flex gap-2.5">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0 mt-0.5" style={{ background: av.bg, color: av.fg }} title={av.system ? "System / imported" : it.name}>{av.system ? <IconHistory size={11} /> : av.initials}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[14px] text-gray-700">
                                <span className="font-medium text-[#232D42]">{av.system ? "System" : it.name}</span>{" "}
                                {it.kind === "comment" ? "commented" : (ACT_VERB[it.action] || it.action.replace(/_/g, " "))}
                                <span className="text-gray-400"> · {relTime(it.at)}</span>
                                {it.kind === "comment" && it.resolved && <span className="ml-1.5 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">resolved</span>}
                              </div>
                              {it.kind === "comment" ? (
                                <div className="text-[14px] text-gray-800 whitespace-pre-wrap mt-0.5">{it.body}</div>
                              ) : stFrom || stTo ? (
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {it.from && <span className="text-[11px] px-2 py-0.5 rounded-full line-through" style={{ background: stFrom!.bg, color: stFrom!.text }}>{it.from}</span>}
                                  {it.from && it.to && <IconChevronRight size={12} className="text-gray-400" />}
                                  {it.to && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: stTo!.bg, color: stTo!.text }}>{it.to}</span>}
                                </div>
                              ) : DIFF_FIELDS.has(it.action) ? (
                                <div className="mt-1">
                                  {expandedDiffs.has(it.id) && <div className="text-[12.5px] border border-gray-100 rounded-lg p-2 bg-gray-50/60 mb-1">{wordDiff(it.from || "", it.to || "")}</div>}
                                  <button onClick={() => setExpandedDiffs((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} className="text-[11px] text-brand hover:underline">{expandedDiffs.has(it.id) ? "Hide changes" : "Show what changed"}</button>
                                </div>
                              ) : (it.from || it.to) ? (
                                <div className="text-[12px] mt-0.5">
                                  {it.from && <span className="line-through text-red-500">{it.from}</span>}
                                  {it.from && it.to && <span className="text-gray-400"> → </span>}
                                  {it.to && <span className="text-emerald-700">{it.to}</span>}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {feed.length > feedLimit && (
                        <button onClick={() => setFeedLimit((l) => l + 25)} className="text-[12px] text-brand hover:underline">Show more ({feed.length - feedLimit})</button>
                      )}
                    </div>
                  )}

                {/* Composer — account-specific: comments + edits are stamped with the
                    logged-in user (no manual picker). Extra spacing so the section breathes. */}
                <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                    {(() => { const a = feedAvatar(activeAuthor, authorLabel(activeAuthor)); return <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: a.bg, color: a.fg }}>{a.initials}</span>; })()}
                    <span>Commenting as <span className="font-medium text-[#232D42]">{authorLabel(activeAuthor)}</span></span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    {(() => { const a = feedAvatar(activeAuthor, authorLabel(activeAuthor)); return <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0" style={{ background: a.bg, color: a.fg }}>{a.initials}</span>; })()}
                    <div className="flex-1 min-w-0">
                      <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3}
                        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); postComment(); } }}
                        placeholder="Leave a comment…  (⌘/Ctrl + Enter to post)"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14.5px] resize-none outline-none focus:border-brand" />
                      <div className="flex justify-end mt-2">
                        <button onClick={postComment} disabled={posting || !commentText.trim()}
                          className="bg-brand text-white text-[12px] font-medium rounded-lg px-4 py-1.5 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed">
                          {posting ? "Posting…" : "Comment"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
    {lightbox && lightbox.items[lightbox.index] && (
      <CreativeViewer creatives={lightbox.items} index={lightbox.index} setIndex={(n) => setLightbox((l) => l ? { items: l.items, index: n } : null)} onClose={() => setLightbox(null)} />
    )}
    </>
  );
}

function ModalLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] group">
      <span className="text-[#8A92A6] w-16 flex-shrink-0">{label}</span>
      <span className="text-brand group-hover:underline truncate">{href}</span>
    </a>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm mt-1">{value || "—"}</div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</div>
      {children}
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-20">{label}</span>
      <a href={href} target="_blank" rel="noreferrer" className="text-brand hover:underline truncate">{href}</a>
    </div>
  );
}
