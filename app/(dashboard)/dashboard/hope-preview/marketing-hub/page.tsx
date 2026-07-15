"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
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
    <HopeDashboardShell active="marketing-hub" title="Marketing Hub" subtitle="Content calendar for the marketing team — SBU · Type · Owner · Publishing Date." hideAccountPicker>
      {({ range }) => <Inner range={range} />}
    </HopeDashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
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
      {/* Top bar: entries count · global search · live */}
      <div className="flex items-center gap-4">
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
        <div className="ml-auto flex-shrink-0">
          <LiveIndicator isLoading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      {/* Compact filter dropdowns — hidden on Pipeline (it shows the whole picture). */}
      {tab !== "pipeline" && (
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
        <TeamView rows={filtered} allRows={data?.rows || []} facets={data?.facets} onOpen={setOpenId} loading={isLoading} />
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

function CompactFacet({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={label}
      className={`border rounded-lg px-2.5 py-1.5 text-sm bg-white ${value ? "border-brand text-brand font-medium" : "border-gray-200 text-gray-600"}`}
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// TEAM sub-tab — one card per teammate; click a card to open their full task
// list INLINE below the cards (all statuses), not a pop-up.
function TeamView({ rows, allRows, facets, onOpen, loading }: { rows: Row[]; allRows: Row[]; facets?: Facets; onOpen: (id: string) => void; loading: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
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
    <div className="space-y-6">
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
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-medium" style={{ background: m.color + "22", color: m.color }}>
          {m.label.slice(0, 1)}
        </div>
        <div className="flex-1">
          <div className="text-base font-medium">{m.label}</div>
          <div className="text-xs text-gray-500">{ROLE_LABEL[m.role]}</div>
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

  const buckets = useMemo(() => {
    const dueToday: Row[] = [];
    const overdue: Row[] = [];
    const awaitingApproval: Row[] = [];
    const thisWeek: Row[] = [];
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
      }
    }
    return { dueToday, overdue, awaitingApproval, thisWeek, completed };
  }, [mine, todayStr, weekAhead, weekAgo]);

  const kpis = [
    { label: "Due today", value: buckets.dueToday.length, bg: "#E6F1FB", tx: "#185FA5" },
    { label: "Overdue", value: buckets.overdue.length, bg: "#FBEAF0", tx: "#993556" },
    { label: "Awaiting approval", value: buckets.awaitingApproval.length, bg: "#EEEDFE", tx: "#3C3489" },
    { label: "This week", value: buckets.thisWeek.length, bg: "#FAEEDA", tx: "#633806" },
    { label: "Done · 7d", value: buckets.completed.length, bg: "#E1F5EE", tx: "#0F6E56" },
  ];

  const [dateSel, setDateSel] = useState<string>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [colorBy, setColorBy] = useState<string>("status");
  const [sortField, setSortField] = useState<string>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const typeOptions = useMemo(() => Array.from(new Set(mine.map((r) => r.type).filter(Boolean))).sort(), [mine]);

  // 1) Filter by the date window (on publishing date).
  const dateFiltered = useMemo(() => {
    if (dateSel === "all") return mine;
    return mine.filter((r) => {
      const d = r.publishingDate?.slice(0, 10) || "";
      if (!d) return false;
      switch (dateSel) {
        case "today": return d === todayStr;
        case "tomorrow": return d === off(1);
        case "yesterday": return d === off(-1);
        case "last3": return d >= off(-2) && d <= todayStr;
        case "week": return d >= off(-6) && d <= todayStr;
        case "custom": return (!customFrom || d >= customFrom) && (!customTo || d <= customTo);
        default: return true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, dateSel, customFrom, customTo, todayStr]);

  // 2) Filter by Type (Airtable-style: Status = pills, Publishing Date = presets).
  const baseFiltered = useMemo(
    () => (typeFilter === "all" ? dateFiltered : dateFiltered.filter((r) => r.type === typeFilter)),
    [dateFiltered, typeFilter],
  );

  // Status pill counts reflect the date + type window.
  const statusGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of baseFiltered) { const k = r.status || "No status"; map.set(k, (map.get(k) || 0) + 1); }
    const order = PIPELINE_STAGES.map((s) => s.key);
    return [...map.entries()].sort((a, b) => (order.indexOf(a[0]) < 0 ? 99 : order.indexOf(a[0])) - (order.indexOf(b[0]) < 0 ? 99 : order.indexOf(b[0])));
  }, [baseFiltered]);

  // 3) Filter by status pill, then sort by the chosen column + direction.
  const tableRows = useMemo(() => {
    const list = statusFilter === "all" ? baseFiltered : baseFiltered.filter((r) => (r.status || "") === statusFilter);
    const order = PIPELINE_STAGES.map((s) => s.key);
    const prRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const cmp = (a: Row, b: Row): number => {
      switch (sortField) {
        case "task": return (a.particulars || "").localeCompare(b.particulars || "");
        case "type": return (a.type || "").localeCompare(b.type || "");
        case "sbu": return (a.sbu || "").localeCompare(b.sbu || "");
        case "publish": return (a.publishingDate || "").localeCompare(b.publishingDate || "");
        case "priority": return (prRank[(a.priority || "").toLowerCase()] ?? 9) - (prRank[(b.priority || "").toLowerCase()] ?? 9);
        case "status":
        default: {
          const sa = order.indexOf(a.status) < 0 ? 99 : order.indexOf(a.status);
          const sb = order.indexOf(b.status) < 0 ? 99 : order.indexOf(b.status);
          if (sa !== sb) return sa - sb;
          return (a.publishingDate || "").localeCompare(b.publishingDate || "");
        }
      }
    };
    const sorted = [...list].sort(cmp);
    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [baseFiltered, statusFilter, sortField, sortDir]);

  // 3) Optional grouping (Map preserves first-appearance order).
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const key = (r: Row) =>
      groupBy === "sbu" ? (r.sbu || "No SBU")
      : groupBy === "status" ? (r.status || "No status")
      : groupBy === "type" ? (r.type || "No type")
      : (r.priority || "No priority");
    const m = new Map<string, Row[]>();
    for (const r of tableRows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return [...m.entries()];
  }, [tableRows, groupBy]);

  const groupColor = (k: string) =>
    groupBy === "sbu" ? sbuColor(k, allSbus) : groupBy === "status" ? statusColor(k) : "#B4B2A9";

  const rowColor = (r: Row) =>
    colorBy === "priority" ? priorityColor(r.priority)
    : colorBy === "sbu" ? sbuColor(r.sbu, allSbus)
    : colorBy === "none" ? "transparent"
    : statusColor(r.status);

  const renderRow = (r: Row) => {
    const sp = statusPill(r.status);
    const pp = priorityPill(r.priority);
    return (
      <tr key={r.id} onClick={() => onOpen(r.id)} className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer">
        <td className="px-4 py-2.5 text-gray-800 max-w-[320px] truncate" style={{ borderLeft: `3px solid ${rowColor(r)}` }}>{r.particulars || <span className="text-gray-400 italic">Untitled</span>}</td>
        <td className="px-4 py-2.5 text-gray-600">{r.type || "—"}</td>
        <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-sm" style={{ background: sbuColor(r.sbu, allSbus) }} />{r.sbu || "—"}</span></td>
        <td className="px-4 py-2.5">{r.status ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: sp.bg, color: sp.text }}>{r.status}</span> : "—"}</td>
        <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.publishingDate)}</td>
        <td className="px-4 py-2.5">{r.priority ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: pp.bg, color: pp.text }}>{r.priority}</span> : "—"}</td>
      </tr>
    );
  };

  return (
    <div className="bg-white border border-gray-100 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-medium" style={{ background: member.color + "22", color: member.color }}>
            {member.label.slice(0, 1)}
          </div>
          <div>
            <div className="text-lg font-medium">{member.label}&apos;s tasks</div>
            <div className="text-sm text-gray-500">{ROLE_LABEL[member.role]} · {mine.length} in this range</div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="Close">×</button>
      </div>

      {/* KPI chips (left) + toolbar: date presets · Type · Group · Color (right) — one band */}
      <div className="px-6 py-3.5 border-b border-gray-100 flex items-center justify-between gap-x-6 gap-y-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          {kpis.map((k) => (
            <div key={k.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: k.bg }}>
              <span className="text-xs" style={{ color: k.tx, opacity: 0.9 }}>{k.label}</span>
              <span className="text-sm font-medium" style={{ color: k.tx }}>{fmtInt(k.value)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex flex-wrap gap-0.5 bg-gray-100 rounded-lg p-1">
            {DATE_PRESETS.map(([k, label]) => {
              const a = dateSel === k;
              return (
                <button key={k} onClick={() => setDateSel(k)} className={`px-2.5 py-1 rounded-md text-xs ${a ? "bg-white shadow-sm text-gray-800 font-medium" : "text-gray-500 hover:text-gray-700"}`}>{label}</button>
              );
            })}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap text-xs text-gray-500">
            <label className="flex items-center gap-1.5"><IconFilter size={14} className="text-gray-400" aria-hidden="true" /> Type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700 max-w-[150px]">
                <option value="all">All</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5"><IconLayoutList size={14} className="text-gray-400" aria-hidden="true" /> Group
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700">
                <option value="none">None</option>
                <option value="sbu">SBU</option>
                <option value="status">Status</option>
                <option value="type">Type</option>
                <option value="priority">Priority</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5"><IconPalette size={14} className="text-gray-400" aria-hidden="true" /> Color
              <select value={colorBy} onChange={(e) => setColorBy(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700">
                <option value="status">Status</option>
                <option value="priority">Priority</option>
                <option value="sbu">SBU</option>
                <option value="none">None</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Custom date range */}
      {dateSel === "custom" && (
        <div className="px-6 pt-3 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          From
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
          to
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
        </div>
      )}

      {/* Status filter pills */}
      <div className="px-6 pt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${statusFilter === "all" ? "border-gray-300 bg-gray-50 text-gray-800 font-medium" : "border-transparent text-gray-500 hover:bg-gray-50"}`}
        >
          All <span className="text-gray-400">{baseFiltered.length}</span>
        </button>
        {statusGroups.map(([st, n]) => {
          const active = statusFilter === st;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(active ? "all" : st)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${active ? "border-gray-300 bg-gray-50 text-gray-800 font-medium" : "border-transparent text-gray-500 hover:bg-gray-50"}`}
            >
              <span className="w-2 h-2 rounded-sm" style={{ background: statusColor(st) }} />
              {st} <span className="text-gray-400">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Task table (grouped or flat) */}
      <div className="px-6 pb-5 pt-3">
        <div className="border border-gray-100 rounded-lg overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-gray-500 text-left">
                {([["task", "Task"], ["type", "Type"], ["sbu", "SBU"], ["status", "Status"], ["publish", "Publish"], ["priority", "Priority"]] as [string, string][]).map(([key, label]) => {
                  const active = sortField === key;
                  return (
                    <th
                      key={key}
                      onClick={() => { if (active) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortField(key); setSortDir("asc"); } }}
                      className="px-4 py-2.5 font-normal cursor-pointer select-none hover:text-gray-700"
                      title="Click to sort"
                    >
                      <span className="inline-flex items-center gap-1">{label}{active && <span className="text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No tasks in this view.</td></tr>
              ) : grouped
                ? grouped.flatMap(([k, rows]) => [
                    <tr key={`h-${k}`}>
                      <td colSpan={6} className="px-4 py-2" style={{ background: groupColor(k) + "14" }}>
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: groupColor(k) }} />
                          {k} <span className="text-gray-400">{rows.length}</span>
                        </span>
                      </td>
                    </tr>,
                    ...rows.map(renderRow),
                  ])
                : tableRows.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CalendarView({ rows, range, facets, onOpen, onSaved, loading }: { rows: Row[]; range: { from: string; to: string }; facets?: Facets; onOpen: (id: string) => void; onSaved: () => void; loading: boolean }) {
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
        <div className="text-sm text-gray-500">{loading ? "Loading…" : <><span className="text-gray-400">drag a task to another day to reschedule · </span>{rows.length} entries scheduled this range</>}</div>
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
            <div
              key={key}
              onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
              onDragLeave={() => setDragOver((prev) => (prev === key ? null : prev))}
              onDrop={(e) => dropOn(e, key)}
              className={`min-h-[120px] border rounded p-2 ${dragOver === key ? "border-brand border-2 bg-brand/5" : isToday ? "border-brand border-2" : "border-gray-100"}`}
            >
              <div className={`text-xs font-medium mb-1.5 ${isToday ? "text-brand" : "text-gray-500"}`}>{d.getDate()}</div>
              <div className="space-y-1">
                {list.slice(0, 4).map((r) => (
                  <button
                    key={r.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => onOpen(r.id)}
                    title={`${r.particulars} · ${r.type} · ${r.owner} — drag to reschedule`}
                    className="w-full text-left text-[11px] px-1.5 py-1 rounded truncate hover:opacity-90 cursor-grab active:cursor-grabbing"
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
