"use client";
import { useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { HopeSelect } from "@/app/(dashboard)/dashboard/hope-preview/HopeSelect";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useApi } from "@/lib/use-api";
import { fmtDateShort } from "@/lib/date";

type CompetitorMedia = {
  id: string;
  caption?: string;
  media_type: string;
  thumbnail_url?: string;
  media_url?: string;
  permalink?: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  children?: { data: { id: string; media_type: string; media_url?: string; thumbnail_url?: string }[] };
};
type Competitor = {
  username: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  followers_count: number;
  follows_count?: number;
  media_count: number;
  recent: CompetitorMedia[];
  avgLikesRecent: number;
  avgCommentsRecent: number;
  engagementRatePct: number;
  postsLast30d: number;
};
type ErrorRow = { error: string; username: string };
type BenchmarkData = {
  niche: string;
  niches: string[];
  queriedAt: string;
  latencyMs: number;
  sourceAccount: { id: string; handle: string };
  competitors: (Competitor | ErrorRow)[];
};

function isError(c: Competitor | ErrorRow): c is ErrorRow {
  return (c as ErrorRow).error !== undefined;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// A tracked competitor carries a manual category + a metrics period (days; 0 = all recent).
type Tracked = { handle: string; category: string; period: number };
const PERIODS: { value: number; label: string }[] = [
  { value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }, { value: 0, label: "All recent" },
];
const periodLabel = (d: number) => PERIODS.find((p) => p.value === d)?.label ?? `${d}d`;

// Recompute a competitor's headline metrics over the last `days` (0 = all recent). Note:
// business_discovery only returns ~25 recent posts, so short windows use whatever falls in them.
function periodMetrics(c: Competitor, days: number) {
  if (!days || !c.recent?.length) return { avgLikes: c.avgLikesRecent, avgComments: c.avgCommentsRecent, er: c.engagementRatePct, posts: c.postsLast30d };
  const cutoff = Date.now() - days * 86_400_000;
  const inP = c.recent.filter((m) => new Date(m.timestamp).getTime() >= cutoff);
  const n = inP.length;
  const avgLikes = n ? Math.round(inP.reduce((s, m) => s + m.like_count, 0) / n) : 0;
  const avgComments = n ? Math.round(inP.reduce((s, m) => s + m.comments_count, 0) / n) : 0;
  const er = c.followers_count > 0 && n > 0 ? ((avgLikes + avgComments) / c.followers_count) * 100 : 0;
  return { avgLikes, avgComments, er, posts: n };
}

export default function BenchmarkPage() {
  return (
    <HopeDashboardShell active="benchmark" title="Competitors" subtitle="Track competitor Instagram accounts — followers, posting cadence, engagement, and their top-performing posts." hideAccountPicker hideRange>
      {({ accountId, range }) => <BenchmarkInner accountId={accountId} range={range} />}
    </HopeDashboardShell>
  );
}

function BenchmarkInner({ accountId }: { accountId: string; range: { from: string; to: string } }) {
  const [niche, setNiche] = useState<string>("");
  const [customHandles, setCustomHandles] = useState("");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [detail, setDetail] = useState<Competitor | null>(null);   // in-dashboard competitor drill-down
  // Persisted "tracked" competitors — {handle, category, period}, saved per account in
  // localStorage so they stick across reloads (per-device). Old string[] entries migrate.
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const [trackCat, setTrackCat] = useState("");
  const [trackPeriod, setTrackPeriod] = useState(30);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`bm-tracked-${accountId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setTracked(Array.isArray(parsed) ? parsed.map((x: unknown) => typeof x === "string" ? { handle: x, category: "Uncategorized", period: 30 } : x as Tracked) : []);
    } catch { /* private mode */ }
  }, [accountId]);
  const saveTracked = (next: Tracked[]) => { setTracked(next); try { localStorage.setItem(`bm-tracked-${accountId}`, JSON.stringify(next)); } catch { /* private mode */ } };
  const removeTracked = (handle: string) => saveTracked(tracked.filter((t) => t.handle.toLowerCase() !== handle.toLowerCase()));
  const trackedOf = (handle: string) => tracked.find((t) => t.handle.toLowerCase() === handle.toLowerCase());

  // The saved "Tracked" list (niche = "__tracked__") drives its own fetch; otherwise use the
  // niche or a one-off custom lookup. Cache key includes all of these so switching is instant.
  const qs = new URLSearchParams({ accountId });
  if (niche === "__tracked__") {
    qs.set("handles", tracked.map((t) => t.handle).join(","));
  } else {
    if (niche) qs.set("niche", niche);
    if (customHandles.trim()) qs.set("handles", customHandles);
  }
  const { data, error, isLoading, refresh, mutate } = useApi<BenchmarkData>(`/api/benchmark?${qs.toString()}`);
  const loading = isLoading;

  // Manual refetch trigger that also sets the niche/handles (used by the buttons).
  function load(opts?: { niche?: string; handles?: string }) {
    if (opts?.niche !== undefined) setNiche(opts.niche);
    if (opts?.handles !== undefined) setCustomHandles(opts.handles);
    if (!opts) refresh();
  }

  // Save the typed handle(s) with the chosen category + period, then show the Tracked view.
  const addTracked = () => {
    const adds = customHandles.split(",").map((s) => s.replace(/^@/, "").trim()).filter(Boolean);
    if (!adds.length) return;
    const cat = trackCat.trim() || "Uncategorized";
    const have = new Set(tracked.map((t) => t.handle.toLowerCase()));
    const next = [...tracked, ...adds.filter((h) => !have.has(h.toLowerCase())).map((h) => ({ handle: h, category: cat, period: trackPeriod }))];
    saveTracked(next);
    setCustomHandles(""); setTrackCat("");
    setNiche("__tracked__");
  };

  useEffect(() => { if (data?.niche && !niche) setNiche(data.niche); }, [data, niche]);
  useEffect(() => { if (data) setFetchedAt(Date.now()); }, [data]);
  void mutate;

  const sorted = data
    ? [...data.competitors].sort((a, b) => {
        if (isError(a) && isError(b)) return 0;
        if (isError(a)) return 1;
        if (isError(b)) return -1;
        return b.followers_count - a.followers_count;
      })
    : [];

  const valid = sorted.filter((c): c is Competitor => !isError(c));
  const erValues = valid.map((c) => c.engagementRatePct).filter((v) => v > 0);
  const medianER = erValues.length
    ? [...erValues].sort((a, b) => a - b)[Math.floor(erValues.length / 2)]
    : 0;

  // Best posts across ALL competitors shown, ranked by engagement — the top strip.
  const topPostsAll = valid
    .flatMap((c) => c.recent.map((m) => ({ m, handle: c.username })))
    .filter(({ m }) => m.thumbnail_url || m.media_url)
    .sort((a, b) => (b.m.like_count + b.m.comments_count) - (a.m.like_count + a.m.comments_count))
    .slice(0, 10);

  // Clicking a competitor opens their full profile + all tracked posts IN the dashboard
  // (covers the whole tab) — never a redirect out to Instagram.
  if (detail) return <CompetitorDetail c={detail} medianER={medianER} onBack={() => setDetail(null)} />;

  return (
    <>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-base font-medium text-[#232D42]">Competitors <span className="text-gray-400 text-base font-normal">· {data?.niche || "—"}</span></h2>
          <p className="text-sm text-gray-500 mt-0.5">Public Instagram accounts tracked via Meta&apos;s public data — followers, posting cadence, engagement rate.</p>
        </div>
        <LiveIndicator fetchedAt={fetchedAt} latencyMs={data?.latencyMs ?? null} onRefresh={refresh} loading={loading} />
      </div>

      {/* Filter row */}
      <div className="bg-white rounded-xl p-3 mb-5 border border-gray-100 shadow-sm flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide pl-1">Niche:</span>
        {(data?.niches || []).map((n) => (
          <button
            key={n}
            onClick={() => { setCustomHandles(""); load({ niche: n }); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              n === niche
                ? "bg-brand text-white border-brand"
                : "bg-white text-gray-700 border-gray-200 hover:border-brand"
            }`}
          >
            {n}
          </button>
        ))}
        {tracked.length > 0 && (
          <button
            onClick={() => { setCustomHandles(""); setNiche("__tracked__"); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              niche === "__tracked__" ? "bg-brand text-white border-brand" : "bg-white text-gray-700 border-gray-200 hover:border-brand"
            }`}
          >
            ⭐ Tracked ({tracked.length})
          </button>
        )}
        <span className="text-gray-300 mx-1">|</span>
        <input
          value={customHandles}
          onChange={(e) => setCustomHandles(e.target.value)}
          placeholder="add @handle to track…"
          className="text-xs px-3 py-1.5 rounded-full border border-gray-200 focus:outline-none focus:border-brand min-w-[190px]"
          onKeyDown={(e) => { if (e.key === "Enter") addTracked(); }}
        />
        {customHandles.trim() && (
          <>
            <input
              value={trackCat}
              onChange={(e) => setTrackCat(e.target.value)}
              placeholder="category"
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 focus:outline-none focus:border-brand w-32"
              onKeyDown={(e) => { if (e.key === "Enter") addTracked(); }}
            />
            <HopeSelect value={String(trackPeriod)} onChange={(v) => setTrackPeriod(Number(v))} options={PERIODS.map((p) => ({ value: String(p.value), label: p.label }))} />
            <button onClick={addTracked} className="text-xs px-3 py-1.5 rounded-full bg-brand text-white">+ Track</button>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm">
          {error.message}
        </div>
      )}

      {loading && !data && (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 border border-gray-100">Querying Meta…</div>
      )}

      {/* Summary strip */}
      {valid.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
          <SummaryCard label="Competitors tracked" value={valid.length.toString()} />
          <SummaryCard label="Avg followers" value={fmt(Math.round(valid.reduce((s, c) => s + c.followers_count, 0) / valid.length))} />
          <SummaryCard label="Median engagement rate" value={`${medianER.toFixed(2)}%`} />
          <SummaryCard label="Avg posts / 30d" value={(valid.reduce((s, c) => s + c.postsLast30d, 0) / valid.length).toFixed(1)} />
        </div>
      )}

      {/* Top competitor posts — best across everyone shown, ranked by engagement */}
      {topPostsAll.length > 0 && (
        <div className="bg-white rounded-2xl p-4 mb-5 border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-[#232D42]">🏆 Top competitor posts</span>
            <span className="text-xs text-gray-400">across all competitors shown · ranked by engagement</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {topPostsAll.map(({ m, handle }, i) => (
              <a
                key={m.id}
                href={m.permalink || "#"}
                target={m.permalink ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="shrink-0 w-[150px]"
              >
                <div className="relative w-[150px] h-[150px] rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.thumbnail_url || m.media_url} alt="" className="w-full h-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-semibold px-2 h-5 grid place-items-center rounded-full shadow">🏆 Top</span>
                  )}
                </div>
                <div className="mt-1.5 text-[12px] font-medium text-[#232D42] truncate">@{handle}</div>
                <div className="text-[11px] text-gray-500 tabular-nums">♥ {fmt(m.like_count)} · 💬 {fmt(m.comments_count)}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Competitor grid */}
      {niche === "__tracked__" && tracked.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 border border-gray-100">No tracked accounts yet — type a handle above and hit <b className="text-gray-600">+ Track</b>.</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((c) => isError(c) ? (
          <div key={c.username} className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-sm">@{c.username}</div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">error</span>
                {niche === "__tracked__" && <button onClick={() => removeTracked(c.username)} className="text-gray-300 hover:text-rose-500 text-sm leading-none" title="Untrack">✕</button>}
              </div>
            </div>
            <p className="text-xs text-gray-500">Couldn&apos;t pull this account — it may be private, renamed, or a personal profile.</p>
            <p className="text-[11px] text-gray-400 mt-2">Only public Instagram Business or Creator accounts can be tracked.</p>
          </div>
        ) : (
          <CompetitorCard key={c.username} c={c} medianER={medianER} onOpen={() => setDetail(c)} onRemove={niche === "__tracked__" ? () => removeTracked(c.username) : undefined} periodDays={niche === "__tracked__" ? (trackedOf(c.username)?.period ?? 0) : undefined} category={niche === "__tracked__" ? (trackedOf(c.username)?.category) : undefined} />
        ))}
      </div>
      )}
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums text-[#232D42]">{value}</div>
    </div>
  );
}

function CompetitorCard({ c, medianER, onOpen, onRemove, periodDays, category }: { c: Competitor; medianER: number; onOpen: () => void; onRemove?: () => void; periodDays?: number; category?: string }) {
  // In the tracked view each competitor has a period → recompute the headline metrics over it.
  const pm = periodDays !== undefined ? periodMetrics(c, periodDays) : null;
  const erShown = pm ? pm.er : c.engagementRatePct;
  const erDelta = erShown - medianER;
  const erBadge = erShown >= medianER
    ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">+{erDelta.toFixed(2)}pp</span>
    : <span className="text-xs px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">{erDelta.toFixed(2)}pp</span>;
  const topPosts = [...c.recent].sort((a, b) => (b.like_count + b.comments_count) - (a.like_count + a.comments_count)).slice(0, 5);
  // Whole card opens the in-dashboard drill-down (no Instagram redirect anywhere).
  return (
    <div onClick={onOpen} className="relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-brand/40 transition cursor-pointer">
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Untrack" className="absolute top-3 right-3 z-10 w-6 h-6 rounded-full bg-white/85 border border-gray-100 text-gray-400 hover:text-rose-500 flex items-center justify-center text-sm leading-none">✕</button>
      )}
      <div className="p-5">
        <div className="flex items-start gap-3">
          {c.profile_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.profile_picture_url} alt={c.username} className="w-12 h-12 rounded-full object-cover border border-gray-100" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-100" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-mono text-sm">@{c.username}</div>
            {c.name && <div className="text-xs text-gray-500 truncate">{c.name}</div>}
            {(category || pm) && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {category && <span className="text-[10px] font-medium bg-brand-light text-brand px-2 py-0.5 rounded-full">{category}</span>}
                {pm && <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{periodLabel(periodDays!)}</span>}
              </div>
            )}
          </div>
        </div>
        {c.biography && <p className="text-[11px] text-gray-500 mt-2 line-clamp-2">{c.biography}</p>}

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Stat label="Followers" value={fmt(c.followers_count)} />
          <Stat label="Posts" value={fmt(c.media_count)} />
          <Stat label={pm && periodDays ? `Posts/${periodDays}d` : "Posts/30d"} value={(pm ? pm.posts : c.postsLast30d).toString()} />
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Engagement rate{pm && periodDays ? ` · ${periodDays}d` : ""}</div>
            <div className="text-lg font-semibold tabular-nums">{erShown.toFixed(2)}%</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">vs niche median</div>
            <div className="mt-1">{erBadge}</div>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-gray-500 flex justify-between">
          <span>Avg likes/post <b className="text-gray-700 tabular-nums">{fmt(pm ? pm.avgLikes : c.avgLikesRecent)}</b></span>
          <span>Avg comments <b className="text-gray-700 tabular-nums">{fmt(pm ? pm.avgComments : c.avgCommentsRecent)}</b></span>
        </div>
      </div>

      {topPosts.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
          <div className="flex items-center mb-2">
            <div className="text-xs uppercase tracking-wide text-gray-400">Top posts · ranked by engagement</div>
            <span className="ml-auto text-[11px] text-brand font-medium">View all →</span>
          </div>
          <div className="space-y-1.5">
            {topPosts.map((m, i) => {
              const er = c.followers_count > 0 ? ((m.like_count + m.comments_count) / c.followers_count) * 100 : 0;
              return (
                <div key={m.id} className="flex items-center gap-2.5 rounded-lg -mx-1 px-1 py-1">
                  <span className="text-[11px] text-gray-400 w-3 text-center tabular-nums flex-shrink-0">{i + 1}</span>
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                    {m.thumbnail_url || m.media_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.thumbnail_url || m.media_url} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-gray-700 truncate">{m.caption ? m.caption.replace(/\s+/g, " ").trim() : m.media_type}</div>
                    <div className="text-[11px] text-gray-500 flex gap-3 mt-0.5 tabular-nums">
                      <span>♥ {fmt(m.like_count)}</span>
                      <span>💬 {fmt(m.comments_count)}</span>
                      <span className="text-gray-400">{er.toFixed(2)}% ER</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Media-type → chip label/colour for the post cards in the drill-down.
function mediaChip(type: string): { label: string; cls: string } {
  if (type === "VIDEO") return { label: "Reel", cls: "bg-rose-50 text-rose-600" };
  if (type === "CAROUSEL_ALBUM") return { label: "Carousel", cls: "bg-brand-light text-brand" };
  return { label: "Image", cls: "bg-gray-100 text-gray-600" };
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums text-[#232D42]">{value}</div>
    </div>
  );
}

// Full-tab competitor drill-down — profile + every tracked post as a rich card, all
// IN the dashboard (post images/metrics shown here; no redirect out to Instagram).
function CompetitorDetail({ c, medianER, onBack }: { c: Competitor; medianER: number; onBack: () => void }) {
  const posts = [...c.recent].sort((a, b) => (b.like_count + b.comments_count) - (a.like_count + a.comments_count));
  const erDelta = c.engagementRatePct - medianER;
  const [post, setPost] = useState<CompetitorMedia | null>(null);   // clicked post → detail modal
  return (
    <>
      <button onClick={onBack} className="text-sm text-brand mb-4 inline-flex items-center gap-1 hover:underline">← Back to benchmark</button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="flex items-start gap-4">
          {c.profile_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.profile_picture_url} alt={c.username} className="w-16 h-16 rounded-full object-cover border border-gray-100" />
          ) : <div className="w-16 h-16 rounded-full bg-gray-100" />}
          <div className="min-w-0 flex-1">
            <div className="font-mono text-base text-[#232D42]">@{c.username}</div>
            {c.name && <div className="text-sm text-gray-600">{c.name}</div>}
            {c.biography && <p className="text-xs text-gray-500 mt-1 max-w-2xl">{c.biography}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
          <DetailStat label="Followers" value={fmt(c.followers_count)} />
          <DetailStat label="Posts" value={fmt(c.media_count)} />
          <DetailStat label="Posts / 30d" value={c.postsLast30d.toString()} />
          <DetailStat label="Engagement rate" value={`${c.engagementRatePct.toFixed(2)}%`} />
          <DetailStat label="vs niche median" value={`${erDelta >= 0 ? "+" : ""}${erDelta.toFixed(2)}pp`} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base font-medium text-[#232D42]">Top performing posts</span>
          <span className="ml-auto text-xs text-gray-400">ranked by engagement · {posts.length} tracked</span>
        </div>
        {posts.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">No public posts available for this account.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {posts.map((m, i) => {
              const er = c.followers_count > 0 ? ((m.like_count + m.comments_count) / c.followers_count) * 100 : 0;
              const chip = mediaChip(m.media_type);
              return (
                <div key={m.id} onClick={() => setPost(m)} className={`border rounded-xl overflow-hidden bg-white cursor-pointer hover:shadow-md hover:border-brand/40 transition ${i === 0 ? "border-amber-300 ring-1 ring-amber-300" : "border-gray-100"}`}>
                  <div className="relative aspect-square bg-gray-100">
                    {m.thumbnail_url || m.media_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.thumbnail_url || m.media_url} alt="" className="w-full h-full object-cover" />
                    ) : null}
                    <span className={`absolute top-2 left-2 rounded-full text-white text-[11px] font-semibold grid place-items-center shadow ${i === 0 ? "px-2 h-6 bg-amber-500" : "w-6 h-6 bg-brand"}`}>{i === 0 ? "🏆 Top" : i + 1}</span>
                    <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
                  </div>
                  <div className="p-3">
                    <div className="text-[12px] text-gray-700 line-clamp-2 h-9">{m.caption ? m.caption.replace(/\s+/g, " ").trim() : "(no caption)"}</div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 tabular-nums">
                      <span>♥ {fmt(m.like_count)}</span>
                      <span>💬 {fmt(m.comments_count)}</span>
                      <span className="ml-auto text-emerald-600 font-semibold">{er.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {post && <PostModal m={post} c={c} onClose={() => setPost(null)} />}
    </>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
      <div className="text-lg font-semibold tabular-nums text-[#232D42]">{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// Competitor post detail — full image + caption + the public metrics Meta exposes for
// other accounts (likes + comments + engagement). Reach/saves/shares are private for
// competitors, so we say so instead of faking them.
function PostModal({ m, c, onClose }: { m: CompetitorMedia; c: Competitor; onClose: () => void }) {
  const er = c.followers_count > 0 ? ((m.like_count + m.comments_count) / c.followers_count) * 100 : 0;
  const chip = mediaChip(m.media_type);
  const date = fmtDateShort(m.timestamp, "");
  // Carousels come back with `children` (each slide); non-carousels are a single "slide".
  const slides = m.children?.data?.length ? m.children.data : [{ id: m.id, media_type: m.media_type, media_url: m.media_url, thumbnail_url: m.thumbnail_url }];
  const [slide, setSlide] = useState(0);
  const cur = slides[Math.min(slide, slides.length - 1)];
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="md:w-1/2 bg-gray-900 relative flex-shrink-0 flex items-center justify-center">
          {cur.media_type === "VIDEO" && cur.media_url ? (
            <video src={cur.media_url} poster={cur.thumbnail_url} controls autoPlay muted playsInline className="w-full h-auto object-contain max-h-[45vh] md:max-h-[90vh]" />
          ) : (cur.thumbnail_url || cur.media_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur.thumbnail_url || cur.media_url} alt="" className="w-full h-auto object-contain max-h-[45vh] md:max-h-[90vh]" />
          ) : null}
          <span className={`absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full ${chip.cls}`}>{chip.label}{slides.length > 1 ? ` · ${slide + 1}/${slides.length}` : ""}</span>
          {slides.length > 1 && (
            <>
              <button onClick={() => setSlide((s) => (s - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 hover:bg-white shadow flex items-center justify-center text-gray-700 text-xl leading-none">‹</button>
              <button onClick={() => setSlide((s) => (s + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 hover:bg-white shadow flex items-center justify-center text-gray-700 text-xl leading-none">›</button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {slides.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === slide ? "bg-white" : "bg-white/50"}`} />)}
              </div>
            </>
          )}
        </div>
        <div className="md:w-1/2 p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 min-w-0">
              {c.profile_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.profile_picture_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0" />}
              <div className="font-mono text-sm truncate">@{c.username}</div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none flex-shrink-0">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <MetricBox label="Likes" value={fmt(m.like_count)} />
            <MetricBox label="Comments" value={fmt(m.comments_count)} />
            <MetricBox label="Engagement" value={`${er.toFixed(2)}%`} />
          </div>
          <div className="text-xs text-gray-400 mb-3">{chip.label}{date ? ` · ${date}` : ""}</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{m.caption || "(no caption)"}</div>
          <p className="text-[11px] text-gray-400 mt-4 border-t border-gray-100 pt-3">Reach, saves &amp; shares aren&apos;t public for other accounts — Instagram only exposes likes &amp; comments for competitors.</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
