"use client";
import { useCallback, useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";

type Integration = {
  key: string;
  name: string;
  category: string;
  configured: boolean;
  status: "ok" | "warn" | "error" | "unknown";
  tokenType: string;
  expiresAt: number | null;
  daysRemaining: number | null;
  detail: string;
  note?: string;
  usage?: { allTime: number; today: number; session: number; errors: number };
  quota?: { label: string; usedPct?: number; detail: string; note?: string; resetAt?: number };
};

function untilReset(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
type UsageRow = { provider: string; calls: number; errors: number; lastAt: number | null; lastStatus: number | null; today: number; allTime: number; allTimeErrors: number };
type Payload = {
  integrations: Integration[];
  usage: { startedAt: number; firstAt: number; rows: UsageRow[]; totalSession: number; totalToday: number; totalAllTime: number; totalErrors: number };
  rateLimit: { provider: string; callPct: number; cpuPct: number; timePct: number } | null;
  generatedAt: number;
};

const DOT: Record<Integration["status"], string> = { ok: "bg-emerald-500", warn: "bg-amber-500", error: "bg-rose-500", unknown: "bg-gray-300" };
const LABEL: Record<Integration["status"], string> = { ok: "Healthy", warn: "Attention", error: "Error", unknown: "Unknown" };

function relTime(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
function expiryColor(days: number | null): string {
  if (days === null) return "text-gray-400";
  if (days < 7) return "text-rose-600";
  if (days < 21) return "text-amber-600";
  return "text-emerald-600";
}

export default function IntegrationsPage() {
  return (
    <HopeDashboardShell active="integrations" title="Integrations" subtitle="Live token health & API-call usage across every connected service." hideAccountPicker>
      {() => <Integrations />}
    </HopeDashboardShell>
  );
}

function Integrations() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const r = await fetch(`/api/integrations/status${force ? "?force=1" : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d as Payload);
      setFetchedAt(Date.now());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 30s (usage counters move as pages are used).
  useEffect(() => {
    load();
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-16 bg-gray-100 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-36 bg-gray-100 rounded-2xl" />)}
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800">Couldn&rsquo;t load status — {err}</div>;
  }

  const healthy = data.integrations.filter((i) => i.status === "ok").length;
  const attention = data.integrations.filter((i) => i.status === "warn" || i.status === "error").length;
  const expiringSoon = data.integrations.filter((i) => i.daysRemaining !== null && i.daysRemaining < 21).sort((a, b) => (a.daysRemaining! - b.daysRemaining!));

  return (
    <div className="space-y-6">
      {/* Summary strip — API-call totals headline the monitor */}
      <div className="flex flex-wrap items-center gap-3">
        <Stat n={data.usage.totalAllTime} label="API calls (all-time)" tone="brand" big />
        <Stat n={data.usage.totalToday} label="Today" />
        <Stat n={data.usage.totalSession} label="This session" />
        <Stat n={data.integrations.length} label="Integrations" />
        <Stat n={healthy} label="Healthy" tone="emerald" />
        <Stat n={attention} label="Need attention" tone={attention ? "rose" : "gray"} />
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span>Updated {relTime(fetchedAt)}</span>
          <button onClick={() => load(true)} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-brand text-gray-700 font-medium">↻ Refresh now</button>
        </div>
      </div>

      {/* Token-expiry warnings up top (the whole point of the monitor) */}
      {expiringSoon.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="text-xs font-semibold text-amber-900 mb-1">⏳ Tokens expiring soon</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-amber-900">
            {expiringSoon.map((i) => (
              <span key={i.key}><b>{i.name.split(" —")[0]}</b>: {i.daysRemaining} day{i.daysRemaining === 1 ? "" : "s"} left</span>
            ))}
          </div>
        </div>
      )}

      {/* Meta rate-limit meter */}
      {data.rateLimit && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Meta Graph rate limit (rolling)</div>
            <div className="text-xs text-gray-400">% of Meta&rsquo;s hourly allowance used</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Meter label="Call volume" pct={data.rateLimit.callPct} />
            <Meter label="CPU time" pct={data.rateLimit.cpuPct} />
            <Meter label="Total time" pct={data.rateLimit.timePct} />
          </div>
        </div>
      )}

      {/* Token health cards */}
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-3">Token health</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.integrations.map((i) => (
            <div key={i.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-base font-medium text-[#232D42] leading-snug">{i.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{i.category} · {i.tokenType}</div>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-gray-600">
                  <span className={`w-2 h-2 rounded-full ${DOT[i.status]}`} />
                  {LABEL[i.status]}
                </span>
              </div>

              {i.daysRemaining !== null ? (
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className={`text-[26px] font-semibold tabular-nums leading-none ${expiryColor(i.daysRemaining)}`}>{i.daysRemaining}</span>
                  <span className="text-[12px] text-gray-500">days until expiry</span>
                </div>
              ) : (
                <div className="mt-3 text-[13px] text-gray-500">No expiry</div>
              )}

              <div className="text-[12px] text-gray-600 mt-2 leading-snug">{i.detail}</div>
              {i.note && <div className="text-xs text-rose-600 mt-1.5">⚠ {i.note}</div>}
              {i.expiresAt && (
                <div className="text-xs text-gray-400 mt-2">Expires {new Date(i.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
              )}

              {/* This integration's own API-call counts */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                {i.usage && i.usage.allTime > 0 ? (
                  <div className="flex items-stretch gap-2">
                    <CallStat n={i.usage.allTime} label="All-time" primary />
                    <CallStat n={i.usage.today} label="Today" />
                    <CallStat n={i.usage.session} label="Session" />
                    {i.usage.errors > 0 && <CallStat n={i.usage.errors} label="Errors" danger />}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">
                    {i.usage ? "No API calls tracked yet" : "Usage not tracked"}
                  </div>
                )}
              </div>

              {/* Quota / rate-limit meter */}
              {i.quota && (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs uppercase tracking-wide text-gray-500 font-medium">{i.quota.label}</span>
                    {typeof i.quota.usedPct === "number" ? (
                      <span className="text-xs font-semibold tabular-nums text-gray-900">{i.quota.usedPct.toFixed(i.quota.usedPct < 1 ? 2 : 0)}%</span>
                    ) : i.quota.resetAt ? (
                      <span className="text-xs tabular-nums text-gray-400">resets in {untilReset(i.quota.resetAt)}</span>
                    ) : null}
                  </div>
                  {typeof i.quota.usedPct === "number" && (
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${i.quota.usedPct >= 90 ? "bg-rose-500" : i.quota.usedPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(1, i.quota.usedPct)}%` }} />
                    </div>
                  )}
                  <div className="text-xs text-gray-700 mt-1">{i.quota.detail}</div>
                  {i.quota.note && <div className="text-xs text-gray-400 mt-1 leading-snug">{i.quota.note}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* API usage table */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">API call usage — number of calls per provider</div>
          <div className="text-xs text-gray-400">Tracking since {new Date(data.usage.firstAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
        </div>
        {data.usage.rows.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-500">
            No API calls recorded yet. Open a few dashboard tabs and they&rsquo;ll show up here.
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-gray-50 text-xs uppercase tracking-widest text-gray-500 font-semibold">
                  <tr>
                    <th className="text-left px-4 py-2.5">Provider</th>
                    <th className="text-right px-4 py-2.5">All-time</th>
                    <th className="text-right px-4 py-2.5">Today</th>
                    <th className="text-right px-4 py-2.5">Session</th>
                    <th className="text-right px-4 py-2.5">Errors</th>
                    <th className="text-right px-4 py-2.5">Last</th>
                    <th className="text-left px-4 py-2.5 w-[22%]">Share (all-time)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usage.rows.map((r) => {
                    const pct = data.usage.totalAllTime > 0 ? (r.allTime / data.usage.totalAllTime) * 100 : 0;
                    return (
                      <tr key={r.provider} className="border-t border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{r.provider}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{r.allTime.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.today.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.calls.toLocaleString("en-IN")}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${r.allTimeErrors > 0 ? "text-rose-600 font-medium" : "text-gray-400"}`}>{r.allTimeErrors}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{relTime(r.lastAt)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                              <div className="h-full bg-brand rounded" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-gray-400 w-8 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-4 py-2.5 text-gray-900">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{data.usage.totalAllTime.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{data.usage.totalToday.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{data.usage.totalSession.toLocaleString("en-IN")}</td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="text-xs text-gray-400 mt-2">All-time &amp; today persist across restarts; session resets on restart. Counts calls the dashboard makes — not traffic from n8n or other apps.</div>
      </div>
    </div>
  );
}

function Stat({ n, label, tone = "gray", big }: { n: number; label: string; tone?: "gray" | "emerald" | "rose" | "brand"; big?: boolean }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : tone === "brand" ? "text-brand" : "text-gray-900";
  return (
    <div className={`bg-white rounded-xl border shadow-sm px-4 py-2.5 ${big ? "border-brand/30" : "border-gray-100"}`}>
      <div className={`${big ? "text-[26px]" : "text-[20px]"} font-semibold tabular-nums leading-none ${color}`}>{n.toLocaleString("en-IN")}</div>
      <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function CallStat({ n, label, primary, danger }: { n: number; label: string; primary?: boolean; danger?: boolean }) {
  const color = danger ? "text-rose-600" : primary ? "text-brand" : "text-gray-900";
  return (
    <div className={`flex-1 rounded-lg px-2.5 py-1.5 ${primary ? "bg-brand/5" : "bg-gray-50"}`}>
      <div className={`text-[16px] font-semibold tabular-nums leading-none ${color}`}>{n.toLocaleString("en-IN")}</div>
      <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function Meter({ label, pct }: { label: string; pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const color = p >= 90 ? "bg-rose-500" : p >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] text-gray-600">{label}</span>
        <span className="text-[12px] font-semibold tabular-nums text-gray-900">{p.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}
