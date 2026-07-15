"use client";
import { format, parseISO } from "date-fns";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { useApi } from "@/lib/use-api";
import { IconThumbUp, IconMessageCircle, IconShare3 } from "@tabler/icons-react";

// Facebook content page (sidebar: Facebook → Posts) — the page's recent posts
// with per-post likes/comments/shares, sorted by engagement.

type Post = {
  id: string; message: string; createdTime: string; fullPicture: string | null;
  permalink: string | null; likes: number | null; comments: number | null; shares: number | null;
};
type Resp = {
  page: { name: string };
  posts: { available: boolean; reason?: string; items: Post[] };
  error?: string;
};

function fmt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

export default function FacebookPostsPage() {
  return (
    <HopeDashboardShell active="facebook" title="Facebook posts" subtitle="Recent page posts with per-post engagement.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} />}
    </HopeDashboardShell>
  );
}

function Inner({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ account: accountId, from: range.from, to: range.to, limit: "24" }).toString();
  const { data, isLoading } = useApi<Resp>(`/api/facebook?${qs}`);

  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading posts…</div>;
  if (!data || data.error) return <div className="text-sm text-gray-400 py-16 text-center">Couldn&apos;t load posts.</div>;
  if (!data.posts.available) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
        <div className="text-base font-medium text-gray-700 mb-1">Posts can&apos;t be read for this page</div>
        <p className="text-sm text-gray-400 max-w-lg mx-auto">{data.posts.reason}</p>
      </div>
    );
  }

  const score = (p: Post) => (p.likes ?? 0) + (p.comments ?? 0) * 2 + (p.shares ?? 0) * 3;
  const posts = [...data.posts.items].sort((a, b) => score(b) - score(a));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm font-semibold text-gray-800">{data.page.name} · {posts.length} recent posts · sorted by engagement</div>
        <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>
      </div>

      {posts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">No published posts on this page yet.</div>
      ) : (
        <>
          {/* Highlighted TOP PERFORMERS hero — the 3 best by engagement */}
          <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-5 mb-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base font-semibold text-gray-900">🏆 Top performers</span>
              <span className="text-xs text-gray-400">· by engagement</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {posts.slice(0, 3).map((p) => (
                <a key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="flex gap-4 rounded-xl bg-white border border-gray-100 p-3 hover:border-gray-300 hover:shadow-sm">
                  <div className="w-32 aspect-square rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    {p.fullPicture
                      ? <img src={p.fullPicture} alt="" className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-400 p-2 text-center">{(p.message || "Post").slice(0, 60)}</div>}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">{(() => { try { return format(parseISO(p.createdTime), "d MMM yyyy"); } catch { return ""; } })()}</div>
                    <div className="text-[13px] text-gray-900 leading-snug mt-0.5 line-clamp-2">{p.message || "(no text)"}</div>
                    <div className="grid grid-cols-3 gap-1 mt-auto pt-2 text-center">
                      <div><div className="text-lg font-bold text-gray-900 tabular-nums">{fmt(p.likes)}</div><div className="text-[9px] uppercase text-gray-500">Likes</div></div>
                      <div><div className="text-lg font-bold text-gray-900 tabular-nums">{fmt(p.comments)}</div><div className="text-[9px] uppercase text-gray-500">Comm.</div></div>
                      <div><div className="text-lg font-bold text-gray-900 tabular-nums">{fmt(p.shares)}</div><div className="text-[9px] uppercase text-gray-500">Shares</div></div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-1">All posts · {posts.length}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {posts.map((p, i) => (
            <a key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="block bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-gray-300">
              <div className="relative">
                {p.fullPicture
                  ? <img src={p.fullPicture} alt="" className="w-full aspect-[4/3] object-cover bg-gray-100" loading="lazy" />
                  : <div className="w-full aspect-[4/3] bg-gray-50 flex items-center justify-center text-xs text-gray-400 p-3 text-center">{(p.message || "Post").slice(0, 80)}</div>}
                <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-white/90 rounded-full px-2 py-0.5 text-gray-700">#{i + 1}</span>
              </div>
              <div className="p-3">
                <div className="text-[12px] text-gray-800 leading-snug line-clamp-2 min-h-[32px]">{p.message || "(no text)"}</div>
                <div className="text-[11px] text-gray-500 mt-2 flex gap-3 tabular-nums">
                  <span><IconThumbUp size={12} stroke={1.8} className="inline -mt-0.5 mr-0.5 text-gray-400" />{fmt(p.likes)}</span>
                  <span><IconMessageCircle size={12} stroke={1.8} className="inline -mt-0.5 mr-0.5 text-gray-400" />{fmt(p.comments)}</span>
                  <span><IconShare3 size={12} stroke={1.8} className="inline -mt-0.5 mr-0.5 text-gray-400" />{fmt(p.shares)}</span>
                  <span className="text-gray-400 ml-auto">{(() => { try { return format(parseISO(p.createdTime), "d MMM"); } catch { return ""; } })()}</span>
                </div>
              </div>
            </a>
          ))}
          </div>
        </>
      )}
    </div>
  );
}
