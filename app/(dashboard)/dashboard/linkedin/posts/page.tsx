"use client";
import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LI_PAGE } from "@/components/PlatformOverviews";
import { useApi } from "@/lib/use-api";

// LinkedIn content page (sidebar: LinkedIn → Posts) — Instagram-style card grid.
// Every post gets a visual: its real thumbnail when LinkedIn provides one, else
// a designed text-creative placeholder (most LinkedIn posts are text-only).
// Clicking a card opens the detail view: caption on top, creative, and the
// complete metrics underneath.

type Post = {
  id: string; date: string; text: string; type: string;
  impressions: number; uniqueImpressions?: number; clicks: number; reactions: number;
  comments: number; shares: number; engagementRate: number; ctr: number;
  thumbnailUrl?: string | null; permalink?: string | null; mediaTitle?: string | null;
};
type Resp = {
  source: "demo" | "live";
  page: { name: string };
  posts: Post[];
  error?: string;
};

const LI_BLUE = "#0A66C2";

function fmt(n: number | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("en-IN");
}
function dateLabel(iso: string): string {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; }
}

export default function LinkedInPostsPage() {
  return (
    <DashboardShell title="LinkedIn posts" subtitle="Every post in range — click one for the full picture.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function Inner({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const pageKey = LI_PAGE[accountId] ?? null;
  const qs = new URLSearchParams({ page: pageKey ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<Resp>(pageKey ? `/api/linkedin?${qs}` : null);
  const [selected, setSelected] = useState<Post | null>(null);

  if (!pageKey) {
    return <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">This brand has no LinkedIn page connected.</div>;
  }
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading posts…</div>;
  if (!data || data.error) return <div className="text-sm text-gray-400 py-16 text-center">Couldn&apos;t load posts.</div>;

  const posts = [...(data.posts || [])].sort((a, b) => b.impressions - a.impressions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm font-semibold text-gray-800">{data.page.name} · {posts.length} posts in range · by impressions</div>
        {data.source === "live"
          ? <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>
          : <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Demo</span>}
      </div>

      {posts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">No posts in this date range.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {posts.map((p, i) => <Card key={p.id} post={p} rank={i + 1} onClick={() => setSelected(p)} />)}
        </div>
      )}

      {selected && <DetailModal post={selected} pageName={data.page.name} onClose={() => setSelected(null)} />}
    </div>
  );
}

// The visual: real thumbnail, or a designed text creative for text-only posts.
function Creative({ post, big }: { post: Post; big?: boolean }) {
  if (post.thumbnailUrl) {
    return <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />;
  }
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-4 text-left"
      style={{ background: `linear-gradient(135deg, ${LI_BLUE} 0%, #084D92 60%, #063D75 100%)` }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{post.type || "POST"}</span>
      <p className={`text-white font-medium leading-snug ${big ? "text-lg line-clamp-6" : "text-[13px] line-clamp-4"}`}>
        {post.text || "(no text)"}
      </p>
      <span className="text-[10px] text-white/60">in</span>
    </div>
  );
}

function Card({ post, rank, onClick }: { post: Post; rank: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-gray-300 hover:shadow-sm text-left transition"
    >
      <div className="relative bg-gray-100 aspect-square overflow-hidden">
        <Creative post={post} />
        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-white/90 rounded-full px-2 py-0.5 text-gray-700">#{rank}</span>
      </div>
      <div className="p-3">
        <div className="text-xs text-gray-800 leading-snug line-clamp-2 min-h-[2.5rem]">{post.text || "(no text)"}</div>
        <div className="text-[10px] text-gray-400 mt-1">{dateLabel(post.date)} · {post.type}</div>
        <div className="text-[11px] text-gray-600 mt-1.5 flex gap-3 tabular-nums">
          <span>👁 {fmt(post.impressions)}</span>
          <span>👍 {fmt(post.reactions)}</span>
          <span>💬 {fmt(post.comments)}</span>
          <span className="ml-auto">{(post.engagementRate ?? 0).toFixed(1)}%</span>
        </div>
      </div>
    </button>
  );
}

function DetailModal({ post, pageName, onClose }: { post: Post; pageName: string; onClose: () => void }) {
  const metrics = [
    { label: "Impressions", value: fmt(post.impressions) },
    { label: "Unique impressions", value: fmt(post.uniqueImpressions) },
    { label: "Clicks", value: fmt(post.clicks) },
    { label: "Reactions", value: fmt(post.reactions) },
    { label: "Comments", value: fmt(post.comments) },
    { label: "Shares", value: fmt(post.shares) },
    { label: "Engagement rate", value: `${(post.engagementRate ?? 0).toFixed(1)}%` },
    { label: "CTR", value: `${(post.ctr ?? 0).toFixed(1)}%` },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Caption / description on top */}
        <div className="p-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: LI_BLUE }}>
                {pageName} · {dateLabel(post.date)} · {post.type}
              </div>
              <p className="text-[15px] text-gray-900 leading-relaxed whitespace-pre-wrap mt-2">{post.text || "(no text)"}</p>
              {post.mediaTitle && <p className="text-xs text-gray-500 mt-1.5">📎 {post.mediaTitle}</p>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0">×</button>
          </div>
        </div>

        {/* The creative */}
        <div className="aspect-video bg-gray-100">
          <Creative post={post} big />
        </div>

        {/* Complete metrics at the bottom */}
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{m.label}</div>
                <div className="text-xl font-semibold tabular-nums mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
              style={{ background: LI_BLUE }}
            >
              Open on LinkedIn ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
