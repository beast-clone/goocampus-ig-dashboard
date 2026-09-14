"use client";
import { useEffect, useMemo, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { LiveIndicator } from "@/components/LiveIndicator";
import { LoadingBlock } from "@/components/LoadingBlock";
import { LiveWaiting } from "./LiveWaiting";
import { useApi } from "@/lib/use-api";
import { fmtDateShort, fmtDateTime } from "@/lib/date";
import { IconUsers, IconChartLine, IconUserCheck, IconClock, IconTrophy } from "@tabler/icons-react";
import { IndiaStatesMap } from "@/components/GeoMaps";

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
    assignedToCounsellors: number | null;
  };
  inflowByDay: { date: string; count: number }[];
  bySource: { name: string; count: number }[];
  byInterest: { name: string; count: number }[];
  byStatus: { name: string; count: number }[];
  counsellors: Counsellor[];
  revenueBySource: { name: string; closings: number; revenue: number }[];
  campaigns: { name: string; leads: number; contracts: number; revenue: number }[];
  awaiting: { name: string; counsellor: string; source: string; daysUntouched: number; created: string; link: string }[];
  awaitingTotal: number;
  poolLeads: { name: string; counsellor: string; source: string; status: string; created: string; link: string }[];
  poolTotal: number;
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

// "Leads by source" — a tonal ramp of the brand indigo (dark → light) instead of
// clashing hues, so the chart reads calm and on-brand (Hope UI). bySource is sorted
// largest-first, so index 0 (the biggest source) gets the darkest shade.
const SOURCE_SHADES = ["#2138B0", "#3A57E8", "#5A72EC", "#8496F2", "#A6B4F6", "#C6D0FA", "#DCE2FB"];

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
  const [poolOpen, setPoolOpen] = useState(false);

  const totalInterest = useMemo(() => data?.byInterest.reduce((s, i) => s + i.count, 0) || 0, [data]);
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
    <div className="space-y-5">
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

      {/* KPI strip — headline numbers. Untouched and Time-to-convert live in their own
          detailed cards below (Awaiting activity / Speed to lead), so we don't repeat
          those two here; Time to first contact is kept as a headline on request. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        <KpiTile icon={IconUsers} label="Leads generated" value={data ? fmtInt(data.totals.leads) : "—"} hint="Created in the selected window" />
        <KpiTile icon={IconChartLine} label="Avg leads / day" value={data ? fmtInt(avgLeadsPerDay) : "—"} hint={`${rangeDayCount} days in this window`} />
        <KpiTile icon={IconUserCheck} label="Assigned to team" value={data ? fmtInt(data.totals.assignedToCounsellors ?? assignedToTeam) : "—"} hint={data ? `distributed · ${fmtInt(data.poolTotal)} still in the pool →` : "distributed to counsellors"} onClick={data ? () => setPoolOpen(true) : undefined} />
        <KpiTile icon={IconClock} label="Time to first contact" value={data ? fmtHrs(data.totals.firstContactAvgHrs ?? data.totals.firstActivityAvgHrs) : "—"} hint="created → first contact · target <24h" tone={data && ((data.totals.firstContactAvgHrs ?? data.totals.firstActivityAvgHrs) ?? 0) > 48 ? "warn" : undefined} />
        <KpiTile icon={IconTrophy} label="Closings" value={data ? fmtInt(data.totals.contracts) : "—"} hint={data && data.totals.revenue > 0 ? `${fmtInr(data.totals.revenue)} booked` : "₹ from Revenue Tracker"} tone="good" />
      </div>

      {/* Provenance note — so anyone on the team can self-answer "what's the source of this data?" */}
      <details className="group rounded-xl border border-gray-100 bg-white px-4 py-2.5">
        <summary className="flex items-center gap-2 cursor-pointer list-none select-none text-[13px] font-medium text-[#8A92A6]">
          <span className="text-brand">ⓘ</span> Where this data comes from
          <span className="ml-auto text-[11px] text-gray-400 group-open:hidden">show</span>
          <span className="ml-auto text-[11px] text-gray-400 hidden group-open:inline">hide</span>
        </summary>
        <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-[#3B4457]">
          <div><b>Source:</b> the Airtable <b>Sales Hub CRM</b> — the main Leads table. The dashboard only <b>reads</b> it; it never edits Airtable.</div>
          <div><b>No Airtable view is used.</b> We read the table directly and filter by <b>Created Date</b> for the range you pick above — so renaming, re-filtering, or deleting any grid view in Airtable does not change these numbers.</div>
          <div><b>Time to first contact</b> uses each lead&rsquo;s <b>Created Date</b> → first time its record was edited (a stand-in for first follow-up).</div>
          <div><b>Awaiting activity / Untouched</b> = no CRM update in 7+ days <b>and</b> no call ever logged (<b>Call Attempts = 0</b>). The CRM keeps only a call count, not a last-call date, so this means &ldquo;never called,&rdquo; not &ldquo;not called in 7 days.&rdquo;</div>
          <div><b>Closings, Revenue &amp; Time to convert</b> come from the <b>Contracts</b> table (by Generated Date) and the <b>Revenue Tracker</b> (by Payment Date), matched back to leads by email / phone.</div>
          <div className="text-[#8A92A6]">Refreshes about every 2 hours through the day — or hit <b>Refresh now</b> for the latest.</div>
        </div>
      </details>

      {/* ══ 1. Revenue & conversion — the money view, top priority ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
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
            isLoading ? <LoadingBlock className="!py-6" size={24} /> : <div className="text-sm text-gray-400">No revenue attributed in this window</div>
          )}
        </Card>
        {/* Revenue trend (month-wise, follows range) */}
        {data && data.revenueTrend.length > 0 && (
          <Card>
            <div className="flex items-baseline justify-between mb-1">
              <div className="text-base font-medium text-[#232D42]">Revenue trend</div>
              <div className="text-sm text-gray-500">Month-wise · follows the selected range</div>
            </div>
            <div className="text-sm text-gray-500 mb-5">Two views, month by month — money received (Revenue Tracker) and deals closed. Recent months often show closings before their ₹ amount is entered, so revenue trails by a month or two.</div>
            <RevenueTrendChart data={data.revenueTrend} />
          </Card>
        )}
      </div>

      {/* ══ 2. Speed to lead + Awaiting activity — the leak view ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <Card>
          <div className="flex items-baseline justify-between mb-4">
            <div className="text-base font-medium text-[#232D42]">Speed to lead</div>
            <div className="text-sm text-gray-500">two different clocks</div>
          </div>
          {(() => {
            const fc = data ? (data.totals.firstContactAvgHrs ?? data.totals.firstActivityAvgHrs) : null;
            const greenPct = Math.min(100, (24 / Math.max(24, fc || 24)) * 100);
            const ratio = fc ? fc / 24 : null;
            return (
              <>
                {/* Clock 1 — how fast we RESPOND to a new lead */}
                <div className="rounded-xl bg-[#F3F5FA] p-4 mb-3">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[13px] font-medium text-[#232D42]">1 · Time to first contact</div>
                    <div className="text-[11px] text-gray-400">how fast we respond</div>
                  </div>
                  <div className="text-2xl font-medium text-[#C0392B] tabular-nums mt-1">{data ? fmtHrs(fc) : "—"}</div>
                  <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">From when a lead <b>arrives</b> → the counsellor&rsquo;s <b>first call or note</b>. Goal: within 24 hours.</div>
                  {data && (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-white overflow-hidden flex">
                        <span className="h-full bg-[#0F9D58]" style={{ width: `${greenPct}%` }} />
                        <span className="h-full bg-[#FBE4EC]" style={{ width: `${100 - greenPct}%` }} />
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
                        <span>24-hour goal</span>
                        <span>{ratio ? `${ratio.toFixed(1)}× the goal — ${ratio > 1 ? "slower ✗" : "faster ✓"}` : "—"}</span>
                      </div>
                    </div>
                  )}
                </div>
                {/* Clock 2 — how long until they PAY */}
                <div className="rounded-xl bg-[#F3F5FA] p-4">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[13px] font-medium text-[#232D42]">2 · Time to convert</div>
                    <div className="text-[11px] text-gray-400">how long until they pay</div>
                  </div>
                  <div className="text-2xl font-medium text-[#232D42] tabular-nums mt-1">{data && data.totals.convertAvgDays != null ? `${data.totals.convertAvgDays}d` : "—"}{data && data.totals.convertCount ? <span className="text-sm font-normal text-gray-400"> · {fmtInt(data.totals.convertCount)} paid</span> : null}</div>
                  <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">From when a lead <b>arrives</b> → <b>payment received</b> (matched in the Revenue Tracker). This is your full sales cycle, not response time.</div>
                </div>
              </>
            );
          })()}
        </Card>
        {/* Awaiting activity — a simple "who to chase" card, not a full table */}
        <Card>
          <div className="flex justify-between items-baseline">
            <div className="text-base font-medium text-[#232D42]">Awaiting activity</div>
            <div className="text-sm text-gray-500">not contacted yet</div>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <div className="text-4xl font-medium text-[#C0392B] tabular-nums leading-none">{data ? fmtInt(data.awaitingTotal) : "—"}</div>
            <div className="text-[13px] text-gray-500 pb-0.5">leads never contacted{data ? <> · <b className="font-medium text-[#3B4457]">{fmtDateShort(data.range.from)} – {fmtDateShort(data.range.to)}</b></> : ""}</div>
          </div>
          <div className="text-[12px] text-gray-500 mt-2 leading-relaxed">
            No CRM update and no call for 7+ days. <span className="text-gray-400">Excludes leads you&rsquo;ve already closed off — junk, not interested, closed lost, cold, unreachable, not eligible.</span>
          </div>
          {(data?.awaiting.length ?? 0) > 0 ? (
            <div className="mt-4 border-t border-gray-100">
              {data!.awaiting.slice(0, 5).map((a, i) => (
                <button key={`${a.name}-${i}`} onClick={() => window.open(a.link, "_blank", "noreferrer")}
                  className="w-full flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0 text-left hover:bg-[#FAFBFF]" title="Open this lead in Airtable">
                  <span className="min-w-0 truncate text-[13px] text-[#232D42]">{a.name} <span className="text-gray-300">↗</span></span>
                  <span className="shrink-0 text-[12px] text-gray-500 whitespace-nowrap">{a.created ? fmtDateShort(a.created) : "—"} · <span className="tabular-nums">{a.daysUntouched}d idle</span></span>
                </button>
              ))}
              <a href="/dashboard/preview/sales-ops/tracker" className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">See all {data ? fmtInt(data.awaitingTotal) : ""} in the Leads tracker →</a>
            </div>
          ) : (
            isLoading ? <LoadingBlock className="!py-6" size={24} /> : <div className="text-sm text-gray-400 mt-4">Nothing awaiting activity in this range ✓</div>
          )}
        </Card>
      </div>

      {/* ══ 3. Per-lead first-contact tracking — compact, paginated, with counsellor + date filters ══ */}
      <LeadsFirstContact />

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
          isLoading ? <LoadingBlock className="!py-6" size={24} /> : <div className="text-sm text-gray-400">—</div>
        )}
        <div className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
          <span className="font-medium text-[#3B4457]">New Leads (Maheen)</span> is the holding pool — leads park here as New / Re-Enquiry for the assignment automation, not a real counsellor.
          First touch: <span className="text-[#0F9D58]">green &lt;24h</span> / <span className="text-[#B7791F]">amber 24–48h</span> / <span className="text-[#C0392B]">red &gt;48h</span>.
          Status mix: <span style={{ color: "#93A9F6" }}>New</span> / <span style={{ color: "#B7791F" }}>In-progress</span> / <span style={{ color: "#C0392B" }}>Junk</span> / <span style={{ color: "#0F9D58" }}>Qualified+</span>.
        </div>
      </Card>

      {/* ══ 5. Lead intake — Leads by source + Lead inflow side by side ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <Card>
          <div className="flex items-baseline justify-between mb-4">
            <div className="text-base font-medium text-[#232D42]">Leads by source</div>
            <div className="text-sm text-gray-500">{data ? `${fmtInt(data.totals.leads)} in this window` : ""}</div>
          </div>
          <div className="space-y-3 text-sm">
            {data?.bySource.map((s, i) => (
              <div key={s.name} className="grid grid-cols-[130px_1fr_auto] items-center gap-3">
                <span className="text-[#3B4457] truncate">{s.name}</span>
                <span className="h-[10px] rounded-full bg-[#F3F5FA] overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${(s.count / maxSource) * 100}%`, background: SOURCE_SHADES[Math.min(i, SOURCE_SHADES.length - 1)] }} />
                </span>
                <span className="text-right tabular-nums font-medium min-w-[66px]">
                  {fmtInt(s.count)}<span className="text-gray-400 font-normal ml-1.5">{data.totals.leads ? Math.round((s.count / data.totals.leads) * 100) : 0}%</span>
                </span>
              </div>
            ))}
            {!data && (isLoading ? <LoadingBlock className="!py-4" size={24} /> : <div className="text-gray-400">—</div>)}
          </div>
        </Card>
        <LeadInflow />
      </div>

      {/* ══ 6. Status snapshot + Interest mix side by side (equal height) ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Status snapshot — own date window (self-fetching) */}
        <StatusSnapshot />
        {/* Interest mix */}
        <Card className="h-full">
          <div className="text-base font-medium text-[#232D42]">Interest mix</div>
          <div className="text-sm text-gray-500 mb-4">Primary Interest</div>
          <TableList rows={data?.byInterest || []} total={totalInterest} loading={isLoading} />
        </Card>
      </div>

      {/* ══ 8. Campaign attribution ══ */}
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
          isLoading ? <LoadingBlock className="!py-6" size={24} /> : <div className="text-sm text-gray-400">No campaigns tagged in this range</div>
        )}
      </Card>

      {/* ══ 9. Geography — India state map ══ */}
      {data && data.geography.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium text-[#232D42]">Geography</div>
            <div className="text-sm text-gray-500">Leads by Indian state</div>
          </div>
          <div className="text-sm text-gray-500 mb-4">Where leads are physically located — hover a state for its exact count.</div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-center">
            <div className="h-[360px]"><IndiaStatesMap entries={data.geography} /></div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-3">Top states</div>
              {data.geography.slice(0, 10).map((g) => {
                const max = data.geography[0]?.count || 1;
                const pct = data.totals.leads ? Math.round((g.count / data.totals.leads) * 100) : 0;
                return (
                  <div key={g.name} className="mb-2.5">
                    <div className="flex justify-between text-[12.5px] mb-1">
                      <span className="text-[#3B4457] truncate">{g.name}</span>
                      <span className="tabular-nums font-medium text-[#232D42]">{fmtInt(g.count)} <span className="text-gray-400 font-normal">{pct}%</span></span>
                    </div>
                    <span className="block h-[7px] rounded-full bg-[#F3F5FA] overflow-hidden"><span className="block h-full rounded-full bg-brand" style={{ width: `${(g.count / max) * 100}%` }} /></span>
                  </div>
                );
              })}
            </div>
          </div>
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

      {poolOpen && data && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={() => setPoolOpen(false)}>
          <div className="bg-white rounded-2xl border border-gray-100 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-medium text-[#232D42]">Not assigned yet — in the New-Leads pool</div>
                <div className="text-[13px] text-gray-500 mt-0.5"><b className="text-[#C0392B] font-medium">{fmtInt(data.poolTotal)}</b> leads parked, waiting to be given to a counsellor · {fmtDateShort(data.range.from)} – {fmtDateShort(data.range.to)}</div>
              </div>
              <button onClick={() => setPoolOpen(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto">
              {data.poolLeads.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-gray-400">Nothing in the pool for this range ✓</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-gray-100">
                    <tr className="text-gray-500 text-left">
                      <th className="px-6 py-2.5 font-normal">Lead</th>
                      <th className="px-6 py-2.5 font-normal">Arrived</th>
                      <th className="px-6 py-2.5 font-normal">Source</th>
                      <th className="px-6 py-2.5 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.poolLeads.map((p, i) => (
                      <tr key={`${p.name}-${i}`} onClick={() => window.open(p.link, "_blank", "noreferrer")} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-[#FAFBFF]" title="Open this lead in Airtable">
                        <td className="px-6 py-2.5 text-[#232D42]">{p.name} <span className="text-gray-300">↗</span></td>
                        <td className="px-6 py-2.5 whitespace-nowrap text-[#3B4457]">{p.created ? fmtDateShort(p.created) : "—"}</td>
                        <td className="px-6 py-2.5">{p.source}</td>
                        <td className="px-6 py-2.5 text-gray-500">{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 text-[12px] text-gray-500">
              Showing up to 50. These sit under <b>Maheen Ejaz (New Leads pool)</b> until the round-robin or a counsellor picks them up.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type DrillLead = {
  id: string; name: string; mobile: string; source: string; status: string;
  interest: string; campaign: string; createdAt: string; lastActivityAt: string;
  daysUntouched: number; linkToRecord: string;
  contacted: boolean; firstContactHrs: number | null;
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
          {!leads && !err && <LoadingBlock />}
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
                  <th className="px-6 py-3 font-normal">Contacted</th>
                  <th className="px-6 py-3 font-normal text-right">Time to 1st contact</th>
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
                    <td className="px-6 py-3"><ContactedCell contacted={l.contacted} /></td>
                    <td className="px-6 py-3 text-right"><TtcCell hrs={l.firstContactHrs} contacted={l.contacted} createdAt={l.createdAt} /></td>
                    <td className={`px-6 py-3 text-right ${l.daysUntouched > 7 ? "text-amber-600" : ""}`}>{l.daysUntouched}</td>
                    <td className="px-6 py-3">
                      {l.linkToRecord && (
                        <a href={l.linkToRecord} target="_blank" rel="noreferrer" className="text-brand hover:underline">Open ↗</a>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={10} className="px-6 py-10 text-center text-base text-gray-400">No leads match</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

type FCLead = {
  id: string; name: string; mobile: string; source: string; status: string;
  createdAt: string; daysUntouched: number; linkToRecord: string;
  contacted: boolean; firstContactHrs: number | null; counsellor: string;
};

const initials = (n: string) => (n || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Sales Hub leads table — a compact, paginated (10/page) first-contact tracker with
// its own date window + counsellor filter. This is the "pull back a counsellor's
// leads by date" tool: pick a counsellor + range, see interest/status, export.
const PER_PAGE = 10;
function LeadsFirstContact() {
  const [days, setDays] = useState<7 | 30 | 60 | 90 | "custom">(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [leads, setLeads] = useState<FCLead[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<"all" | "contacted" | "not">("all");
  const [counsellorF, setCounsellorF] = useState<string>("all");
  const [page, setPage] = useState(0);

  const win = useMemo(() => {
    if (days === "custom") return customFrom && customTo ? { from: customFrom, to: customTo } : null;
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    return { from: ymdLocal(from), to: ymdLocal(to) };
  }, [days, customFrom, customTo]);

  useEffect(() => {
    if (!win) return;
    let cancelled = false;
    setLeads(null); setErr(null); setPage(0);
    const qs = new URLSearchParams({ name: "all", from: win.from, to: win.to }).toString();
    fetch(`/api/leads-crm/counsellor?${qs}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { if (j.error) setErr(j.error); else setLeads(j.leads as FCLead[]); } })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, [win?.from, win?.to]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => { setPage(0); }, [q, statusF, counsellorF]);

  const counsellorOpts = useMemo(() => {
    if (!leads) return [] as { name: string; n: number }[];
    const m = new Map<string, number>();
    for (const l of leads) { const c = l.counsellor || "Unassigned"; m.set(c, (m.get(c) || 0) + 1); }
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  }, [leads]);

  const filtered = useMemo(() => {
    if (!leads) return [];
    const needle = q.trim().toLowerCase();
    let out = leads;
    if (counsellorF !== "all") out = out.filter((l) => (l.counsellor || "Unassigned") === counsellorF);
    if (statusF === "contacted") out = out.filter((l) => l.contacted);
    else if (statusF === "not") out = out.filter((l) => !l.contacted);
    if (needle) out = out.filter((l) => (l.name || "").toLowerCase().includes(needle) || (l.mobile || "").includes(needle) || (l.source || "").toLowerCase().includes(needle));
    return out;
  }, [leads, q, statusF, counsellorF]);

  const contactedN = useMemo(() => filtered.filter((l) => l.contacted).length, [filtered]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const cur = Math.min(page, pageCount - 1);
  const shown = filtered.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);

  // Windowed page numbers (max 5 around the current page).
  const pageNums = useMemo(() => {
    const nums: number[] = [];
    const start = Math.max(0, Math.min(cur - 2, pageCount - 5));
    const end = Math.min(pageCount, Math.max(cur + 3, 5));
    for (let i = Math.max(0, start); i < end; i++) nums.push(i);
    return nums;
  }, [cur, pageCount]);

  function exportCsv() {
    const header = ["Name", "Assigned to", "Source", "Status", "Created", "Contacted", "Time to first contact (hrs)"];
    const rows = filtered.map((l) => [l.name, l.counsellor, l.source, l.status, (l.createdAt || "").slice(0, 10), l.contacted ? "Yes" : "No", l.firstContactHrs == null ? "" : String(l.firstContactHrs)]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    navigator.clipboard?.writeText(csv);
  }

  const RANGES: (7 | 30 | 60 | 90 | "custom")[] = [7, 30, 60, 90, "custom"];

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <div className="text-base font-medium text-[#232D42]">Leads · first-contact tracking</div>
        {leads && <div className="text-sm text-gray-500">{contactedN} of {filtered.length} contacted · {filtered.length ? Math.round((contactedN / filtered.length) * 100) : 0}%</div>}
      </div>
      <div className="text-[12.5px] text-gray-500 mb-4">Contacted = status left &ldquo;New&rdquo;, a note was added, or a call was attempted — whichever came first. Time colour-coded by SLA (green &lt;24h · amber 24–48h · red &gt;48h). <span className="text-gray-400">Approximate for now.</span></div>

      {/* Filter row: counsellor · date range · status · search · export */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={counsellorF} onChange={(e) => setCounsellorF(e.target.value)} className="text-[12.5px] border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-white focus:outline-none focus:border-brand">
          <option value="all">All counsellors</option>
          {counsellorOpts.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.n})</option>)}
        </select>
        <span className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {RANGES.map((r) => (
            <button key={String(r)} onClick={() => setDays(r)} className={`text-xs font-semibold px-3 py-1.5 border-r border-gray-100 last:border-r-0 ${days === r ? "bg-brand text-white" : "bg-white text-[#5b6472] hover:bg-gray-50"}`}>
              {r === "custom" ? "Custom" : `${r}d`}
            </button>
          ))}
        </span>
        {days === "custom" && (
          <span className="inline-flex items-center gap-1">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
            <span className="text-gray-400 text-xs">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
          </span>
        )}
        {(["all", "contacted", "not"] as const).map((k) => (
          <button key={k} onClick={() => setStatusF(k)} className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${statusF === k ? "bg-brand text-white border-brand" : "bg-white text-[#3B4457] border-gray-200 hover:bg-gray-50"}`}>
            {k === "all" ? "All" : k === "contacted" ? "Contacted" : "Not yet"}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, source…" className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 max-w-full focus:outline-none focus:border-brand" />
        <button onClick={exportCsv} disabled={!leads || filtered.length === 0} className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[#3B4457] hover:border-brand disabled:opacity-50">⬇ Export</button>
      </div>

      {err && <div className="text-sm text-red-600 py-6">{err}</div>}
      {!leads && !err && <div className="text-sm text-gray-400 py-6">Loading leads…</div>}
      {days === "custom" && !win && <div className="text-sm text-gray-400 py-6">Pick a start and end date.</div>}
      {leads && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-100">
                  <th className="py-2.5 font-normal min-w-[150px]">Lead</th>
                  <th className="py-2.5 font-normal">Assigned to</th>
                  <th className="py-2.5 font-normal">Source</th>
                  <th className="py-2.5 font-normal">Status</th>
                  <th className="py-2.5 font-normal">Created</th>
                  <th className="py-2.5 font-normal">Contacted</th>
                  <th className="py-2.5 font-normal text-right">Time to 1st contact</th>
                  <th className="py-2.5 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-[#232D42]">{l.name || "—"}</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <span className="w-5 h-5 rounded-full bg-brand-light text-brand grid place-items-center text-[9px] font-bold">{initials(l.counsellor)}</span>
                        {l.counsellor || "Unassigned"}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-600">{l.source || "—"}</td>
                    <td className="py-2.5">{l.status ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: stChip(l.status).bg, color: stChip(l.status).fg }}>{l.status}</span> : "—"}</td>
                    <td className="py-2.5 text-gray-500">{l.createdAt ? l.createdAt.slice(0, 10) : "—"}</td>
                    <td className="py-2.5"><ContactedCell contacted={l.contacted} /></td>
                    <td className="py-2.5 text-right"><TtcCell hrs={l.firstContactHrs} contacted={l.contacted} createdAt={l.createdAt} /></td>
                    <td className="py-2.5 text-right">{l.linkToRecord && <a href={l.linkToRecord} target="_blank" rel="noreferrer" className="text-brand hover:underline text-xs">Open ↗</a>}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-gray-400">No leads match</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
              <div className="text-xs text-gray-500">Showing {cur * PER_PAGE + 1}–{Math.min(filtered.length, cur * PER_PAGE + PER_PAGE)} of {filtered.length}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0} className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-brand disabled:opacity-40 disabled:hover:border-gray-200">‹</button>
                {pageNums[0] > 0 && <span className="px-1 text-gray-400 text-xs">…</span>}
                {pageNums.map((n) => (
                  <button key={n} onClick={() => setPage(n)} className={`min-w-[32px] h-8 px-2 rounded-lg border text-xs font-semibold ${n === cur ? "bg-brand text-white border-brand" : "bg-white text-[#3B4457] border-gray-200 hover:border-brand"}`}>{n + 1}</button>
                ))}
                {pageNums[pageNums.length - 1] < pageCount - 1 && <span className="px-1 text-gray-400 text-xs">…</span>}
                <button onClick={() => setPage(Math.min(pageCount - 1, cur + 1))} disabled={cur >= pageCount - 1} className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-brand disabled:opacity-40 disabled:hover:border-gray-200">›</button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Per-section date window (its own filter, independent of the page range) ──
type WinDays = 7 | 30 | 60 | 90 | "custom";
function RangeButtons({ value, onChange }: { value: WinDays; onChange: (d: WinDays) => void }) {
  const R: WinDays[] = [7, 30, 60, 90, "custom"];
  return (
    <span className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
      {R.map((r) => (
        <button key={String(r)} onClick={() => onChange(r)} className={`text-xs font-semibold px-3 py-1.5 border-r border-gray-100 last:border-r-0 ${value === r ? "bg-brand text-white" : "bg-white text-[#5b6472] hover:bg-gray-50"}`}>
          {r === "custom" ? "Custom" : `${r}d`}
        </button>
      ))}
    </span>
  );
}
function CustomDates({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
      <span className="text-gray-400 text-xs">→</span>
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
    </span>
  );
}
// Fetch all leads (read-only) for a rolling/custom window — reused by the status
// snapshot and inflow sections so each can have its own date filter. The name=all
// fetch is cached per {window}, so sections sharing a window share the read.
function useWindowLeads(days: WinDays, customFrom: string, customTo: string) {
  const [leads, setLeads] = useState<FCLead[] | null>(null);
  const win = useMemo(() => {
    if (days === "custom") return customFrom && customTo ? { from: customFrom, to: customTo } : null;
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    return { from: ymdLocal(from), to: ymdLocal(to) };
  }, [days, customFrom, customTo]);
  useEffect(() => {
    if (!win) { setLeads(null); return; }
    let cancelled = false;
    setLeads(null);
    fetch(`/api/leads-crm/counsellor?name=all&from=${win.from}&to=${win.to}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setLeads((j.leads || []) as FCLead[]); })
      .catch(() => { if (!cancelled) setLeads([]); });
    return () => { cancelled = true; };
  }, [win?.from, win?.to]);
  return { leads, win };
}

function StatusSnapshot() {
  const [days, setDays] = useState<WinDays>(30);
  const [cf, setCf] = useState(""); const [ct, setCt] = useState("");
  const { leads } = useWindowLeads(days, cf, ct);
  const rows = useMemo(() => {
    if (!leads) return null;
    const m = new Map<string, number>();
    for (const l of leads) { const s = l.status || "—"; m.set(s, (m.get(s) || 0) + 1); }
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [leads]);
  const total = rows ? rows.reduce((s, r) => s + r.count, 0) : 0;
  const max = rows && rows[0] ? rows[0].count : 1;
  // Only the top 7 statuses matter; the long tail of 1–2 count statuses becomes "Other".
  const TOP = 7;
  const display = useMemo(() => {
    if (!rows) return [];
    if (rows.length <= TOP + 1) return rows;
    const head = rows.slice(0, TOP);
    const tail = rows.slice(TOP);
    return [...head, { name: "Other", count: tail.reduce((s, r) => s + r.count, 0) }];
  }, [rows]);
  return (
    <Card className="h-full">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div><div className="text-base font-medium text-[#232D42]">Status snapshot</div><div className="text-sm text-gray-500">where every lead sits{rows ? ` · ${fmtInt(total)} leads` : ""}</div></div>
        <div className="flex items-center gap-2"><RangeButtons value={days} onChange={setDays} />{days === "custom" && <CustomDates from={cf} to={ct} setFrom={setCf} setTo={setCt} />}</div>
      </div>
      {!rows ? <LoadingBlock className="!py-6" size={24} /> :
        rows.length === 0 ? <div className="text-sm text-gray-400 py-6">No leads in this window.</div> : (
          <div className="space-y-2">
            {display.map((r, i) => { const shade = SOURCE_SHADES[Math.min(i, SOURCE_SHADES.length - 1)]; const pct = total ? (r.count / total) * 100 : 0; return (
              <div key={r.name} className="grid grid-cols-[150px_1fr_92px] items-center gap-3 text-[12.5px]">
                <span className="text-[#3B4457] truncate">{r.name}</span>
                <span className="h-[10px] rounded-full bg-[#F3F5FA] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: shade }} /></span>
                <span className="text-right tabular-nums"><b className="font-medium text-[#232D42]">{fmtInt(r.count)}</b> <span className="text-gray-400">{pct.toFixed(1)}%</span></span>
              </div>
            ); })}
          </div>
        )}
    </Card>
  );
}

function LeadInflow() {
  const [days, setDays] = useState<WinDays>(30);
  const [cf, setCf] = useState(""); const [ct, setCt] = useState("");
  const [hi, setHi] = useState<number | null>(null);
  const { leads, win } = useWindowLeads(days, cf, ct);
  const chart = useMemo(() => {
    if (!leads || !win) return null;
    const m = new Map<string, number>();
    for (const l of leads) { const d = (l.createdAt || "").slice(0, 10); if (d) m.set(d, (m.get(d) || 0) + 1); }
    const series: { date: string; count: number }[] = [];
    const start = new Date(win.from + "T00:00:00"), end = new Date(win.to + "T00:00:00");
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) series.push({ date: ymdLocal(new Date(t)), count: m.get(ymdLocal(new Date(t))) || 0 });
    if (!series.length) return null;
    const max = Math.max(1, ...series.map((d) => d.count));
    const total = series.reduce((s, d) => s + d.count, 0);
    const W = 400, H = 90;
    const coords = series.map((d, i) => ({ x: (i / Math.max(1, series.length - 1)) * W, y: H - (d.count / max) * H, date: d.date, count: d.count }));
    const points = coords.map((c) => `${c.x},${c.y}`).join(" ");
    const peakI = coords.reduce((bi, c, i, arr) => (c.count > arr[bi].count ? i : bi), 0);
    return { points, coords, peakI, peak: series[peakI], total, avg: Math.round(total / series.length), n: series.length, W, H, from: win.from, to: win.to };
  }, [leads, win]);
  const dayLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <Card className="h-full">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div><div className="text-base font-medium text-[#232D42]">Lead inflow — daily</div><div className="text-sm text-gray-500">new leads created per day · hover any day for its count</div></div>
        <div className="flex items-center gap-2"><RangeButtons value={days} onChange={setDays} />{days === "custom" && <CustomDates from={cf} to={ct} setFrom={setCf} setTo={setCt} />}</div>
      </div>
      {!chart ? (days === "custom" ? <div className="text-sm text-gray-400 py-10">Pick a start and end date.</div> : <LoadingBlock className="!py-10" size={24} />) : (
        <>
          <div className="flex items-baseline gap-6 mb-3">
            <div><div className="text-2xl font-medium text-[#232D42]">{fmtInt(chart.avg)}</div><div className="text-xs text-gray-500 uppercase tracking-wide">Avg / day</div></div>
            <div><div className="text-2xl font-medium text-[#232D42]">{fmtInt(chart.peak.count)}</div><div className="text-xs text-gray-500 uppercase tracking-wide">Peak · {dayLabel(chart.peak.date)}</div></div>
          </div>
          <div
            className="relative h-28 select-none"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = (e.clientX - rect.left) / rect.width;
              setHi(Math.max(0, Math.min(chart.n - 1, Math.round(frac * (chart.n - 1)))));
            }}
            onMouseLeave={() => setHi(null)}
          >
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" className="block w-full h-28">
              <polyline points={chart.points} fill="none" stroke="#3A57E8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <polyline points={`${chart.points} ${chart.W},${chart.H} 0,${chart.H}`} fill="#3A57E8" fillOpacity="0.08" stroke="none" />
            </svg>
            {/* peak marker (always on) */}
            <span className="absolute w-2 h-2 rounded-full bg-brand ring-2 ring-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${(chart.coords[chart.peakI].x / chart.W) * 100}%`, top: `${(chart.coords[chart.peakI].y / chart.H) * 112}px` }} />
            {/* hover guide + dot + tooltip */}
            {hi != null && chart.coords[hi] && (
              <>
                <span className="absolute top-0 bottom-0 w-px bg-brand/25 pointer-events-none" style={{ left: `${(chart.coords[hi].x / chart.W) * 100}%` }} />
                <span className="absolute w-2.5 h-2.5 rounded-full bg-white border-[1.5px] border-brand -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${(chart.coords[hi].x / chart.W) * 100}%`, top: `${(chart.coords[hi].y / chart.H) * 112}px` }} />
                <span className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-10 whitespace-nowrap rounded-md bg-[#232D42] px-2 py-1 text-[11px] leading-none text-white shadow"
                  style={{ left: `${(chart.coords[hi].x / chart.W) * 100}%`, top: `${(chart.coords[hi].y / chart.H) * 112 - 6}px` }}>
                  {dayLabel(chart.coords[hi].date)} · <b>{fmtInt(chart.coords[hi].count)}</b> {chart.coords[hi].count === 1 ? "lead" : "leads"}
                </span>
              </>
            )}
          </div>
          <div className="flex justify-between text-sm text-gray-500 mt-2"><span>{dayLabel(chart.from)}</span><span>{chart.total} total · {dayLabel(chart.to)}</span></div>
        </>
      )}
    </Card>
  );
}

// First-contact SLA colour for a "time to first contact" value (hours):
// green <24h · amber 24–48h · red >48h · grey when not yet contacted.
function ttcColor(hrs: number | null): string {
  if (hrs == null) return "#8A92A6";
  if (hrs < 24) return "#1AA053";
  if (hrs <= 48) return "#D9861B";
  return "#E5484D";
}
function fmtTtc(hrs: number | null): string {
  if (hrs == null) return "—";
  if (hrs < 1) return `${Math.max(1, Math.round(hrs * 60))}m`;
  if (hrs < 24) { const h = Math.floor(hrs); const m = Math.round((hrs - h) * 60); return m ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(hrs / 24); const h = Math.round(hrs % 24); return h ? `${d}d ${h}h` : `${d}d`;
}
function ContactedCell({ contacted }: { contacted: boolean }) {
  return contacted ? (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#137A3E]"><span className="w-[7px] h-[7px] rounded-full" style={{ background: "#1AA053" }} />Contacted</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gray-400"><span className="w-[7px] h-[7px] rounded-full" style={{ background: "#C6CBD6" }} />Not yet</span>
  );
}
function TtcCell({ hrs, contacted, createdAt }: { hrs: number | null; contacted?: boolean; createdAt?: string }) {
  // Contacted → the actual time to first contact, colour-coded by SLA. Not contacted
  // yet → a LIVE red stopwatch counting up since the lead arrived, so the overdue
  // leads visibly tick instead of showing a blank "—".
  if (!contacted && hrs == null && createdAt) {
    return <LiveWaiting createdAt={createdAt} />;
  }
  return <span className="tabular-nums font-semibold" style={{ color: ttcColor(hrs) }}>{fmtTtc(hrs)}</span>;
}

function KpiTile({ label, value, hint, tone, icon: Icon, onClick }: { label: string; value: string; hint: string; tone?: "crit" | "warn" | "good"; icon?: typeof IconUsers; onClick?: () => void }) {
  const chip = tone === "crit" ? { fg: "#E5484D", bg: "rgba(229,72,77,0.12)" }
    : tone === "warn" ? { fg: "#D9861B", bg: "rgba(217,134,27,0.13)" }
    : tone === "good" ? { fg: "#1AA053", bg: "rgba(26,160,83,0.12)" }
    : { fg: "#3A57E8", bg: "rgba(58,87,232,0.12)" };
  const valueColor = tone === "crit" ? "text-[#C0392B]" : tone === "warn" ? "text-[#B7791F]" : tone === "good" ? "text-[#0F6B36]" : "text-[#232D42]";
  return (
    <div onClick={onClick} className={`bg-white rounded-xl border border-gray-100 p-5 ${onClick ? "cursor-pointer hover:border-brand transition-colors" : ""}`}>
      {Icon && (
        <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[9px] mb-3" style={{ background: chip.bg }}>
          <Icon size={18} stroke={1.8} style={{ color: chip.fg }} />
        </span>
      )}
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-medium mt-1.5 ${valueColor}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1.5">{hint}</div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-100 p-5 ${className}`}>{children}</div>;
}

// Two separate single-metric charts — rupees and a count of contracts are different
// units, so mixing them on one axis was misleading. Each has its own scale + label.
function RevenueTrendChart({ data }: { data: { month: string; revenue: number; contracts: number }[] }) {
  return (
    <div className="space-y-5">
      <MiniTrend title="Revenue booked" unit="₹ received per month" data={data} value={(d) => d.revenue} color="#3A57E8" fmt={(v) => fmtInr(v)} />
      <div className="border-t border-gray-100" />
      <MiniTrend title="Contracts generated" unit="deals closed per month" data={data} value={(d) => d.contracts} color="#5DCAA5" fmt={(v) => `${fmtInt(v)}`} />
    </div>
  );
}

// A small line/area trend graph for one metric. Line + soft area fill + a dot and
// value label per month. SVG holds the line/area (stretched to full width); the dots
// and labels are HTML overlaid by percentage so they stay crisp and readable.
function MiniTrend({ title, unit, data, value, color, fmt }: {
  title: string;
  unit: string;
  data: { month: string; revenue: number; contracts: number }[];
  value: (d: { month: string; revenue: number; contracts: number }) => number;
  color: string;
  fmt: (v: number) => string;
}) {
  const n = data.length;
  const vals = data.map(value);
  const max = Math.max(...vals, 1);
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / max) * 74; // leave ~26% headroom at the top for labels
  const pts = data.map((d, i) => ({ month: d.month, v: vals[i], px: x(i), py: y(vals[i]) }));
  const line = pts.map((p) => `${p.px},${p.py}`).join(" ");
  const area = `0,100 ${line} 100,100`;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[13px] font-medium text-[#232D42]">{title}</div>
        <div className="text-[11px] text-gray-400">{unit}</div>
      </div>
      <div className="relative w-full" style={{ height: 104 }}>
        {n > 1 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <polygon points={area} fill={color} opacity={0.08} />
            <polyline points={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
        {pts.map((p) => (
          <div key={p.month}>
            <span className="absolute block h-2 w-2 rounded-full ring-2 ring-white" style={{ left: `${p.px}%`, top: `${p.py}%`, background: color, transform: "translate(-50%,-50%)" }} title={fmt(p.v)} />
            <span className="absolute whitespace-nowrap text-[11px] font-medium text-[#232D42]" style={{ left: `${p.px}%`, top: `${p.py}%`, transform: "translate(-50%,-190%)" }}>{fmt(p.v)}</span>
          </div>
        ))}
      </div>
      <div className="grid mt-1.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {pts.map((p, i) => (
          <div key={p.month} className={`text-[11px] text-gray-500 ${n <= 1 ? "text-center" : i === 0 ? "text-left" : i === n - 1 ? "text-right" : "text-center"}`}>{fmtMonth(p.month)}</div>
        ))}
      </div>
    </div>
  );
}

function TableList({ rows, total, loading }: { rows: { name: string; count: number }[]; total: number; loading: boolean }) {
  if (rows.length === 0) return loading ? <LoadingBlock className="!py-6" size={24} /> : <div className="text-sm text-gray-400">—</div>;
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
