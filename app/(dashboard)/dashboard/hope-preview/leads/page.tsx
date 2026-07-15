"use client";
import { useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { useApi } from "@/lib/use-api";
import { LiveIndicator } from "@/components/LiveIndicator";

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
  leadsPerPost?: number;
  commentConversion?: number;
  topPosts?: { id: string; permalink: string; caption: string; leads: number }[];
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
    <HopeDashboardShell active="leads" title="Social Leads" subtitle="Leads from this account's posts, comments and ads — where they came from and reply rate.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} />}
    </HopeDashboardShell>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <BigCard label="Total leads" value={fmt(data.totals.all)} sub="all sources combined" />
            <BigCard label="From Meta Ads" value={fmt(data.totals.ads)} sub={data.adSpend > 0 ? `${fmtINR(data.adSpend)} spent · ${fmtINR(data.costPerLead)} / lead` : "no ad data"} />
            <BigCard label="From comments" value={fmt(data.totals.comments)} sub="funnel keyword detection" />
          </div>

          {/* Quick metric tiles — the "extra" signals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MiniTile label="Comment leads / post" value={(data.leadsPerPost ?? (data.postsAnalyzed ? data.totals.comments / data.postsAnalyzed : 0)).toFixed(1)} hint={`across ${fmt(data.postsAnalyzed)} posts`} />
            <MiniTile label="Comment → lead" value={`${((data.commentConversion ?? (data.totalComments ? data.totals.comments / data.totalComments : 0)) * 100).toFixed(1)}%`} hint="of comments become leads" />
            <MiniTile label="Reply rate" value={`${(data.commentReplyRate * 100).toFixed(1)}%`} hint={`${fmt(data.commentsReplied)} of ${fmt(data.totalComments)} replied`} />
            <MiniTile label="Best keyword" value={data.topKeywords[0]?.keyword?.toUpperCase() || "—"} hint={data.topKeywords[0] ? `${data.topKeywords[0].leads} leads` : "none yet"} />
          </div>

          {/* Source split — a single clean 100% bar, no more donut */}
          {data.totals.all > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Where leads came from</div>
                <div className="text-xs text-gray-500">{fmt(data.totals.all)} total in this range</div>
              </div>
              {/* 100% split bar */}
              <div className="flex h-3.5 rounded-full overflow-hidden mb-4">
                <div className="bg-blue-500 h-full" style={{ width: `${data.totals.all ? (data.totals.ads / data.totals.all) * 100 : 0}%` }} title="Meta Ads" />
                <div className="bg-emerald-500 h-full" style={{ width: `${data.totals.all ? (data.totals.comments / data.totals.all) * 100 : 0}%` }} title="Comments" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
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
                  extra={`${(data.commentReplyRate * 100).toFixed(1)}% reply rate · ${fmt(data.totalComments)} comments`}
                />
              </div>
              <div className="text-[11px] text-gray-500 leading-relaxed pt-3 mt-3 border-t border-gray-100">
                The comments path is essentially free — only Meta Ads cost money. This split tells you whether
                paid spend or organic conversation is doing the heavy lifting.
              </div>
            </div>
          )}

          {/* Keywords + top posts — paired into two columns so the page reads tight */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top funnel keywords */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-sm font-medium mb-3">Top funnel keywords</div>
              {data.topKeywords.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">No keywords detected.</div>
              ) : (
                <div className="space-y-2">
                  {data.topKeywords.slice(0, 7).map((k) => {
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

            {/* Posts that pulled the most leads */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-sm font-medium mb-3">Posts that pulled the most leads</div>
              {(data.topPosts?.length ?? 0) === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">Hit refresh to load top posts.</div>
              ) : (
                <div className="space-y-2">
                  {(data.topPosts ?? []).map((p, i) => (
                    <a
                      key={p.id}
                      href={p.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition"
                    >
                      <div className="w-6 h-6 rounded-md bg-violet-50 text-violet-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                      <div className="flex-1 min-w-0 text-[13px] text-gray-800 truncate">{p.caption || "(no caption)"}</div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold text-gray-900">{p.leads}</span>
                        <span className="text-[11px] text-gray-500 ml-1">leads</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
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

function MiniTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 font-medium truncate">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1 truncate">{value}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function BigCard({ label, value, sub }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
