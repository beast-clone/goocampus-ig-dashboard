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
      {({ accountId }) => <PostsView accountId={accountId} />}
    </DashboardShell>
  );
}

function PostsView({ accountId }: { accountId: string }) {
  const [posts, setPosts] = useState<ApiPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sort, setSort] = useState<"reach" | "engagement" | "date">("date");

  useEffect(() => {
    setPosts(null);
    setError(null);
    fetch(`/api/posts?accountId=${accountId}&limit=25&insights=true`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setPosts(d.posts ?? [])))
      .catch((e) => setError(String(e)));
  }, [accountId]);

  if (error) return <ErrorBox msg={error} />;
  if (!posts) return <div className="text-sm text-gray-500">Loading posts from Instagram…</div>;

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Posts (recent)" value={totalPosts} />
        <MetricCard label="Avg Reach / post" value={avgReach.toLocaleString()} />
        <MetricCard label="Avg Engagement" value={avgEng.toLocaleString()} />
        <MetricCard label="Top performer" value={top?.caption.slice(0, 18) + "…"} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-medium">All posts</div>
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
                <td className="px-3 py-3 text-right">{p.reach.toLocaleString()}</td>
                <td className="px-3 py-3 text-right">{p.likes.toLocaleString()}</td>
                <td className="px-3 py-3 text-right">{p.comments}</td>
                <td className="px-3 py-3 text-right">{p.shares}</td>
                <td className="px-3 py-3 text-right">{p.saves}</td>
                <td className="px-5 py-3 text-right font-medium">{p.totalInteractions.toLocaleString()}</td>
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
