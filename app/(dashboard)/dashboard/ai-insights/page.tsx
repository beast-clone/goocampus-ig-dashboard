"use client";
import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Insight = {
  generatedAt: string;
  latencyMs: number;
  range: { from: string; to: string };
  account: string;
  stats: {
    postsAnalyzed: number;
    byType: Record<string, { count: number; totalReach: number; avgReach: number; avgEng: number; engRatePct: number }>;
    topPosts: { id: string; type: string; caption: string; reach: number; likes: number; comments: number; shares: number; saves: number; permalink: string; timestamp: string }[];
    topHashtags: { tag: string; posts: number; avgReach: number; erPct: number }[];
    bestWeekday: { day: string; avgReach: number } | null;
    bestHour: { hour: number; avgReach: number } | null;
  };
  ai: {
    headline: string;
    winners: string[];
    patterns: string[];
    captionStyle: string[];
    recommendations: string[];
    nextWeekPlan: { day: string; time: string; format: string; hook: string }[];
  };
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AIInsightsPage() {
  return (
    <DashboardShell title="AI Insights" subtitle="Auto-generated weekly analysis: what worked, what to do next.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function Inner({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const [data, setData] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, range }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); setLoading(false); return; }
      setData(d as Insight);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!data && !loading) {
    return (
      <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-3xl p-10 text-white shadow-xl text-center">
        <div className="text-5xl mb-3">✨</div>
        <h2 className="text-2xl font-semibold">Generate this week&apos;s insights</h2>
        <p className="text-sm text-violet-100 mt-2 max-w-md mx-auto">
          We&apos;ll analyze every post for <b>{accountId}</b> from <b>{range.from}</b> to <b>{range.to}</b>: post types, hashtags,
          caption patterns, best time slots — and give you a 5-day plan for next week.
        </p>
        <button
          onClick={generate}
          className="mt-6 bg-white text-violet-700 font-semibold rounded-full px-6 py-3 hover:scale-105 transition shadow-lg"
        >
          Generate insights →
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="bg-white rounded-3xl p-16 text-center border border-gray-100">
        <div className="inline-flex gap-1.5 mb-4">
          <span className="w-3 h-3 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-3 h-3 rounded-full bg-fuchsia-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-3 h-3 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <div className="text-gray-700 font-medium">Pulling posts and analyzing patterns…</div>
        <div className="text-xs text-gray-400 mt-1">Usually 20-30 seconds — fetching insights for every post in parallel.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
        {error}
        <button onClick={generate} className="ml-3 underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const sortedTypes = Object.entries(data.stats.byType).sort((a, b) => b[1].avgReach - a[1].avgReach);
  const winnerType = sortedTypes[0];

  return (
    <>
      {/* Headline + regen */}
      <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-3xl p-7 text-white shadow-xl mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-violet-100">Weekly headline</div>
            <h2 className="text-xl font-semibold mt-1 leading-snug">{data.ai.headline || "—"}</h2>
            <div className="text-[11px] text-violet-100 mt-3">
              Analyzed <b>{data.stats.postsAnalyzed}</b> posts · {data.range.from} → {data.range.to} ·
              generated {new Date(data.generatedAt).toLocaleString()} · {(data.latencyMs / 1000).toFixed(1)}s
            </div>
          </div>
          <button
            onClick={generate}
            className="bg-white/20 hover:bg-white/30 backdrop-blur text-white text-xs font-medium rounded-full px-4 py-2 transition"
          >
            ↻ Regenerate
          </button>
        </div>
      </div>

      {/* Post-type winner banner */}
      {winnerType && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 col-span-1 md:col-span-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">🏆 Winning format</div>
            <div className="text-2xl font-semibold mt-1 capitalize">{winnerType[0].toLowerCase()}</div>
            <div className="text-xs text-gray-500 mt-2">
              Avg reach <b className="text-gray-700">{fmt(winnerType[1].avgReach)}</b> · ER <b className="text-gray-700">{winnerType[1].engRatePct.toFixed(2)}%</b> · across {winnerType[1].count} posts
            </div>
          </div>
          <Stat label="Best day" value={data.stats.bestWeekday?.day || "—"} sub={data.stats.bestWeekday ? `${fmt(data.stats.bestWeekday.avgReach)} avg reach` : ""} />
          <Stat label="Best hour" value={data.stats.bestHour ? `${String(data.stats.bestHour.hour).padStart(2, "0")}:00` : "—"} sub={data.stats.bestHour ? `${fmt(data.stats.bestHour.avgReach)} avg reach` : ""} />
        </div>
      )}

      {/* By-type breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="text-sm font-medium mb-3">Format performance</div>
        <div className="space-y-2">
          {sortedTypes.map(([type, s]) => {
            const pct = winnerType ? (s.avgReach / winnerType[1].avgReach) * 100 : 0;
            return (
              <div key={type} className="flex items-center gap-3 text-sm">
                <div className="w-20 text-gray-600 capitalize">{type.toLowerCase()}</div>
                <div className="text-xs text-gray-500 w-16">{s.count} posts</div>
                <div className="flex-1 h-6 bg-gray-100 rounded relative overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded transition-all" style={{ width: `${Math.max(pct, 3)}%` }} />
                  <div className="absolute inset-0 flex items-center px-3 text-xs font-medium text-gray-800">
                    Avg reach {fmt(s.avgReach)} · ER {s.engRatePct.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Section title="What's working" items={data.ai.winners} tint="emerald" icon="📈" />
        <Section title="Content patterns" items={data.ai.patterns} tint="violet" icon="🔍" />
        <Section title="Caption style" items={data.ai.captionStyle} tint="amber" icon="✏️" />
        <Section title="Do this next week" items={data.ai.recommendations} tint="rose" icon="🎯" numbered />
      </div>

      {/* Next week plan */}
      {data.ai.nextWeekPlan && data.ai.nextWeekPlan.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="text-sm font-medium mb-4">Suggested 5-day plan</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {data.ai.nextWeekPlan.slice(0, 5).map((d, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-3 hover:border-violet-300 transition">
                <div className="flex items-baseline justify-between">
                  <div className="text-lg font-semibold">{d.day}</div>
                  <div className="text-[11px] text-gray-500 tabular-nums">{d.time}</div>
                </div>
                <div className="text-[10px] uppercase text-violet-600 font-medium mt-2">{d.format}</div>
                <div className="text-xs text-gray-700 mt-1 leading-snug">{d.hook}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top hashtags + top posts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="text-sm font-medium mb-3">Top hashtags (by ER)</div>
          <div className="space-y-1.5">
            {data.stats.topHashtags.slice(0, 8).map((h) => (
              <div key={h.tag} className="flex justify-between items-center text-xs py-1.5 border-b border-gray-50 last:border-0">
                <span className="font-mono text-violet-700">{h.tag}</span>
                <span className="text-gray-500 tabular-nums">{h.posts}× · {fmt(h.avgReach)} avg · {h.erPct.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="text-sm font-medium mb-3">Top posts by reach</div>
          <div className="space-y-2">
            {data.stats.topPosts.map((p) => (
              <a key={p.id} href={p.permalink} target="_blank" rel="noopener noreferrer" className="block text-xs hover:bg-gray-50 rounded-lg p-2 -mx-2 transition">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-medium text-violet-600">{p.type}</span>
                  <span className="text-gray-500 tabular-nums">{fmt(p.reach)} reach</span>
                </div>
                <div className="text-gray-700 line-clamp-2 mt-1">{p.caption || "(no caption)"}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Section({ title, items, tint, icon, numbered }: { title: string; items: string[]; tint: "emerald" | "violet" | "amber" | "rose"; icon: string; numbered?: boolean }) {
  const tints = {
    emerald: "border-emerald-100 bg-emerald-50/30",
    violet: "border-violet-100 bg-violet-50/30",
    amber: "border-amber-100 bg-amber-50/30",
    rose: "border-rose-100 bg-rose-50/30",
  } as const;
  return (
    <div className={`rounded-2xl border ${tints[tint]} p-5`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <ul className="space-y-2">
        {items.length === 0 && <li className="text-xs text-gray-400 italic">No insights generated.</li>}
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 leading-snug flex gap-2.5">
            <span className={`flex-shrink-0 ${numbered ? "font-semibold text-rose-600" : "text-gray-400"}`}>
              {numbered ? `${i + 1}.` : "·"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
