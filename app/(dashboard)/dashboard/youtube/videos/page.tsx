"use client";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { DashboardShell } from "@/components/DashboardShell";
import { YT_CHANNEL, YT_CHANNEL_PILLS } from "@/lib/brand-platforms";
import { useProfile } from "@/lib/profile";
import { useApi } from "@/lib/use-api";
import { IconEye, IconThumbUp, IconMessageCircle, IconClock, IconTrophy, IconRefresh, IconPlayerPlayFilled } from "@tabler/icons-react";

// Shorts / Long-form pages, built like the Instagram Reels page: the channel's
// FULL upload library (via /api/youtube/uploads — every video ever posted, with
// lifetime stats), split by real duration, with top performers, a "reusable"
// (proven older) shelf, a sort control, format-shaped cards, and a detail modal.

type Video = {
  id: string; title: string; thumbnail: string; publishedAt: string;
  durationSec: number; isShort: boolean; views: number; likes: number; comments: number;
};
type Resp = { channel: { name: string; handle: string }; source: string; videos: Video[]; error?: string };

const YT = "#FF0000";
const KINDS = [
  { key: "longform", label: "Long-form" },
  { key: "shorts", label: "Shorts" },
] as const;
type Kind = (typeof KINDS)[number]["key"];
const SORTS = [
  { key: "views", label: "Most viewed" },
  { key: "likes", label: "Most liked" },
  { key: "date", label: "Newest" },
] as const;
type Sort = (typeof SORTS)[number]["key"];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
function dur(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function dateLabel(iso: string): string {
  try { return format(parseISO(iso), "d MMM yyyy"); } catch { return iso; }
}
function daysAgo(iso: string): number {
  try { return Math.floor((Date.now() - parseISO(iso).getTime()) / 86_400_000); } catch { return 0; }
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
    <DashboardShell title="YouTube videos" subtitle="Your whole library — every Short and long-form video, with lifetime performance.">
      {({ accountId }) => <Inner accountId={accountId} kind={kind} setKind={setKind} />}
    </DashboardShell>
  );
}

function Inner({ accountId, kind, setKind }: { accountId: string; kind: Kind; setKind: (k: Kind) => void }) {
  const profile = useProfile();
  const [channelPick, setChannelPick] = useState<string | null>(null);
  const channel = profile ? (YT_CHANNEL[profile] ?? "") : (channelPick ?? YT_CHANNEL[accountId] ?? "goocampus");
  const { data, isLoading } = useApi<Resp>(channel ? `/api/youtube/uploads?channel=${channel}` : null);
  const [sort, setSort] = useState<Sort>("views");
  const [selected, setSelected] = useState<Video | null>(null);

  if (profile && !channel) {
    return <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center text-sm text-gray-400">This brand doesn&apos;t have a YouTube channel connected.</div>;
  }

  const channelPills = profile ? null : (
    <div className="bg-white border border-gray-100 rounded-lg p-1.5 inline-flex items-center gap-1">
      {YT_CHANNEL_PILLS.map((c) => (
        <button key={c.key} onClick={() => setChannelPick(c.key)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${channel === c.key ? "bg-red-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
          {c.label}
        </button>
      ))}
    </div>
  );

  const all = data?.videos ?? [];
  const shorts = all.filter((v) => v.isShort);
  const longform = all.filter((v) => v.durationSec > 0 && !v.isShort);
  const pool = kind === "shorts" ? shorts : longform;

  const sorted = [...pool].sort((a, b) => {
    if (sort === "likes") return b.likes - a.likes;
    if (sort === "date") return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    return b.views - a.views;
  });
  const topByViews = [...pool].sort((a, b) => b.views - a.views);
  // "Reusable" = proven older performers (>30 days old, high views) worth reposting.
  const reusable = [...pool]
    .filter((v) => daysAgo(v.publishedAt) > 30)
    .sort((a, b) => b.views - a.views)
    .slice(0, 3);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {channelPills}
          <div className="bg-white border border-gray-100 rounded-lg p-1.5 inline-flex items-center gap-1">
            {KINDS.map((k) => (
              <button key={k.key} onClick={() => setKind(k.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${kind === k.key ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                {k.label} · {k.key === "shorts" ? shorts.length : longform.length}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.source === "live" && <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>}
          <span className="text-[11px] text-gray-400">{data?.channel.name} · {all.length} videos total</span>
        </div>
      </div>

      {isLoading && !data && <div className="text-sm text-gray-400 py-16 text-center">Loading your whole library…</div>}
      {data && data.source !== "live" && <div className="text-sm text-gray-400 py-16 text-center">Couldn&apos;t load videos for this channel.</div>}

      {data && data.source === "live" && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label={kind === "shorts" ? "Shorts" : "Long-form videos"} value={String(pool.length)} sub="in library" accent />
            <Stat label="Total views" value={fmt(pool.reduce((s, v) => s + v.views, 0))} sub="lifetime" />
            <Stat label="Total likes" value={fmt(pool.reduce((s, v) => s + v.likes, 0))} sub="lifetime" />
            <Stat label="Best performer" value={topByViews[0] ? fmt(topByViews[0].views) : "—"} sub="most viewed" />
          </div>

          {/* Reusable / proven shelf */}
          {reusable.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconRefresh size={16} stroke={1.8} className="text-emerald-600" />
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Proven {kind === "shorts" ? "Shorts" : "videos"} — worth reposting</span>
                <span className="text-[10px] text-gray-400">top all-time, over a month old</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {reusable.map((v) => (
                  <button key={v.id} onClick={() => setSelected(v)} className="flex gap-3 rounded-lg border border-gray-100 p-2.5 hover:border-gray-300 text-left">
                    <div className={`${kind === "shorts" ? "w-12 aspect-[9/16]" : "w-24 aspect-video"} rounded-md overflow-hidden bg-gray-100 flex-shrink-0`}>
                      {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-gray-900 leading-snug line-clamp-2">{v.title}</div>
                      <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2 tabular-nums">
                        <span className="inline-flex items-center gap-0.5"><IconEye size={12} className="text-gray-400" />{fmt(v.views)}</span>
                        <span>{dateLabel(v.publishedAt)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grid + sort */}
          <div className="bg-white border border-gray-100 rounded-xl">
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="text-sm font-semibold text-gray-800">All {kind === "shorts" ? "Shorts" : "long-form videos"} · {sorted.length}</div>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="text-xs border border-gray-200 rounded-md px-2 py-1">
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {sorted.length === 0 ? (
              <div className="p-14 text-center text-sm text-gray-400">No {kind === "shorts" ? "Shorts" : "long-form videos"} on this channel yet.</div>
            ) : (
              <div className={`grid gap-4 p-5 ${kind === "shorts" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"}`}>
                {sorted.map((v) => (
                  <VideoCard key={v.id} v={v} isTop={v.id === topByViews[0]?.id} onClick={() => setSelected(v)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {selected && <DetailModal v={selected} channel={channel} channelName={data?.channel.name ?? "YouTube"} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: YT } : {}}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function VideoCard({ v, isTop, onClick }: { v: Video; isTop: boolean; onClick: () => void }) {
  const short = v.isShort;
  return (
    <button type="button" onClick={onClick} className="text-left bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-brand hover:shadow-md transition group">
      <div className={`relative bg-black overflow-hidden ${short ? "aspect-[9/16]" : "aspect-video"}`}>
        {v.thumbnail
          ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200" loading="lazy" />
          : <div className="w-full h-full" />}
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1">
          <IconPlayerPlayFilled size={10} /> {short ? "Short" : dur(v.durationSec)}
        </div>
        {isTop && (
          <div className="absolute top-2 right-2 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: YT }}>
            <IconTrophy size={10} /> Top
          </div>
        )}
        <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
          <IconEye size={11} /> {fmt(v.views)}
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide">{dateLabel(v.publishedAt)}</div>
        <div className="text-xs text-gray-800 leading-snug line-clamp-2 min-h-[2.5rem]">{v.title}</div>
        <div className="grid grid-cols-3 gap-1 pt-2 border-t border-gray-100 text-center">
          <Mini icon={<IconEye size={13} />} value={fmt(v.views)} />
          <Mini icon={<IconThumbUp size={13} />} value={fmt(v.likes)} />
          <Mini icon={<IconMessageCircle size={13} />} value={fmt(v.comments)} />
        </div>
      </div>
    </button>
  );
}

function Mini({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div>
      <div className="text-gray-400 flex justify-center">{icon}</div>
      <div className="text-[11px] font-semibold text-gray-900 tabular-nums leading-tight">{value}</div>
    </div>
  );
}

type Reply = { id: string; author: string; authorImage: string; text: string; likes: number; publishedAt: string };
type Comment = { id: string; author: string; authorImage: string; text: string; likes: number; publishedAt: string; replyCount: number; replies?: Reply[] };

function DetailModal({ v, channel, channelName, onClose }: { v: Video; channel: string; channelName: string; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [cReason, setCReason] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    setComments(null); setCReason(null);
    fetch(`/api/youtube/comments?channel=${channel}&video=${v.id}`)
      .then((r) => r.json())
      .then((d) => { if (dead) return; setComments(d.comments || []); if (!d.available) setCReason(d.reason || "No comments."); })
      .catch(() => { if (!dead) { setComments([]); setCReason("Couldn't load comments."); } });
    return () => { dead = true; };
  }, [v.id, channel]);

  const metrics = [
    { label: "Views", value: fmt(v.views) },
    { label: "Likes", value: fmt(v.likes) },
    { label: "Comments", value: fmt(v.comments) },
    { label: "Length", value: dur(v.durationSec) },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col md:flex-row">
          {/* Plays INSIDE the dashboard — autoplays on open, never leaves the app. */}
          <div className={`bg-black flex-shrink-0 ${v.isShort ? "md:w-72" : "md:w-[520px]"}`}>
            <div className={`relative w-full ${v.isShort ? "aspect-[9/16]" : "aspect-video"}`}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1`}
                title={v.title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
          <div className="flex-1 p-5 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wider text-red-600">
                  {channelName} · {v.isShort ? "Short" : "Long-form"} · {dateLabel(v.publishedAt)}
                </div>
                <div className="text-lg font-medium text-gray-900 mt-1 leading-snug">{v.title}</div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0">×</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {metrics.map((m) => (
                <div key={m.label} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{m.label}</div>
                  <div className="text-xl font-semibold tabular-nums mt-0.5">{m.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[11px] text-gray-400 inline-flex items-center gap-1.5">
              <IconPlayerPlayFilled size={12} className="text-red-500" /> Playing here in the dashboard
            </div>

            {/* Comments — read live from YouTube, shown in the dashboard */}
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <IconMessageCircle size={15} className="text-gray-500" />
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Comments</span>
                <span className="text-[11px] text-gray-400">{fmt(v.comments)} total</span>
              </div>
              {comments === null ? (
                <div className="text-sm text-gray-400 py-4">Loading comments…</div>
              ) : comments.length === 0 ? (
                <div className="text-sm text-gray-400 py-4">{cReason || "No comments yet."}</div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      {c.authorImage
                        ? <img src={c.authorImage} alt="" className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0" loading="lazy" />
                        : <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[12px] font-medium text-gray-800 truncate">{c.author}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{c.publishedAt ? dateLabel(c.publishedAt) : ""}</span>
                        </div>
                        <div className="text-[13px] text-gray-700 whitespace-pre-wrap break-words leading-snug mt-0.5">{c.text}</div>
                        <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-3">
                          <span className="inline-flex items-center gap-1"><IconThumbUp size={11} />{fmt(c.likes)}</span>
                          {c.replyCount > 0 && <span>{c.replyCount} repl{c.replyCount === 1 ? "y" : "ies"}</span>}
                        </div>
                        {/* Nested replies */}
                        {(c.replies?.length ?? 0) > 0 && (
                          <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-100">
                            {c.replies!.map((rp) => (
                              <div key={rp.id} className="flex gap-2">
                                {rp.authorImage
                                  ? <img src={rp.authorImage} alt="" className="w-5 h-5 rounded-full bg-gray-100 flex-shrink-0" loading="lazy" />
                                  : <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-[11px] font-medium text-gray-800 truncate">{rp.author}</span>
                                    <span className="text-[9px] text-gray-400 flex-shrink-0">{rp.publishedAt ? dateLabel(rp.publishedAt) : ""}</span>
                                  </div>
                                  <div className="text-[12px] text-gray-700 whitespace-pre-wrap break-words leading-snug mt-0.5">{rp.text}</div>
                                  {rp.likes > 0 && <div className="text-[10px] text-gray-400 mt-0.5 inline-flex items-center gap-1"><IconThumbUp size={10} />{fmt(rp.likes)}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
