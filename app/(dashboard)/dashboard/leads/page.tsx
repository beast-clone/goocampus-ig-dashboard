"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from "recharts";

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
function monthLabel(ym: string): string {
  try {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
  } catch { return ym; }
}

export default function LeadsPage() {
  return (
    <DashboardShell title="Leads" subtitle="View-only — how many leads we generated, where they came from, and reply rate.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function Inner({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  function load(force = false, signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ accountId, from: range.from, to: range.to });
    if (force) qs.set("force", "1");
    fetch(`/api/leads?${qs}`, { signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          setFetchedAt(Date.now());
        }
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    const ctrl = new AbortController();
    load(false, ctrl.signal);
    return () => ctrl.abort();
    /* eslint-disable-next-line */
  }, [accountId, range.from, range.to]);

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div className="text-xs text-gray-500">
          {data ? `Analyzed ${data.postsAnalyzed} posts in this range` : ""}
        </div>
        <LiveIndicator fetchedAt={fetchedAt} latencyMs={data?.latencyMs ?? null} loading={loading} onRefresh={() => load(true)} />
      </div>

      {loading && !data && <div className="text-sm text-gray-500">Loading lead analytics…</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-4 rounded-lg">{error}</div>}

      {data && (
        <>
          {/* Headline totals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <BigCard label="Total leads" value={fmt(data.totals.all)} sub="all sources combined" accent="bg-violet-600" />
            <BigCard label="From Meta Ads" value={fmt(data.totals.ads)} sub={data.adSpend > 0 ? `${fmtINR(data.adSpend)} spent · ${fmtINR(data.costPerLead)} / lead` : "no ad data"} accent="bg-blue-500" />
            <BigCard label="From comments" value={fmt(data.totals.comments)} sub="funnel keyword detection" accent="bg-emerald-500" />
          </div>

          {/* Monthly trend chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
            <div className="text-sm font-medium mb-3">Leads by month</div>
            {data.byMonth.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8">No lead activity in this range.</div>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={data.byMonth.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="ads" name="Ad leads" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="comments" name="Comment leads" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

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
