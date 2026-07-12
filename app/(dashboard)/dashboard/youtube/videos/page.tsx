"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { YT_CHANNEL } from "@/components/PlatformOverviews";
import { useApi } from "@/lib/use-api";

// YouTube content split: Long-form vs Shorts (sidebar: YouTube → Long-form / Shorts).
// A video counts as a Short when it's ≤ 3 minutes (YouTube's own rule) — the
// duration comes live from the Data API. Hash-routed like the audience pages:
// /dashboard/youtube/videos#shorts | #longform.

type Video = {
  id: string; title: string; thumbnail: string; views: number; watchHours: number;
  avgViewDurationSec: number; likes: number; comments: number;
  durationSec?: number; isShort?: boolean;
};
type Resp = {
  source: "demo" | "live";
  channel: { name: string; handle: string };
  topVideos: Video[];
  error?: string;
};

const KINDS = [
  { key: "longform", label: "Long-form" },
  { key: "shorts", label: "Shorts" },
] as const;
type Kind = (typeof KINDS)[number]["key"];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
function dur(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export default function YouTubeVideosPage() {
  const [kind, setKindState] = useState<Kind>("longform");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "") as Kind;
      if (KINDS.some((k) => k.key === h)) setKindState(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const setKind = (k: Kind) => { setKindState(k); try { window.location.hash = k; } catch { /* ignore */ } };

  return (
    <DashboardShell title="YouTube videos" subtitle="Your uploads in range, split into long-form and Shorts.">
      {({ accountId, range }) => <Inner accountId={accountId} range={range} kind={kind} setKind={setKind} />}
    </DashboardShell>
  );
}

function Inner({ accountId, range, kind, setKind }: {
  accountId: string; range: { from: string; to: string }; kind: Kind; setKind: (k: Kind) => void;
}) {
  const channel = YT_CHANNEL[accountId] ?? null;
  const qs = new URLSearchParams({ channel: channel ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<Resp>(channel ? `/api/youtube?${qs}` : null);

  if (!channel) {
    return <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">This brand has no YouTube channel connected.</div>;
  }
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading videos…</div>;
  if (!data || data.error) return <div className="text-sm text-gray-400 py-16 text-center">Couldn&apos;t load videos.</div>;

  const all = data.topVideos || [];
  const classified = all.filter((v) => (v.durationSec ?? 0) > 0);
  const longform = classified.filter((v) => !v.isShort);
  const shorts = classified.filter((v) => v.isShort);
  const shown = kind === "shorts" ? shorts : longform;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="bg-white border border-gray-100 rounded-lg p-1.5 inline-flex items-center gap-1">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => setKind(k.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${kind === k.key ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {k.label} · {k.key === "shorts" ? shorts.length : longform.length}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data.source === "live"
            ? <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>
            : <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Demo — durations unavailable</span>}
          <span className="text-[11px] text-gray-400">{data.channel.name} · top {all.length} by views in range</span>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">
          No {kind === "shorts" ? "Shorts" : "long-form videos"} in this date range&apos;s top list.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-4 py-3 font-medium">Video</th>
                <th className="px-3 py-3 font-medium text-right">Length</th>
                <th className="px-3 py-3 font-medium text-right">Views</th>
                <th className="px-3 py-3 font-medium text-right">Watch hrs</th>
                <th className="px-3 py-3 font-medium text-right">Avg view</th>
                <th className="px-3 py-3 font-medium text-right">Likes</th>
                <th className="px-4 py-3 font-medium text-right">Comments</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((v, i) => (
                <tr key={v.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 group">
                      <span className="text-gray-400 text-xs w-5">{i + 1}</span>
                      {v.thumbnail
                        ? <img src={v.thumbnail} alt="" className={`${kind === "shorts" ? "w-10 aspect-[9/16]" : "w-20 aspect-video"} object-cover rounded bg-gray-100 flex-shrink-0`} loading="lazy" />
                        : <div className="w-20 aspect-video rounded bg-gray-100 flex-shrink-0" />}
                      <span className="text-gray-900 leading-snug line-clamp-2 group-hover:text-brand">{v.title}</span>
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{dur(v.durationSec ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(v.views)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{v.watchHours}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{dur(v.avgViewDurationSec)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(v.likes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(v.comments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        Shorts = videos up to 3 minutes (YouTube&apos;s definition), detected from each video&apos;s real length. The list covers the top-viewed videos in the selected date range.
      </p>
    </div>
  );
}
