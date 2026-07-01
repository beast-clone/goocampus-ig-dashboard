"use client";
import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MetricCard } from "@/components/MetricCard";
import { useApi } from "@/lib/use-api";

type ApiPost = {
  id: string;
  caption: string;
  mediaUrl: string;
  permalink: string;
  type: "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL_ALBUM" | "STORY";
  timestamp: string;
  likes: number;
  comments: number;
  reach: number;
  shares: number;
  saves: number;
  totalInteractions: number;
  views?: number;
};

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Image",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Carousel",
  REEL: "Reel",
};

export default function PostsPage() {
  return (
    <DashboardShell title="Posts">
      {({ accountId, range }) => <PostsView accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function PostsView({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sort, setSort] = useState<"reach" | "engagement" | "date">("date");
  // Progressive insights loading: track which post IDs have had their reach/eng fetched yet
  const [insightsLoaded, setInsightsLoaded] = useState<Set<string>>(new Set());
  const [insightsProgress, setInsightsProgress] = useState<{ done: number; total: number } | null>(null);

  // Phase 1: cached list fetch via SWR (instant on repeat visits)
  const qs = new URLSearchParams({ accountId, from: range.from, to: range.to, insights: "false" }).toString();
  const { data: apiData, error, isLoading, refresh } = useApi<{ posts?: ApiPost[] }>(`/api/posts?${qs}`);
  const loading = isLoading;
  const fetchData = () => refresh();

  // Local mirror of the list so phase-2 progressive updates can mutate individual posts
  // without invalidating SWR's cache.
  const [posts, setPosts] = useState<ApiPost[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const fetchStartRef = useRef<number>(0);
  useEffect(() => { if (isLoading) fetchStartRef.current = Date.now(); }, [isLoading]);
  // When a new list arrives, reset progressive state and kick off phase 2
  useEffect(() => {
    if (!apiData) return;
    const list: ApiPost[] = apiData.posts ?? [];
    setPosts(list);
    setInsightsLoaded(new Set());
    setInsightsProgress(null);
    setFetchedAt(Date.now());
    setLatencyMs(Date.now() - fetchStartRef.current);
    if (list.length > 0) loadInsightsProgressively(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiData]);

  async function loadInsightsProgressively(list: ApiPost[]) {
    const BATCH = 10;
    const ordered = [...list].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setInsightsProgress({ done: 0, total: ordered.length });
    for (let off = 0; off < ordered.length; off += BATCH) {
      const slice = ordered.slice(off, off + BATCH);
      const items = slice.map((p) => ({
        id: p.id,
        mediaType: p.type === "REEL" ? "VIDEO" : p.type,
        mediaProductType: p.type === "REEL" ? "REELS" : undefined,
      }));
      try {
        const r = await fetch("/api/posts/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, items }),
        });
        if (!r.ok) continue;
        const d = await r.json();
        const map = new Map<string, { reach: number; shares: number; saves: number; totalInteractions: number; views?: number }>();
        for (const ins of (d.insights ?? [])) map.set(ins.id, ins);
        // Merge into existing posts state without re-fetching anything
        setPosts((prev) => prev ? prev.map((p) => {
          const fresh = map.get(p.id);
          return fresh ? { ...p, reach: fresh.reach, shares: fresh.shares, saves: fresh.saves, totalInteractions: fresh.totalInteractions, views: fresh.views } : p;
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

  if (error) return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />
      <ErrorBox msg={error.message} />
    </>
  );
  if (!posts) return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />
      <div className="text-sm text-gray-500">Loading posts from Instagram…</div>
    </>
  );

  const filtered = typeFilter === "ALL" ? posts : posts.filter((p) => p.type === typeFilter);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "reach") return b.reach - a.reach;
    if (sort === "engagement") return b.totalInteractions - a.totalInteractions;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const totalPosts = posts.length;
  const avgReach = totalPosts ? Math.round(posts.reduce((s, p) => s + p.reach, 0) / totalPosts) : 0;
  const avgEng = totalPosts ? Math.round(posts.reduce((s, p) => s + p.totalInteractions, 0) / totalPosts) : 0;
  const top = posts.reduce((best, p) => (p.reach > (best?.reach ?? 0) ? p : best), posts[0]);

  return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Posts (recent)" value={totalPosts} />
        <MetricCard label="Avg Reach / post" value={avgReach.toLocaleString()} />
        <MetricCard label="Avg Engagement" value={avgEng.toLocaleString()} />
        <MetricCard label="Top performer" value={top?.caption.slice(0, 18) + "…"} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-medium">
            All posts <span className="text-gray-400 font-normal">({range.from} → {range.to}, {totalPosts} loaded</span>
            {insightsProgress && (
              <span className="ml-2 text-xs text-brand">· loading engagement {insightsProgress.done}/{insightsProgress.total}</span>
            )}
            <span className="text-gray-400 font-normal">)</span>
          </div>
          <div className="flex gap-2">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1">
              <option value="ALL">All types</option>
              <option value="REEL">Reels</option>
              <option value="CAROUSEL_ALBUM">Carousels</option>
              <option value="VIDEO">Videos</option>
              <option value="IMAGE">Images</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as "reach" | "engagement" | "date")} className="text-xs border border-gray-200 rounded-md px-2 py-1">
              <option value="date">Sort: Date</option>
              <option value="reach">Reach</option>
              <option value="engagement">Engagement</option>
            </select>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase">
              <th className="px-5 py-3">Post</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3 text-right">Reach</th>
              <th className="px-3 py-3 text-right">Likes</th>
              <th className="px-3 py-3 text-right">Comments</th>
              <th className="px-3 py-3 text-right">Shares</th>
              <th className="px-3 py-3 text-right">Saves</th>
              <th className="px-5 py-3 text-right">Engagement</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">No posts match this filter.</td></tr>
            )}
            {sorted.map((p) => (
              <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3">
                  <a href={p.permalink} target="_blank" className="flex items-center gap-3 group">
                    {p.mediaUrl ? (
                      <img src={p.mediaUrl} alt="" className="w-10 h-10 object-cover rounded-lg" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xs">{TYPE_LABEL[p.type]?.[0]}</div>
                    )}
                    <div className="truncate max-w-xs group-hover:text-brand">{p.caption?.slice(0, 60) || "(no caption)"}{p.caption?.length > 60 ? "…" : ""}</div>
                  </a>
                </td>
                <td className="px-3 py-3 text-xs text-gray-600">{TYPE_LABEL[p.type] ?? p.type}</td>
                <td className="px-3 py-3 text-xs text-gray-600">{format(parseISO(p.timestamp), "MMM d")}</td>
                <td className="px-3 py-3 text-right">{insightsLoaded.has(p.id) ? p.reach.toLocaleString() : <span className="text-gray-300">···</span>}</td>
                <td className="px-3 py-3 text-right">{p.likes.toLocaleString()}</td>
                <td className="px-3 py-3 text-right">{p.comments}</td>
                <td className="px-3 py-3 text-right">{insightsLoaded.has(p.id) ? p.shares : <span className="text-gray-300">···</span>}</td>
                <td className="px-3 py-3 text-right">{insightsLoaded.has(p.id) ? p.saves : <span className="text-gray-300">···</span>}</td>
                <td className="px-5 py-3 text-right font-medium">{insightsLoaded.has(p.id) ? p.totalInteractions.toLocaleString() : <span className="text-gray-300">···</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
      Couldn’t load posts: {msg}
    </div>
  );
}
