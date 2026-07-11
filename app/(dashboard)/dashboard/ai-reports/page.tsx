"use client";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Period = "weekly" | "monthly" | "quarterly";

type ReportPayload = {
  meta: {
    period: Period;
    label: string;
    account: string;
    dateRange: { from: string; to: string };
    generatedAt: string;
    latencyMs: number;
  };
  executiveSummary: string;
  highlights: { label: string; value: string; delta?: string; insight: string }[];
  contentMix: {
    totalPosts: number;
    byFormat: { format: string; count: number; avgReach: number; avgEng: number; erPct: number }[];
    insight: string;
  };
  topPosts: {
    rank: number; title: string; permalink: string; mediaUrl: string; type: string;
    timestamp: string; reach: number; likes: number; comments: number; engagementRate: number; whyItWorked: string;
  }[];
  followerGrowth: {
    gained: number; dailyAvg: number;
    bestDay: { date: string; gain: number } | null;
    worstDay: { date: string; gain: number } | null;
    insight: string;
  };
  reachOverview: { total: number; deltaPct: number; insight: string };
  engagementOverview: { total: number; deltaPct: number; engagementRatePct: number; insight: string };
  audienceInsights: {
    topCountries: { label: string; value: number }[];
    topCities: { label: string; value: number }[];
    ageBreakdown: { label: string; value: number }[];
    genderBreakdown: { label: string; value: number }[];
    insight: string;
  };
  bestTimes: { day: string; hour: number; followersOnline: number }[];
  recommendations: { title: string; why: string; action: string }[];
  postMetricsTable: {
    date: string; type: string; caption: string;
    reach: number; likes: number; comments: number; saves: number; shares: number; erPct: number;
  }[];
};

const PERIOD_META: Record<Period, { title: string; sub: string; icon: string }> = {
  weekly:    { title: "Weekly report",    sub: "Last 7 days · run every Monday",           icon: "📅" },
  monthly:   { title: "Monthly report",   sub: "Last 30 days · run on the 4th–5th",         icon: "📆" },
  quarterly: { title: "Quarterly report", sub: "Last 90 days · run on the 1st of the quarter", icon: "📊" },
};

function fmtHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-IN");
}

export default function AIReportsPage() {
  return (
    <DashboardShell title="AI Reports" subtitle="Weekly, monthly and quarterly performance rollups — generated on demand.">
      {({ accountId }) => <AIReports accountId={accountId} />}
    </DashboardShell>
  );
}

function AIReports({ accountId }: { accountId: string }) {
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState<Period | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);

  const generate = async (period: Period, force = false) => {
    setLoading(period);
    setError(null);
    setSelectedPeriod(period);
    try {
      const qs = new URLSearchParams({ accountId, period, ...(force ? { force: "1" } : {}) }).toString();
      const r = await fetch(`/api/ai-report?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setReport(d as ReportPayload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Header cards — the three generation buttons */}
      {!report && (
        <>
          <div className="bg-gradient-to-r from-brand to-brand-dark text-white rounded-2xl p-6 mb-6">
            <div className="text-[11px] uppercase tracking-widest opacity-80">Pick a cadence</div>
            <h1 className="text-[22px] font-semibold mt-1">Generate a live performance report</h1>
            <p className="text-[13px] opacity-90 mt-2 max-w-2xl leading-relaxed">
              Pulls your @{accountId} insights, posts, audience and follower data — synthesizes into a
              structured report. Runs in ~10 seconds. Cached 12h so re-opening is instant.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {(["weekly", "monthly", "quarterly"] as Period[]).map((p) => {
              const meta = PERIOD_META[p];
              const isLoading = loading === p;
              return (
                <button
                  key={p}
                  onClick={() => generate(p)}
                  disabled={isLoading}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-brand hover:shadow-md transition text-left disabled:opacity-60"
                >
                  <div className="text-3xl mb-3">{meta.icon}</div>
                  <div className="text-[15px] font-semibold text-gray-900">{meta.title}</div>
                  <div className="text-[12px] text-gray-500 mt-1 leading-snug">{meta.sub}</div>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand">
                    {isLoading ? "Generating…" : "Generate now →"}
                  </div>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-[13px] text-rose-800 mb-4">
              Couldn&rsquo;t generate — {error}
            </div>
          )}
        </>
      )}

      {/* Report view */}
      {report && (
        <>
          {/* Top actions bar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(["weekly", "monthly", "quarterly"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => generate(p)}
                  disabled={loading === p}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-lg border transition ${
                    selectedPeriod === p
                      ? "border-brand bg-brand text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-brand"
                  } disabled:opacity-50`}
                >
                  {loading === p ? "…" : PERIOD_META[p].title}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => selectedPeriod && generate(selectedPeriod, true)}
                disabled={!!loading}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-brand disabled:opacity-50"
              >
                ↻ Regenerate
              </button>
              <button
                onClick={() => window.print()}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-brand"
              >
                🖨 Export / Print
              </button>
              <button
                onClick={() => { setReport(null); setSelectedPeriod(null); }}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-900"
              >
                ← Back
              </button>
            </div>
          </div>

          <ReportView report={report} regenerating={loading !== null} />
        </>
      )}
    </div>
  );
}

function ReportView({ report, regenerating }: { report: ReportPayload; regenerating: boolean }) {
  const chartWidth = 720;
  const chartHeight = 140;

  const dailyBarMax = useMemo(() => {
    const vals = [report.followerGrowth.bestDay?.gain || 0, Math.abs(report.followerGrowth.worstDay?.gain || 0)];
    return Math.max(1, ...vals);
  }, [report.followerGrowth]);

  return (
    <article className={`bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-8 ${regenerating ? "opacity-70" : ""}`}>
      {/* Header */}
      <header className="border-b border-gray-100 pb-6">
        <div className="text-[11px] uppercase tracking-widest text-brand font-semibold mb-2">
          {report.meta.period === "weekly" ? "Weekly performance" : report.meta.period === "monthly" ? "Monthly performance" : "Quarterly performance"}
        </div>
        <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight leading-tight">
          {report.meta.label}
        </h1>
        <div className="text-[12.5px] text-gray-500 mt-1">
          @{report.meta.account} · Generated {new Date(report.meta.generatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </div>
      </header>

      {/* Executive summary */}
      {report.executiveSummary && (
        <section>
          <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-2">Executive summary</div>
          <p className="text-[15px] text-gray-800 leading-relaxed">{report.executiveSummary}</p>
        </section>
      )}

      {/* Highlights */}
      <section>
        <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Highlights</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {report.highlights.map((h) => (
            <div key={h.label} className="border border-gray-200 rounded-xl p-4">
              <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold">{h.label}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <div className="text-[24px] font-semibold tabular-nums tracking-tight">{h.value}</div>
                {h.delta && (
                  <div className={`text-[12px] font-semibold ${h.delta.startsWith("-") || h.delta.startsWith("−") ? "text-rose-700" : "text-emerald-700"}`}>
                    {h.delta}
                  </div>
                )}
              </div>
              {h.insight && <div className="text-[12px] text-gray-600 mt-2 leading-snug">{h.insight}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Content mix */}
      <section>
        <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Content mix</div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-5 items-start">
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-[10.5px] uppercase tracking-widest">Format</th>
                  <th className="text-right px-3 py-2 font-semibold text-[10.5px] uppercase tracking-widest">Posts</th>
                  <th className="text-right px-3 py-2 font-semibold text-[10.5px] uppercase tracking-widest">Avg reach</th>
                  <th className="text-right px-3 py-2 font-semibold text-[10.5px] uppercase tracking-widest">ER</th>
                </tr>
              </thead>
              <tbody>
                {report.contentMix.byFormat.map((f) => (
                  <tr key={f.format} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-900">{f.format}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(f.avgReach)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.erPct}%</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-100 bg-gray-50">
                  <td className="px-3 py-2 font-semibold text-gray-900">Total</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{report.contentMix.totalPosts}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
          {report.contentMix.insight && (
            <div className="border border-brand/30 bg-brand/5 rounded-xl p-4">
              <div className="text-[10.5px] uppercase tracking-widest text-brand font-semibold mb-2">Read on the mix</div>
              <p className="text-[13px] text-gray-800 leading-relaxed">{report.contentMix.insight}</p>
            </div>
          )}
        </div>
      </section>

      {/* Top posts */}
      {report.topPosts.length > 0 && (
        <section>
          <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Top 5 posts by reach</div>
          <div className="space-y-3">
            {report.topPosts.map((p) => (
              <a
                key={p.rank}
                href={p.permalink}
                target="_blank"
                rel="noreferrer"
                className="grid grid-cols-[36px_88px_1fr_auto] items-center gap-4 border border-gray-200 rounded-xl p-3 hover:border-brand transition"
              >
                <div className="text-[22px] font-semibold tabular-nums text-gray-300 text-center">{p.rank}</div>
                <div className="aspect-square rounded-md bg-gray-100 overflow-hidden">
                  {p.mediaUrl ? <img src={p.mediaUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">▢</div>}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                    {p.type === "REEL" ? "Reel" : p.type === "CAROUSEL_ALBUM" ? "Carousel" : "Static"} · {new Date(p.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </div>
                  <div className="text-[13.5px] font-medium text-gray-900 leading-snug mt-0.5 line-clamp-2">{p.title}</div>
                  {p.whyItWorked && <div className="text-[12px] text-gray-600 mt-1 leading-snug italic">Why it worked: {p.whyItWorked}</div>}
                </div>
                <div className="text-right text-[12px] text-gray-700 tabular-nums whitespace-nowrap">
                  <div><b>{fmtNum(p.reach)}</b> reach</div>
                  <div className="text-gray-500">{fmtNum(p.likes)} ❤ · {fmtNum(p.comments)} 💬</div>
                  <div className="text-gray-500">{p.engagementRate}% ER</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Follower growth */}
      <section>
        <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Follower growth</div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-5 items-stretch">
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="grid grid-cols-3 gap-3">
              <MiniFact big={fmtNum(report.followerGrowth.gained)} lbl="New in range" />
              <MiniFact big={String(report.followerGrowth.dailyAvg)} lbl="Avg/day" />
              <MiniFact big={report.followerGrowth.bestDay ? `+${fmtNum(report.followerGrowth.bestDay.gain)}` : "—"} lbl={report.followerGrowth.bestDay ? `Best (${new Date(report.followerGrowth.bestDay.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })})` : "Best day"} />
            </div>
            <div className="mt-4">
              <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-2">Best vs worst day</div>
              <div className="flex items-center gap-2">
                <div className="text-[11px] text-gray-500 tabular-nums w-24">Best day</div>
                <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${((report.followerGrowth.bestDay?.gain || 0) / dailyBarMax) * 100}%` }} />
                </div>
                <div className="text-[11.5px] tabular-nums w-16 text-right">+{report.followerGrowth.bestDay?.gain || 0}</div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="text-[11px] text-gray-500 tabular-nums w-24">Worst day</div>
                <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                  <div className={`h-full ${(report.followerGrowth.worstDay?.gain || 0) < 0 ? "bg-rose-500" : "bg-gray-400"}`} style={{ width: `${(Math.abs(report.followerGrowth.worstDay?.gain || 0) / dailyBarMax) * 100}%` }} />
                </div>
                <div className="text-[11.5px] tabular-nums w-16 text-right">{report.followerGrowth.worstDay?.gain ?? 0}</div>
              </div>
            </div>
          </div>
          {report.followerGrowth.insight && (
            <div className="border border-brand/30 bg-brand/5 rounded-xl p-4">
              <div className="text-[10.5px] uppercase tracking-widest text-brand font-semibold mb-2">Read on follower growth</div>
              <p className="text-[13px] text-gray-800 leading-relaxed">{report.followerGrowth.insight}</p>
            </div>
          )}
        </div>
      </section>

      {/* Reach + Engagement side-by-side */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TwoLineCard title="Reach" value={fmtNum(report.reachOverview.total)} delta={report.reachOverview.deltaPct} insight={report.reachOverview.insight} />
        <TwoLineCard title="Engagement" value={fmtNum(report.engagementOverview.total)} delta={report.engagementOverview.deltaPct} insight={report.engagementOverview.insight} extra={`Engagement rate: ${report.engagementOverview.engagementRatePct}%`} />
      </section>

      {/* Audience */}
      {(report.audienceInsights.topCountries.length > 0 || report.audienceInsights.topCities.length > 0) && (
        <section>
          <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Who you reached</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.audienceInsights.topCountries.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-2">Top countries</div>
                <div className="space-y-1.5 text-[12.5px]">
                  {report.audienceInsights.topCountries.slice(0, 5).map((c) => (
                    <div key={c.label} className="flex items-baseline justify-between">
                      <span>{c.label}</span><span className="tabular-nums text-gray-500">{fmtNum(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {report.audienceInsights.topCities.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-2">Top cities</div>
                <div className="space-y-1.5 text-[12.5px]">
                  {report.audienceInsights.topCities.slice(0, 5).map((c) => (
                    <div key={c.label} className="flex items-baseline justify-between">
                      <span>{c.label}</span><span className="tabular-nums text-gray-500">{fmtNum(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {report.audienceInsights.insight && (
            <div className="mt-3 border border-brand/30 bg-brand/5 rounded-xl p-4">
              <div className="text-[10.5px] uppercase tracking-widest text-brand font-semibold mb-2">Read on audience</div>
              <p className="text-[13px] text-gray-800 leading-relaxed">{report.audienceInsights.insight}</p>
            </div>
          )}
        </section>
      )}

      {/* Best times */}
      {report.bestTimes.length > 0 && (
        <section>
          <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Best times to post</div>
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="space-y-2">
              {report.bestTimes.map((t, i) => (
                <div key={i} className="grid grid-cols-[100px_1fr_100px] items-center gap-3 text-[12.5px]">
                  <div className={i === 0 ? "font-semibold text-brand" : "text-gray-900"}>{t.day} · {fmtHour(t.hour)}</div>
                  <div className="h-3 bg-gray-100 rounded overflow-hidden">
                    <div className={i === 0 ? "h-full bg-brand" : "h-full bg-brand/40"} style={{ width: `${(t.followersOnline / report.bestTimes[0].followersOnline) * 100}%` }} />
                  </div>
                  <div className="text-right text-[11.5px] tabular-nums text-gray-500">{fmtNum(t.followersOnline)} online</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <section>
          <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Recommendations for next {report.meta.period === "weekly" ? "week" : report.meta.period === "monthly" ? "month" : "quarter"}</div>
          <div className="space-y-3">
            {report.recommendations.map((r, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-baseline gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand text-white text-[11px] font-semibold flex items-center justify-center shrink-0 tabular-nums">{i + 1}</span>
                  <div className="text-[14px] font-semibold text-gray-900 leading-snug">{r.title}</div>
                </div>
                <div className="text-[12.5px] text-gray-700 mt-2 ml-8 leading-relaxed">
                  <b>Why:</b> {r.why}
                </div>
                <div className="text-[12.5px] text-gray-700 mt-1 ml-8 leading-relaxed">
                  <b>Action:</b> {r.action}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Metrics table */}
      {report.postMetricsTable.length > 0 && (
        <section>
          <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold mb-3">All posts in this range</div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Post</th>
                    <th className="text-right px-3 py-2">Reach</th>
                    <th className="text-right px-3 py-2">Likes</th>
                    <th className="text-right px-3 py-2">Comm.</th>
                    <th className="text-right px-3 py-2">Saves</th>
                    <th className="text-right px-3 py-2">Shares</th>
                    <th className="text-right px-3 py-2">ER</th>
                  </tr>
                </thead>
                <tbody>
                  {report.postMetricsTable.map((p, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{p.type}</td>
                      <td className="px-3 py-2 max-w-[280px] truncate" title={p.caption}>{p.caption}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.reach)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.likes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.comments)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.saves)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.shares)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.erPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <footer className="pt-6 border-t border-gray-100 text-[11px] text-gray-400 italic">
        Live data from Meta&rsquo;s Instagram Graph API for @{report.meta.account}. AI prose written by GPT-4o-mini from the pre-computed numbers above.
      </footer>
    </article>
  );
}

function MiniFact({ big, lbl }: { big: string; lbl: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[18px] font-semibold tabular-nums leading-none">{big}</div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1 leading-tight">{lbl}</div>
    </div>
  );
}

function TwoLineCard({ title, value, delta, insight, extra }: { title: string; value: string; delta: number; insight: string; extra?: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="text-[10.5px] uppercase tracking-widest text-gray-500 font-semibold">{title}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-[24px] font-semibold tabular-nums tracking-tight">{value}</div>
        <div className={`text-[12px] font-semibold ${delta < 0 ? "text-rose-700" : "text-emerald-700"}`}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
        </div>
      </div>
      {extra && <div className="text-[11.5px] text-gray-500 mt-1">{extra}</div>}
      {insight && <div className="text-[12.5px] text-gray-700 mt-2 leading-snug">{insight}</div>}
    </div>
  );
}
