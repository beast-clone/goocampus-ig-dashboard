"use client";
import { useEffect, useMemo, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useApi } from "@/lib/use-api";

type Counsellor = {
  name: string;
  assigned: number;
  firstActivityAvgHrs: number | null;
  contracts: number;
  revenue: number;
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
    contracts: number;
    revenue: number;
  };
  inflowByDay: { date: string; count: number }[];
  bySource: { name: string; count: number }[];
  byInterest: { name: string; count: number }[];
  byStatus: { name: string; count: number }[];
  counsellors: Counsellor[];
  campaigns: { name: string; leads: number; contracts: number; revenue: number }[];
  awaiting: { name: string; counsellor: string; source: string; daysUntouched: number }[];
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

export default function SalesOpsPage() {
  return (
    <HopeDashboardShell active="sales" title="Sales Hub" subtitle="Your whole CRM — total leads, counsellor activity, contracts and revenue in the selected range." hideAccountPicker>
      {({ range }) => <Inner range={range} />}
    </HopeDashboardShell>
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
        <LiveIndicator isLoading={isLoading} onRefresh={refresh} />
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-5">
        <KpiTile label="Leads this range" value={data ? fmtInt(data.totals.leads) : "—"} hint="Created Date in range" />
        <KpiTile label="Avg first activity" value={data ? fmtHrs(data.totals.firstActivityAvgHrs) : "—"} hint="Created → first CRM touch" />
        <KpiTile label="Contracts generated" value={data ? fmtInt(data.totals.contracts) : "—"} hint="Contract Generator table" />
        <KpiTile label="Revenue booked" value={data ? fmtInr(data.totals.revenue) : "—"} hint="Revenue Tracker payments" />
      </div>

      {/* Inflow + Source */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium">Lead inflow — daily</div>
            <div className="text-sm text-gray-500">
              {data ? `${data.range.days} days · ${data.range.from} → ${data.range.to}` : ""}
            </div>
          </div>
          {inflowChart ? (
            <>
              <div className="flex items-baseline gap-6 mb-3">
                <div>
                  <div className="text-3xl font-medium">{fmtInt(data?.totals.leads || 0)}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Total leads</div>
                </div>
                <div>
                  <div className="text-3xl font-medium">{fmtInt(Math.round((data?.totals.leads || 0) / (data?.range.days || 1)))}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Avg per day</div>
                </div>
                <div>
                  <div className="text-3xl font-medium">{fmtInt(inflowChart.peak.count)}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Peak · {inflowChart.peak.date}</div>
                </div>
              </div>
              <svg viewBox="0 0 400 90" preserveAspectRatio="none" className="w-full h-32">
                <polyline points={inflowChart.points} fill="none" stroke="#3A57E8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <polyline points={`${inflowChart.points} 400,90 0,90`} fill="#3A57E8" fillOpacity="0.08" stroke="none" />
              </svg>
              <div className="flex justify-between text-sm text-gray-500 mt-2">
                <span>{range.from}</span>
                <span>{range.to}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400 py-10">{isLoading ? "Loading…" : "No leads in this range"}</div>
          )}
        </Card>
        <Card className="col-span-2">
          <div className="text-base font-medium mb-4">Source split</div>
          <div className="space-y-3 text-sm">
            {data?.bySource.slice(0, 6).map((s, i) => (
              <div key={s.name}>
                <div className="flex justify-between">
                  <span>{s.name}</span>
                  <span className="text-gray-500">{fmtInt(s.count)} · {Math.round((s.count / data.totals.leads) * 100)}%</span>
                </div>
                <div className="h-[5px] rounded mt-1.5" style={{ width: `${(s.count / maxSource) * 100}%`, background: COLORS[i % COLORS.length] }} />
              </div>
            ))}
            {!data && <div className="text-gray-400">{isLoading ? "Loading…" : "—"}</div>}
          </div>
        </Card>
      </div>

      {/* Counsellor activity */}
      <div>
        <div className="text-base font-medium mb-3">Counsellor activity</div>
        <div className="grid grid-cols-3 gap-5">
          {(data?.counsellors.slice(0, 6) || []).map((c, i) => (
            <button
              key={c.name}
              onClick={() => setDrillCounsellor(c.name)}
              className="bg-white rounded-xl border border-gray-100 p-6 text-left hover:border-brand hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-medium"
                    style={{ background: [ "#CECBF6", "#9FE1CB", "#FAC775", "#F4C0D1", "#B5D4F4", "#F5C4B3" ][i % 6], color: "#333" }}>
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="text-base font-medium">{c.name}</div>
                </div>
                <div className="text-xs text-gray-400">Click to view leads →</div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Assigned</div>
                  <div className="text-2xl font-medium mt-1">{fmtInt(c.assigned)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Avg first activity</div>
                  <div className="text-2xl font-medium mt-1">{fmtHrs(c.firstActivityAvgHrs)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Contracts</div>
                  <div className="text-xl font-medium mt-1">{fmtInt(c.contracts)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Revenue</div>
                  <div className="text-xl font-medium mt-1">{fmtInr(c.revenue)}</div>
                </div>
              </div>
            </button>
          ))}
          {!data && Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><div className="text-sm text-gray-400">{isLoading ? "Loading…" : "—"}</div></Card>
          ))}
        </div>
      </div>

      {/* Status + Interest */}
      <div className="grid grid-cols-2 gap-5">
        <Card>
          <div className="text-base font-medium">Current CRM status</div>
          <div className="text-sm text-gray-500 mb-4">Snapshot of the Lead Status field</div>
          <TableList rows={data?.byStatus || []} total={totalStatus} loading={isLoading} />
        </Card>
        <Card>
          <div className="text-base font-medium">Interest mix</div>
          <div className="text-sm text-gray-500 mb-4">Primary Interest</div>
          <TableList rows={data?.byInterest || []} total={totalInterest} loading={isLoading} />
        </Card>
      </div>

      {/* Campaign attribution */}
      <Card>
        <div className="text-base font-medium">Campaign attribution</div>
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
          <div className="text-base font-medium">Awaiting activity</div>
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
                <tr key={`${a.name}-${i}`} className="border-t border-gray-100">
                  <td className="py-2.5">{a.name}</td>
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

      {/* ── Section: Revenue trend (last 6 months) ── */}
      {data && data.revenueTrend.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium">Revenue trend</div>
            <div className="text-sm text-gray-500">Last 6 months · independent of range</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Payments booked (Revenue Tracker) alongside contracts generated per month.</div>
          <RevenueTrendChart data={data.revenueTrend} />
        </Card>
      )}

      {/* ── Section: Call activity ── */}
      {data && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-base font-medium">Call activity</div>
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
            <div className="text-base font-medium">Meetings</div>
            <div className="text-sm text-gray-500">Sales System v2.0 table</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Counsellor meetings held, ratings, and what&apos;s coming up.</div>
          {data.meetings.totalMeetings > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-5 mb-6">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Meetings held</div>
                  <div className="text-3xl font-medium mt-1">{fmtInt(data.meetings.totalMeetings)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Avg lead rating</div>
                  <div className="text-3xl font-medium mt-1">
                    {data.meetings.avgRating != null ? `${data.meetings.avgRating}/5` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Upcoming</div>
                  <div className="text-3xl font-medium mt-1">{fmtInt(data.meetings.upcoming.length)}</div>
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
                            {new Date(m.when).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
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
            <div className="text-base font-medium">Attendance × Distribution</div>
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
            <div className="text-base font-medium">Re-enquiries</div>
            <div className="text-sm text-gray-500">Repeat inquirers — warm signal</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Leads that came back a second time.</div>
          <div className="grid grid-cols-2 gap-5 mb-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total re-enquiries in range</div>
              <div className="text-3xl font-medium mt-1">{fmtInt(data.reEnquiries.total)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">With re-enquiry timestamp</div>
              <div className="text-3xl font-medium mt-1">{fmtInt(data.reEnquiries.withinRange)}</div>
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
                      {r.lastReEnquiryAt ? new Date(r.lastReEnquiryAt).toLocaleDateString("en-IN") : "—"}
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
            <div className="text-base font-medium">Walk-in enquiries</div>
            <div className="text-sm text-gray-500">Office Enquiries table</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">In-person funnel — separate from digital DM leads.</div>
          <div className="grid grid-cols-3 gap-5 mb-6">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Walk-ins in range</div>
              <div className="text-3xl font-medium mt-1">{fmtInt(data.walkIns.total)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Countries of interest</div>
              <div className="text-3xl font-medium mt-1">{fmtInt(data.walkIns.byCountry.length)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Specialties mentioned</div>
              <div className="text-3xl font-medium mt-1">{fmtInt(data.walkIns.byInterest.length)}</div>
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
            <div className="text-base font-medium">Geography</div>
            <div className="text-sm text-gray-500">Location field on CRM</div>
          </div>
          <div className="text-sm text-gray-500 mb-5">Where leads are physically located.</div>
          <TableList rows={data.geography} total={data.totals.leads} loading={false} />
        </Card>
      )}

      {data && (
        <div className="text-xs text-gray-400 text-right">
          Generated {new Date(data.generatedAt).toLocaleString("en-IN")} · {data.latencyMs}ms
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

  const statuses = useMemo(() => {
    if (!leads) return [];
    return Array.from(new Set(leads.map((l) => l.status).filter(Boolean))).sort();
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
            <div className="text-xl font-medium">{name} — assigned leads</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {range.from} → {range.to} · {leads ? `${leads.length} leads` : "loading…"}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">×</button>
        </div>

        {leads && (
          <div className="px-8 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3 text-sm">
            <label className="text-gray-500">Sort</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "createdAt" | "daysUntouched" | "status")} className="border border-gray-200 rounded px-3 py-1.5">
              <option value="createdAt">Newest first</option>
              <option value="daysUntouched">Most idle first</option>
              <option value="status">Status</option>
            </select>
            <label className="text-gray-500 ml-3">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-200 rounded px-3 py-1.5">
              <option value="">All</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="ml-auto">
              <button onClick={copyCsv} className="border border-gray-200 rounded px-4 py-1.5 hover:bg-gray-50">Copy CSV</button>
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
                    <td className="px-6 py-3">{l.status || "—"}</td>
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

function KpiTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-medium mt-2">{value}</div>
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
