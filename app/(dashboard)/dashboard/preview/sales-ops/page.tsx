"use client";
import { useEffect, useMemo, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useApi } from "@/lib/use-api";
import { fmtDateShort, fmtDateTime } from "@/lib/date";

type Counsellor = {
  name: string;
  assigned: number;
  firstActivityAvgHrs: number | null;
  contracts: number;
  revenue: number;
  untouched: number;
  byStatus: Record<string, number>;
};

type CallStat = {
  name: string;
  inboundCalls: number;
  outboundCalls: number;
  totalCallMins: number;
  connectedCalls: number;
  workingMins: number;
};

type MeetingSummary = {
  totalMeetings: number;
  avgRating: number | null;
  ratingDistribution: { rating: number; count: number }[];
  perCounsellor: { name: string; meetings: number; avgRating: number | null }[];
  upcoming: { name: string; counsellor: string; when: string }[];
};

type AttendanceRow = {
  name: string; daysPresent: number; daysAbsent: number; daysLeave: number;
  totalDays: number; leadsAllocated: number; dmLeadsAllocated: number;
};

type SalesOpsData = {
  range: { from: string; to: string; days: number };
  totals: {
    leads: number;
    firstActivityAvgHrs: number | null;
    firstContactAvgHrs: number | null;
    convertAvgDays: number | null;
    convertCount: number;
    contracts: number;
    revenue: number;
  };
  inflowByDay: { date: string; count: number }[];
  bySource: { name: string; count: number }[];
  byInterest: { name: string; count: number }[];
  byStatus: { name: string; count: number }[];
  counsellors: Counsellor[];
  revenueBySource: { name: string; closings: number; revenue: number }[];
  campaigns: { name: string; leads: number; contracts: number; revenue: number }[];
  awaiting: { name: string; counsellor: string; source: string; daysUntouched: number; link: string }[];
  awaitingTotal: number;
  callActivity: CallStat[];
  meetings: MeetingSummary;
  attendance: AttendanceRow[];
  reEnquiries: {
    total: number;
    withinRange: number;
    recent: { name: string; counsellor: string; lastReEnquiryAt: string }[];
  };
  walkIns: {
    total: number;
    byCountry: { name: string; count: number }[];
    byInterest: { name: string; count: number }[];
    recent: { name: string; createdAt: string; country: string; interest: string }[];
  };
  revenueTrend: { month: string; revenue: number; contracts: number }[];
  geography: { name: string; count: number }[];
  generatedAt: string;
  latencyMs: number;
  cached?: boolean;
};

function fmtInt(n: number): string {
  return n.toLocaleString("en-IN");
}

function fmtInr(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtMins(n: number): string {
  if (n <= 0) return "—";
  if (n < 60) return `${Math.round(n)} min`;
  const hrs = n / 60;
  if (hrs < 10) return `${hrs.toFixed(1)} hrs`;
  return `${Math.round(hrs)} hrs`;
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

function fmtHrs(n: number | null): string {
  if (n == null) return "—";
  if (n < 1) return `${Math.round(n * 60)} min`;
  if (n >= 24) return `${(n / 24).toFixed(1)} days`;
  return `${n.toFixed(1)} hrs`;
}

const COLORS = ["#3A57E8", "#5DCAA5", "#EF9F27", "#B4B2A9", "#D4537E", "#7F77DD"];

// Maheen isn't a counsellor — it's the holding pool where leads park as New / Re-Enquiry
// for the assignment automation. Relabel it everywhere in the UI.
const BUCKET_NAME = "Maheen Ejaz";
const isBucket = (name: string) => name === BUCKET_NAME;
const counsellorLabel = (name: string) => (isBucket(name) ? "New Leads (Maheen)" : name);

const STATUS_HEX: Record<string, { bg: string; fg: string }> = {
  "New": { bg: "#E1F0FB", fg: "#0C447C" },
  "Attempted to contact": { bg: "#F0F2F8", fg: "#5A6273" },
  "Junk lead": { bg: "#FBE4EC", fg: "#C0392B" },
  "SQL": { bg: "#EFEBFE", fg: "#6E48F8" },
  "Bookings": { bg: "#FEF3E2", fg: "#B7791F" },
  "Initial discussions": { bg: "#E3F5EA", fg: "#137A3E" },
  "Hot lead": { bg: "#FDE7DA", fg: "#C05621" },
  "Interested": { bg: "#DBF3EF", fg: "#0E7C6E" },
  "Re-Enquiry": { bg: "#E4F4FD", fg: "#0B84C4" },
  "Contract stage": { bg: "#E9ECFB", fg: "#2138B0" },
  "Closed won": { bg: "#CDEED9", fg: "#0F6B36" },
  "Not interested": { bg: "#F0F2F8", fg: "#8A92A6" },
};
const stChip = (s: string) => STATUS_HEX[s] || { bg: "#F0F2F8", fg: "#8A92A6" };

// First-touch SLA colouring: <24h good, 24–48h watch, >48h breached.
function firstTouchStyle(h: number | null): { bg: string; fg: string } {
  if (h == null) return { bg: "#F0F2F8", fg: "#8A92A6" };
  if (h < 24) return { bg: "#E3F5EA", fg: "#0F9D58" };
  if (h <= 48) return { bg: "#FEF3E2", fg: "#B7791F" };
  return { bg: "#FBE4EC", fg: "#C0392B" };
}

// Group a counsellor's status counts into the 4-colour mix bar.
function statusGroupColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("junk") || n.includes("not interested")) return "#C0392B"; // lost
  if (n === "new" || n.includes("re-enquiry") || n === "—") return "#93A9F6"; // fresh
  if (n.includes("won") || n.includes("sql") || n.includes("hot") || n.includes("booking") || n.includes("contract") || n.includes("interested") || n.includes("initial")) return "#0F9D58"; // qualified+
  return "#B7791F"; // in-progress (attempted, etc.)
}
function mixSegments(byStatus: Record<string, number>): { color: string; pct: number }[] {
  const total = Object.values(byStatus).reduce((s, n) => s + n, 0) || 1;
  const grouped = new Map<string, number>();
  for (const [name, n] of Object.entries(byStatus)) {
    const c = statusGroupColor(name);
    grouped.set(c, (grouped.get(c) || 0) + n);
  }
  const order = ["#93A9F6", "#B7791F", "#C0392B", "#0F9D58"];
  return order.filter((c) => grouped.has(c)).map((color) => ({ color, pct: (grouped.get(color)! / total) * 100 }));
}

export default function SalesOpsPage() {
  return (
    <PreviewDashboardShell active="sales" title="Sales Hub" subtitle="Your whole CRM — total leads, counsellor activity, contracts and revenue in the selected range." hideAccountPicker>
      {({ range }) => <Inner range={range} />}
    </PreviewDashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ from: range.from, to: range.to }).toString();
  const { data, isLoading, refresh } = useApi<SalesOpsData>(`/api/leads-crm?${qs}`);
  const [drillCounsellor, setDrillCounsellor] = useState<string | null>(null);

  const inflowChart = useMemo(() => {
    if (!data) return null;
    const days = data.inflowByDay;
    if (days.length === 0) return null;
    const max = Math.max(...days.map((d) => d.count), 1);
    const peak = days.reduce((a, b) => (b.count > a.count ? b : a), days[0]);
    const w = 400;
    const h = 80;
    const step = days.length > 1 ? w / (days.length - 1) : 0;
    const points = days.map((d, i) => `${i * step},${h - (d.count / max) * (h - 10)}`).join(" ");
    return { points, peak, count: days.length };
  }, [data]);

  const totalInterest = useMemo(() => data?.byInterest.reduce((s, i) => s + i.count, 0) || 0, [data]);
  const totalStatus = useMemo(() => data?.byStatus.reduce((s, i) => s + i.count, 0) || 0, [data]);
  const maxSource = useMemo(() => data?.bySource.reduce((m, s) => Math.max(m, s.count), 1) || 1, [data]);
  const assignedToTeam = useMemo(() => (data?.counsellors || []).filter((c) => c.name !== "Unassigned").reduce((s, c) => s + c.assigned, 0), [data]);
  // Inclusive day count for the selected range — "21 Jul → 20 Aug" is 31 days, not 30.
  const rangeDayCount = useMemo(() => {
    const a = Date.parse(range.from + "T00:00:00Z"), b = Date.parse(range.to + "T00:00:00Z");
    if (Number.isNaN(a) || Number.isNaN(b)) return 1;
    return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
  }, [range.from, range.to]);
  const avgLeadsPerDay = useMemo(
    () => Math.round((data?.totals.leads || 0) / rangeDayCount),
    [data, rangeDayCount],
  );
  const sortedCounsellors = useMemo(
    () => [...(data?.counsellors || [])].sort((a, b) => (isBucket(b.name) ? 1 : 0) - (isBucket(a.name) ? 1 : 0) || b.assigned - a.assigned),
    [data],
  );
  const sourceRoi = useMemo(() => {
    if (!data) return [];
    const rev = new Map(data.revenueBySource.map((r) => [r.name.toLowerCase(), r]));
    return data.bySource.map((s) => {
      const rv = rev.get(s.name.toLowerCase());
      const closings = rv?.closings || 0;
      return { name: s.name, leads: s.count, closings, revenue: rv?.revenue || 0, conv: s.count ? (closings / s.count) * 100 : 0 };
    });
  }, [data]);
  const maxRoiConv = useMemo(() => Math.max(1, ...sourceRoi.map((r) => r.conv)), [sourceRoi]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="text-base text-gray-500">
          {data ? (
            <>
              {fmtInt(data.totals.leads)} leads in this range · {data.range.days} days
              {data.cached ? " · cached" : ""}
            </>
          ) : isLoading ? "Loading…" : ""}
        </div>
        <LiveIndicator loading={isLoading} onRefresh={refresh} />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-7 gap-5">
        <KpiTile label="Leads generated" value={data ? fmtInt(data.totals.leads) : "—"} hint="Created in the selected window" />
        <KpiTile label="Avg leads / day" value={data ? fmtInt(avgLeadsPerDay) : "—"} hint={`${rangeDayCount} days in this window`} />
        <KpiTile label="Assigned to team" value={data ? fmtInt(assignedToTeam) : "—"} hint={data && data.totals.leads ? `${Math.round((assignedToTeam / data.totals.leads) * 100)}% · incl. New-Leads pool` : "across counsellors"} />
        <KpiTile label="Time to first contact" value={data ? fmtHrs(data.totals.firstContactAvgHrs ?? data.totals.firstActivityAvgHrs) : "—"} hint="created → first edit · target <24h" tone={data && ((data.totals.firstContactAvgHrs ?? data.totals.firstActivityAvgHrs) ?? 0) > 48 ? "warn" : undefined} />
        <KpiTile label="Untouched leads" value={data ? fmtInt(data.awaitingTotal) : "—"} hint={data && data.totals.leads ? `${Math.round((data.awaitingTotal / data.totals.leads) * 100)}% · idle >7 days` : "no CRM activity >7d"} tone={data && data.awaitingTotal > 0 ? "crit" : undefined} />
        <KpiTile label="Time to convert" value={data && data.totals.convertAvgDays != null ? `${data.totals.convertAvgDays}d` : "—"} hint={data ? `${fmtInt(data.totals.convertCount)} converted · from Revenue Tracker` : "created → paid"} />
        <KpiTile label="Closings" value={data ? fmtInt(data.totals.contracts) : "—"} hint={data && data.totals.revenue > 0 ? `${fmtInr(data.totals.revenue)} booked` : "₹ from Revenue Tracker"} />
      </div>

      {/* Leads by source — full-width banner */}
      <Card>
        <div className="flex items-baseline justify-between mb-4">
          <div className="text-base font-medium text-[#232D42]">Leads by source</div>
          <div className="text-sm text-gray-500">{data ? `${fmtInt(data.totals.leads)} in this window` : ""}</div>
        </div>
        <div className="space-y-3 text-sm">
          {data?.bySource.map((s, i) => (
            <div key={s.name} className="grid grid-cols-[200px_1fr_auto] items-center gap-3">
              <span className="text-[#3B4457] truncate">{s.name}</span>
              <span className="h-[10px] rounded-full bg-[#F3F5FA] overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${(s.count / maxSource) * 100}%`, background: COLORS[i % COLORS.length] }} />
              </span>
              <span className="text-right tabular-nums font-medium min-w-[72px]">
                {fmtInt(s.count)}<span className="text-gray-400 font-normal ml-1.5">{data.totals.leads ? Math.round((s.count / data.totals.leads) * 100) : 0}%</span>
              </span>
            </div>
          ))}
          {!data && <div className="text-gray-400">{isLoading ? "Loading…" : "—"}</div>}
        </div>
        <div className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">The date range (top-right) re-scopes every card on this page.</div>
      </Card>

      {/* Speed to lead — full width, under Leads by source */}
      <Card>
        <div className="flex items-baseline justify-between mb-4">
          <div className="text-base font-medium text-[#232D42]">Speed to lead</div>
          <div className="text-sm text-gray-500">the biggest leak</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 items-start">
          <div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-[#F3F5FA] rounded-xl p-3.5">
                <div className="text-2xl font-medium text-[#C0392B] tabular-nums">{data ? fmtHrs(data.totals.firstContactAvgHrs ?? data.totals.firstActivityAvgHrs) : "—"}</div>
                <div className="text-xs text-gray-500 mt-0.5">to first contact</div>
              </div>
              <div className="bg-[#F3F5FA] rounded-xl p-3.5">
                <div className="text-2xl font-medium text-[#232D42] tabular-nums">{data && data.totals.convertAvgDays != null ? `${data.totals.convertAvgDays}d` : "—"}</div>
                <div className="text-xs text-gray-500 mt-0.5">to convert{data && data.totals.convertCount ? ` · ${fmtInt(data.totals.convertCount)} won` : ""}</div>
              </div>
            </div>
            {data && (() => {
              const fc = data.totals.firstContactAvgHrs ?? data.totals.firstActivityAvgHrs;
              return (
              <div className="mb-3">
                <div className="h-2.5 rounded-full bg-[#F3F5FA] overflow-hidden flex">
                  <span className="h-full bg-[#0F9D58]" style={{ width: `${Math.min(100, (24 / Math.max(24, fc || 24)) * 100)}%` }} />
                  <span className="h-full bg-[#FBE4EC]" style={{ width: `${100 - Math.min(100, (24 / Math.max(24, fc || 24)) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                  <span>24h SLA target</span>
                  <span>avg is {fc ? `${(fc / 24).toFixed(1)}× ${fc > 24 ? "over" : "of"} target` : "—"}</span>
                </div>
              </div>
              );
            })()}
            <div className="rounded-lg bg-brand-light border border-brand/20 px-3 py-2 text-[11px] leading-relaxed text-[#3B4457]">
              <div className="font-semibold text-brand mb-1">ⓘ How to read this</div>
              <div><b>To first contact</b> — avg time before someone first touches a new lead (first call, status change, or note).</div>
              <div><b>To convert</b> — avg time from lead created → paid (matched in the Revenue Tracker).</div>
              <div className="mt-1"><b>SLA</b> = <i>Service Level Agreement</i> — your promise/target for how fast you respond. <b>“24h SLA target”</b> = the goal is to first-contact every new lead within 24 hours. <b>“0.7× of target”</b> means your average (~17h) is 0.7 of the 24h goal — <b>under 1× is faster than the goal ✓</b>, over 1× is slower ✗.</div>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-2">Oldest untouched</div>
            <div className="space-y-2">
              {(data?.awaiting || []).slice(0, 4).map((a, i) => (
                <a key={`${a.name}-${i}`} href={a.link} target="_blank" rel="noreferrer"
                  title="Open this lead in Airtable"
                  className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 hover:border-brand hover:bg-[#FAFBFF] transition-colors">
                  <div className="min-w-0">
                    <div className="text-[13px] truncate text-[#232D42]">{a.name}</div>
                    <div className="text-[11px] text-gray-500 truncate">{counsellorLabel(a.counsellor)} · {a.source}</div>
                  </div>
                  <div className="text-[12px] font-bold text-[#C0392B] whitespace-nowrap flex items-center gap-1">{a.daysUntouched}d <span className="text-gray-300 font-normal">↗</span></div>
                </a>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-3">Oldest-untouched from the live Days Untouched field.</div>
          </div>
        </div>
      </Card>

      {/* Assigned to counsellors — table (click a row → drill-down) */}
      <Card>
        <div className="flex items-baseline justify-between mb-4">
          <div className="text-base font-medium text-[#232D42]">Assigned to counsellors</div>
          <div className="text-sm text-gray-500">▸ click a row for the full lead breakdown</div>
        </div>
        {data ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-100">
                <th className="py-2.5 font-normal">Counsellor</th>
                <th className="py-2.5 font-normal text-right">Assigned</th>
                <th className="py-2.5 font-normal text-right">First touch</th>
                <th className="py-2.5 font-normal text-right">Untouched</th>
                <th className="py-2.5 font-normal w-[150px]">Status mix</th>
                <th className="py-2.5 font-normal text-right">Closings</th>
                <th className="py-2.5 font-normal w-5"></th>
              </tr>
            </thead>
            <tbody>
              {sortedCounsellors.map((c) => {
                const bucket = isBucket(c.name);
                const ft = firstTouchStyle(c.firstActivityAvgHrs);
                return (
                  <tr
                    key={c.name}
                    onClick={() => setDrillCounsellor(c.name)}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${bucket ? "bg-[#F7FBFE]" : ""}`}
                  >
                    <td className={`py-2.5 ${bucket ? "border-l-[3px] border-l-[#0B84C4] pl-3" : ""}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                          style={{ background: bucket ? "#E4F4FD" : "#E9ECFB", color: bucket ? "#0B84C4" : "#2138B0" }}>
                          {bucket ? "◇" : c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="font-medium text-[#232D42]">{counsellorLabel(c.name)}</span>
                        {bucket && <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0B84C4] bg-[#E4F4FD] px-2 py-0.5 rounded-full">holding pool</span>}
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{fmtInt(c.assigned)}</td>
                    <td className="py-2.5 text-right">
                      {bucket ? <span className="text-gray-400">n/a</span> : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums" style={{ background: ft.bg, color: ft.fg }}>{fmtHrs(c.firstActivityAvgHrs)}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium" style={{ color: bucket ? "#9AA1AF" : c.untouched > 0 ? "#C0392B" : "#232D42" }}>
                      {bucket ? "—" : fmtInt(c.untouched)}
                    </td>
                    <td className="py-2.5">
                      <span className="flex h-2 rounded-full overflow-hidden bg-[#F3F5FA] min-w-[110px]">
                        {mixSegments(c.byStatus).map((seg, i) => <span key={i} className="h-full" style={{ width: `${seg.pct}%`, background: seg.color }} />)}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{bucket ? <span className="text-gray-400">—</span> : fmtInt(c.contracts)}</td>
                    <td className="py-2.5 text-right text-gray-300">▸</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-gray-400">{isLoading ? "Loading…" : "—"}</div>
        )}
        <div className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
          <span className="font-medium text-[#3B4457]">New Leads (Maheen)</span> is the holding pool — leads park here as New / Re-Enquiry for the assignment automation, not a real counsellor.
          First touch: <span className="text-[#0F9D58]">green &lt;24h</span> / <span className="text-[#B7791F]">amber 24–48h</span> / <span className="text-[#C0392B]">red &gt;48h</span>.
          Status mix: <span style={{ color: "#93A9F6" }}>New</span> / <span style={{ color: "#B7791F" }}>In-progress</span> / <span style={{ color: "#C0392B" }}>Junk</span> / <span style={{ color: "#0F9D58" }}>Qualified+</span>.
        </div>
      </Card>

      {/* Conversion & revenue by source */}
      <Card>
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-base font-medium text-[#232D42]">Conversion &amp; revenue by source</div>
          <div className="text-sm text-gray-500">which channel turns leads into money</div>
        </div>
        <div className="text-sm text-gray-500 mb-4">Leads created in-window vs closings paid in-window (Revenue Tracker source) — directional channel ROI, independent of the status field.</div>
        {data && sourceRoi.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-100">
                <th className="py-2.5 font-normal">Source</th>
                <th className="py-2.5 font-normal text-right">Leads</th>
                <th className="py-2.5 font-normal text-right">Closings</th>
                <th className="py-2.5 font-normal text-right">Conv %</th>
                <th className="py-2.5 font-normal w-[200px]">Rate</th>
                <th className="py-2.5 font-normal text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sourceRoi.map((r) => (
                <tr key={r.name} className="border-b border-gray-50">
                  <td className="py-2.5">{r.name}</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtInt(r.leads)}</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtInt(r.closings)}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium">{r.conv > 0 ? `${r.conv.toFixed(1)}%` : "—"}</td>
                  <td className="py-2.5">
                    <span className="block h-2 rounded-full bg-[#F3F5FA] overflow-hidden">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${(r.conv / maxRoiConv) * 100}%` }} />
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{r.revenue > 0 ? fmtInr(r.revenue) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-gray-400">{isLoading ? "Loading…" : "No revenue attributed in this window"}</div>
        )}
      </Card>

      {/* Status snapshot — full-width detail */}
      <Card>
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-base font-medium text-[#232D42]">Status snapshot</div>
          <div className="text-sm text-gray-500">directional only</div>
        </div>
        <div className="flex gap-2.5 items-start bg-[#FEF3E2] border border-[#F3E2C4] rounded-lg px-3.5 py-3 text-[12.5px] text-[#7a5a1a] mb-4">
          <span>⚠</span>
          <span>Sales rarely update status — junk leads sit as “New”, and some “New” leads have actually converted. Treat this as <b>directional</b>; real conversions come from <b>Conversion &amp; revenue by source</b> above.</span>
        </div>
        {data && data.byStatus.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-100">
                <th className="py-2.5 font-normal">Status</th>
                <th className="py-2.5 font-normal text-right">Leads</th>
                <th className="py-2.5 font-normal text-right">% of pipeline</th>
                <th className="py-2.5 font-normal w-[320px]">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.byStatus.map((s) => {
                const c = stChip(s.name);
                const pct = totalStatus ? (s.count / totalStatus) * 100 : 0;
                return (
                  <tr key={s.name} className="border-b border-gray-50">
                    <td className="py-2.5"><span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: c.bg, color: c.fg }}>{s.name}</span></td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{fmtInt(s.count)}</td>
                    <td className="py-2.5 text-right tabular-nums text-gray-500">{pct.toFixed(1)}%</td>
                    <td className="py-2.5">
                      <span className="block h-2 rounded-full bg-[#F3F5FA] overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: c.fg }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-gray-400">{isLoading ? "Loading…" : "—"}</div>
        )}
      </Card>

      {/* Lead inflow + Interest mix */}
      <div className="grid grid-cols-5 gap-5 items-start">
        <Card className="col-span-3">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Lead inflow — daily</div>
            <div className="text-sm text-gray-500">{data ? `${data.range.days} days` : ""}</div>
          </div>
          {inflowChart ? (
            <>
              <div className="flex items-baseline gap-6 mb-3">
                <div>
                  <div className="text-2xl font-medium text-[#232D42]">{fmtInt(Math.round((data?.totals.leads || 0) / (data?.range.days || 1)))}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Avg / day</div>
                </div>
                <div>
                  <div className="text-2xl font-medium text-[#232D42]">{fmtInt(inflowChart.peak.count)}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Peak · {inflowChart.peak.date}</div>
                </div>
              </div>
              <svg viewBox="0 0 400 90" preserveAspectRatio="none" className="w-full h-28">
                <polyline points={inflowChart.points} fill="none" stroke="#3A57E8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <polyline points={`${inflowChart.points} 400,90 0,90`} fill="#3A57E8" fillOpacity="0.08" stroke="none" />
              </svg>
              <div className="flex justify-between text-sm text-gray-500 mt-2"><span>{range.from}</span><span>{range.to}</span></div>
            </>
          ) : (
            <div className="text-sm text-gray-400 py-10">{isLoading ? "Loading…" : "No leads in this range"}</div>
          )}
        </Card>
        <Card className="col-span-2">
          <div className="text-base font-medium text-[#232D42]">Interest mix</div>
          <div className="text-sm text-gray-500 mb-4">Primary Interest</div>
          <TableList rows={data?.byInterest || []} total={totalInterest} loading={isLoading} />
        </Card>
      </div>

      {/* Campaign attribution */}
      <Card>
        <div className="text-base font-medium text-[#232D42]">Campaign attribution</div>
        <div className="text-sm text-gray-500 mb-4">Campaign Name → leads and downstream revenue</div>
        {(data?.campaigns.length ?? 0) > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left">
                <th className="py-2.5 font-normal">Campaign</th>
                <th className="py-2.5 font-normal text-right">Leads</th>
                <th className="py-2.5 font-normal text-right">Contracts</th>
                <th className="py-2.5 font-normal text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data!.campaigns.map((c) => (
                <tr key={c.name} className="border-t border-gray-100">
                  <td className="py-2.5">{c.name}</td>
                  <td className="py-2.5 text-right">{fmtInt(c.leads)}</td>
                  <td className="py-2.5 text-right">{fmtInt(c.contracts)}</td>
                  <td className="py-2.5 text-right">{fmtInr(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-gray-400">{isLoading ? "Loading…" : "No campaigns tagged in this range"}</div>
        )}
      </Card>

      {/* Awaiting activity */}
      <Card>
        <div className="flex justify-between items-baseline">
          <div className="text-base font-medium text-[#232D42]">Awaiting activity</div>
          <div className="text-sm text-gray-500">Days Untouched formula</div>
        </div>
        <div className="text-sm text-gray-500 mb-4">
          Leads with no CRM activity in over 7 days · {data ? fmtInt(data.awaitingTotal) : "—"} total
        </div>
        {(data?.awaiting.length ?? 0) > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left">
                <th className="py-2.5 font-normal">Lead</th>
                <th className="py-2.5 font-normal">Counsellor</th>
                <th className="py-2.5 font-normal">Source</th>
                <th className="py-2.5 font-normal text-right">Days idle</th>
              </tr>
            </thead>
            <tbody>
              {data!.awaiting.map((a, i) => (
                <tr key={`${a.name}-${i}`} onClick={() => window.open(a.link, "_blank", "noreferrer")}
                  className="border-t border-gray-100 cursor-pointer hover:bg-[#FAFBFF]" title="Open this lead in Airtable">
                  <td className="py-2.5 text-[#232D42]">{a.name} <span className="text-gray-300">↗</span></td>
                  <td className="py-2.5">{a.counsellor}</td>
                  <td className="py-2.5">{a.source}</td>
                  <td className="py-2.5 text-right">{a.daysUntouched}</td>
                </tr>
              ))}
              {data && data.awaitingTotal > data.awaiting.length && (
                <tr className="border-t border-gray-100 text-gray-500 italic">
                  <td className="py-2.5">+{fmtInt(data.awaitingTotal - data.awaiting.length)} more…</td>
                  <td /><td /><td />
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-gray-400">{isLoading ? "Loading…" : "Nothing awaiting activity in this range"}</div>
        )}
      </Card>

      {/* ── Section: Revenue trend (month-wise, follows range) ── */}
      {data && data.revenueTrend.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Revenue trend</div>
            <div className="text-sm text-gray-500">Month-wise · follows the selected range</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Payments booked (Revenue Tracker) alongside contracts closed per month. Recent months often show closings before their ₹ amount is entered — revenue trails by a month or two.</div>
          <RevenueTrendChart data={data.revenueTrend} />
        </Card>
      )}

      {/* ── Section: Call activity ── */}
      {data && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Call activity</div>
            <div className="text-sm text-gray-500">Performance Metrics table</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Inbound + outbound call counts and durations logged in this range.</div>
          {data.callActivity.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-2.5 font-normal">Counsellor</th>
                  <th className="py-2.5 font-normal text-right">Inbound</th>
                  <th className="py-2.5 font-normal text-right">Outbound</th>
                  <th className="py-2.5 font-normal text-right">Connected</th>
                  <th className="py-2.5 font-normal text-right">Call time</th>
                  <th className="py-2.5 font-normal text-right">Working time</th>
                </tr>
              </thead>
              <tbody>
                {data.callActivity.map((c) => (
                  <tr key={c.name} className="border-t border-gray-100">
                    <td className="py-2.5">{c.name}</td>
                    <td className="py-2.5 text-right">{fmtInt(c.inboundCalls)}</td>
                    <td className="py-2.5 text-right">{fmtInt(c.outboundCalls)}</td>
                    <td className="py-2.5 text-right">{fmtInt(c.connectedCalls)}</td>
                    <td className="py-2.5 text-right">{fmtMins(c.totalCallMins)}</td>
                    <td className="py-2.5 text-right">{fmtMins(c.workingMins)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-gray-400">No call activity logged in this range</div>
          )}
        </Card>
      )}

      {/* ── Section: Meetings ── */}
      {data && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Meetings</div>
            <div className="text-sm text-gray-500">Sales System v2.0 table</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Counsellor meetings held, ratings, and what&apos;s coming up.</div>
          {data.meetings.totalMeetings > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-5 mb-6">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Meetings held</div>
                  <div className="text-3xl font-medium text-[#232D42] mt-1">{fmtInt(data.meetings.totalMeetings)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Avg lead rating</div>
                  <div className="text-3xl font-medium text-[#232D42] mt-1">
                    {data.meetings.avgRating != null ? `${data.meetings.avgRating}/5` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Upcoming</div>
                  <div className="text-3xl font-medium text-[#232D42] mt-1">{fmtInt(data.meetings.upcoming.length)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <div className="text-sm font-medium mb-2">Per counsellor</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-left">
                        <th className="py-2 font-normal">Counsellor</th>
                        <th className="py-2 font-normal text-right">Meetings</th>
                        <th className="py-2 font-normal text-right">Avg rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.meetings.perCounsellor.map((m) => (
                        <tr key={m.name} className="border-t border-gray-100">
                          <td className="py-2">{m.name}</td>
                          <td className="py-2 text-right">{fmtInt(m.meetings)}</td>
                          <td className="py-2 text-right">{m.avgRating != null ? `${m.avgRating}/5` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Upcoming meetings</div>
                  {data.meetings.upcoming.length > 0 ? (
                    <div className="text-sm space-y-2">
                      {data.meetings.upcoming.slice(0, 6).map((m, i) => (
                        <div key={i} className="flex justify-between py-2 border-b border-gray-100 last:border-b-0">
                          <div>
                            <div>{m.name || "—"}</div>
                            <div className="text-xs text-gray-500">{m.counsellor || "—"}</div>
                          </div>
                          <div className="text-gray-500 text-right">
                            {fmtDateTime(m.when)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">Nothing scheduled ahead</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">No meetings logged in this range</div>
          )}
        </Card>
      )}

      {/* ── Section: Attendance × Distribution ── */}
      {data && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Attendance × Distribution</div>
            <div className="text-sm text-gray-500">Attendance + Lead Distribution tables</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Days available crossed with leads allocated. Context for why a counsellor&apos;s volume is what it is.</div>
          {data.attendance.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-2.5 font-normal">Counsellor</th>
                  <th className="py-2.5 font-normal text-right">Present</th>
                  <th className="py-2.5 font-normal text-right">Absent</th>
                  <th className="py-2.5 font-normal text-right">Leave</th>
                  <th className="py-2.5 font-normal text-right">Leads allocated</th>
                  <th className="py-2.5 font-normal text-right">DM leads</th>
                </tr>
              </thead>
              <tbody>
                {data.attendance.map((a) => (
                  <tr key={a.name} className="border-t border-gray-100">
                    <td className="py-2.5">{a.name}</td>
                    <td className="py-2.5 text-right">{fmtInt(a.daysPresent)}</td>
                    <td className="py-2.5 text-right">{fmtInt(a.daysAbsent)}</td>
                    <td className="py-2.5 text-right">{fmtInt(a.daysLeave)}</td>
                    <td className="py-2.5 text-right">{fmtInt(a.leadsAllocated)}</td>
                    <td className="py-2.5 text-right">{fmtInt(a.dmLeadsAllocated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-gray-400">No attendance or distribution rows in this range</div>
          )}
        </Card>
      )}

      {/* ── Section: Re-enquiries ── */}
      {data && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Re-enquiries</div>
            <div className="text-sm text-gray-500">Repeat inquirers — warm signal</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Leads that came back a second time.</div>
          <div className="grid grid-cols-2 gap-5 mb-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total re-enquiries in range</div>
              <div className="text-3xl font-medium text-[#232D42] mt-1">{fmtInt(data.reEnquiries.total)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">With re-enquiry timestamp</div>
              <div className="text-3xl font-medium text-[#232D42] mt-1">{fmtInt(data.reEnquiries.withinRange)}</div>
            </div>
          </div>
          {data.reEnquiries.recent.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-2.5 font-normal">Lead</th>
                  <th className="py-2.5 font-normal">Counsellor</th>
                  <th className="py-2.5 font-normal">Last re-enquiry</th>
                </tr>
              </thead>
              <tbody>
                {data.reEnquiries.recent.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2.5">{r.name || "—"}</td>
                    <td className="py-2.5">{r.counsellor}</td>
                    <td className="py-2.5 text-gray-500">
                      {fmtDateShort(r.lastReEnquiryAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-gray-400">No re-enquiries logged in this range</div>
          )}
        </Card>
      )}

      {/* ── Section: Walk-in enquiries ── */}
      {data && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Walk-in enquiries</div>
            <div className="text-sm text-gray-500">Office Enquiries table</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">In-person funnel — separate from digital DM leads.</div>
          <div className="grid grid-cols-3 gap-5 mb-6">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Walk-ins in range</div>
              <div className="text-3xl font-medium text-[#232D42] mt-1">{fmtInt(data.walkIns.total)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Countries of interest</div>
              <div className="text-3xl font-medium text-[#232D42] mt-1">{fmtInt(data.walkIns.byCountry.length)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Specialties mentioned</div>
              <div className="text-3xl font-medium text-[#232D42] mt-1">{fmtInt(data.walkIns.byInterest.length)}</div>
            </div>
          </div>
          {data.walkIns.total > 0 && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <div className="text-sm font-medium mb-2">Top target countries</div>
                <TableList rows={data.walkIns.byCountry} total={data.walkIns.total} loading={false} />
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Top specialties</div>
                <TableList rows={data.walkIns.byInterest} total={data.walkIns.total} loading={false} />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Section: Geography ── */}
      {data && data.geography.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Geography</div>
            <div className="text-sm text-gray-500">Location field on CRM</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Where leads are physically located.</div>
          <TableList rows={data.geography} total={data.totals.leads} loading={false} />
        </Card>
      )}

      {data && (
        <div className="text-xs text-gray-400 text-right">
          Generated {fmtDateTime(data.generatedAt)} · {data.latencyMs}ms
        </div>
      )}

      {drillCounsellor && (
        <CounsellorDrilldownModal name={drillCounsellor} range={range} onClose={() => setDrillCounsellor(null)} />
      )}
    </div>
  );
}

type DrillLead = {
  id: string; name: string; mobile: string; source: string; status: string;
  interest: string; campaign: string; createdAt: string; lastActivityAt: string;
  daysUntouched: number; linkToRecord: string;
};

function CounsellorDrilldownModal({ name, range, onClose }: { name: string; range: { from: string; to: string }; onClose: () => void }) {
  const [leads, setLeads] = useState<DrillLead[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"createdAt" | "daysUntouched" | "status">("createdAt");
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    const qs = new URLSearchParams({ name, from: range.from, to: range.to }).toString();
    let cancelled = false;
    fetch(`/api/leads-crm/counsellor?${qs}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { if (j.error) setErr(j.error); else setLeads(j.leads); } })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, [name, range.from, range.to]);

  const statusCounts = useMemo(() => {
    if (!leads) return [];
    const m = new Map<string, number>();
    for (const l of leads) if (l.status) m.set(l.status, (m.get(l.status) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const visible = useMemo(() => {
    if (!leads) return [];
    let out = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads;
    out = [...out].sort((a, b) => {
      if (sortBy === "createdAt") return a.createdAt < b.createdAt ? 1 : -1;
      if (sortBy === "daysUntouched") return b.daysUntouched - a.daysUntouched;
      return a.status.localeCompare(b.status);
    });
    return out;
  }, [leads, sortBy, statusFilter]);

  function copyCsv() {
    if (!leads) return;
    const header = ["Name", "Mobile", "Source", "Status", "Interest", "Campaign", "Created", "Last activity", "Days idle"];
    const rows = visible.map((l) => [l.name, l.mobile, l.source, l.status, l.interest, l.campaign, l.createdAt.slice(0, 10), l.lastActivityAt.slice(0, 10), String(l.daysUntouched)]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    navigator.clipboard.writeText(csv);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <div>
            <div className="text-xl font-medium">{counsellorLabel(name)} — assigned leads</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {range.from} → {range.to} · {leads ? `${leads.length} leads` : "loading…"}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">×</button>
        </div>

        {leads && (
          <div className="px-8 py-4 border-b border-gray-100 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter("")}
                className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${statusFilter === "" ? "bg-brand text-white border-brand" : "bg-white text-[#3B4457] border-gray-200 hover:bg-gray-50"}`}
              >
                All <span className="opacity-70">{leads.length}</span>
              </button>
              {statusCounts.map(([s, n]) => {
                const c = stChip(s);
                const on = statusFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(on ? "" : s)}
                    className="text-xs font-semibold rounded-full px-3 py-1.5 border"
                    style={on ? { background: c.fg, color: "#fff", borderColor: c.fg } : { background: c.bg, color: c.fg, borderColor: "transparent" }}
                  >
                    {s} <span className="opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="text-gray-500">Sort</label>
              <PreviewSelect value={sortBy} onChange={(v) => setSortBy(v as "createdAt" | "daysUntouched" | "status")} options={[
                { value: "createdAt", label: "Newest first" }, { value: "daysUntouched", label: "Most idle first" }, { value: "status", label: "Status" },
              ]} />
              <div className="ml-auto">
                <button onClick={copyCsv} className="border border-gray-200 rounded px-4 py-1.5 hover:bg-gray-50">Copy CSV</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {err && <div className="p-8 text-base text-red-600">{err}</div>}
          {!leads && !err && <div className="p-8 text-base text-gray-400">Loading…</div>}
          {leads && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-gray-100">
                <tr className="text-gray-500 text-left">
                  <th className="px-6 py-3 font-normal">Name</th>
                  <th className="px-6 py-3 font-normal">Mobile</th>
                  <th className="px-6 py-3 font-normal">Source</th>
                  <th className="px-6 py-3 font-normal">Status</th>
                  <th className="px-6 py-3 font-normal">Interest</th>
                  <th className="px-6 py-3 font-normal">Created</th>
                  <th className="px-6 py-3 font-normal text-right">Days idle</th>
                  <th className="px-6 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3">{l.name || "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{l.mobile || "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{l.source || "—"}</td>
                    <td className="px-6 py-3">{l.status ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: stChip(l.status).bg, color: stChip(l.status).fg }}>{l.status}</span> : "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{l.interest || "—"}</td>
                    <td className="px-6 py-3 text-gray-500">{l.createdAt.slice(0, 10)}</td>
                    <td className={`px-6 py-3 text-right ${l.daysUntouched > 7 ? "text-amber-600" : ""}`}>{l.daysUntouched}</td>
                    <td className="px-6 py-3">
                      {l.linkToRecord && (
                        <a href={l.linkToRecord} target="_blank" rel="noreferrer" className="text-brand hover:underline">Open ↗</a>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-base text-gray-400">No leads match</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "crit" | "warn" }) {
  const valueColor = tone === "crit" ? "text-[#C0392B]" : tone === "warn" ? "text-[#B7791F]" : "text-[#232D42]";
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-medium mt-2 ${valueColor}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1.5">{hint}</div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-100 p-6 ${className}`}>{children}</div>;
}

function RevenueTrendChart({ data }: { data: { month: string; revenue: number; contracts: number }[] }) {
  const maxRev = Math.max(...data.map((d) => d.revenue), 1);
  const maxCon = Math.max(...data.map((d) => d.contracts), 1);
  return (
    <div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((d) => (
          <div key={d.month} className="flex flex-col items-center">
            <div className="text-xs text-gray-500 mb-1">{fmtMonth(d.month)}</div>
            <div className="w-full flex flex-col items-center gap-1">
              <div className="w-full h-40 flex items-end justify-center gap-1">
                <div className="w-8 rounded-t" style={{ height: `${(d.revenue / maxRev) * 100}%`, background: "#3A57E8", minHeight: d.revenue > 0 ? "4px" : 0 }} title={`₹${d.revenue.toLocaleString("en-IN")}`}></div>
                <div className="w-8 rounded-t" style={{ height: `${(d.contracts / maxCon) * 100}%`, background: "#5DCAA5", minHeight: d.contracts > 0 ? "4px" : 0 }} title={`${d.contracts} contracts`}></div>
              </div>
              <div className="text-sm font-medium">{fmtInr(d.revenue)}</div>
              <div className="text-xs text-gray-500">{d.contracts} contracts</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-6 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: "#3A57E8" }}></span>Revenue booked</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: "#5DCAA5" }}></span>Contracts generated</div>
      </div>
    </div>
  );
}

function TableList({ rows, total, loading }: { rows: { name: string; count: number }[]; total: number; loading: boolean }) {
  if (rows.length === 0) return <div className="text-sm text-gray-400">{loading ? "Loading…" : "—"}</div>;
  return (
    <div className="text-sm">
      {rows.slice(0, 8).map((r) => (
        <div key={r.name} className="flex justify-between py-2.5 border-b border-gray-100 last:border-b-0">
          <span>{r.name}</span>
          <span className="text-gray-500">
            {fmtInt(r.count)}{total > 0 ? ` · ${Math.round((r.count / total) * 100)}%` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
