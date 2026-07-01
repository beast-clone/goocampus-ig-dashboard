"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useApi } from "@/lib/use-api";
import { LiveIndicator } from "@/components/LiveIndicator";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type Overview = {
  account: { id: string; handle: string };
  range: { from: string; to: string };
  totals: { all: number; ads: number; comments: number };
  byMonth: { month: string; ads: number; comments: number; total: number }[];
  topKeywords: { keyword: string; leads: number }[];
  adSpend: number;
  costPerLead: number;
  commentReplyRate: number;
  commentsReplied: number;
  totalComments: number;
  postsAnalyzed: number;
  cached?: boolean;
  latencyMs?: number;
};

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}
function fmtINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export default function LeadsPage() {
  return (
    <DashboardShell title="Leads" subtitle="View-only — how many leads we generated, where they came from, and reply rate.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function Inner({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ accountId, from: range.from, to: range.to }).toString();
  const { data, error, isLoading, refresh } = useApi<Overview>(`/api/leads?${qs}`);
  const loading = isLoading;
  const load = () => refresh();
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  useEffect(() => { if (data) setFetchedAt(Date.now()); }, [data]);

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div className="text-xs text-gray-500">
          {data ? `Analyzed ${data.postsAnalyzed} posts in this range` : ""}
        </div>
        <LiveIndicator fetchedAt={fetchedAt} latencyMs={data?.latencyMs ?? null} loading={loading} onRefresh={load} />
      </div>

      {loading && !data && <div className="text-sm text-gray-500">Loading lead analytics…</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-4 rounded-lg">{error.message}</div>}

      {data && (
        <>
          {/* Headline totals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <BigCard label="Total leads" value={fmt(data.totals.all)} sub="all sources combined" accent="bg-violet-600" />
            <BigCard label="From Meta Ads" value={fmt(data.totals.ads)} sub={data.adSpend > 0 ? `${fmtINR(data.adSpend)} spent · ${fmtINR(data.costPerLead)} / lead` : "no ad data"} accent="bg-blue-500" />
            <BigCard label="From comments" value={fmt(data.totals.comments)} sub="funnel keyword detection" accent="bg-emerald-500" />
          </div>

          {/* Source split — donut + horizontal proportion bar. Way more readable than
              the old monthly bar chart, which collapsed to one big bar when the date
              range only spanned one month with activity. */}
          {data.totals.all > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium">Where leads came from</div>
                <div className="text-xs text-gray-500">{fmt(data.totals.all)} total in this range</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                {/* Donut */}
                <div className="relative" style={{ height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Meta Ads", value: data.totals.ads, fill: "#3b82f6" },
                          { name: "Comments", value: data.totals.comments, fill: "#10b981" },
                        ]}
                        dataKey="value"
                        innerRadius={62}
                        outerRadius={90}
                        paddingAngle={2}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <Cell fill="#3b82f6" />
                        <Cell fill="#10b981" />
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [fmt(value) + " leads", name]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-3xl font-bold text-gray-900 leading-none">{fmt(data.totals.all)}</div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">total leads</div>
                  </div>
                </div>

                {/* Side legend with proportion bar + cost details */}
                <div className="space-y-4">
                  <SourceRow
                    color="bg-blue-500"
                    label="Meta Ads"
                    value={data.totals.ads}
                    pct={data.totals.all ? (data.totals.ads / data.totals.all) * 100 : 0}
                    extra={data.adSpend > 0 ? `${fmtINR(data.adSpend)} spent · ${fmtINR(data.costPerLead)} / lead` : undefined}
                  />
                  <SourceRow
                    color="bg-emerald-500"
                    label="Comments"
                    value={data.totals.comments}
                    pct={data.totals.all ? (data.totals.comments / data.totals.all) * 100 : 0}
                    extra={`${(data.commentReplyRate * 100).toFixed(1)}% reply rate · ${fmt(data.totalComments)} comments total`}
                  />
                  <div className="text-[11px] text-gray-500 leading-relaxed pt-1 border-t border-gray-100">
                    Comments path is essentially free — only Meta Ads cost money. The split tells you whether
                    paid spend is doing the heavy lifting or whether organic conversation is.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top funnel keywords + secondary metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-sm font-medium mb-3">Top funnel keywords</div>
              {data.topKeywords.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">No keywords detected.</div>
              ) : (
                <div className="space-y-2">
                  {data.topKeywords.map((k) => {
                    const max = data.topKeywords[0].leads || 1;
                    const pct = (k.leads / max) * 100;
                    return (
                      <div key={k.keyword} className="flex items-center gap-3">
                        <div className="w-20 text-xs font-medium text-gray-700 uppercase truncate">{k.keyword}</div>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-10 text-right text-xs font-medium text-gray-900">{k.leads}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-sm font-medium mb-3">Engagement</div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-500">Comment reply rate</div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-bold text-gray-900">{(data.commentReplyRate * 100).toFixed(1)}%</span>
                    <span className="text-xs text-gray-500">{fmt(data.commentsReplied)} of {fmt(data.totalComments)} comments</span>
                  </div>
                </div>
                <div className="h-px bg-gray-100" />
                <div>
                  <div className="text-xs text-gray-500">Total comments received</div>
                  <div className="text-2xl font-bold text-gray-900 mt-0.5">{fmt(data.totalComments)}</div>
                </div>
                {data.adSpend > 0 && (
                  <>
                    <div className="h-px bg-gray-100" />
                    <div>
                      <div className="text-xs text-gray-500">Cost per lead (ads)</div>
                      <div className="text-2xl font-bold text-gray-900 mt-0.5">{fmtINR(data.costPerLead)}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SourceRow({ color, label, value, pct, extra }: { color: string; label: string; value: number; pct: number; extra?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
          <span className="text-sm font-medium text-gray-900">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-gray-900 tabular-nums">{fmt(value)}</span>
          <span className="text-xs text-gray-500 ml-1.5">({pct.toFixed(1)}%)</span>
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {extra && <div className="text-[11px] text-gray-500 mt-1.5">{extra}</div>}
    </div>
  );
}

function BigCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`h-1 ${accent}`} />
      <div className="p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</div>
        <div className="text-3xl font-bold text-gray-900 mt-1">{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}
