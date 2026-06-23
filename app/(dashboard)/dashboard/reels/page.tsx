"use client";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { DashboardShell } from "@/components/DashboardShell";
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
      {({ accountId }) => <ReelsView accountId={accountId} />}
    </DashboardShell>
  );
}

function ReelsView({ accountId }: { accountId: string }) {
  const [posts, setPosts] = useState<ApiPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPosts(null); setError(null);
    fetch(`/api/posts?accountId=${accountId}&limit=50&insights=true`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setPosts(d.posts ?? [])))
      .catch((e) => setError(String(e)));
  }, [accountId]);

  if (error) return <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">Couldn’t load reels: {error}</div>;
  if (!posts) return <div className="text-sm text-gray-500">Loading reels…</div>;

  const reels = posts.filter((p) => p.type === "REEL");
  if (reels.length === 0) return <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">No reels found in the recent 50 posts for this account.</div>;

  const totalViews = reels.reduce((s, r) => s + (r.views ?? 0), 0);
  const avgWatchSec = reels.length ? Math.round(reels.reduce((s, r) => s + (r.avgWatchMs ?? 0), 0) / reels.length / 1000) : 0;
  const avgShares = reels.length ? Math.round(reels.reduce((s, r) => s + r.shares, 0) / reels.length) : 0;
  const sorted = [...reels].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Reels (recent)" value={reels.length} />
        <MetricCard label="Total views" value={totalViews.toLocaleString()} />
        <MetricCard label="Avg watch time" value={`${avgWatchSec}s`} />
        <MetricCard label="Avg shares / reel" value={avgShares.toLocaleString()} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 text-sm font-medium">Top reels by views</div>
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
                <td className="px-3 py-3 text-right">{(r.views ?? 0).toLocaleString()}</td>
                <td className="px-3 py-3 text-right">{r.avgWatchMs ? `${Math.round(r.avgWatchMs / 1000)}s` : "—"}</td>
                <td className="px-3 py-3 text-right">{r.reach.toLocaleString()}</td>
                <td className="px-3 py-3 text-right">{r.likes.toLocaleString()}</td>
                <td className="px-3 py-3 text-right">{r.shares}</td>
                <td className="px-5 py-3 text-right">{r.saves}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
