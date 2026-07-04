"use client";
import { useEffect, useState } from "react";

type Tip = {
  metric: "followers" | "reach" | "engagement";
  headline: string;
  detail: string;
  action: string;
  tone: "grow" | "hold" | "fix";
};

const METRIC_META: Record<Tip["metric"], { label: string; icon: string; hue: string }> = {
  followers:  { label: "Followers",  icon: "👥", hue: "violet"  },
  reach:      { label: "Reach",      icon: "📡", hue: "sky"     },
  engagement: { label: "Engagement", icon: "💬", hue: "emerald" },
};

const TONE_STYLE: Record<Tip["tone"], string> = {
  grow: "bg-emerald-50 text-emerald-700 border-emerald-200",
  hold: "bg-gray-50 text-gray-600 border-gray-200",
  fix:  "bg-rose-50 text-rose-700 border-rose-200",
};

export function AiTipsStrip({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (force = false) => {
    const setter = force ? setRefreshing : setLoading;
    setter(true); setError(null);
    try {
      const qs = new URLSearchParams({ accountId, from: range.from, to: range.to, ...(force ? { force: "1" } : {}) }).toString();
      const r = await fetch(`/api/overview-tips?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setTips(d.tips || []);
      setCached(d.cached ? d.cachedAt : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setter(false);
    }
  };

  useEffect(() => { load(false); }, [accountId, range.from, range.to]);

  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-gray-900">✨ AI Growth Tips</h2>
          <span className="text-[11px] text-gray-500 italic">Data-backed next moves for this range</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {cached && (
            <span className="text-gray-400" title={cached}>
              cached · {new Date(cached).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="text-brand hover:underline disabled:text-gray-400"
          >
            {refreshing ? "regenerating…" : "↻ regenerate"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm h-[140px] animate-pulse">
              <div className="h-3 w-24 bg-gray-100 rounded mb-3" />
              <div className="h-4 w-full bg-gray-100 rounded mb-2" />
              <div className="h-3 w-3/4 bg-gray-100 rounded mb-2" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs text-rose-700">
          Couldn&apos;t generate tips — {error}. Try regenerate.
        </div>
      )}

      {!loading && !error && tips && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tips.map((t, i) => {
            const meta = METRIC_META[t.metric];
            return (
              <article
                key={i}
                className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-col gap-2 relative overflow-hidden"
              >
                <div className={`absolute top-0 left-0 h-1 w-full bg-${meta.hue}-400`} />
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-500">
                    <span className="mr-1">{meta.icon}</span>{meta.label}
                  </div>
                  <span className={`text-[9px] uppercase tracking-wide font-semibold rounded-full border px-2 py-0.5 ${TONE_STYLE[t.tone]}`}>
                    {t.tone === "grow" ? "growing" : t.tone === "hold" ? "flat" : "declining"}
                  </span>
                </div>
                <div className="text-sm font-semibold text-gray-900 leading-snug">{t.headline}</div>
                <div className="text-[12px] text-gray-600 leading-snug">{t.detail}</div>
                <div className="text-[12px] font-medium text-brand mt-auto pt-1 leading-snug">
                  → {t.action}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
