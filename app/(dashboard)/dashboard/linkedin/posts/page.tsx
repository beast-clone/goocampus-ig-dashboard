"use client";
import { DashboardShell } from "@/components/DashboardShell";
import { LI_PAGE } from "@/components/PlatformOverviews";
import { useApi } from "@/lib/use-api";

// LinkedIn content page (sidebar: LinkedIn → Posts) — every post in range with
// its full performance row, sorted by impressions. Live for GooCampus World.

type Post = {
  id: string; date: string; text: string; type: string;
  impressions: number; clicks: number; reactions: number; comments: number; shares: number;
  engagementRate: number; ctr: number; thumbnailUrl?: string | null; permalink?: string | null;
};
type Resp = {
  source: "demo" | "live";
  page: { name: string };
  posts: Post[];
  error?: string;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return (n ?? 0).toLocaleString("en-IN");
}

export default function LinkedInPostsPage() {
  return (
    <DashboardShell title="LinkedIn posts" subtitle="Every post in range with its full performance.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function Inner({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const pageKey = LI_PAGE[accountId] ?? null;
  const qs = new URLSearchParams({ page: pageKey ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<Resp>(pageKey ? `/api/linkedin?${qs}` : null);

  if (!pageKey) {
    return <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">This brand has no LinkedIn page connected.</div>;
  }
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading posts…</div>;
  if (!data || data.error) return <div className="text-sm text-gray-400 py-16 text-center">Couldn&apos;t load posts.</div>;

  const posts = [...(data.posts || [])].sort((a, b) => b.impressions - a.impressions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm font-semibold text-gray-800">{data.page.name} · {posts.length} posts in range</div>
        {data.source === "live"
          ? <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>
          : <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Demo</span>}
      </div>

      {posts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">No posts in this date range.</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-4 py-3 font-medium">Post</th>
                <th className="px-3 py-3 font-medium text-right">Impressions</th>
                <th className="px-3 py-3 font-medium text-right">Clicks</th>
                <th className="px-3 py-3 font-medium text-right">Reactions</th>
                <th className="px-3 py-3 font-medium text-right">Comments</th>
                <th className="px-3 py-3 font-medium text-right">Shares</th>
                <th className="px-3 py-3 font-medium text-right">Eng. rate</th>
                <th className="px-4 py-3 font-medium text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p, i) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 max-w-[420px]">
                    <a href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 group">
                      <span className="text-gray-400 text-xs w-5">{i + 1}</span>
                      {p.thumbnailUrl
                        ? <img src={p.thumbnailUrl} alt="" className="w-12 h-12 object-cover rounded bg-gray-100 flex-shrink-0" loading="lazy" />
                        : <div className="w-12 h-12 rounded bg-blue-50 text-blue-800 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">{(p.type || "POST").slice(0, 4)}</div>}
                      <span className="min-w-0">
                        <span className="block text-gray-900 leading-snug line-clamp-2 group-hover:text-brand">{p.text || "(no text)"}</span>
                        <span className="block text-[11px] text-gray-400 mt-0.5">{new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {p.type}</span>
                      </span>
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(p.impressions)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.clicks)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.reactions)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.comments)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.shares)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{(p.engagementRate ?? 0).toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{(p.ctr ?? 0).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
