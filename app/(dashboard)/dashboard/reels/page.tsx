"use client";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/use-api";
import { format, parseISO } from "date-fns";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MetricCard } from "@/components/MetricCard";

type ApiPost = {
  id: string;
  caption: string;
  mediaUrl: string;
  permalink: string;
  type: "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL_ALBUM";
  timestamp: string;
  likes: number;
  comments: number;
  reach: number;
  shares: number;
  saves: number;
  totalInteractions: number;
  views?: number;
  avgWatchMs?: number;
};

export default function ReelsPage() {
  return (
    <DashboardShell title="Reels">
      {({ accountId, range }) => <ReelsView accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function ReelsView({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const [insightsLoaded, setInsightsLoaded] = useState<Set<string>>(new Set());
  const [insightsProgress, setInsightsProgress] = useState<{ done: number; total: number } | null>(null);

  // Phase 1: cached post-list fetch via SWR
  const qs = new URLSearchParams({ accountId, from: range.from, to: range.to, insights: "false" }).toString();
  const { data: apiData, error, isLoading, refresh } = useApi<{ posts?: ApiPost[] }>(`/api/posts?${qs}`);
  const loading = isLoading;
  const fetchData = () => refresh();

  const [posts, setPosts] = useState<ApiPost[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const fetchStartRef = useRef<number>(0);
  useEffect(() => { if (isLoading) fetchStartRef.current = Date.now(); }, [isLoading]);
  useEffect(() => {
    if (!apiData) return;
    const list: ApiPost[] = apiData.posts ?? [];
    setPosts(list);
    setInsightsLoaded(new Set());
    setInsightsProgress(null);
    setFetchedAt(Date.now());
    setLatencyMs(Date.now() - fetchStartRef.current);
    const reels = list.filter((p) => p.type === "REEL");
    if (reels.length > 0) loadInsightsProgressively(reels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiData]);

  async function loadInsightsProgressively(list: ApiPost[]) {
    const BATCH = 10;
    const ordered = [...list].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setInsightsProgress({ done: 0, total: ordered.length });
    for (let off = 0; off < ordered.length; off += BATCH) {
      const slice = ordered.slice(off, off + BATCH);
      const items = slice.map((p) => ({ id: p.id, mediaType: "VIDEO", mediaProductType: "REELS" }));
      try {
        const r = await fetch("/api/posts/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, items }),
        });
        if (!r.ok) continue;
        const d = await r.json();
        const map = new Map<string, { reach: number; shares: number; saves: number; totalInteractions: number; views?: number; avgWatchMs?: number }>();
        for (const ins of (d.insights ?? [])) map.set(ins.id, ins);
        setPosts((prev) => prev ? prev.map((p) => {
          const fresh = map.get(p.id);
          return fresh ? { ...p, reach: fresh.reach, shares: fresh.shares, saves: fresh.saves, totalInteractions: fresh.totalInteractions, views: fresh.views, avgWatchMs: fresh.avgWatchMs } : p;
        }) : prev);
        setInsightsLoaded((prev) => {
          const next = new Set(prev);
          for (const id of map.keys()) next.add(id);
          return next;
        });
        setInsightsProgress({ done: Math.min(off + BATCH, ordered.length), total: ordered.length });
      } catch { /* skip this batch, keep going */ }
    }
    setInsightsProgress(null);
  }

  const live = <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />;

  if (error) return <>{live}<div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">Couldn&apos;t load reels: {error.message}</div></>;
  if (!posts) return <>{live}<div className="text-sm text-gray-500">Loading reels…</div></>;

  const reels = posts.filter((p) => p.type === "REEL");
  if (reels.length === 0) return <>{live}<div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">No reels found in the recent 50 posts for this account.</div></>;

  const totalViews = reels.reduce((s, r) => s + (r.views ?? 0), 0);
  const avgWatchSec = reels.length ? Math.round(reels.reduce((s, r) => s + (r.avgWatchMs ?? 0), 0) / reels.length / 1000) : 0;
  const avgShares = reels.length ? Math.round(reels.reduce((s, r) => s + r.shares, 0) / reels.length) : 0;
  const sorted = [...reels].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));

  return (
    <>
      {live}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Reels (recent)" value={reels.length} />
        <MetricCard label="Total views" value={totalViews.toLocaleString()} />
        <MetricCard label="Avg watch time" value={`${avgWatchSec}s`} />
        <MetricCard label="Avg shares / reel" value={avgShares.toLocaleString()} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 text-sm font-medium flex items-center justify-between">
          <span>Top reels by views</span>
          {insightsProgress && (
            <span className="text-xs text-brand font-normal">loading {insightsProgress.done}/{insightsProgress.total}</span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase">
              <th className="px-5 py-3">Reel</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3 text-right">Views</th>
              <th className="px-3 py-3 text-right">Avg watch</th>
              <th className="px-3 py-3 text-right">Reach</th>
              <th className="px-3 py-3 text-right">Likes</th>
              <th className="px-3 py-3 text-right">Shares</th>
              <th className="px-5 py-3 text-right">Saves</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3">
                  <a href={r.permalink} target="_blank" className="flex items-center gap-3 group">
                    {r.mediaUrl ? <img src={r.mediaUrl} alt="" className="w-10 h-14 object-cover rounded-lg" /> : <div className="w-10 h-14 rounded-lg bg-gray-100 flex items-center justify-center">🎬</div>}
                    <div className="truncate max-w-xs group-hover:text-brand">{r.caption?.slice(0, 60) || "(no caption)"}{r.caption?.length > 60 ? "…" : ""}</div>
                  </a>
                </td>
                <td className="px-3 py-3 text-xs text-gray-600">{format(parseISO(r.timestamp), "MMM d")}</td>
                <td className="px-3 py-3 text-right">{insightsLoaded.has(r.id) ? (r.views ?? 0).toLocaleString() : <span className="text-gray-300">···</span>}</td>
                <td className="px-3 py-3 text-right">{insightsLoaded.has(r.id) ? (r.avgWatchMs ? `${Math.round(r.avgWatchMs / 1000)}s` : "—") : <span className="text-gray-300">···</span>}</td>
                <td className="px-3 py-3 text-right">{insightsLoaded.has(r.id) ? r.reach.toLocaleString() : <span className="text-gray-300">···</span>}</td>
                <td className="px-3 py-3 text-right">{r.likes.toLocaleString()}</td>
                <td className="px-3 py-3 text-right">{insightsLoaded.has(r.id) ? r.shares : <span className="text-gray-300">···</span>}</td>
                <td className="px-5 py-3 text-right">{insightsLoaded.has(r.id) ? r.saves : <span className="text-gray-300">···</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
