"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { fmtDateShort, fmtDateTime } from "@/lib/date";
import { ReportView, PERIOD_META, type ReportPayload, type Period } from "./ReportView";

export default function AIReportsPage() {
  return (
    <HopeDashboardShell active="ai-reports" title="Monthly Reports" subtitle="Generate the full performance report — weekly, monthly &amp; quarterly rollups across channels. Generated reports get stored under Reports.">
      {({ accountId }) => <AIReports accountId={accountId} />}
    </HopeDashboardShell>
  );
}

function AIReports({ accountId }: { accountId: string }) {
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState<Period | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [savedMode, setSavedMode] = useState(false); // opened from the Reports archive (read-only)
  const autoedFor = useRef<string | null>(null);

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

  // On open: if a ?saved=<key> is present (opened from the Reports archive), load
  // that stored report as-is. Otherwise auto-load the current monthly report.
  useEffect(() => {
    const savedKey = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("saved")
      : null;
    if (savedKey) {
      if (autoedFor.current === `saved:${savedKey}`) return;
      autoedFor.current = `saved:${savedKey}`;
      setSavedMode(true);
      setReport(null);
      setError(null);
      setLoading("monthly");
      fetch(`/api/reports?key=${encodeURIComponent(savedKey)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.error) throw new Error(d.error);
          const rep = d.report as ReportPayload;
          setReport(rep);
          setSelectedPeriod(rep.meta.period);
        })
        .catch((e) => setError((e as Error).message))
        .finally(() => setLoading(null));
      return;
    }
    if (autoedFor.current === accountId) return;
    autoedFor.current = accountId;
    setReport(null);
    generate("monthly");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Auto-load skeleton — shown while the monthly report is being prepared on open. */}
      {!report && loading && (
        <div className="animate-pulse">
          <div className="h-28 bg-gray-100 rounded-2xl mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
          </div>
          <div className="h-48 bg-gray-100 rounded-2xl mb-4" />
          <div className="h-64 bg-gray-100 rounded-2xl" />
          <div className="text-center text-[13px] text-gray-500 mt-6">Preparing your {loading} report…</div>
        </div>
      )}

      {/* Header cards — the three generation buttons (fallback / manual re-pick) */}
      {!report && !loading && (
        <>
          <div className="bg-gradient-to-r from-brand to-brand-dark text-white rounded-2xl p-6 mb-6">
            <div className="text-[11px] uppercase tracking-widest opacity-80">Pick a cadence</div>
            <h1 className="text-base font-medium mt-1 !text-white">Generate a live performance report</h1>
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
                  <div className="text-base font-medium text-[#232D42]">{meta.title}</div>
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
              {savedMode ? (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-brand-light text-brand">Saved report</span>
              ) : (
                (["weekly", "monthly", "quarterly"] as Period[]).map((p) => (
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
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              {!savedMode && (
                <button
                  onClick={() => selectedPeriod && generate(selectedPeriod, true)}
                  disabled={!!loading}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-brand disabled:opacity-50"
                >
                  ↻ Regenerate
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-brand"
              >
                🖨 Export / Print
              </button>
              <button
                onClick={() => { if (savedMode) { window.location.href = "/dashboard/hope-preview/reports/social"; } else { setReport(null); setSelectedPeriod(null); } }}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-900"
              >
                ← Back{savedMode ? " to Reports" : ""}
              </button>
            </div>
          </div>

          <ReportView report={report} regenerating={loading !== null} />
        </>
      )}
    </div>
  );
}
