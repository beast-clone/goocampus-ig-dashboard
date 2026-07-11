"use client";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { NewTaskButton } from "@/components/NewTaskModal";
import { useApi } from "@/lib/use-api";

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

type Role = "writer" | "designer" | "editor" | "manager";
type TeamMember = { key: string; label: string; role: Role; aliases: string[]; color: string };

// Maheen assigns work, doesn't receive it — kept out of team cards. The
// dashboard's top strip + Today's line-up IS her oversight view.
const TEAM: TeamMember[] = [
  { key: "manya", label: "Manya", role: "writer",   aliases: ["Manya B M", "Manya"],                                color: "#D4537E" },
  { key: "praveen", label: "Praveen", role: "designer", aliases: ["Praveen L", "Praveen"],                          color: "#378ADD" },
  { key: "nikhil", label: "Nikhil", role: "editor", aliases: ["NIKHI Shyamraj", "Nikhil Shyamraj", "Nikhil"],       color: "#EF9F27" },
  { key: "nandu", label: "Nandu", role: "editor", aliases: ["Nandu C", "Nandu"],                                   color: "#5DCAA5" },
];

const ROLE_LABEL: Record<Role, string> = {
  writer: "Content writer",
  designer: "Graphic designer",
  editor: "Video editor",
  manager: "Manager",
};

const ROLE_HIGHLIGHT: Record<Role, string> = {
  writer: "Captions pending",
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

const PIPELINE_STAGES = [
  { key: "Content - Pending",     label: "Content Pending",     color: "#B4B2A9" },
  { key: "Content - In Progress", label: "In Progress",         color: "#EF9F27" },
  { key: "Output - Ready",        label: "Output Ready",        color: "#378ADD" },
  { key: "Ready to Publish",      label: "Ready to Publish",    color: "#5DCAA5" },
  { key: "Published/Scheduled",   label: "Published",           color: "#26215C" },
];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function MarketingHubPage() {
  return (
    <DashboardShell title="Marketing Hub" subtitle="Content calendar for the marketing team — SBU · Type · Owner · Publishing Date.">
      {({ range }) => <Inner range={range} />}
    </DashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  // Deep-link: /dashboard/marketing-hub?open=<mh_posts.id> opens that task.
  const openParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("open") || "" : "";
  const qs = new URLSearchParams({ from: range.from, to: range.to, ...(openParam ? { open: openParam } : {}) }).toString();
  const { data, isLoading, refresh } = useApi<Data>(`/api/marketing-hub?${qs}`);
  const [view, setView] = useState<"dashboard" | "calendar" | "list">("dashboard");
  const [drillMember, setDrillMember] = useState<string | null>(null);
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
      <div className="flex items-center justify-between">
        <div className="text-base text-gray-500">
          {data ? <>{fmtInt(filtered.length)} of {fmtInt(data.totalInRange)} entries in this range{data.cached ? " · cached" : ""}</> : isLoading ? "Loading…" : ""}
        </div>
        <LiveIndicator isLoading={isLoading} onRefresh={refresh} />
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-100 rounded-lg p-5">
        <div className="grid grid-cols-6 gap-3 mb-3">
          <Facet label="SBU" value={filters.sbu} options={data?.facets.sbu || []} onChange={(v) => setFilters({ ...filters, sbu: v })} />
          <Facet label="Type" value={filters.type} options={data?.facets.type || []} onChange={(v) => setFilters({ ...filters, type: v })} />
          <Facet label="Status" value={filters.status} options={data?.facets.status || []} onChange={(v) => setFilters({ ...filters, status: v })} />
          <Facet label="Owner" value={filters.owner} options={data?.facets.owner || []} onChange={(v) => setFilters({ ...filters, owner: v })} />
          <Facet label="Priority" value={filters.priority} options={data?.facets.priority || []} onChange={(v) => setFilters({ ...filters, priority: v })} />
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Search</div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, caption…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={() => setView("dashboard")} className={`px-4 py-1.5 text-sm rounded ${view === "dashboard" ? "bg-brand text-white" : "border border-gray-200 hover:bg-gray-50"}`}>Dashboard</button>
            <button onClick={() => setView("calendar")} className={`px-4 py-1.5 text-sm rounded ${view === "calendar" ? "bg-brand text-white" : "border border-gray-200 hover:bg-gray-50"}`}>Calendar</button>
            <button onClick={() => setView("list")} className={`px-4 py-1.5 text-sm rounded ${view === "list" ? "bg-brand text-white" : "border border-gray-200 hover:bg-gray-50"}`}>List</button>
          </div>
          {(filters.sbu || filters.type || filters.status || filters.owner || filters.priority || search) && (
            <button onClick={() => { setFilters({ sbu: "", type: "", status: "", owner: "", priority: "" }); setSearch(""); }} className="text-sm text-gray-500 hover:text-gray-800">Clear filters</button>
          )}
        </div>
      </div>

      {view === "dashboard" && (
        <DashboardView rows={filtered} onOpen={setOpenId} onOpenMember={setDrillMember} loading={isLoading} />
      )}

      {drillMember && data && (
        <PersonPanel
          member={TEAM.find((m) => m.key === drillMember)!}
          allRows={data.rows}
          onOpen={setOpenId}
          onClose={() => setDrillMember(null)}
        />
      )}

      {view === "calendar" && (
        <CalendarView rows={filtered} range={range} facets={data?.facets} onOpen={setOpenId} loading={isLoading} />
      )}

      {view === "list" && (
        <ListView rows={filtered} facets={data?.facets} onOpen={setOpenId} loading={isLoading} />
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

function Facet({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-white">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function DashboardView({ rows, onOpen, onOpenMember, loading }: { rows: Row[]; onOpen: (id: string) => void; onOpenMember: (key: string) => void; loading: boolean }) {
  const today = ymd(new Date());
  const weekAhead = ymd(new Date(Date.now() + 7 * 86_400_000));
  const weekAgo = ymd(new Date(Date.now() - 7 * 86_400_000));

  // Team-wide totals for the top strip.
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
    return { publishingToday, overdue, awaitingApproval, completedThisWeek, inProgress, total: rows.length };
  }, [rows, today, weekAgo]);

  // Per-team-member queue counts.
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
    // Role-specific highlight metric
    if (m.role === "writer") {
      roleHighlight = mine.filter((r) => !r.caption && PENDING_STATUSES.includes(r.status)).length;
    } else if (m.role === "designer") {
      roleHighlight = mine.filter((r) => DESIGN_TYPES.includes(r.type) && PENDING_STATUSES.includes(r.status)).length;
    } else if (m.role === "editor") {
      roleHighlight = mine.filter((r) => VIDEO_TYPES.includes(r.type) && PENDING_STATUSES.includes(r.status)).length;
    } else if (m.role === "manager") {
      // Manager's highlight = ALL rows across the team awaiting approval, not just Maheen's own.
      roleHighlight = rows.filter((r) => r.needsReview).length;
    }
    return { member: m, mine, today: today_, week, overdue: overdue_, done: done_, roleHighlight };
  }), [rows, today, weekAgo, weekAhead]);

  // Pipeline stage counts.
  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of PIPELINE_STAGES) counts[s.key] = 0;
    for (const r of rows) if (counts[r.status] !== undefined) counts[r.status] += 1;
    return PIPELINE_STAGES.map((s) => ({ ...s, count: counts[s.key] }));
  }, [rows]);

  // Week-ahead publishing strip: 7 tiles starting today.
  const weekAheadDays = useMemo(() => {
    const days: { date: string; label: string; rows: Row[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 86_400_000);
      const key = ymd(d);
      const label = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
      days.push({ date: key, label, rows: rows.filter((r) => r.publishingDate?.slice(0, 10) === key) });
    }
    return days;
  }, [rows]);

  if (loading && rows.length === 0) {
    return <div className="bg-white border border-gray-100 rounded-lg p-10 text-center text-gray-400">Loading team dashboard…</div>;
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

      {/* Today's line-up — the manager's daily-oversight view */}
      {(() => {
        const todaysList = rows.filter((r) => r.publishingDate?.slice(0, 10) === today && !DONE_STATUSES.includes(r.status));
        const overdueList = rows.filter((r) => {
          const dd = r.dueDate?.slice(0, 10) || "";
          return dd && dd < today && !DONE_STATUSES.includes(r.status);
        });
        return (
          <div className="bg-white border border-gray-100 rounded-lg p-5">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-lg font-medium">Today&apos;s line-up</div>
                <div className="text-sm text-gray-500">Everything scheduled to publish today across the team.</div>
              </div>
              <div className="text-sm text-gray-500">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
            </div>
            {todaysList.length === 0 && overdueList.length === 0 && (
              <div className="text-sm text-gray-400 py-6 text-center">Nothing scheduled for today. Team is clear.</div>
            )}
            {todaysList.length > 0 && (
              <div className="space-y-2">
                {todaysList.map((r) => {
                  const member = TEAM.find((m) => ownerMatches(r.owner, m));
                  return (
                    <button
                      key={r.id}
                      onClick={() => onOpen(r.id)}
                      className="w-full text-left flex items-center gap-3 p-3 rounded border border-gray-100 hover:border-brand hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                        style={{ background: (member?.color || "#B4B2A9") + "22", color: member?.color || "#666" }}>
                        {(member?.label || r.owner || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.particulars || "(untitled)"}</div>
                        <div className="text-xs text-gray-500">{r.owner || "Unassigned"} · {r.type} · {r.sbu}</div>
                      </div>
                      <div className="text-xs px-2 py-1 rounded flex-shrink-0" style={{ background: (r.status === "Ready to Publish" ? "#5DCAA5" : "#EF9F27") + "22", color: r.status === "Ready to Publish" ? "#0F6E56" : "#854F0B" }}>
                        {r.status}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {overdueList.length > 0 && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <div className="text-sm font-medium text-rose-600 mb-3">⚠ {overdueList.length} overdue</div>
                <div className="space-y-2">
                  {overdueList.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onOpen(r.id)}
                      className="w-full text-left flex items-center gap-3 p-2 rounded hover:bg-rose-50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{r.particulars || "(untitled)"}</div>
                        <div className="text-xs text-gray-500">Due {r.dueDate?.slice(0, 10)} · {r.owner || "Unassigned"}</div>
                      </div>
                    </button>
                  ))}
                  {overdueList.length > 5 && <div className="text-xs text-gray-400 text-center">+{overdueList.length - 5} more overdue</div>}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Team member cards */}
      <div className="grid grid-cols-4 gap-4">
        {teamCards.map((c) => (
          <TeamMemberCard key={c.member.key} card={c} onOpen={onOpen} onOpenPanel={() => onOpenMember(c.member.key)} />
        ))}
      </div>

      {/* Pipeline flow */}
      <div className="bg-white border border-gray-100 rounded-lg p-5">
        <div className="text-lg font-medium mb-1">Content pipeline</div>
        <div className="text-sm text-gray-500 mb-4">How many entries sit at each stage right now.</div>
        <div className="flex items-stretch gap-2">
          {pipeline.map((s, i) => (
            <div key={s.key} className="flex-1">
              <div className="rounded-lg p-4 text-white" style={{ background: s.color }}>
                <div className="text-3xl font-medium">{fmtInt(s.count)}</div>
                <div className="text-xs uppercase tracking-wide opacity-90 mt-1">{s.label}</div>
              </div>
              {i < pipeline.length - 1 && <div className="text-center text-gray-300 text-xs mt-1">→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Week-ahead publishing strip */}
      <div className="bg-white border border-gray-100 rounded-lg p-5">
        <div className="text-lg font-medium mb-1">Next 7 days · publishing schedule</div>
        <div className="text-sm text-gray-500 mb-4">What&apos;s slated to go out this week.</div>
        <div className="grid grid-cols-7 gap-3">
          {weekAheadDays.map((d, i) => (
            <div key={d.date} className={`rounded-lg border p-3 ${i === 0 ? "border-brand border-2" : "border-gray-100"}`}>
              <div className={`text-xs mb-2 ${i === 0 ? "text-brand font-medium" : "text-gray-500"}`}>{d.label}{i === 0 ? " · today" : ""}</div>
              <div className="text-2xl font-medium mb-2">{d.rows.length}</div>
              <div className="space-y-1">
                {d.rows.slice(0, 3).map((r) => (
                  <button key={r.id} onClick={() => onOpen(r.id)} className="w-full text-left text-[11px] px-1.5 py-1 rounded truncate hover:bg-gray-50" title={r.particulars}>
                    {r.particulars || "(untitled)"}
                  </button>
                ))}
                {d.rows.length > 3 && <div className="text-[10px] text-gray-400">+{d.rows.length - 3} more</div>}
              </div>
            </div>
          ))}
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

function TeamMemberCard({ card, onOpen, onOpenPanel }: {
  card: { member: TeamMember; mine: Row[]; today: number; week: number; overdue: number; done: number; roleHighlight: number };
  onOpen: (id: string) => void;
  onOpenPanel: () => void;
}) {
  const { member: m, mine } = card;
  const todayStr = ymd(new Date());
  // Top 3 pending tasks — soonest due first, then anything today, then rest.
  const pending = useMemo(() => {
    return [...mine]
      .filter((r) => !DONE_STATUSES.includes(r.status))
      .sort((a, b) => {
        const aOverdue = (a.dueDate?.slice(0, 10) || "") < todayStr && !!a.dueDate;
        const bOverdue = (b.dueDate?.slice(0, 10) || "") < todayStr && !!b.dueDate;
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        const aPd = a.publishingDate?.slice(0, 10) || "9999-12-31";
        const bPd = b.publishingDate?.slice(0, 10) || "9999-12-31";
        return aPd.localeCompare(bPd);
      })
      .slice(0, 3);
  }, [mine, todayStr]);

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5 flex flex-col hover:border-brand transition">
      <button onClick={onOpenPanel} className="flex items-center gap-3 mb-4 text-left w-full">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-medium" style={{ background: m.color + "22", color: m.color }}>
          {m.label.slice(0, 1)}
        </div>
        <div className="flex-1">
          <div className="text-base font-medium">{m.label}</div>
          <div className="text-xs text-gray-500">{ROLE_LABEL[m.role]}</div>
        </div>
        <div className="text-xs text-gray-400">Open →</div>
      </button>

      <div className="rounded p-3 mb-3" style={{ background: m.color + "11" }}>
        <div className="text-xs uppercase tracking-wide" style={{ color: m.color }}>{ROLE_HIGHLIGHT[m.role]}</div>
        <div className="text-2xl font-medium mt-1">{fmtInt(card.roleHighlight)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <MiniStat label="Today" value={card.today} />
        <MiniStat label="This week" value={card.week} />
        <MiniStat label="Overdue" value={card.overdue} alarm={card.overdue > 0} />
        <MiniStat label="Done · 7d" value={card.done} />
      </div>

      <div className="pt-3 border-t border-gray-100 flex-1">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Next up</div>
        {pending.length > 0 ? (
          <div className="space-y-1.5">
            {pending.map((r) => {
              const isOverdue = (r.dueDate?.slice(0, 10) || "") < todayStr && !!r.dueDate;
              return (
                <button
                  key={r.id}
                  onClick={() => onOpen(r.id)}
                  title={r.particulars}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-rose-500" : "bg-gray-300"}`} />
                  <span className="truncate flex-1">{r.particulars || "(untitled)"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-400 py-2">Nothing pending</div>
        )}
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

function PersonPanel({ member, allRows, onOpen, onClose }: {
  member: TeamMember;
  allRows: Row[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const todayStr = ymd(new Date());
  const weekAhead = ymd(new Date(Date.now() + 7 * 86_400_000));
  const weekAgo = ymd(new Date(Date.now() - 7 * 86_400_000));

  const mine = useMemo(() => allRows.filter((r) => ownerMatches(r.owner, member)), [allRows, member]);

  const buckets = useMemo(() => {
    const dueToday: Row[] = [];
    const overdue: Row[] = [];
    const awaitingApproval: Row[] = [];
    const thisWeek: Row[] = [];
    const contentPending: Row[] = [];
    const inProgress: Row[] = [];
    const readyToPublish: Row[] = [];
    const completed: Row[] = [];

    for (const r of mine) {
      const pd = r.publishingDate?.slice(0, 10) || "";
      const dd = r.dueDate?.slice(0, 10) || "";
      const isDone = DONE_STATUSES.includes(r.status);
      const doneRecently = r.completionTime && r.completionTime.slice(0, 10) >= weekAgo;

      if (isDone && doneRecently) completed.push(r);
      if (r.needsReview) awaitingApproval.push(r);
      if (!isDone) {
        if (pd === todayStr) dueToday.push(r);
        if (dd && dd < todayStr) overdue.push(r);
        if (pd && pd > todayStr && pd <= weekAhead) thisWeek.push(r);
        if (r.status === "Content - Pending") contentPending.push(r);
        if (r.status === "Content - In Progress") inProgress.push(r);
        if (r.status === "Ready to Publish") readyToPublish.push(r);
      }
    }
    return { dueToday, overdue, awaitingApproval, thisWeek, contentPending, inProgress, readyToPublish, completed };
  }, [mine, todayStr, weekAhead, weekAgo]);

  const kpis = [
    { label: "Due today", value: buckets.dueToday.length, accent: "#378ADD" },
    { label: "Overdue", value: buckets.overdue.length, accent: "#D4537E", alarm: true },
    { label: "Awaiting approval", value: buckets.awaitingApproval.length, accent: "#7F77DD" },
    { label: "This week", value: buckets.thisWeek.length, accent: "#EF9F27" },
    { label: "Done · 7d", value: buckets.completed.length, accent: "#5DCAA5" },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-6xl my-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-lg z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-medium" style={{ background: member.color + "22", color: member.color }}>
              {member.label.slice(0, 1)}
            </div>
            <div>
              <div className="text-2xl font-medium">{member.label}&apos;s workload</div>
              <div className="text-sm text-gray-500 mt-0.5">{ROLE_LABEL[member.role]} · {mine.length} entries assigned in current range</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">×</button>
        </div>

        {/* KPI strip */}
        <div className="px-8 py-6 border-b border-gray-100">
          <div className="grid grid-cols-5 gap-4">
            {kpis.map((k) => (
              <div key={k.label} className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</div>
                <div className="text-3xl font-medium mt-2" style={k.alarm && k.value > 0 ? { color: k.accent } : {}}>{fmtInt(k.value)}</div>
                <div className="h-1 rounded mt-2" style={{ background: k.accent + (k.value > 0 ? "" : "33") }} />
              </div>
            ))}
          </div>
        </div>

        {/* Detailed buckets */}
        <div className="px-8 py-6 space-y-6">
          <Bucket title="⚠ Overdue" tone="danger" rows={buckets.overdue} onOpen={onOpen} emptyText="Nothing overdue. Clean." />
          <Bucket title="🎯 Due today" tone="brand" rows={buckets.dueToday} onOpen={onOpen} emptyText="Nothing publishing today." />
          <Bucket title="✋ Awaiting approval" tone="purple" rows={buckets.awaitingApproval} onOpen={onOpen} emptyText="Nothing waiting for approval." />
          <Bucket title="📋 Content pending" tone="gray" rows={buckets.contentPending} onOpen={onOpen} emptyText="No content-pending items." />
          <Bucket title="⚙ In progress" tone="amber" rows={buckets.inProgress} onOpen={onOpen} emptyText="Nothing currently in progress." />
          <Bucket title="✅ Ready to publish" tone="green" rows={buckets.readyToPublish} onOpen={onOpen} emptyText="Nothing sitting in ready-to-publish." />
          <Bucket title="🗓 Publishing this week" tone="brand" rows={buckets.thisWeek} onOpen={onOpen} emptyText="Nothing else scheduled this week." />
          <Bucket title="🎉 Completed in last 7 days" tone="green" rows={buckets.completed} onOpen={onOpen} emptyText="Nothing wrapped up in the last week." collapsedByDefault />
        </div>
      </div>
    </div>
  );
}

function Bucket({ title, tone, rows, onOpen, emptyText, collapsedByDefault }: {
  title: string; tone: "danger" | "brand" | "purple" | "gray" | "amber" | "green";
  rows: Row[]; onOpen: (id: string) => void; emptyText: string; collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const toneStyles: Record<string, { bg: string; text: string }> = {
    danger: { bg: "#FCEBEB", text: "#A32D2D" },
    brand:  { bg: "#E6F1FB", text: "#0C447C" },
    purple: { bg: "#EEEDFE", text: "#3C3489" },
    gray:   { bg: "#F1EFE8", text: "#444441" },
    amber:  { bg: "#FAEEDA", text: "#633806" },
    green:  { bg: "#EAF3DE", text: "#27500A" },
  };
  const t = toneStyles[tone];
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between mb-3 text-left">
        <div className="flex items-center gap-3">
          <span className="text-base font-medium">{title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: t.bg, color: t.text }}>{rows.length}</span>
        </div>
        <div className="text-xs text-gray-400">{open ? "Hide" : "Show"}</div>
      </button>
      {open && (
        rows.length === 0 ? (
          <div className="text-sm text-gray-400 py-3">{emptyText}</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="w-full text-left flex items-center gap-3 p-3 rounded border border-gray-100 hover:border-brand hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.particulars || "(untitled)"}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {r.type} · {r.sbu}
                    {r.publishingDate && ` · Publish ${r.publishingDate.slice(0, 10)}`}
                    {r.dueDate && ` · Due ${r.dueDate.slice(0, 10)}`}
                  </div>
                </div>
                <div className="text-xs px-2 py-1 rounded flex-shrink-0" style={{ background: t.bg, color: t.text }}>
                  {r.status}
                </div>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function CalendarView({ rows, range, facets, onOpen, loading }: { rows: Row[]; range: { from: string; to: string }; facets?: Facets; onOpen: (id: string) => void; loading: boolean }) {
  // Bucket rows by yyyy-mm-dd
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const d = r.publishingDate?.slice(0, 10);
      if (!d) continue;
      let list = m.get(d);
      if (!list) { list = []; m.set(d, list); }
      list.push(r);
    }
    return m;
  }, [rows]);

  // Build a month grid based on the FROM month.
  const fromDate = new Date(range.from);
  const y = fromDate.getFullYear();
  const mo = fromDate.getMonth();
  const firstOfMonth = new Date(y, mo, 1);
  const firstWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, mo, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const allSbus = facets?.sbu || [];
  const monthLabel = firstOfMonth.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const today = ymd(new Date());

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-medium">{monthLabel}</div>
        <div className="text-sm text-gray-500">{loading ? "Loading…" : `${rows.length} entries scheduled this range`}</div>
      </div>
      <div className="grid grid-cols-7 gap-2 text-xs text-gray-500 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="text-center font-medium">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} className="min-h-[120px]" />;
          const key = ymd(d);
          const list = byDay.get(key) || [];
          const isToday = key === today;
          return (
            <div key={key} className={`min-h-[120px] border rounded p-2 ${isToday ? "border-brand border-2" : "border-gray-100"}`}>
              <div className={`text-xs font-medium mb-1.5 ${isToday ? "text-brand" : "text-gray-500"}`}>{d.getDate()}</div>
              <div className="space-y-1">
                {list.slice(0, 4).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onOpen(r.id)}
                    title={`${r.particulars} · ${r.type} · ${r.owner}`}
                    className="w-full text-left text-[11px] px-1.5 py-1 rounded truncate hover:opacity-90"
                    style={{ background: sbuColor(r.sbu, allSbus) + "22", color: "#222", borderLeft: `3px solid ${sbuColor(r.sbu, allSbus)}` }}
                  >
                    {r.particulars || "(untitled)"}
                  </button>
                ))}
                {list.length > 4 && <div className="text-[10px] text-gray-400 text-center">+{list.length - 4} more</div>}
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      {allSbus.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
          {allSbus.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: sbuColor(s, allSbus) }} />
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListView({ rows, facets, onOpen, loading }: { rows: Row[]; facets?: Facets; onOpen: (id: string) => void; loading: boolean }) {
  const allSbus = facets?.sbu || [];
  return (
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50">
          <tr className="text-gray-500 text-left">
            <th className="px-4 py-3 font-normal">Publish date</th>
            <th className="px-4 py-3 font-normal">SBU</th>
            <th className="px-4 py-3 font-normal">Title</th>
            <th className="px-4 py-3 font-normal">Type</th>
            <th className="px-4 py-3 font-normal">Status</th>
            <th className="px-4 py-3 font-normal">Owner</th>
            <th className="px-4 py-3 font-normal">Priority</th>
            <th className="px-4 py-3 font-normal">Platforms</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">{loading ? "Loading…" : "No entries match"}</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onOpen(r.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
              <td className="px-4 py-3 text-gray-500">{r.publishingDate?.slice(0, 10) || "—"}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sbuColor(r.sbu, allSbus) }} />
                  {r.sbu || "—"}
                </span>
              </td>
              <td className="px-4 py-3">{r.particulars || "(untitled)"}</td>
              <td className="px-4 py-3 text-gray-600">{r.type || "—"}</td>
              <td className="px-4 py-3">{r.status || "—"}</td>
              <td className="px-4 py-3">{r.owner || "—"}</td>
              <td className="px-4 py-3">{r.priority || "—"}</td>
              <td className="px-4 py-3 text-gray-600">{r.platforms.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
              {row.sbu || "—"} · {row.type || "—"} · Publishing {row.publishingDate?.slice(0, 10) || "—"}
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
            <MetaField label="Due date" value={row.dueDate?.slice(0, 10)} />
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
