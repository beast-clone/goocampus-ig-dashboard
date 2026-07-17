"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { HopeSelect } from "@/app/(dashboard)/dashboard/hope-preview/HopeSelect";
import { LiveIndicator } from "@/components/LiveIndicator";
import { NewTaskButton } from "@/components/NewTaskModal";
import { useApi } from "@/lib/use-api";
import { IconSearch, IconPaperclip, IconBrandInstagram, IconBrandFacebook, IconBrandLinkedin, IconBrandYoutube, IconFilter, IconLayoutList, IconPalette } from "@tabler/icons-react";

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
  needsReview: boolean;
  syncedToScheduler: boolean;
  caption: string;
  content: string;
  additionalInfo: string;
  outputLink: string;
  instagramUrl: string;
  facebookUrl: string;
  link: string;
  slackLink: string;
  attachments: { url: string; filename: string; type?: string }[];
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

const PENDING_STATUSES = ["Content - Pending", "Content - In Progress"];
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
  { key: "Content - In Progress", label: "In Progress",         color: "#D9A05B" },
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

export default function MarketingHubPage() {
  return (
    <HopeDashboardShell active="marketing-hub" title="Marketing Hub" subtitle="Content calendar for the marketing team — SBU · Type · Owner · Publishing Date." hideAccountPicker hideRange>
      {({ range, setRange }) => <Inner range={range} setRange={setRange} />}
    </HopeDashboardShell>
  );
}

function Inner({ range, setRange }: { range: { from: string; to: string }; setRange: (r: { from: string; to: string }) => void }) {
  // Deep-link: /dashboard/marketing-hub?open=<mh_posts.id> opens that task.
  const openParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("open") || "" : "";
  const qs = new URLSearchParams({ from: range.from, to: range.to, ...(openParam ? { open: openParam } : {}) }).toString();
  const { data, isLoading, refresh } = useApi<Data>(`/api/marketing-hub?${qs}`);

  // Sub-tab is driven by ?tab= so the sidebar folder (Master sheet · Team ·
  // Pipeline · Content calendar · Next 7 days) deep-links reactively — Next's
  // <Link> updates useSearchParams without a reload (a URL #hash would not fire
  // a hashchange on Link's pushState, so tabs wouldn't switch until refresh).
  const searchParams = useSearchParams();
  const TABS = ["team", "master", "pipeline", "calendar"];
  const tabParam = searchParams.get("tab") || "team";
  const tab = TABS.includes(tabParam) ? tabParam : "master";

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
      {/* Top bar: entries count · global search · live. The Workload tab drives its
          own filtering (person cards + date range), so it hides the count + search. */}
      <div className="flex items-center gap-4">
        {tab !== "team" && (
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

      {/* Compact filter dropdowns — hidden on Pipeline (whole picture) and Workload (own controls). */}
      {tab !== "pipeline" && tab !== "team" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-1">Filter</span>
          <CompactFacet label="SBU" value={filters.sbu} options={data?.facets.sbu || []} onChange={(v) => setFilters({ ...filters, sbu: v })} />
          <CompactFacet label="Type" value={filters.type} options={data?.facets.type || []} onChange={(v) => setFilters({ ...filters, type: v })} />
          <CompactFacet label="Status" value={filters.status} options={data?.facets.status || []} onChange={(v) => setFilters({ ...filters, status: v })} />
          <CompactFacet label="Owner" value={filters.owner} options={data?.facets.owner || []} onChange={(v) => setFilters({ ...filters, owner: v })} />
          <CompactFacet label="Priority" value={filters.priority} options={data?.facets.priority || []} onChange={(v) => setFilters({ ...filters, priority: v })} />
          {(filters.sbu || filters.type || filters.status || filters.owner || filters.priority) && (
            <button onClick={() => setFilters({ sbu: "", type: "", status: "", owner: "", priority: "" })} className="text-sm text-gray-500 hover:text-gray-800 px-2">Clear</button>
          )}
        </div>
      )}

      {tab === "master" && (
        <MasterSheet rows={filtered} facets={data?.facets} onOpen={setOpenId} onSaved={refresh} loading={isLoading} />
      )}

      {tab === "team" && (
        <TeamView rows={filtered} allRows={data?.rows || []} facets={data?.facets} onOpen={setOpenId} loading={isLoading} range={range} setRange={setRange} />
      )}

      {tab === "pipeline" && (
        <PipelineView rows={filtered} facets={data?.facets} onOpen={setOpenId} loading={isLoading} />
      )}

      {tab === "calendar" && (
        <CalendarView rows={filtered} range={range} facets={data?.facets} onOpen={setOpenId} onSaved={refresh} loading={isLoading} />
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
      if (dd && dd < today && !isDone) overdue_ += 1;
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
      if (r.status === "Content - In Progress") inProgress += 1;
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
        <BigStat label="In progress" value={totals.inProgress} accent="#EF9F27" />
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
      if (dd && dd < todayStr) overdue.push(r);
      else if (ref && ref === todayStr) today_.push(r);
      else if (ref && ref > todayStr && ref <= weekAhead) week.push(r);
      else upcoming.push(r);
    }
    const byRef = (a: Row, b: Row) => (a.publishingDate || a.dueDate || "9999").localeCompare(b.publishingDate || b.dueDate || "9999");
    overdue.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    [today_, week, upcoming].forEach((g) => g.sort(byRef));
    done.sort((a, b) => (b.completionTime || "").localeCompare(a.completionTime || ""));
    return { overdue, today: today_, week, upcoming, done };
  }, [mine, todayStr, weekAhead]);

  const openCount = sections.overdue.length + sections.today.length + sections.week.length + sections.upcoming.length;

  const renderRow = (r: Row, opts?: { overdue?: boolean; done?: boolean }) => {
    const sp = statusPill(r.status);
    const dd = (r.dueDate || "").slice(0, 10);
    const daysOver = opts?.overdue && dd ? Math.max(0, Math.round((Date.parse(todayStr) - Date.parse(dd)) / 86_400_000)) : null;
    const dateShown = opts?.done ? r.completionTime : (r.publishingDate || r.dueDate);
    return (
      <div key={r.id} onClick={() => onOpen(r.id)} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
        <span className="text-[13px] font-medium text-gray-800 flex-1 min-w-0 truncate" title={r.particulars}>{r.particulars || <span className="text-gray-400 italic">Untitled</span>}</span>
        <span className="text-[11px] text-gray-500 flex-shrink-0 whitespace-nowrap hidden sm:inline">{r.sbu || "—"}</span>
        {r.status && <span className="text-[10px] font-medium px-2 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap" style={{ background: sp.bg, color: sp.text }}>{r.status}</span>}
        {daysOver != null && <span className="text-[10px] font-medium px-2 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap bg-rose-100 text-rose-700">{daysOver}d overdue</span>}
        <span className="text-[11px] text-gray-400 flex-shrink-0 w-20 text-right">{opts?.done ? "done · " : ""}{fmtDate(dateShown)}</span>
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
    <div className="bg-white border border-gray-100 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: member.color }}>
            {member.av}
          </div>
          <div>
            <div className="text-lg font-medium">{member.label} · full task list</div>
            <div className="text-sm text-gray-500">{member.displayRole} · everything in the selected range</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-md px-2.5 py-1 whitespace-nowrap">{openCount} open · <span className={sections.overdue.length ? "text-rose-600 font-medium" : ""}>{sections.overdue.length} overdue</span></span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="Close">×</button>
        </div>
      </div>

      {/* Grouped task list: Overdue → Due today → This week → Upcoming → Done */}
      <div className="px-4 py-3">
        {openCount === 0 && sections.done.length === 0 ? (
          <div className="px-2 py-10 text-center text-gray-400 text-sm">No tasks for {member.label} in this range.</div>
        ) : GROUPS.map((g) => g.rows.length > 0 && (
          <div key={g.key} className="mb-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ background: g.bg }}>
              <span className="w-2 h-2 rounded-full" style={{ background: g.dot }} />
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: g.text }}>{g.label}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/70" style={{ color: g.text }}>{g.rows.length}</span>
            </div>
            <div className="mt-0.5">{g.rows.map((r) => renderRow(r, g.opts))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MHCAL_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MHCAL_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Status → pill palette. Mirrors the Hope UI publishing calendar's approach: soft-tinted
// bg + matching border + colored text so status is legible at a glance across the grid.
// Unmapped statuses fall through to the neutral gray.
const CAL_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Content - Pending":     { bg: "#F1F3F8", text: "#5B6472", border: "#D3D8E1" },
  "Content - In Progress": { bg: "#FEF3E2", text: "#B45309", border: "#F4DBB0" },
  "Content - Approved":    { bg: "#E1F5EE", text: "#0F6E56", border: "#B2E1D0" },
  "Output - Ready":        { bg: "#E4ECFF", text: "#2138B0", border: "#BBCCF7" },
  "Ready to Publish":      { bg: "#E3F5EA", text: "#157F3C", border: "#B9E4D2" },
  "Published/Scheduled":   { bg: "#EEEDFE", text: "#3C3489", border: "#CFCBFA" },
};
function calStatusStyle(s: string): { bg: string; text: string; border: string } {
  return CAL_STATUS_COLORS[s] || { bg: "#F1F3F8", text: "#5B6472", border: "#D3D8E1" };
}

const MHCAL_CSS = `
.mhcal{color:#0F172A;font-feature-settings:"cv02","cv03","cv04","cv11"}
.mhcal button{font-family:inherit;cursor:pointer}
/* Hero band — indigo→violet ramp, distinct from the publishing calendar's blue */
.mhcal-hero{position:relative;background:linear-gradient(115deg,#4C4CE2 0%,#6F5BEA 50%,#8B6DF2 100%);border-radius:16px;padding:1.35rem 1.7rem 3rem;color:#fff;overflow:hidden;display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
.mhcal-hero::after{content:"";position:absolute;right:-40px;top:-60px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.16),transparent 62%)}
.mhcal-hero::before{content:"";position:absolute;right:120px;bottom:-90px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.10),transparent 62%)}
.mhcal-hero-txt{position:relative;z-index:1;max-width:640px}
.mhcal-hero-tag{display:inline-block;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;background:rgba(255,255,255,.22);padding:.22rem .6rem;border-radius:20px;margin-bottom:.5rem}
.mhcal-hero-txt h1{margin:0;font-size:1.55rem;font-weight:800;letter-spacing:-.018em;line-height:1.15}
.mhcal-hero-txt p{margin:.3rem 0 0;font-size:.86rem;color:rgba(255,255,255,.95);line-height:1.45}
.mhcal-hero-stat{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-end;gap:.15rem;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);padding:.7rem 1rem;border-radius:12px;backdrop-filter:blur(2px);min-width:125px}
.mhcal-hero-statv{font-size:1.55rem;font-weight:800;letter-spacing:-.02em;line-height:1}
.mhcal-hero-statl{font-size:.64rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.82)}
/* Title card, pulled up to overlap the hero */
.mhcal-titlecard{position:relative;z-index:2;margin:-2.15rem 1rem 0;background:#fff;border:1px solid #EEF0F4;border-radius:14px;box-shadow:0 12px 28px rgba(20,25,60,.10);padding:.85rem 1.35rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.mhcal-titlecard h4{margin:0;font-size:1.15rem;font-weight:700;color:#0F172A;letter-spacing:-.012em}
.mhcal-titlemeta{font-size:.76rem;color:#6B7280;font-weight:500}
.mhcal-titlemeta b{color:#0F172A;font-weight:600}
/* Brand filter — pill chips one-click filter across SBUs (primary interest) */
.mhcal-brands{display:flex;align-items:center;gap:.4rem;margin-top:.8rem;padding:.65rem .8rem;background:#fff;border:1px solid #EEF0F4;border-radius:12px;overflow-x:auto;scrollbar-width:thin}
.mhcal-brands::-webkit-scrollbar{height:6px}
.mhcal-brands::-webkit-scrollbar-thumb{background:#D3D8E1;border-radius:3px}
.mhcal-brands-lbl{font-size:.66rem;text-transform:uppercase;letter-spacing:.09em;color:#94A0AF;font-weight:700;padding-right:.5rem;flex:0 0 auto}
.mhcal-brand{display:inline-flex;align-items:center;gap:.42rem;padding:.4rem .78rem;border-radius:99px;background:#F5F6FA;color:#4B5563;font-size:.75rem;font-weight:500;border:1px solid transparent;flex:0 0 auto;transition:.15s;white-space:nowrap;letter-spacing:-.003em}
.mhcal-brand:hover{background:#EAECF3;color:#0F172A}
.mhcal-brand.on{background:#0F172A;color:#fff}
.mhcal-brand .bdot{width:8px;height:8px;border-radius:50%;flex:0 0 8px}
.mhcal-brand .bcount{opacity:.7;font-weight:500;font-size:.68rem;font-variant-numeric:tabular-nums}
.mhcal-brand.on .bcount{opacity:.85}
/* Calendar card */
.mhcal-card{background:#fff;border:1px solid #EEF0F4;border-radius:16px;box-shadow:0 6px 16px rgba(20,25,60,.05);overflow:hidden;margin-top:.75rem}
.mhcal-dow{display:grid;grid-template-columns:repeat(7,1fr);background:#FAFBFC;border-bottom:1px solid #EEF0F4}
.mhcal-dow span{padding:.65rem .7rem;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#94A0AF;border-right:1px solid #EEF0F4}
.mhcal-dow span:last-child{border-right:none}
.mhcal-grid{display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:minmax(126px,1fr)}
.mhcal-cell{border-right:1px solid #EEF0F4;border-top:1px solid #EEF0F4;padding:.4rem;position:relative;min-width:0;transition:background .15s}
.mhcal-cell:nth-child(7n){border-right:none}
.mhcal-cell.out{background:#FAFBFC}
.mhcal-cell.today{background:rgba(76,76,226,.045)}
.mhcal-cell.over{background:rgba(76,76,226,.09);box-shadow:inset 0 0 0 2px rgba(76,76,226,.35)}
.mhcal-daynum{text-align:right;font-size:.75rem;font-weight:600;color:#4B5563;padding:.05rem .3rem .3rem;font-variant-numeric:tabular-nums}
.mhcal-cell.out .mhcal-daynum{color:#C4CBD4}
.mhcal-cell.today .mhcal-daynum{display:inline-flex;float:right;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:12px;background:#4C4CE2;color:#fff;font-weight:700}
.mhcal-events{display:flex;flex-direction:column;gap:3px;clear:both}
/* Event pill — Hope V1 look: 1px border matching bg-tint, colored text, small SBU dot
   + brand name on the right so primary interest reads at a glance. */
.mhcal-ev{display:flex;align-items:center;gap:6px;width:100%;text-align:left;border:1px solid;border-radius:6px;padding:2.5px 7px;overflow:hidden;transition:filter .1s,transform .1s;cursor:grab}
.mhcal-ev:hover{filter:brightness(.96);transform:translateX(1px)}
.mhcal-ev:active{cursor:grabbing}
.mhcal-evdot{width:7px;height:7px;border-radius:2px;flex:0 0 7px}
.mhcal-evtitle{font-size:.7rem;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-.005em}
.mhcal-evsbu{font-size:.6rem;font-weight:600;opacity:.7;flex:0 0 auto;max-width:78px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-.003em}
.mhcal-more{border:none;background:none;font-size:.66rem;color:#94A0AF;text-align:left;padding:1px 6px;font-weight:600}
.mhcal-more:hover{color:#4C4CE2}
/* Status legend — compact strip so the pill color→meaning is obvious */
.mhcal-slegend{margin-top:.75rem;padding:.7rem 1rem;background:#fff;border:1px solid #EEF0F4;border-radius:12px;display:flex;flex-wrap:wrap;gap:.6rem 1.1rem;font-size:.72rem;color:#4B5563;font-weight:500}
.mhcal-slegend-item{display:inline-flex;align-items:center;gap:.45rem}
.mhcal-slegend-chip{width:14px;height:14px;border-radius:4px;border:1px solid;flex:0 0 14px}
`;

function CalendarView({ rows, range, facets, onOpen, onSaved, loading }: { rows: Row[]; range: { from: string; to: string }; facets?: Facets; onOpen: (id: string) => void; onSaved: () => void; loading: boolean }) {
  // Brand quick-filter — "" = All. Isolates a single SBU across the whole grid without
  // touching the master hub-level filter, so the calendar can drill into one brand cheaply.
  const [activeBrand, setActiveBrand] = useState<string>("");

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

  // 42-cell month grid (mirrors the publishing calendar's HopeCalendar layout so the two
  // pages read as siblings — always 6 full rows, prev/next-month spillover greyed out).
  const fromDate = new Date(range.from);
  const y = fromDate.getFullYear();
  const mo = fromDate.getMonth();
  const monthGrid = useMemo(() => {
    const firstOfMonth = new Date(y, mo, 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - firstOfMonth.getDay());
    const today = ymd(new Date());
    const cells: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      cells.push({ date: d, inMonth: d.getMonth() === mo, isToday: ymd(d) === today });
    }
    return cells;
  }, [y, mo]);

  const allSbus = facets?.sbu || [];
  const monthLabel = `${MHCAL_MONTH_NAMES[mo]} ${y}`;

  return (
    <div className="mhcal">
      <style dangerouslySetInnerHTML={{ __html: MHCAL_CSS }} />

      {/* Hero — tightened copy, higher-contrast subtitle */}
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

      {/* Title card overlapping the hero */}
      <div className="mhcal-titlecard">
        <h4>{monthLabel}</h4>
        <div className="mhcal-titlemeta">
          {loading ? "Syncing…" : <><b>{filteredRows.length}</b>{activeBrand ? <> in <b>{activeBrand}</b></> : ""} · drag any card to reschedule</>}
        </div>
      </div>

      {/* Brand quick-filter — one-click SBU isolate; primary interest is also shown
          on every task pill, so the brand stays legible even without a filter set. */}
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
              <button
                key={s}
                className={`mhcal-brand ${active ? "on" : ""}`}
                onClick={() => setActiveBrand((prev) => prev === s ? "" : s)}
              >
                <span className="bdot" style={{ background: sbuColor(s, allSbus) }} />
                {s}
                <span className="bcount">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Calendar card */}
      <div className="mhcal-card">
        <div className="mhcal-dow">
          {MHCAL_DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="mhcal-grid">
          {monthGrid.map((cell) => {
            const key = ymd(cell.date);
            const list = byDay.get(key) || [];
            const cls = `mhcal-cell${cell.inMonth ? "" : " out"}${cell.isToday ? " today" : ""}${dragOver === key ? " over" : ""}`;
            return (
              <div
                key={key}
                className={cls}
                onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                onDragLeave={() => setDragOver((prev) => (prev === key ? null : prev))}
                onDrop={(e) => dropOn(e, key)}
              >
                <div className="mhcal-daynum">{cell.date.getDate()}</div>
                <div className="mhcal-events">
                  {list.slice(0, 4).map((r) => {
                    const st = calStatusStyle(r.status);
                    const c = sbuColor(r.sbu, allSbus);
                    return (
                      <button
                        key={r.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; }}
                        onClick={() => onOpen(r.id)}
                        title={`${r.particulars} · ${r.type} · ${r.sbu} · ${r.owner || "—"} — drag to reschedule`}
                        className="mhcal-ev"
                        style={{ background: st.bg, borderColor: st.border, color: st.text }}
                      >
                        <span className="mhcal-evdot" style={{ background: c }} />
                        <span className="mhcal-evtitle">{r.particulars || "(untitled)"}</span>
                        {r.sbu && <span className="mhcal-evsbu">{r.sbu}</span>}
                      </button>
                    );
                  })}
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
  "Content - In Progress": { bg: "#FAEEDA", text: "#633806" },
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
function MasterSheet({ rows, facets, onOpen, onSaved, loading }: { rows: Row[]; facets?: Facets; onOpen: (id: string) => void; onSaved: () => void; loading: boolean }) {
  const allSbus = facets?.sbu || [];
  const statusOptions = facets?.status || PIPELINE_STAGES.map((s) => s.key);
  const priorityOptions = facets?.priority || ["Urgent", "High", "Medium", "Low"];
  const save = async (id: string, fields: Record<string, unknown>) => {
    const ok = await saveField(id, fields);
    if (ok) onSaved();
  };

  return (
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="text-base font-medium">Master sheet</div>
        <div className="text-sm text-gray-400">{fmtInt(rows.length)} records · edit Status · Owner · Priority · Date inline · click a row to open</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr className="text-gray-500 text-left">
              <th className="px-4 py-2.5 font-normal">Particulars</th>
              <th className="px-4 py-2.5 font-normal">SBU</th>
              <th className="px-4 py-2.5 font-normal">Type</th>
              <th className="px-4 py-2.5 font-normal">Status</th>
              <th className="px-4 py-2.5 font-normal">Owner</th>
              <th className="px-4 py-2.5 font-normal">Priority</th>
              <th className="px-4 py-2.5 font-normal">Publish</th>
              <th className="px-4 py-2.5 font-normal">Platforms</th>
              <th className="px-4 py-2.5 font-normal" aria-label="Attachments"><IconPaperclip size={14} className="text-gray-400" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">{loading ? "Loading…" : "No entries match"}</td></tr>
            )}
            {rows.map((r) => {
              const sp = statusPill(r.status);
              const pp = priorityPill(r.priority);
              const ownerKey = TEAM.find((m) => ownerMatches(r.owner, m))?.key ?? "";
              return (
                <tr key={r.id} onClick={() => onOpen(r.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-2.5 text-gray-800 max-w-[280px] truncate">{r.particulars || "(untitled)"}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sbuColor(r.sbu, allSbus) }} />
                      {r.sbu || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.type || "—"}</td>
                  <td className="px-4 py-2.5">
                    <EditableCell
                      display={r.status
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: sp.bg, color: sp.text }}>{r.status}</span>
                        : <span className="text-gray-300">— set</span>}
                      editControl={(done) => (
                        <select autoFocus defaultValue={r.status} onBlur={done} className={EDIT_SELECT_CLS}
                          onChange={async (e) => { await save(r.id, { status: e.target.value }); done(); }}>
                          {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <EditableCell
                      display={r.owner
                        ? <span className="inline-flex items-center gap-2"><span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium" style={{ background: "#EEEDFE", color: "#3C3489" }}>{r.owner.trim().slice(0, 1).toUpperCase()}</span>{r.owner}</span>
                        : <span className="text-gray-300">— assign</span>}
                      editControl={(done) => (
                        <select autoFocus defaultValue={ownerKey} onBlur={done} className={EDIT_SELECT_CLS}
                          onChange={async (e) => { await save(r.id, { owner_key: e.target.value || null }); done(); }}>
                          <option value="">Unassigned</option>
                          {TEAM.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <EditableCell
                      display={r.priority
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: pp.bg, color: pp.text }}>{r.priority}</span>
                        : <span className="text-gray-300">— set</span>}
                      editControl={(done) => (
                        <select autoFocus defaultValue={r.priority} onBlur={done} className={EDIT_SELECT_CLS}
                          onChange={async (e) => { await save(r.id, { priority: e.target.value }); done(); }}>
                          {priorityOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    <EditableCell
                      display={r.publishingDate ? <span>{fmtDate(r.publishingDate)}</span> : <span className="text-gray-300">— set date</span>}
                      editControl={(done) => (
                        <input type="date" autoFocus defaultValue={r.publishingDate?.slice(0, 10) || ""} onBlur={done} className={EDIT_SELECT_CLS}
                          onChange={async (e) => { await save(r.id, { publishing_date: e.target.value || null }); done(); }} />
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5"><PlatformIcons platforms={r.platforms} /></td>
                  <td className="px-4 py-2.5 text-gray-400">{r.attachments.length ? <span className="inline-flex items-center gap-0.5"><IconPaperclip size={13} />{r.attachments.length}</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-8 py-5 border-b border-gray-100">
          <div>
            <div className="text-xl font-medium">{row.particulars || "(untitled)"}</div>
            <div className="text-sm text-gray-500 mt-1">
              {row.sbu || "—"} · {row.type || "—"} · Publishing {fmtDate(row.publishingDate)}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-auto px-8 py-6 space-y-6">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <MetaField label="Status" value={row.status} />
            <MetaField label="Owner" value={row.owner} />
            <MetaField label="Priority" value={row.priority} />
            <MetaField label="Publish to page" value={row.publishToPage} />
            <MetaField label="Platforms" value={row.platforms.join(", ")} />
            <MetaField label="Collaborators" value={row.collaborators.join(", ")} />
            <MetaField label="Due date" value={fmtDate(row.dueDate)} />
            <MetaField label="Completion time" value={row.completionTime ? new Date(row.completionTime).toLocaleString("en-IN") : ""} />
          </div>

          {row.needsReview && (
            <div className="text-sm bg-amber-50 border border-amber-200 rounded px-4 py-2 text-amber-900">Needs review</div>
          )}
          {row.syncedToScheduler && (
            <div className="text-sm bg-green-50 border border-green-200 rounded px-4 py-2 text-green-900">Synced to Scheduler</div>
          )}

          {row.attachments.length > 0 && (
            <Section label="Attachments">
              <div className="grid grid-cols-4 gap-3">
                {row.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block border border-gray-100 rounded overflow-hidden hover:border-brand">
                    {a.type?.startsWith("image/") ? (
                      // Airtable-hosted thumbnails; safe to render as <img>.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.filename} className="w-full h-32 object-cover" />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center bg-gray-50 text-gray-400 text-xs">{a.type || "file"}</div>
                    )}
                    <div className="p-2 text-xs text-gray-600 truncate">{a.filename}</div>
                  </a>
                ))}
              </div>
            </Section>
          )}

          {row.caption && (
            <Section label="Caption">
              <div className="text-sm whitespace-pre-wrap text-gray-800">{row.caption}</div>
            </Section>
          )}

          {row.content && (
            <Section label="Content brief">
              <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: row.content }} />
            </Section>
          )}

          {row.additionalInfo && (
            <Section label="Additional info">
              <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: row.additionalInfo }} />
            </Section>
          )}

          {(row.outputLink || row.instagramUrl || row.facebookUrl || row.link || row.slackLink) && (
            <Section label="Links">
              <div className="text-sm space-y-1">
                {row.outputLink && <LinkRow label="Output" href={row.outputLink} />}
                {row.instagramUrl && <LinkRow label="Instagram" href={row.instagramUrl} />}
                {row.facebookUrl && <LinkRow label="Facebook" href={row.facebookUrl} />}
                {row.link && <LinkRow label="Link" href={row.link} />}
                {row.slackLink && <LinkRow label="Slack" href={row.slackLink} />}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
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
