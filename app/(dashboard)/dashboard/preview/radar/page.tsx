"use client";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRadarActions, Thumbs, type RadarActionsState } from "./RadarThumbs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { TEAM_USERS } from "@/lib/users";
import type { Sbu } from "@/lib/sbus";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";
import { LiveIndicator } from "@/components/LiveIndicator";
import { IconBrandGoogle, IconBrandReddit, IconCheck, IconFlame, IconMessage2, IconMessageQuestion, IconNews, IconPencil, IconRefresh, IconSearch, IconSeo, IconShieldCheck, IconSparkles, IconStar, IconStethoscope, IconTargetArrow, IconTrendingUp, IconWorldSearch, IconX, IconAlertTriangle, IconBook, IconClipboardText, IconBroadcast, IconRss, IconSettings } from "@tabler/icons-react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import { fmtDateShort, fmtDateTime } from "@/lib/date";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";

type Alert = {
  id: string;
  name: string;
  primaryInterest: string;
  feedUrl: string | null;
  searchQuery: string | null;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

type FeedItem = {
  id: string;
  alertId: string;
  alertName: string;
  primaryInterest: string;
  title: string;
  link: string;
  source: string | null;
  snippet: string;
  publishedAt: string;
  fetchedAt: string;
};

// Preloaded interest options — matches the Post Scheduler Airtable's Primary
// Interest single-select values, so a "Turn into post" click can pre-fill the
// same value without translation.
const INTEREST_OPTIONS = [
  "Australia-PGCP",
  "NEET PG",
  "ALS",
  "Mentorship Platform",
  "Study Abroad",
  "AMC",
  "UAE / Gulf",
  "UK / Europe",
  "Other",
];

export default function RadarPage() {
  return (
    <PreviewDashboardShell active="radar" title="Content Radar" subtitle="What's trending in your domain right now — news, search, your SEO and brand mentions — turned into a post in one click." hideAccountPicker hideRange>
      {() => <Radar />}
    </PreviewDashboardShell>
  );
}

// Anything older than this is not news and does not belong in a list headed "what to
// write about". The feed carried a 2012 Dubai licensing piece and 29 items over a month
// old, sitting alongside today's stories with nothing to separate them — Google News
// returns whatever it has for a quiet search term, and nothing was filtering it.
const MAX_AGE_DAYS = 30;
const ageDays = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

// Every place the radar listens. Shown whether or not it found anything: a source that
// is quiet today is information, and hiding it teaches the team to watch three tiles and
// ignore the rest.
type GoogleReviewLite = {
  id: string; rating: number; publishedAt: string | null; relative: string | null;
  text: string; author: string; authorPhoto: string | null; link: string | null;
};
type ReviewsResp = {
  place: { title: string; rating: number | null; ratingCount: number | null; cid: string | null } | null;
  reviews: GoogleReviewLite[];
  configured: boolean;
  error: string | null;
};

type ReviewSort = "needs_reply" | "newest" | "highest" | "lowest";
const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  // The default is the one Google does not offer, because Google is not trying to get
  // anybody to answer these — it is the whole reason the tile exists.
  { value: "needs_reply", label: "Needs a reply first" },
  { value: "newest", label: "Newest first" },
  { value: "lowest", label: "Lowest rated" },
  { value: "highest", label: "Highest rated" },
];

type SourceTile = {
  name: string; n: number | null; unit: string; what: string; dim?: boolean; note?: string;
};

// Which site lane a mention came from, as a tile name.
function laneOf(source: string | null): string {
  const s = (source || "").toLowerCase();
  if (s.includes("reddit")) return "Reddit";
  if (s.includes("quora")) return "Quora";
  if (s.includes("mouthshut")) return "MouthShut";
  if (s.includes("valuemd")) return "ValueMD";
  return "Google News";
}

function Radar() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  // Separate from `banner`, which also carries success messages — feeding that to
  // the live badge would turn it red on "Refreshed 5 feeds".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeInterest, setActiveInterest] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // In-app reader — set to an item when the user clicks a headline.
  const [readerItem, setReaderItem] = useState<FeedItem | null>(null);
  const [showAllNews, setShowAllNews] = useState(false);
  // Free trend signals (Google Trends RSS breakouts + autocomplete ideas).
  const [trends, setTrends] = useState<TrendsResp | null>(null);
  const [trendsRefreshing, setTrendsRefreshing] = useState(false);
  // Real brand mentions (Google News search for the brand) — powers the pulse
  // row's brand tile and the Brand-watch card.
  const [reviews, setReviews] = useState<ReviewsResp | null>(null);
  const [brand, setBrand] = useState<MentionResult | null>(null);
  // Separate loading flag so the pulse tile shows a skeleton (not a hard "0
  // mentions") while the brand search is in flight; brand === null alone can't
  // tell "still loading" apart from "loaded, no data / errored".
  const [brandLoading, setBrandLoading] = useState(true);

  const loadTrends = useCallback(async (force = false) => {
    if (force) setTrendsRefreshing(true);
    try {
      const r = await fetch(`/api/radar/trends${force ? "?force=1" : ""}`);
      const d = await r.json();
      if (r.ok) setTrends(d as TrendsResp);
    } catch { /* trends are best-effort — never block the feed */ }
    finally { setTrendsRefreshing(false); }
  }, []);
  useEffect(() => { loadTrends(); }, [loadTrends]);

  // Google Maps reviews. Served from a shared hourly cache, so this costs nothing per
  // page load — see lib/google-reviews.
  useEffect(() => {
    let alive = true;
    fetch("/api/radar/reviews", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setReviews(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    fetch(`/api/radar/search?q=${encodeURIComponent(BRAND_QUERY)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setBrand(d as MentionResult); })
      .catch(() => { /* brand watch is best-effort */ })
      .finally(() => setBrandLoading(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const t0 = Date.now();
    try {
      const [aRes, iRes] = await Promise.all([
        fetch("/api/radar/alerts").then((r) => r.json()),
        fetch(`/api/radar/feed?interest=${encodeURIComponent(activeInterest)}`).then((r) => r.json()),
      ]);
      setAlerts(aRes.alerts || []);
      setItems(iRes.items || []);
      setFetchedAt(Date.now());
      setLatencyMs(Date.now() - t0);
    } catch (e) {
      setBanner((e as Error).message);
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeInterest]);

  useEffect(() => { load(); }, [load]);

  // Flagged stories first — a closing deadline is worth more than something
  // published an hour ago — then newest within each tier. Collapsed to the first
  // few because 31 headlines is a wall; the count on the button says what is
  // hidden rather than making you guess.
  const newsOrdered = useMemo(
    () => [...items].sort((a, b) =>
      rankOf(a) - rankOf(b) ||
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    [items],
  );
  const newsShown = showAllNews ? newsOrdered : newsOrdered.slice(0, NEWS_PREVIEW);

  async function refreshAll() {
    setRefreshing(true);
    setBanner(null);
    try {
      const r = await fetch("/api/radar/refresh", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const errCount = (d.errors || []).length;
      setBanner(`Refreshed ${d.alerts} feed${d.alerts === 1 ? "" : "s"} · ${d.inserted} new item${d.inserted === 1 ? "" : "s"}${errCount ? ` · ${errCount} feed${errCount === 1 ? "" : "s"} errored (see settings)` : ""}`);
      await load();
    } catch (e) {
      setBanner((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  // Populate interest chips from the alerts (so we only show interests the user
  // has actually subscribed to) plus "all".
  const interestChips = useMemo(() => {
    const set = new Set(alerts.filter((a) => a.active).map((a) => a.primaryInterest));
    return ["all", ...Array.from(set).sort()];
  }, [alerts]);

  // Which source tile is selected, or null for everything.
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  // Google's own sort options, because this is the list people are used to reading on
  // Google and arriving at a different vocabulary for the same four choices helps nobody.
  const [reviewSort, setReviewSort] = useState<ReviewSort>("needs_reply");

  // Thumbs, and the keys already closed into a past day's report.
  const acts = useRadarActions();

  // How many stories each topic has actually found. The Topics screen used to list the
  // words being searched and nothing about whether searching them was working.
  const countsByAlert = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of items) m[i.alertId] = (m[i.alertId] || 0) + 1;
    return m;
  }, [items]);

  // Only admins are shown the way into the report — it says who ignored what, and the
  // endpoint refuses everyone else, so a link for them would only be a dead end.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setIsAdmin(!!d?.user?.isAdmin); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // News, minus anything too old to be news. Done here rather than in the query so the
  // tile can still say how many were dropped.
  const freshNews = useMemo(() => items.filter((i) => ageDays(i.publishedAt) <= MAX_AGE_DAYS), [items]);
  const droppedOld = items.length - freshNews.length;

  // Memoised: `brand?.mentions || []` is a fresh array every render, which would make
  // every list below it recompute on every keystroke elsewhere on the page.
  const mentions = useMemo(() => brand?.mentions || [], [brand]);
  const mentionsByLane = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of mentions) m[laneOf(x.source)] = (m[laneOf(x.source)] || 0) + 1;
    return m;
  }, [mentions]);
  const risingTerms = useMemo(() => {
    const seen = new Set<string>();
    for (const g of trends?.ideas || []) for (const i of g.ideas) seen.add(i.toLowerCase().trim());
    return Array.from(seen);
  }, [trends]);

  // A complaint does not go stale the way a news story does — it stays at the top of our
  // Google listing being read by people deciding whether to call us, whether it was left
  // last week or last quarter. So negatives get a longer window than the rest of the
  // Radar. Praise does expire as *content*: a five-star review from March is not news and
  // there are hundreds of them, so those keep the same 30 days as everything else and are
  // capped, or they would bury the page.
  const NEGATIVE_WINDOW_DAYS = 90;
  const PRAISE_MAX = 3;

  const viewingReviews = sourceFilter === "Google Reviews";
  const allReviews = useMemo(() => reviews?.reviews || [], [reviews]);

  const reviewRows = useMemo(() => {
    const bad = allReviews
      .filter((r) => r.rating > 0 && r.rating <= 3)
      .filter((r) => !r.publishedAt || ageDays(r.publishedAt) <= NEGATIVE_WINDOW_DAYS);
    const good = allReviews
      // A bare five stars with no words is not a testimonial — there is nothing to post.
      .filter((r) => r.rating >= 5 && r.text.length > 40)
      .filter((r) => r.publishedAt && ageDays(r.publishedAt) <= MAX_AGE_DAYS)
      .slice(0, PRAISE_MAX);
    // Filtered to this source on purpose? Then show everything we hold, not the handful
    // the Radar picked out. The tile is a summary; clicking it is asking to look properly.
    const all = viewingReviews ? [...allReviews] : [...bad, ...good];
    return { bad, good, all };
  }, [viewingReviews, allReviews]);

  const tiles = useMemo<SourceTile[]>(() => [
    { name: "Google News", n: freshNews.length, unit: "headlines", what: "news in your field" },
    { name: "Reddit", n: mentionsByLane["Reddit"] || 0, unit: "threads", what: "brand + topic talk" },
    { name: "Google Trends", n: risingTerms.length, unit: "rising searches", what: "what people search" },
    { name: "Quora", n: mentionsByLane["Quora"] || 0, unit: "threads", what: "questions being asked" },
    { name: "MouthShut", n: mentionsByLane["MouthShut"] || 0, unit: "threads", what: "consumer reviews" },
    { name: "ValueMD", n: mentionsByLane["ValueMD"] || 0, unit: "threads", what: "IMG forums" },
    { name: "Search Console", n: null, unit: "your own site", what: "see the SEO tab", dim: true },
    // Counts the complaints, not the reviews. 378 reviews at 4.9 stars is a fact about
    // the business; the number that should make someone click is the number needing an
    // answer. The overall score rides along on the description line.
    reviews?.configured
      ? {
          name: "Google Reviews",
          n: reviewRows.bad.length,
          unit: reviewRows.bad.length === 1 ? "needs a reply" : "need a reply",
          what: reviews.place?.rating
            ? `${reviews.place.rating}★ from ${reviews.place.ratingCount ?? "?"}`
            : "star ratings",
        }
      : { name: "Google Reviews", n: null, unit: "not connected", what: "star ratings", dim: true },
  ], [freshNews.length, mentionsByLane, risingTerms.length, reviews, reviewRows.bad.length]);

  // One list. A story, a thread and a rising search are all the same thing here —
  // something you could write about today — so they are ranked together rather than
  // filed into separate panels the reader has to reconcile.
  // actionKey is the identity the thumbs and the nightly report both use — it has to be
  // derived the same way here as in lib/radar-actions.ts, or a row answered on this page
  // would not be the row the report closes.
  type Merged =
    | { key: string; actionKey: string; kind: "news"; src: string; rank: number; at: number; item: FeedItem }
    | { key: string; actionKey: string; kind: "mention"; src: string; rank: number; at: number; m: WebMention }
    | { key: string; actionKey: string; kind: "search"; src: string; rank: number; at: number; term: string }
    | { key: string; actionKey: string; kind: "review"; src: string; rank: number; at: number; review: GoogleReviewLite };

  const merged = useMemo<Merged[]>(() => {
    const out: Merged[] = [];
    for (const m of mentions) {
      const neg = m.sentiment === "negative";
      out.push({ key: `m${m.url}`, actionKey: `mention:${m.url.trim()}`, kind: "mention",
                 src: laneOf(m.source), rank: neg ? 0 : 2,
                 at: +new Date(m.publishedAt || 0) || 0, m });
    }
    for (const it of freshNews) {
      out.push({ key: `n${it.id}`, actionKey: `news:${it.id.trim()}`, kind: "news",
                 src: "Google News", rank: rankOf(it) === 0 ? 1 : 3,
                 at: +new Date(it.publishedAt) || 0, item: it });
    }
    for (const r of reviewRows.all) {
      const bad = r.rating <= 3;
      out.push({
        key: `r${r.id}`, actionKey: `review:${r.id}`, kind: "review", src: "Google Reviews",
        // A complaint outranks everything. It is the only item on this page where doing
        // nothing keeps costing us money for as long as it stays unanswered.
        rank: bad ? -1 : 2.6,
        at: +new Date(r.publishedAt || 0) || 0, review: r,
      });
    }
    for (const term of risingTerms) {
      out.push({ key: `s${term}`, actionKey: `search:${term.trim().toLowerCase()}`, kind: "search",
                 src: "Google Trends", rank: 2.5, at: 0, term });
    }
    return out.sort((a, b) => a.rank - b.rank || b.at - a.at);
  }, [mentions, freshNews, risingTerms, reviewRows.all]);

  // Anything already written into a past day's report is gone from here. It had its day;
  // it now lives in the report. Without this the tab is a pile that only grows, which is
  // exactly why nobody was clearing it.
  const shown = useMemo(() => {
    const rows = merged.filter((r) => (!sourceFilter || r.src === sourceFilter) && !acts.logged.has(r.actionKey));
    if (!viewingReviews) return rows;
    // Only meaningful once the list is all reviews — sorting a mixed list by star rating
    // would silently drop every row that has no stars to the bottom.
    const at = (r: Merged) => (r.kind === "review" ? +new Date(r.review.publishedAt || 0) || 0 : 0);
    const stars = (r: Merged) => (r.kind === "review" ? r.review.rating : 0);
    const copy = [...rows];
    if (reviewSort === "newest") copy.sort((a, b) => at(b) - at(a));
    else if (reviewSort === "lowest") copy.sort((a, b) => stars(a) - stars(b) || at(b) - at(a));
    else if (reviewSort === "highest") copy.sort((a, b) => stars(b) - stars(a) || at(b) - at(a));
    // needs_reply: complaints first, newest of those at the top — the order you would
    // work through them in.
    else copy.sort((a, b) => Number(stars(a) > 3) - Number(stars(b) > 3) || at(b) - at(a));
    return copy;
  }, [merged, sourceFilter, acts.logged, viewingReviews, reviewSort]);

  return (
    <>
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <div>
          {/* The four tiles that used to sit below counted the things directly
              beneath them — "Brand mentions 10" above the list of 10. One line
              instead, and Breakouts is gone until there actually is one. */}
          <div className="text-xs text-[#8A92A6]">
            <b className="font-semibold text-[#232D42] tabular-nums">{freshNews.length}</b> headline{freshNews.length === 1 ? "" : "s"}
            {brand?.mentions?.length ? <> · <b className="font-semibold text-[#232D42] tabular-nums">{brand.mentions.length}</b> brand mention{brand.mentions.length === 1 ? "" : "s"}</> : null}
            {risingTerms.length ? <> · <b className="font-semibold text-[#232D42] tabular-nums">{risingTerms.length}</b> rising search{risingTerms.length === 1 ? "" : "es"}</> : null}
            {" · "}<b className="font-semibold text-[#232D42] tabular-nums">{alerts.filter((a) => a.active).length}</b> topic{alerts.filter((a) => a.active).length === 1 ? "" : "s"} watched
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={load} error={loadError} />
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="text-xs font-medium bg-white text-brand border border-brand/30 px-3 py-1.5 rounded-lg hover:bg-brand-light disabled:opacity-50"
          >
            {refreshing ? "Refreshing feeds…" : "↻ Pull latest from Google"}
          </button>
          {isAdmin && (
            <Link href="/dashboard/preview/radar/report"
              className="text-xs font-medium bg-white text-[#4A5468] border border-gray-200 px-3 py-1.5 rounded-lg hover:border-brand hover:text-brand">
              <IconClipboardText size={14} stroke={1.8} className="inline -mt-0.5 mr-1" />Report
            </Link>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-xs font-medium bg-brand text-white px-3 py-1.5 rounded-lg hover:bg-brand-dark"
          >
            <IconSettings size={14} stroke={1.8} className="inline -mt-0.5 mr-1" />Topics
          </button>
        </div>
      </div>

      {banner && (
        <div className="bg-brand-light/50 border border-brand/20 rounded-lg px-3 py-2 mb-4 text-[12px] text-brand flex items-center justify-between">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="text-brand/70 hover:text-brand text-sm">×</button>
        </div>
      )}

      {/* Empty state (no topics tracked yet) */}
      {!loading && alerts.length === 0 && (
        <EmptyState onOpenSettings={() => setSettingsOpen(true)} />
      )}

      {/* Where we looked. Every source, including the quiet ones — a tile reading 0 is
          information, and folding them away teaches the team to watch three and ignore
          the rest. Tapping one filters the list below, so this doubles as the only
          navigation the page needs. */}
      {alerts.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A6ACBE] mb-2">
            Where we looked · tap one to see only that
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            {tiles.map((s) => {
              const on = sourceFilter === s.name;
              const clickable = !s.dim;
              return (
                <button key={s.name} type="button"
                  onClick={() => clickable && setSourceFilter(on ? null : s.name)}
                  className={`text-left rounded-xl border px-3 py-2.5 transition ${
                    on ? "border-brand bg-brand-light"
                       : s.dim ? "border-dashed border-gray-200 bg-[#FCFCFE] cursor-default"
                               : "border-gray-100 bg-white hover:border-[#C7CEDD]"}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      s.dim ? "bg-[#D9DEEA]" : (s.n || 0) > 0 ? "bg-[#1AA053]" : "bg-[#D9DEEA]"}`} />
                    <span className="text-[11.5px] font-semibold text-[#232D42]">{s.name}</span>
                  </div>
                  <div className={`text-[1.15rem] font-bold leading-tight ${
                    s.n === null || s.n === 0 ? "text-[#A6ACBE]" : "text-[#232D42]"}`}>
                    {s.n === null ? "—" : s.n}
                  </div>
                  <div className="text-[11px] text-[#8A92A6] leading-snug">{s.unit}</div>
                  <div className="text-[10.5px] text-[#A6ACBE] mt-0.5">{s.what}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-baseline gap-2 flex-wrap mb-2">
            <h2 className="text-base font-medium text-[#232D42]">
              {sourceFilter ? `From ${sourceFilter}` : "What to write about"}
            </h2>
            <span className="text-xs text-[#8A92A6]">
              · {shown.length} {sourceFilter ? "items" : "most urgent first"}
            </span>
            {/* Google's own four choices, in Google's own words, because this is the list
                people already know how to read there. */}
            {viewingReviews && (
              <PreviewSelect className="ml-auto w-[180px]" value={reviewSort}
                onChange={(v) => setReviewSort(v as ReviewSort)} options={REVIEW_SORTS} />
            )}
            {sourceFilter && (
              <button onClick={() => setSourceFilter(null)}
                className={`text-xs text-brand hover:underline ${viewingReviews ? "" : "ml-auto"}`}>Show everything</button>
            )}
          </div>
          {/* Said out loud, because a list that silently hides things is worse than one
              that shows too much — the reader has no way to tell the difference. */}
          {viewingReviews ? (
            // Say how many of how many. "36 reviews" next to a tile reading "4.9 from 378"
            // invites the reader to assume the rest were hidden for a reason.
            <p className="text-[12px] text-[#8A92A6] mb-3">
              The {shown.length} most recent and lowest-rated of{" "}
              {reviews?.place?.ratingCount ?? "all"} reviews.
              {reviews?.place?.cid && (
                <> <a className="text-brand hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps?cid=${reviews.place.cid}`}>See them all on Google</a>.</>
              )}
            </p>
          ) : (
            <p className="text-[12px] text-[#8A92A6] mb-3">
              Published in the last {MAX_AGE_DAYS} days.
              {droppedOld > 0 && <> {droppedOld} older {droppedOld === 1 ? "story is" : "stories are"} left out — not news any more.</>}
            </p>
          )}

          <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {shown.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-sm text-[#232D42] mb-1">Nothing here right now.</div>
                <div className="text-xs text-[#8A92A6]">
                  {sourceFilter ? "That source is quiet today." : "The radar refreshes every hour."}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {shown.map((r) =>
                  r.kind === "news" ? (
                    <FeedRow key={r.key} item={r.item} onRead={() => setReaderItem(r.item)}
                      showTopic={activeInterest === "all"} acts={acts} />
                  ) : r.kind === "review" ? (
                    <RadarReviewRow key={r.key} r={r.review} acts={acts}
                      mapsUrl={reviews?.place?.cid ? `https://www.google.com/maps?cid=${reviews.place.cid}` : null} />
                  ) : r.kind === "mention" ? (
                    <RadarMentionRow key={r.key} m={r.m} lane={r.src} acts={acts} />
                  ) : (
                    <RadarSearchRow key={r.key} term={r.term} acts={acts} />
                  ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal
          alerts={alerts}
          counts={countsByAlert}
          onClose={() => setSettingsOpen(false)}
          onChanged={load}
        />
      )}

      {/* In-app reader */}
      {readerItem && (
        <ReaderModal
          item={readerItem}
          onClose={() => setReaderItem(null)}
        />
      )}
    </>
  );
}

// Radar tracks interests; the board files work by brand. These are the brands
// radar stories land under — a curated shortlist, but every entry is typed as a
// real SBU, because a name that isn't one shows up as a SECOND "NEET PG" in every
// brand dropdown on the board (Manya, 23 Sep). The picker shows the result, so a
// wrong guess is one click to fix rather than a silent mis-file.
const RADAR_SBUS: readonly Sbu[] = [
  "India NEET PG Consulting", "India NEET UG Consulting", "Australia-PGCP",
  "Standard Consulting Program - Australia", "Middle East", "Study Abroad",
  "Mentorship Platform", "10K Mentorship", "General Content",
];
function sbuFor(interest: string): Sbu {
  const i = (interest || "").toLowerCase();
  const exact = RADAR_SBUS.find((o) => o.toLowerCase() === i);
  if (exact) return exact;
  if (i.includes("uae") || i.includes("gulf")) return "Middle East";
  if (i.includes("australia")) return "Australia-PGCP";
  // UG and PG are different brands — "neet" alone used to send both to PG.
  if (i.includes("neet")) return i.includes("ug") ? "India NEET UG Consulting" : "India NEET PG Consulting";
  return "General Content";
}

// Which headlines to put first, and why.
//
// Deliberately a fixed rule, not a model: it costs nothing, gives the same
// answer twice, and — because each flag carries the word that triggered it —
// you can see why a story was raised and tell me the rule is wrong. A ranking
// you cannot interrogate is worse than no ranking on a page people act from.
//
// A deadline beats freshness: "correction window closes today" matters more than
// something published an hour ago, because missing it costs the audience
// something real.
const NEWS_PREVIEW = 6;

const DEADLINE_WORDS = [
  "today", "tomorrow", "last chance", "last date", "deadline", "closes", "closing",
  "ends", "ending", "extended", "final call", "window opens", "opens today",
  "released", "out now", "declared", "starts today",
];

type Flag = { label: string; why: string; tone: "urgent" | "new" | "watch" };

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTH_RE = new RegExp(`\\b(${MONTHS.join("|")}|${MONTHS.map((m) => m.slice(0, 3)).join("|")})\\.?\\s+(\\d{1,2})\\b|\\b(\\d{1,2})\\s+(${MONTHS.join("|")}|${MONTHS.map((m) => m.slice(0, 3)).join("|")})\\b`, "gi");

// When the thing in the headline actually falls due.
//
// The catch that makes this necessary: "closes today" in a story published on
// 28 July means 28 July, not today. Reading those words literally badged
// seven-week-old deadlines as urgent — the exact opposite of useful. Relative
// words are therefore resolved against the article's OWN publication date, and
// anything already past stops being urgent.
//
// Where a headline carries more than one date ("opens today; correct images by
// August 10") the latest is the deadline; the earlier one is a start date.
function deadlineOf(item: FeedItem): Date | null {
  const title = item.title.toLowerCase();
  const pub = new Date(item.publishedAt);
  if (isNaN(pub.getTime())) return null;
  const cands: Date[] = [];

  if (/\btoday\b/.test(title)) cands.push(new Date(pub));
  if (/\btomorrow\b/.test(title)) { const d = new Date(pub); d.setDate(d.getDate() + 1); cands.push(d); }

  for (const m of item.title.matchAll(MONTH_RE)) {
    const name = (m[1] || m[4] || "").toLowerCase();
    const day = parseInt(m[2] || m[3] || "", 10);
    const mi = MONTHS.findIndex((x) => x.startsWith(name.slice(0, 3)));
    if (mi < 0 || !day || day > 31) continue;
    const d = new Date(pub.getFullYear(), mi, day);
    // A date well before publication is next year's (December → January).
    if (d.getTime() < pub.getTime() - 60 * 86_400_000) d.setFullYear(d.getFullYear() + 1);
    cands.push(d);
  }
  if (!cands.length) return null;
  return new Date(Math.max(...cands.map((d) => d.getTime())));
}

// Whole days from today, so "closes today" stays today all day rather than
// flipping to "tomorrow" after midday.
function daysAway(d: Date): number {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function dueLabel(n: number): string {
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  if (n === 2) return "Day after tomorrow";
  if (n <= 7) return `Due in ${n} days`;
  return `Due ${new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function flagFor(item: FeedItem, sentiment: "positive" | "negative" | "neutral"): Flag | null {
  // Title only, not the snippet. Matching body text flagged six stories out of
  // six — "released" and "ending" turned up mid-paragraph in articles with no
  // deadline at all — and a badge on everything highlights nothing. A headline
  // is written to signal urgency; body prose is not.
  const hay = item.title.toLowerCase();
  const hit = DEADLINE_WORDS.find((w) => hay.includes(w));
  if (hit) {
    const due = deadlineOf(item);
    // A deadline that has already passed is not urgent, it is history. Without
    // this, "closes today" from July stayed red for ever.
    if (due) {
      const n = daysAway(due);
      if (n >= 0) return { label: dueLabel(n), why: `“${hit}” in the headline, due ${due.toDateString()}`, tone: "urgent" };
    } else {
      return { label: "Time-sensitive", why: `mentions “${hit}”, no date given`, tone: "urgent" };
    }
  }

  const ageH = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
  if (ageH <= 24) return { label: "New today", why: "published in the last 24 hours", tone: "new" };

  // Something negative about this industry is worth seeing early even when it is
  // not urgent — it tends to be what people ask about.
  if (sentiment === "negative") return { label: "Negative", why: "negative coverage in your field", tone: "watch" };
  return null;
}

const FLAG_STYLE: Record<Flag["tone"], string> = {
  urgent: "bg-[#FDECEA] text-[#C0392B]",
  new: "bg-[#E8F6F0] text-[#2F9E6F]",
  watch: "bg-[#FDF6E7] text-[#B7791F]",
};

// Flagged first, most urgent first, then newest. Within a tier, recency decides.
const TIER: Record<string, number> = { urgent: 0, new: 1, watch: 2 };
function rankOf(item: FeedItem): number {
  const f = flagFor(item, sentimentOf(`${item.title} ${item.snippet || ""}`));
  return f ? TIER[f.tone] : 3;
}

// Every "Write this" on this page now goes to the same place. A news headline used to
// open a little owner/brand picker and create the task on the spot — so the same button
// meant "open the Studio" on one row and "file a task right now" on the row above it,
// and a news story was the one kind of item that never got fact-checked before someone
// started writing it.
function studioHref(item: FeedItem): string {
  const p = new URLSearchParams({ title: item.title });
  if (item.link) p.set("url", item.link);
  const src = item.source || item.alertName;
  if (src) p.set("source", src);
  const sbu = sbuFor(item.primaryInterest);
  if (sbu) p.set("sbu", sbu);
  return `/dashboard/preview/content-studio?${p.toString()}`;
}

// Raises a real task on the board from a headline, and then points at it.
//
// Shared by the feed row and the article reader so both behave identically —
// the reader used to run the old "generate a draft and walk you to Content
// Studio" path, which meant the same headline did two different things
// depending on where you clicked it.
function MakeTaskButton({ item, quiet }: { item: FeedItem; quiet?: boolean }) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState("manya");   // the content writer owns Content-Pending
  const [sbu, setSbu] = useState<string>(sbuFor(item.primaryInterest));
  const [madeId, setMadeId] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const createTask = async () => {
    setBusy(true); setFailed(null);
    try {
      const r = await fetch("/api/marketing-hub/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({
          title: item.title,
          sbu, owner,
          // Everything the writer needs to start, so they never have to come back
          // here to work out what the task was about.
          content: `From Content Radar — ${item.source || item.alertName || "news"}\n${item.link}\n\nTopic: ${item.primaryInterest}`,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Couldn't create the task (${r.status})`);
      setMadeId(d?.id || null);
      setPicking(false);
      // Tell the log this headline was acted on, and which task came out of it — so the
      // report can point at the work rather than just claim it happened. Deliberately
      // not awaited: the task exists, and a failed bookkeeping write must not make a
      // successful creation look like it failed.
      fetch("/api/radar/action", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ itemKey: `news:${item.id.trim()}`, itemKind: "news", action: "written", taskId: d?.id || null }),
      }).catch(() => {});
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Created → the button becomes the way in. ?open= is the Hub's existing
  // deep link, and its API fetches the row even when the current filter
  // excludes it, so this always lands on the task itself.
  if (madeId) {
    return (
      <Link href={`/dashboard/preview/marketing-hub?tab=master&open=${madeId}`}
        className="shrink-0 self-center inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#2F9E6F] bg-[#E8F6F0] hover:bg-[#d9f0e6] px-3 py-1.5 rounded-lg whitespace-nowrap">
        <IconCheck size={13} stroke={2.2} /> Task created — open it
      </Link>
    );
  }

  return (
    <>
      {/* In the list this is one of six and must not compete with the headlines,
          so it carries no border and stays muted until you reach for it. It is
          still always visible — hiding an action until hover strands anyone on a
          touchscreen or a keyboard. In the reader it is the primary action and
          keeps its outline. */}
      <button type="button" onClick={() => setPicking(true)} disabled={busy}
        className={`shrink-0 self-center inline-flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap disabled:opacity-60 transition-colors ${
          quiet
            ? "text-[#A6ACBE] hover:text-brand hover:bg-brand-light"
            : "text-brand border border-gray-100 hover:bg-brand-light hover:border-brand/30"
        }`}>
        <IconSparkles size={13} stroke={1.8} /> {busy ? "Creating…" : "Write this"}
      </button>

      {/* Centred dialog rather than a menu hanging off the button: anchored to a
          row it sat in a corner, and inside the article reader it had to flip
          upward to stay on screen at all. Native <select> is replaced by the
          shared PreviewSelect — a browser's own dropdown is an OS menu and can
          never carry the dashboard's styling. */}
      {picking && (
        <Overlay onClose={() => setPicking(false)}
          className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
              <span className="w-7 h-7 rounded-lg bg-brand-light text-brand grid place-items-center shrink-0">
                <IconSparkles size={15} stroke={1.8} />
              </span>
              <h3 className="text-[14px] font-medium text-[#232D42]">Write this</h3>
              <button onClick={() => setPicking(false)} aria-label="Close"
                className="ml-auto text-[#A6ACBE] hover:text-[#232D42] rounded-lg p-1 hover:bg-[#F6F7FB]">
                <IconX size={16} stroke={2} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <p className="text-[12.5px] leading-relaxed text-[#8A92A6]">
                <span className="text-[#232D42] font-medium">{item.title}</span>
              </p>

              <label className="block">
                <span className="block text-[11px] font-medium text-[#8A92A6] mb-1.5">Who writes it</span>
                <PreviewSelect value={owner} onChange={setOwner}
                  options={TEAM_USERS.map((u) => ({ value: u.id, label: `${u.name} — ${u.role}` }))} />
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-[#8A92A6] mb-1.5">Which brand</span>
                <PreviewSelect value={sbu} onChange={setSbu}
                  options={RADAR_SBUS.map((x) => ({ value: x, label: x }))} />
              </label>

              {failed && (
                <div className="rounded-lg bg-[#FDECEA] border border-[#F5C6C0] px-3 py-2 text-[12px] text-[#C0392B]">{failed}</div>
              )}

              <p className="text-[11.5px] leading-relaxed text-[#A6ACBE]">
                Lands on their board as <b className="font-medium text-[#8A92A6]">Content&nbsp;-&nbsp;Pending</b>,
                with this headline and its link already in the brief.
              </p>
            </div>

            <div className="flex items-center gap-2 px-5 py-3.5 border-t border-gray-100">
              <button onClick={createTask} disabled={busy}
                className="text-[13px] font-medium bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50">
                {busy ? "Creating…" : "Create task"}
              </button>
              <button onClick={() => setPicking(false)}
                className="text-[13px] text-[#8A92A6] hover:text-[#232D42] px-2">Cancel</button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}

function FeedRow({ item, onRead, showTopic, acts }: { item: FeedItem; onRead: () => void; showTopic: boolean; acts: RadarActionsState }) {
  const router = useRouter();
  const [making, setMaking] = useState(false);
  const relative = useMemo(() => {
    const diff = Date.now() - new Date(item.publishedAt).getTime();
    const h = Math.round(diff / 3_600_000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d}d ago`;
    return fmtDateShort(item.publishedAt);
  }, [item.publishedAt]);

  const src = item.source || item.alertName || "?";
  const sentiment = sentimentOf(`${item.title} ${item.snippet || ""}`);
  const flag = flagFor(item, sentiment);

  return (
    <li className="flex gap-3 px-5 py-3.5 hover:bg-[#FBFCFE] transition items-start">
      <SourceIcon url={item.link} label={src} />
      <button type="button" onClick={onRead} className="flex-1 min-w-0 text-left group flex flex-col gap-1">
        <div className="text-sm font-medium text-[#232D42] group-hover:text-brand leading-snug">
          {flag && (
            <span title={`Flagged because it ${flag.why}`}
              className={`inline-block align-[2px] mr-2 text-[10px] font-medium px-2 py-[2px] rounded-full ${FLAG_STYLE[flag.tone]}`}>
              {flag.label}
            </span>
          )}
          {item.title}
        </div>
        {/* Source and age always; the other two only when they carry information.
            "Neutral" was on roughly twenty of thirty-one rows — it is the default
            and says nothing — and the topic repeated on every row, entirely so
            once you had filtered to that topic. */}
        <div className="flex items-center gap-2 text-[11.5px] text-[#8A92A6] flex-wrap">
          <span className="font-medium text-[#4A5468]">{src}</span>
          <span className="opacity-50">·</span>
          <span>{relative}</span>
          {sentiment !== "neutral" && (
            <>
              <span className="opacity-50">·</span>
              <span className="inline-flex items-center gap-1.5" style={{ color: SENT_COLOR[sentiment] }}>
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: SENT_COLOR[sentiment] }} />{SENT_LABEL[sentiment]}
              </span>
            </>
          )}
          {showTopic && (
            <>
              <span className="opacity-50">·</span>
              <span>{item.primaryInterest}</span>
            </>
          )}
        </div>
      </button>
      {/* Write it, or say in one tap that you looked and it isn't worth writing. Both
          clear the row tonight; only one of them costs you an hour. */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Link href={studioHref(item)}
          className="inline-flex items-center justify-center gap-1 text-[11.5px] font-medium bg-brand text-white rounded-lg px-2.5 py-1.5 hover:bg-brand-dark whitespace-nowrap">
          <IconPencil size={13} stroke={1.8} /> Write this
        </Link>
        <Thumbs state={acts} kind="news" rawKey={item.id} />
      </div>
    </li>
  );
}

// The real publisher's mark, not a coloured letter. A row of "D", "N", "R" squares reads
// as filler; the NDTV and Reddit marks are recognised instantly, which is the whole job
// of an icon in a list you are scanning.
//
// The host is taken from the item's own URL rather than its `source` string, because
// source is sometimes a domain ("msn.com") and sometimes a display name ("India Today")
// and only the URL is always there. Falls back to the coloured letter when a site has no
// icon or the request fails, so a missing favicon never leaves a hole in the row.
function SourceIcon({ url, label, size = 36 }: { url: string; label: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const host = useMemo(() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  }, [url]);
  const letter = (label || host || "?").replace(/^www\./, "").charAt(0).toUpperCase();

  if (!host || failed) {
    return (
      <span className="rounded-lg grid place-items-center text-[13px] font-semibold text-white shrink-0"
        style={{ width: size, height: size, background: avatarColor(label || host || "?") }}>{letter}</span>
    );
  }
  return (
    <span className="rounded-lg grid place-items-center shrink-0 bg-white border border-gray-100 overflow-hidden"
      style={{ width: size, height: size }} title={host}>
      {/* Asking for 128 and drawing at 24: the 64px file was being shrunk into a 20px box
          and small marks like Deccan Chronicle's came out as specks. object-contain keeps
          wide wordmarks from being squashed to fit a square. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`}
        alt="" width={size - 10} height={size - 10} className="object-contain"
        onError={() => setFailed(true)} loading="lazy" />
    </span>
  );
}

// Google's official four-colour "G", drawn as vector rather than pulled from the favicon
// service the other rows use. Every other source here is somebody else's site and a
// favicon is the best mark available for it; Google's own logo is a known shape, and the
// 128px bitmap came back soft next to the crisp Reddit and NDTV marks beside it.
function GoogleMark({ size = 36 }: { size?: number }) {
  return (
    <span className="rounded-lg grid place-items-center shrink-0 bg-white border border-gray-100 overflow-hidden"
      style={{ width: size, height: size }} title="Google">
      <svg width={size - 14} height={size - 14} viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  );
}

// A brand or topic thread, in the one list. Says which lane it came from and WHY it is
// worth writing — the old page showed mentions in a panel of their own, where "someone
// is publicly doubting us" sat at the same weight as a rising search.
function RadarMentionRow({ m, lane, acts }: { m: WebMention; lane: string; acts: RadarActionsState }) {
  const neg = m.sentiment === "negative";
  const brandish = /goocampus|goo campus/i.test(`${m.title} ${m.snippet || ""}`);
  const label = neg ? "Someone doubted us" : brandish ? "Someone asked about us" : "Students are discussing this";
  const tone = neg ? "bg-[#FBE7E4] text-[#C03221]"
             : brandish ? "bg-[#FDECEA] text-[#C0392B]"
                        : "bg-[#E3F5EA] text-[#0F6E3C]";
  return (
    <li className="flex gap-3 px-5 py-3.5 hover:bg-[#FBFCFE] transition items-start">
      <SourceIcon url={m.url} label={lane} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[#232D42] leading-snug">
          <span className={`inline-block align-[2px] mr-2 text-[10px] font-medium px-2 py-[2px] rounded-full ${tone}`}>{label}</span>
          {m.title}
        </div>
        <div className="flex items-center gap-2 text-[11.5px] text-[#8A92A6] flex-wrap mt-1">
          <span className="font-medium text-[#4A5468]">{lane}</span>
          {m.snippet && <><span className="opacity-50">·</span><span className="truncate max-w-[42ch]">{m.snippet}</span></>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Link href={draftFromQuery(m.title, `From web mention: ${m.title}
Source: ${m.source || lane}
URL: ${m.url}`)}
          className="inline-flex items-center justify-center gap-1 text-[11.5px] font-medium bg-brand text-white rounded-lg px-2.5 py-1.5 hover:bg-brand-dark whitespace-nowrap">
          <IconPencil size={13} stroke={1.8} /> Write this
        </Link>
        <a href={m.url} target="_blank" rel="noreferrer"
          className="text-[11px] text-[#8A92A6] hover:text-brand whitespace-nowrap">Open</a>
        <Thumbs state={acts} kind="mention" rawKey={m.url} />
      </div>
    </li>
  );
}

// A Google review. The one row on this page where the useful action is usually not
// "write a post" — a complaint needs answering where it was left, in public, which is why
// the primary link goes to Google Maps rather than to the Scheduler. Praise keeps "Write
// this", because a testimonial in a customer's own words is the post.
function RadarReviewRow({ r, acts, mapsUrl }: {
  r: GoogleReviewLite; acts: RadarActionsState; mapsUrl: string | null;
}) {
  const bad = r.rating <= 3;
  // Google's own "5 months ago" is the fallback, because Serper does not always resolve
  // a review to a real date and "—" reads as broken.
  const when = r.publishedAt ? fmtDateShort(r.publishedAt) : r.relative || "";
  return (
    <li className="flex gap-3 px-5 py-3.5 hover:bg-[#FBFCFE] transition items-start">
      {/* Google's own mark, not the Maps pin. The pin is the icon for directions; what
          this row is, is a review left on Google. */}
      <GoogleMark />
      <div className="flex-1 min-w-0">
        {/* Two lines, at reading weight, with room before the buttons.
            A review is a paragraph, not a headline: set in medium like the news titles it
            sits beside, the whole thing read as emphasis and there was nothing left to
            emphasise the badge and stars against. It also ran the full width of the card
            and stopped a few pixels short of "Write this", which made the row look like it
            had overflowed. The rest of the text is one click away on Google. */}
        <div className="text-[13px] text-[#3B4457] leading-relaxed line-clamp-2 pr-8">
          <span className={`inline-block align-[1px] mr-2 text-[10px] font-medium px-2 py-[2px] rounded-full ${
            bad ? "bg-[#FBE7E4] text-[#C03221]" : "bg-[#E3F5EA] text-[#0F6E3C]"}`}>
            {bad ? "Unhappy customer" : "Happy customer"}
          </span>
          {/* Stars, because a rating read as "3" alone is ambiguous out of what. */}
          <span className="mr-1.5 text-[#E8A33D] tracking-tight" title={`${r.rating} out of 5`}>
            {"\u2605".repeat(r.rating)}<span className="text-[#DDE1EA]">{"\u2605".repeat(5 - r.rating)}</span>
          </span>
          {/* The review itself is the headline — there is no other title. A rating with no
              words still needs saying, so it says so rather than rendering a blank line. */}
          {r.text || <span className="text-[#8A92A6] italic font-normal">Left a rating with no comment</span>}
        </div>
        <div className="flex items-center gap-2 text-[11.5px] text-[#8A92A6] flex-wrap mt-1">
          <span className="font-medium text-[#4A5468]">{r.author}</span>
          {when && <><span className="opacity-50">·</span><span>{when}</span></>}
          <span className="opacity-50">·</span><span>Google Reviews</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {bad ? (
          <a href={r.link || mapsUrl || "#"} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#C03221] hover:underline whitespace-nowrap">
            <IconMessage2 size={13} stroke={1.8} /> Reply on Google
          </a>
        ) : !r.text ? (
          // Five stars and no words. There is nothing to quote, so offering "Write this"
          // would be a button that opens an empty draft.
          null
        ) : (
          <Link href={draftFromQuery(`What our students say`, `Google review by ${r.author} (${r.rating}/5)
${r.text}
${r.link || mapsUrl || ""}`)}
            className="inline-flex items-center justify-center gap-1 text-[11.5px] font-medium bg-brand text-white rounded-lg px-2.5 py-1.5 hover:bg-brand-dark whitespace-nowrap">
            <IconPencil size={13} stroke={1.8} /> Write this
          </Link>
        )}
        {/* No "Open" under "Reply on Google" — they were the same link twice, which made
            the wordless one-star rows three controls tall for one line of content. Praise
            keeps it, because there "Write this" goes to the Scheduler and Open goes to
            Google: two different places. */}
        {!bad && (
          <a href={r.link || mapsUrl || "#"} target="_blank" rel="noreferrer"
            className="text-[11px] text-[#8A92A6] hover:text-brand whitespace-nowrap">Open</a>
        )}
        <Thumbs state={acts} kind="review" rawKey={r.id} />
      </div>
    </li>
  );
}

// A rising search. No date and no article behind it — it is demand, not an event — so
// it carries neither an age nor an "Open".
function RadarSearchRow({ term, acts }: { term: string; acts: RadarActionsState }) {
  return (
    <li className="flex gap-3 px-5 py-3.5 hover:bg-[#FBFCFE] transition items-start">
      <SourceIcon url="https://trends.google.com" label="Google Trends" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[#232D42] leading-snug">
          <span className="inline-block align-[2px] mr-2 text-[10px] font-medium px-2 py-[2px] rounded-full bg-brand-light text-[#2138B0]">
            People are searching this
          </span>
          {term}
        </div>
        <div className="text-[11.5px] text-[#8A92A6] mt-1">
          <span className="font-medium text-[#4A5468]">Google Trends</span>
          <span className="opacity-50"> · </span>rising in India — nothing from you on this yet
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Link href={draftFromQuery(term, `Rising search: ${term}
Source: Google Trends`)}
          className="inline-flex items-center justify-center gap-1 text-[11.5px] font-medium bg-brand text-white rounded-lg px-2.5 py-1.5 hover:bg-brand-dark whitespace-nowrap">
          <IconPencil size={13} stroke={1.8} /> Write this
        </Link>
        <Thumbs state={acts} kind="search" rawKey={term} />
      </div>
    </li>
  );
}

/* -------- Trending & rising panel (free: Google Trends RSS + Autocomplete) -------- */

type TrendBreakout = {
  title: string; traffic: string; trafficNum: number; geo: string;
  picture: string | null;
  articles: { title: string; url: string; source: string | null }[];
  matched: string[];
};
type TrendIdeaGroup = { seed: string; ideas: string[] };
type TrendsResp = { breakouts: TrendBreakout[]; ideas: TrendIdeaGroup[]; geos: string[]; fetchedAt: string };

// Build a Scheduler draft link from a trending query or headline — same target
// the alert feed's "Turn into post" uses, so the whole Radar feeds one funnel.
function draftFromQuery(query: string, brief: string) {
  // Content Studio, not the Scheduler.
  //
  // This pointed at /dashboard/scheduler?draft=<everything> and NOTHING in the app ever
  // read that parameter — so every "Write this" on this page carefully packed up the
  // headline, the source and the brief, and then threw all of it away on arrival. The
  // Studio reads these, so the work actually starts where you land.
  const p = new URLSearchParams({ title: query });
  const url = firstUrl(brief);
  const src = firstSource(brief);
  if (url) p.set("url", url);
  if (src) p.set("source", src);
  return `/dashboard/preview/content-studio?${p.toString()}`;
}

// The briefs above are hand-built multi-line strings carrying a "Source:" line and a
// URL. Rather than rewrite every call site, pull those two fields back out of them.
function firstUrl(brief: string): string | null {
  return brief.match(/https?:\/\/\S+/)?.[0] || null;
}
function firstSource(brief: string): string | null {
  return brief.match(/^Source:\s*(.+)$/m)?.[1]?.trim() || null;
}

/* -------- Keyword & brand intelligence search (free: Google News + sentiment) -------- */

type MentionSentiment = "positive" | "negative" | "neutral";
type WebMention = { platform: string; title: string; url: string; source: string | null; publishedAt: string; snippet: string; sentiment: MentionSentiment };
type MentionResult = {
  query: string; mentions: WebMention[];
  counts: { positive: number; negative: number; neutral: number; total: number };
  connectors: { platform: string; icon: string; status: "live" | "needs-setup"; note: string }[];
  fetchedAt: string;
};

const SENT_STYLE: Record<MentionSentiment, { dot: string; label: string; text: string }> = {
  positive: { dot: "#1aa053", label: "Positive", text: "text-[#1aa053]" },
  negative: { dot: "#c03221", label: "Negative", text: "text-[#c03221]" },
  neutral: { dot: "#8A92A6", label: "Neutral", text: "text-[#8A92A6]" },
};

// The brand name doubles as the default query, so the panel opens on "what's the
// internet saying about us" and any keyword search reuses the exact same engine.
const BRAND_QUERY = "GooCampus";

// The places we watch for mentions. Google News is live & free today; the rest
// each need a one-time free connect — shown openly so it's clear what's on and
// what can be switched on next (ordered by value for brand reputation).
// filterKey matches a mention: "news" → platform==="news"; a domain → that site's hits.
const SOURCES: { platform: string; Icon: TablerIcon; live: boolean; filterKey: string | null; note: string }[] = [
  { platform: "Google News", Icon: IconBrandGoogle, live: true, filterKey: "news", note: "Web + press mentions. Live and free — no setup." },
  { platform: "Reddit", Icon: IconBrandReddit, live: true, filterKey: "reddit.com", note: "Candid student threads (r/IMG, r/MBBS) via web search. Add a free Serper.dev key for reliable results." },
  { platform: "Quora", Icon: IconMessageQuestion, live: true, filterKey: "quora.com", note: "'Is GooCampus genuine?' Q&A via web search — key for consultancy reputation." },
  { platform: "MouthShut", Icon: IconMessage2, live: true, filterKey: "mouthshut.com", note: "India consumer reviews / complaints on consultancies via web search." },
  { platform: "ValueMD", Icon: IconStethoscope, live: true, filterKey: "valuemd.com", note: "IMG / med-student forum threads via web search." },
  { platform: "Google Reviews", Icon: IconStar, live: false, filterKey: null, note: "Star ratings + complaints on your Google listing. Free Google Places API key." },
];

function KeywordIntel() {
  const [input, setInput] = useState(BRAND_QUERY);
  const [query, setQuery] = useState(BRAND_QUERY);
  const [res, setRes] = useState<MentionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [srcFilter, setSrcFilter] = useState<string | null>(null);   // click a source chip to filter
  const [readerMention, setReaderMention] = useState<WebMention | null>(null);   // click a mention → read inside the dashboard

  const run = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) return;
    setLoading(true); setError(null); setExpanded(false); setSrcFilter(null); setQuery(term);
    try {
      const r = await fetch(`/api/radar/search?q=${encodeURIComponent(term)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRes(d as MentionResult);
    } catch (e) {
      setError((e as Error).message); setRes(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { run(BRAND_QUERY); }, [run]);

  const isBrand = query.toLowerCase() === BRAND_QUERY.toLowerCase();
  // A mention belongs to a source when its filterKey matches: "news" → the news
  // platform; a domain → that site's hits (site hits carry platform===source===domain).
  const matchesSource = (m: WebMention, key: string) => (key === "news" ? m.platform === "news" : m.source === key || m.platform === key);
  const countFor = (key: string | null) => (key && res ? res.mentions.filter((m) => matchesSource(m, key)).length : res?.mentions.length ?? 0);
  const filtered = res ? (srcFilter ? res.mentions.filter((m) => matchesSource(m, srcFilter)) : res.mentions) : [];
  const shown = expanded ? filtered : filtered.slice(0, 8);
  const relDate = (iso: string) => {
    if (!iso || Number.isNaN(+new Date(iso))) return "";   // site hits often carry no date
    const days = Math.round((Date.now() - +new Date(iso)) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "1d ago";
    if (days < 30) return `${days}d ago`;
    return fmtDateShort(iso);
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="w-7 h-7 rounded-lg bg-brand-light text-brand grid place-items-center"><IconWorldSearch size={16} stroke={1.8} /></span>
          <div>
            <h2 className="text-base font-medium text-[#232D42] leading-tight">Search the web &amp; your brand</h2>
            <div className="text-[11px] text-[#8A92A6]">Type any keyword or your brand — see where it&apos;s mentioned online + the mood. Free · News + Reddit · Quora · MouthShut · ValueMD</div>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); run(input); }} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-[#FCFCFE] border border-gray-200 rounded-lg px-3 py-2 focus-within:border-brand/50">
            <IconSearch size={16} stroke={1.8} className="text-[#A6ACBE]" />
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. GooCampus · AMC exam 2026 · PLAB 2"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#A6ACBE]" />
          </div>
          <button type="submit" disabled={loading}
            className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50">
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[11px] text-[#A6ACBE]">Try:</span>
          {[BRAND_QUERY, "AMC exam 2026", "PLAB 2 2026", "NEET PG 2026"].map((s) => (
            <button key={s} onClick={() => { setInput(s); run(s); }}
              className="text-[11px] bg-[#FCFCFE] hover:bg-brand-light text-[#4A5468] hover:text-brand border border-gray-100 px-2 py-0.5 rounded-full transition">
              {s}
            </button>
          ))}
        </div>

        {/* Sources — where we look for mentions. One live now; the rest connect free. */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#A6ACBE] mr-0.5">Sources we scan</span>
            {SOURCES.map((s) => {
              const active = srcFilter !== null && srcFilter === s.filterKey;
              const clickable = s.live && !!s.filterKey;
              const n = s.filterKey ? countFor(s.filterKey) : 0;
              return (
                <button key={s.platform} type="button" title={clickable ? `Show only ${s.platform} mentions` : s.note}
                  onClick={() => clickable && setSrcFilter(active ? null : s.filterKey)}
                  disabled={!clickable}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition ${
                    active
                      ? "bg-brand border-brand text-white"
                      : s.live
                        ? "bg-[#1aa053]/[0.06] border-[#1aa053]/30 text-[#1aa053] hover:border-[#1aa053]/60 cursor-pointer"
                        : "bg-[#FCFCFE] border-gray-200 text-[#4A5468] cursor-default"
                  }`}>
                  <s.Icon size={15} stroke={1.8} />
                  <span className="font-medium">{s.platform}</span>
                  {s.live
                    ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-white/70 border border-[#1aa053]/20"}`}>{res ? n : "✓"}</span>
                    : <span className="text-[10px] font-semibold text-[#A6ACBE] bg-white border border-gray-200 px-1.5 py-0.5 rounded-full">+ Connect</span>}
                </button>
              );
            })}
            {srcFilter
              ? <button type="button" onClick={() => setSrcFilter(null)} className="text-[11px] font-medium text-brand hover:underline ml-1">Show all sources</button>
              : <span className="text-[11px] text-[#A6ACBE] ml-1">Tap a source to see only its mentions · {SOURCES.filter((s) => s.live).length}/{SOURCES.length} live</span>}
          </div>
        </div>
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-[#8A92A6] py-2">
            <span className="inline-block w-4 h-4 border-2 border-gray-200 border-t-brand rounded-full animate-spin" />
            Scanning the web for “{query}”…
          </div>
        )}
        {!loading && error && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">Search failed: {error}</div>
        )}
        {!loading && !error && res && (
          <>
            {/* summary line + sentiment split */}
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <div className="text-sm text-[#232D42]">
                {srcFilter
                  ? <><b>{filtered.length}</b> {SOURCES.find((s) => s.filterKey === srcFilter)?.platform ?? srcFilter} mention{filtered.length === 1 ? "" : "s"} for <b>{query}</b></>
                  : isBrand ? <><b>{res.counts.total}</b> brand mention{res.counts.total === 1 ? "" : "s"} for <b>{query}</b></>
                            : <><b>{res.counts.total}</b> result{res.counts.total === 1 ? "" : "s"} for <b>{query}</b></>}
              </div>
              <div className="flex items-center gap-1.5">
                {(["positive", "neutral", "negative"] as MentionSentiment[]).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#FCFCFE]">
                    <span className="w-2 h-2 rounded-full" style={{ background: SENT_STYLE[s].dot }} />
                    {res.counts[s]} {SENT_STYLE[s].label.toLowerCase()}
                  </span>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-xs text-[#8A92A6] bg-[#FCFCFE] border border-gray-100 rounded-lg px-3 py-2.5">
                {srcFilter
                  ? <>No {SOURCES.find((s) => s.filterKey === srcFilter)?.platform ?? srcFilter} mentions for “{query}” yet.{srcFilter !== "news" && " Add a free Serper.dev key to reliably pull this source."} <button type="button" onClick={() => setSrcFilter(null)} className="text-brand font-medium hover:underline">Show all sources</button></>
                  : <>No web mentions found for “{query}”. {isBrand ? "That can be good — or add the Serper key to widen the net." : "Try a broader phrase."}</>}
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-gray-100 -mx-1">
                {shown.map((m) => (
                  <li key={m.url} className="flex items-start gap-2.5 px-1 py-2.5">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: SENT_STYLE[m.sentiment].dot }} title={SENT_STYLE[m.sentiment].label} />
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => setReaderMention(m)} className="text-left block w-full text-sm text-[#232D42] hover:text-brand leading-snug line-clamp-2">{m.title}</button>
                      <div className="text-[11px] text-[#8A92A6] mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {m.source && <><span className="font-medium text-[#4A5468]">{m.source}</span><span className="opacity-50">·</span></>}
                        {relDate(m.publishedAt) && <><span>{relDate(m.publishedAt)}</span><span className="opacity-50">·</span></>}
                        <span className={SENT_STYLE[m.sentiment].text}>{SENT_STYLE[m.sentiment].label}</span>
                      </div>
                    </div>
                    <Link href={draftFromQuery(m.title, `From web mention: ${m.title}\nSource: ${m.source || "web"}\nURL: ${m.url}`)}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline whitespace-nowrap mt-0.5"><IconPencil size={13} stroke={1.8} /> Post</Link>
                  </li>
                ))}
              </ul>
            )}
            {filtered.length > 8 && (
              <button onClick={() => setExpanded(!expanded)} className="mt-2 text-[11px] font-medium text-brand hover:underline">
                {expanded ? "Show less" : `Show all ${filtered.length}`}
              </button>
            )}
          </>
        )}
      </div>
      {readerMention && <MentionModal m={readerMention} onClose={() => setReaderMention(null)} />}
    </section>
  );
}

// Lightweight client sentiment for feed rows (mirrors lib/web-mentions lexicon).
const SENT_POS = ["genuine", "helpful", "best", "success", "cleared", "topper", "scores", "qualify", "grateful", "trusted", "recommend", "achieved", "wins", "great"];
const SENT_NEG = ["scam", "fraud", "fake", "delay", "delayed", "postponed", "row", "protest", "worst", "warning", "rejected", "rejection", "crisis", "fails", "fail", "shortage", "concern"];
function sentimentOf(text: string): "positive" | "negative" | "neutral" {
  const s = ` ${text.toLowerCase()} `;
  let n = 0;
  for (const w of SENT_POS) if (s.includes(w)) n++;
  for (const w of SENT_NEG) if (s.includes(w)) n--;
  return n > 0 ? "positive" : n < 0 ? "negative" : "neutral";
}
const SENT_COLOR = { positive: "#1aa053", negative: "#c03221", neutral: "#8A92A6" } as const;
const SENT_LABEL = { positive: "Positive", negative: "Negative", neutral: "Neutral" } as const;
// Deterministic brand colour for a source avatar.
const AV_COLORS = ["#3A57E8", "#1aa053", "#7A74C9", "#f16a1b", "#079aa2", "#c03221"];
function avatarColor(seed: string): string {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

// The one place rising searches appear.
//
// They used to be on the page twice: a four-card "hero strip" mid-page and a
// chip cloud in the right rail — the same Google Trends data, under the same
// name, in two shapes, a scroll apart. That duplication was the single most
// confusing thing on the tab. Breakouts, which the strip showed when they
// existed, are folded in at the top here instead of getting their own band.
function SearchDemand({ trends, refreshing, onRefresh }: {
  trends: TrendsResp | null; refreshing: boolean; onRefresh: () => void;
}) {
  const breakouts = trends?.breakouts || [];
  const rising = (trends?.ideas || []).flatMap((g) => g.ideas.map((q) => ({ q, seed: g.seed })));
  const total = breakouts.length + rising.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
        <span className="w-7 h-7 rounded-lg grid place-items-center bg-brand-light text-brand">
          <IconTrendingUp size={16} stroke={1.8} />
        </span>
        <h3 className="text-sm font-medium text-[#232D42]">People are searching</h3>
        {total > 0 && <span className="text-[12px] text-[#8A92A6] tabular-nums">{total}</span>}
        <button onClick={onRefresh} disabled={refreshing} title="Refresh trends"
          className="ml-auto text-brand hover:text-brand-dark disabled:opacity-50">
          <IconRefresh size={14} stroke={1.8} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {!trends ? (
        <LoadingBlock size={18} className="!py-2 !flex-row !justify-start !gap-2" label="Loading rising searches…" />
      ) : total === 0 ? (
        <div className="px-4 py-3 text-[12px] text-[#8A92A6]">Nothing rising around your topics right now.</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {breakouts.slice(0, 3).map((b) => (
            <div key={`${b.geo}-${b.title}`} className="flex items-center gap-2.5 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[#232D42] capitalize truncate" title={b.title}>{b.title}</span>
                <span className="block text-[11px] text-[#8A92A6]">{b.geo} · {b.traffic}</span>
              </span>
              <span className="text-[10px] font-medium text-[#f16a1b] bg-[#f16a1b]/10 rounded-full px-2 py-0.5 inline-flex items-center gap-1 shrink-0">
                <IconFlame size={11} stroke={2} /> Breakout
              </span>
              <Link href={draftFromQuery(b.title, `Trending breakout: ${b.title}\nRegion: ${b.geo}`)}
                className="text-[11.5px] font-medium text-brand hover:underline shrink-0">Draft</Link>
            </div>
          ))}
          {rising.slice(0, 8).map((r) => (
            <div key={`${r.seed}-${r.q}`} className="flex items-center gap-2.5 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-[#232D42] truncate" title={r.q}>{r.q}</span>
                <span className="block text-[11px] text-[#A6ACBE] truncate">around {r.seed}</span>
              </span>
              <Link href={draftFromQuery(r.q, `Trending search idea: ${r.q}\nSource: Google Suggest (rising around "${r.seed}")`)}
                className="text-[11.5px] font-medium text-brand hover:underline shrink-0">Draft</Link>
            </div>
          ))}
        </div>
      )}
      {trends && (
        <div className="px-4 py-2 border-t border-gray-100 bg-[#FCFCFE] text-[10.5px] text-[#A6ACBE]">
          Free · Google Trends + Suggest · {trends.geos.join("/")}
        </div>
      )}
    </div>
  );
}

// ── Content Radar SEO lanes (Google Search Console for goocampusevents.com) ──
type SeoKeyword = { query: string; clicks: number; impressions: number; ctr: number; position: number };
type GscResp = { winning: SeoKeyword[]; striking: SeoKeyword[]; totals: { clicks: number; impressions: number; queries: number }; range: { from: string; to: string } };

const seoCardShell = "bg-white rounded-2xl border border-gray-100 overflow-hidden";
function SeoHeader({ Icon, title, sub }: { Icon: TablerIcon; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
      <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ color: "#1aa053", background: "rgba(26,160,83,.12)" }}><Icon size={16} stroke={1.8} /></span>
      <h3 className="text-sm font-medium text-[#232D42]">{title}</h3>
      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#A6ACBE]">{sub}</span>
    </div>
  );
}

// Fetches once, then renders both lanes (or a shared state card for
// loading / not-configured / needs-access / error / empty).
function SeoLanes() {
  const [data, setData] = useState<GscResp | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "not_configured" | "no_access" | "api_disabled" | "error">("loading");
  const [access, setAccess] = useState<{ account?: string; siteUrl?: string; enableUrl?: string }>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/website/gsc")
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 503) return setState("not_configured");
        if (r.status === 403) {
          const j = await r.json().catch(() => ({}));
          setAccess(j);
          return setState(j.error === "api_disabled" ? "api_disabled" : "no_access");
        }
        if (!r.ok) return setState("error");
        setData(await r.json());
        setState("ok");
      })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, []);

  if (state === "loading") return <><SeoSkeleton title="Your winning keywords" sub="Search Console" Icon={IconSeo} /><SeoSkeleton title="Striking-distance gaps" sub="rank 11–20" Icon={IconTargetArrow} /></>;
  if (state === "not_configured") return <><SeoConnectCard Icon={IconSeo} title="Your winning keywords" sub="Search Console" /><SeoConnectCard Icon={IconTargetArrow} title="Striking-distance gaps" sub="rank 11–20" /></>;
  if (state === "api_disabled") return <SeoEnableApiCard enableUrl={access.enableUrl} />;
  if (state === "no_access") return <SeoAccessCard account={access.account} siteUrl={access.siteUrl} />;
  if (state === "error" || !data) return (
    <div className={seoCardShell}>
      <SeoHeader Icon={IconSeo} title="Search Console" sub="error" />
      <div className="p-4 text-xs text-[#8A92A6]">Couldn&apos;t load Search Console right now. It refreshes on the next pull.</div>
    </div>
  );
  return (
    <>
      <SeoDataCard Icon={IconSeo} title="Your winning keywords" sub="Search Console" rows={data.winning} metric="clicks" empty="No page-1 keywords in this window yet." />
      <SeoDataCard Icon={IconTargetArrow} title="Striking-distance gaps" sub="rank 11–20" rows={data.striking} metric="impressions" empty="Nothing sitting on page 2 right now — that's a good thing." />
    </>
  );
}

// A ranked keyword list. `metric` decides which number leads (clicks for
// winners, impressions for opportunities). Position pill is colour-coded.
function SeoDataCard({ Icon, title, sub, rows, metric, empty }: {
  Icon: TablerIcon; title: string; sub: string; rows: SeoKeyword[]; metric: "clicks" | "impressions"; empty: string;
}) {
  return (
    <div className={seoCardShell}>
      <SeoHeader Icon={Icon} title={title} sub={sub} />
      {rows.length === 0 ? (
        <div className="p-4 text-xs text-[#8A92A6]">{empty}</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.map((r) => (
            <li key={r.query} className="flex items-center gap-2 px-4 py-2">
              <PosPill pos={r.position} />
              <span className="text-xs text-[#232D42] truncate flex-1" title={r.query}>{r.query}</span>
              <span className="text-[11px] text-[#8A92A6] tabular-nums flex-shrink-0" title={`${r.clicks} clicks · ${r.impressions} impressions · ${r.ctr}% CTR`}>
                {metric === "clicks"
                  ? <><b className="text-[#232D42]">{r.clicks.toLocaleString()}</b> click{r.clicks === 1 ? "" : "s"}</>
                  : <><b className="text-[#232D42]">{r.impressions.toLocaleString()}</b> impr</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Average rank pill: green ≤3, blue ≤10, amber ≤20.
function PosPill({ pos }: { pos: number }) {
  const c = pos <= 3 ? { fg: "#1aa053", bg: "rgba(26,160,83,.12)" } : pos <= 10 ? { fg: "#3A57E8", bg: "#E9ECFB" } : { fg: "#B26A00", bg: "rgba(245,158,11,.14)" };
  return <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md flex-shrink-0 w-9 text-center" style={{ color: c.fg, background: c.bg }}>#{pos.toFixed(1)}</span>;
}

function SeoSkeleton({ Icon, title, sub }: { Icon: TablerIcon; title: string; sub: string }) {
  return (
    <div className={seoCardShell}>
      <SeoHeader Icon={Icon} title={title} sub={sub} />
      <div className="p-4 space-y-2.5">
        <LoadingBlock size={24} className="!py-4" />
      </div>
    </div>
  );
}

// Everything is wired — the property owner just needs to add the service account
// to Search Console. Shows exactly what to add and where.
function SeoAccessCard({ account, siteUrl }: { account?: string; siteUrl?: string }) {
  return (
    <div className={seoCardShell}>
      <SeoHeader Icon={IconShieldCheck} title="One step to go live" sub="Search Console" />
      <div className="p-4 text-xs text-[#4A5468] leading-relaxed space-y-2">
        <p>Search Console is wired up. To switch it on, add this service account as a <b>Full</b> or <b>Restricted</b> user on the <b>{siteUrl || "goocampusevents.com"}</b> property:</p>
        <code className="block bg-[#FCFCFE] border border-gray-100 rounded-lg px-2.5 py-1.5 text-[11px] text-[#232D42] break-all select-all">{account || "the dashboard service account"}</code>
        <p className="text-[#A6ACBE]">Search Console → Settings → Users and permissions → Add user. Then the winning keywords + striking-distance gaps fill in automatically.</p>
      </div>
    </div>
  );
}

// The Cloud project just needs the Search Console API switched on (one click).
function SeoEnableApiCard({ enableUrl }: { enableUrl?: string }) {
  return (
    <div className={seoCardShell}>
      <SeoHeader Icon={IconShieldCheck} title="One click to go live" sub="Search Console" />
      <div className="p-4 text-xs text-[#4A5468] leading-relaxed space-y-2.5">
        <p>The service account already has access — the last step is enabling the <b>Search Console API</b> in the Google Cloud project that owns it.</p>
        {enableUrl ? (
          <a href={enableUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-brand text-white px-3 py-1.5 rounded-lg hover:bg-brand-dark">
            <IconBrandGoogle size={14} stroke={1.8} /> Enable Search Console API ↗
          </a>
        ) : (
          <p className="text-[#8A92A6]">Google Cloud Console → APIs &amp; Services → enable &ldquo;Google Search Console API&rdquo;.</p>
        )}
        <p className="text-[#A6ACBE]">Takes a few minutes to propagate, then the winning keywords + striking-distance gaps fill in automatically.</p>
      </div>
    </div>
  );
}

// Honest placeholder when GSC creds aren't configured at all.
function SeoConnectCard({ Icon, title, sub }: { Icon: TablerIcon; title: string; sub: string }) {
  return (
    <div className={seoCardShell}>
      <SeoHeader Icon={Icon} title={title} sub={sub} />
      <div className="p-4">
        <div className="text-xs text-[#8A92A6] leading-relaxed mb-3">
          Connect <b className="text-[#232D42]">Search Console</b> for goocampusevents.com to see your domain&apos;s real {title.toLowerCase()} — free, refreshes weekly.
        </div>
        <button disabled title="Setup coming next"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-brand-light text-brand px-3 py-1.5 rounded-lg opacity-70 cursor-not-allowed">
          <IconBrandGoogle size={14} stroke={1.8} /> Connect Search Console
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8">
      <div className="max-w-xl mx-auto text-center">
        <div className="text-4xl mb-3"><IconBroadcast size={40} stroke={1.4} className="mx-auto text-gray-300" /></div>
        <h2 className="text-base font-medium text-[#232D42] mb-2">Track your first topic</h2>
        <p className="text-sm text-[#4A5468] mb-5">
          Type in a topic — like <i>AMC exam 2026</i>, <i>DHA licensing</i>, or <i>NEET PG cutoff</i> — and
          the Radar pulls fresh news for it every time you hit refresh. Read the article body inline,
          then turn it into a post without leaving the dashboard.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {["AMC exam 2026", "DHA licensing UAE", "NEET PG cutoff", "AHPRA IMG registration", "PLAB 2 dates"].map((t) => (
            <span key={t} className="text-xs bg-[#F6F7FB] text-[#232D42] px-2.5 py-1 rounded-full">{t}</span>
          ))}
        </div>
        <button
          onClick={onOpenSettings}
          className="text-sm font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark"
        >
          + Add a topic
        </button>
      </div>
    </div>
  );
}

// The topics screen — "Manage alerts" as it was redesigned.
//
// The old one said everything twice. A row carried a name, then "tracking: <the same
// words>" underneath it, then an optional label field that defaulted to the topic, then
// a per-row Pull button that had stopped meaning anything once the refresh went hourly.
// Four controls and three names for one idea.
//
// What is left is what a topic actually is: the words we search for, the brand its
// stories file under, whether it is on, and how to remove it. The word "alert" is gone
// — it was Google's word for the plumbing, never the team's word for the thing.
function SettingsModal({ alerts, counts, onClose, onChanged }: {
  alerts: Alert[];
  /** Stories found per topic, for the one line under each name. */
  counts: Record<string, number>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [interest, setInterest] = useState(INTEREST_OPTIONS[0]);
  // Pasting a Google Alerts RSS URL still works, but it is one person's one-off setup
  // rather than the way topics are added, so it stays behind a line of text.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // A paused topic with the same words as a live one looks broken rather than chosen —
  // that is exactly how the stray "Neet PG" read. Say which one it repeats.
  const dupeOf = useMemo(() => {
    const live = new Map<string, string>();
    for (const a of alerts) {
      if (!a.active) continue;
      const k = (a.searchQuery || a.name || "").trim().toLowerCase();
      if (k) live.set(k, a.name);
    }
    const out: Record<string, string> = {};
    for (const a of alerts) {
      if (a.active) continue;
      const k = (a.searchQuery || a.name || "").trim().toLowerCase();
      const match = k ? live.get(k) : undefined;
      if (match) out[a.id] = match;
    }
    return out;
  }, [alerts]);

  // It runs hourly, so the date is always today and printing it is noise. Show the time
  // alone unless the last run somehow was not today, in which case the date is the news.
  const lastRun = useMemo(() => {
    const times = alerts.map((a) => a.lastFetchedAt).filter(Boolean) as string[];
    if (!times.length) return null;
    const d = new Date(times.sort().slice(-1)[0]);
    const today = d.toDateString() === new Date().toDateString();
    return today
      ? d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
      : fmtDateTime(d.toISOString());
  }, [alerts]);

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const payload: Record<string, string> = { primaryInterest: interest };
      if (showAdvanced && feedUrl.trim()) {
        if (!name.trim()) throw new Error("Give the feed a name");
        payload.name = name.trim();
        payload.feedUrl = feedUrl.trim();
      } else if (searchQuery.trim()) {
        // The topic IS the name. The old optional label existed so the two could differ,
        // and in practice they never did — it only ever produced a second thing to read.
        payload.name = searchQuery.trim();
        payload.searchQuery = searchQuery.trim();
      } else {
        throw new Error("Type a topic to watch");
      }
      const r = await fetch("/api/radar/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setSearchQuery(""); setFeedUrl(""); setName("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    setRowBusy(id);
    try {
      await fetch(`/api/radar/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      onChanged();
    } finally { setRowBusy(null); }
  }

  async function del(id: string, label: string) {
    if (!await confirmDialog({
      title: `Stop watching “${label}”?`,
      body: "The stories it already found are removed from the Radar too.",
      action: "Delete", danger: true,
    })) return;
    setRowBusy(id);
    try {
      await fetch(`/api/radar/alerts/${id}`, { method: "DELETE" });
      onChanged();
    } finally { setRowBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-[1.05rem] font-semibold text-[#232D42]">Topics you&apos;re watching</div>
            <div className="text-[13px] text-[#8A92A6] mt-0.5">
              Each topic is searched for news every hour. Results land in Content Radar.
            </div>
          </div>
          <button onClick={onClose} className="text-[#A6ACBE] hover:text-[#232D42] text-xl leading-none -mt-1">×</button>
        </div>

        {/* Add — two fields, nothing optional. */}
        <form onSubmit={addTopic} className="px-5 py-4 border-b border-gray-100 bg-[#FAFBFF]">
          {!showAdvanced ? (
            <>
              <div className="flex gap-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Add a topic — e.g. AMC exam 2026"
                  className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg border border-[#D9DEEA] bg-white focus:border-brand outline-none"
                  autoFocus
                />
                <PreviewSelect className="w-[170px] shrink-0" value={interest} onChange={setInterest}
                  options={INTEREST_OPTIONS.map((o) => ({ value: o, label: o }))} />
                <button type="submit" disabled={saving}
                  className="shrink-0 text-[13.5px] font-semibold bg-brand text-white px-4 rounded-lg hover:bg-brand-dark disabled:opacity-50">
                  {saving ? "Adding…" : "Add"}
                </button>
              </div>
              <p className="text-[12px] text-[#A6ACBE] mt-2">
                The brand decides where its stories file, and which brand is pre-filled when you write one.
              </p>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name this feed"
                  className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg border border-[#D9DEEA] bg-white focus:border-brand outline-none"
                />
                <PreviewSelect className="w-[170px] shrink-0" value={interest} onChange={setInterest}
                  options={INTEREST_OPTIONS.map((o) => ({ value: o, label: o }))} />
                <button type="submit" disabled={saving}
                  className="shrink-0 text-[13.5px] font-semibold bg-brand text-white px-4 rounded-lg hover:bg-brand-dark disabled:opacity-50">
                  {saving ? "Adding…" : "Add"}
                </button>
              </div>
              <input
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://www.google.com/alerts/feeds/…/…"
                className="w-full mt-2 text-xs px-3 py-2 rounded-lg border border-[#D9DEEA] bg-white font-mono focus:border-brand outline-none"
              />
            </>
          )}
          {error && <div className="text-xs text-[#C03221] mt-2">{error}</div>}
          <div className="mt-2">
            <button type="button" onClick={() => { setShowAdvanced(!showAdvanced); setError(null); }}
              className="text-[12px] text-[#8A92A6] underline hover:text-brand">
              {showAdvanced ? "Back to adding a topic" : "Paste a Google Alerts link instead"}
            </button>
          </div>
        </form>

        {/* Rows — one topic, one line. */}
        {alerts.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-[#8A92A6]">
            Nothing is being watched yet.
          </div>
        ) : (
          <ul>
            {alerts.map((a) => {
              const n = counts[a.id] || 0;
              const dupe = dupeOf[a.id];
              return (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3 border-b border-[#F3F5F9] last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${a.active ? "text-[#232D42]" : "text-[#8A92A6]"}`}>{a.name}</p>
                    <p className="text-[12.5px] text-[#A6ACBE] mt-0.5 truncate">
                      <b className="font-medium text-[#8A92A6]">{a.primaryInterest}</b>
                      {a.lastError
                        ? <> · <span className="text-[#C03221]">{a.lastError}</span></>
                        : dupe
                          ? <> · paused — same as “{dupe}”</>
                          : a.active
                            ? <> · {n} {n === 1 ? "story" : "stories"}</>
                            : <> · paused</>}
                    </p>
                  </div>
                  {/* The word, not a bare switch. An unlabelled toggle in the off position
                      reads as broken rather than chosen. */}
                  <button onClick={() => toggle(a.id, !a.active)} disabled={rowBusy === a.id}
                    className={`shrink-0 text-[12.5px] font-semibold px-2 py-1 rounded-md hover:bg-[#F3F5F9] disabled:opacity-50 ${
                      a.active ? "text-[#1AA053]" : "text-[#8A92A6]"}`}>
                    {a.active ? "Watching" : "Paused"}
                  </button>
                  <button onClick={() => del(a.id, a.name)} disabled={rowBusy === a.id}
                    className="shrink-0 text-[12.5px] text-[#A6ACBE] px-1.5 py-1 rounded-md hover:text-[#C03221] hover:bg-[#FDECEA] disabled:opacity-50">
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Said out loud so nobody goes hunting for the Pull button that used to be on
            every row — it refreshes itself now. */}
        <div className="flex items-center gap-2 px-5 py-3 bg-[#FAFBFF] border-t border-gray-100 text-[12.5px] text-[#A6ACBE]">
          Checked every hour{lastRun && <> · last run {lastRun}</>}
          <button onClick={onClose}
            className="ml-auto text-[13px] font-semibold bg-brand text-white px-4 py-1.5 rounded-lg hover:bg-brand-dark">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------- in-app reader modal -------- */

// Reader modal — fetches the article body via /api/radar/article (server-side
// Mozilla Readability extraction) and renders the cleaned HTML inline so the
// user never leaves the dashboard. Falls back to snippet + "Open original" if
// extraction fails.
function ReaderModal({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawHtml, setRawHtml] = useState<string>("");
  const [finalUrl, setFinalUrl] = useState<string>(item.link);
  const [articleTitle, setArticleTitle] = useState<string | null>(null);
  const [byline, setByline] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    fetch(`/api/radar/article?url=${encodeURIComponent(item.link)}`, { signal: ctrl.signal })
      .then(async (r) => {
        // Read as text first. A gateway timeout or a killed function returns an empty
        // or non-JSON body, and calling .json() on that threw "Unexpected end of JSON
        // input" — a parser message shown to someone who only wanted to read an article.
        const body = await r.text();
        type Article = { html: string; finalUrl: string; title: string | null; byline?: string | null; error?: string };
        let d = {} as Article;
        try { d = body ? (JSON.parse(body) as Article) : ({} as Article); } catch {
          throw new Error(r.ok
            ? "The reader returned something we couldn't read. Open the original instead."
            : r.status === 504 || r.status === 502
              ? "That site took too long to respond. Open the original instead."
              : `The reader failed (HTTP ${r.status}). Open the original instead.`);
        }
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d: { html: string; finalUrl: string; title: string | null; byline?: string | null; error?: string }) => {
        setRawHtml(d.html || "");
        setFinalUrl(d.finalUrl || item.link);
        setArticleTitle(d.title);
        setByline(d.byline || null);
        if (d.error && !d.html) setError(d.error);
      })
      .catch((e) => { if (e.name !== "AbortError") setError((e as Error).message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [item.link]);

  // Strip scripts / iframes / event handlers from the extracted HTML as a
  // minimal defence-in-depth. Readability already sanitises but not for our
  // exact threat model, so we double-check.
  const html = useMemo(() => {
    if (!rawHtml) return "";
    return rawHtml
      .replace(/<(script|iframe|object|embed|noscript)[\s\S]*?<\/\1>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "");
  }, [rawHtml]);


  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-[#8A92A6] flex items-center gap-2 mb-1">
              <span className="font-medium text-brand">{item.primaryInterest}</span>
              <span>·</span>
              <span>{item.source || "unknown"}</span>
              <span>·</span>
              <span>{fmtDateTime(item.publishedAt)}</span>
            </div>
            <h2 className="text-base font-medium text-[#232D42] leading-snug">
              {item.title || articleTitle}
            </h2>
            {byline && <div className="text-xs text-[#8A92A6] mt-1 italic">{byline}</div>}
          </div>
          <button onClick={onClose} className="text-[#A6ACBE] hover:text-[#232D42] text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="text-center py-10">
              <LoadingBlock className="!py-0" label="Loading article inside the dashboard…" />
            </div>
          )}
          {!loading && error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
              <div className="text-sm font-semibold text-rose-900 mb-1">Couldn&apos;t pull the article body.</div>
              <div className="text-xs text-rose-700 mb-3">{error}</div>
              <div className="text-xs text-[#4A5468] mb-3">
                Here&apos;s the summary we have:
              </div>
              <div className="text-sm text-[#232D42] bg-white border border-gray-200 rounded p-3">
                {item.snippet || "(no snippet)"}
              </div>
            </div>
          )}
          {!loading && !error && html && (
            <article
              className="reader-content"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          {/* Reader typography — inline so we don't need @tailwindcss/typography */}
          <style jsx>{`
            :global(.reader-content) { color: #1F2937; font-size: 14.5px; line-height: 1.7; }
            :global(.reader-content h1) { font-size: 22px; font-weight: 600; margin: 24px 0 12px; color: #111827; line-height: 1.3; }
            :global(.reader-content h2) { font-size: 18px; font-weight: 600; margin: 22px 0 10px; color: #111827; line-height: 1.35; }
            :global(.reader-content h3) { font-size: 16px; font-weight: 600; margin: 18px 0 8px; color: #111827; }
            :global(.reader-content p) { margin: 12px 0; }
            :global(.reader-content a) { color: #3A57E8; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
            :global(.reader-content a:hover) { color: #2138B0; }
            :global(.reader-content ul), :global(.reader-content ol) { margin: 12px 0; padding-left: 24px; }
            :global(.reader-content li) { margin: 4px 0; }
            :global(.reader-content blockquote) { border-left: 3px solid #E5E7EB; padding: 4px 0 4px 14px; margin: 14px 0; color: #4B5563; font-style: italic; }
            :global(.reader-content img) { max-width: 100%; height: auto; border-radius: 8px; margin: 14px 0; }
            :global(.reader-content code) { background: #F3F4F6; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
            :global(.reader-content pre) { background: #F9FAFB; border: 1px solid #E5E7EB; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 14px 0; }
            :global(.reader-content pre code) { background: transparent; padding: 0; }
            :global(.reader-content hr) { border: 0; border-top: 1px solid #E5E7EB; margin: 22px 0; }
            :global(.reader-content table) { border-collapse: collapse; margin: 14px 0; width: 100%; }
            :global(.reader-content th), :global(.reader-content td) { border: 1px solid #E5E7EB; padding: 6px 10px; text-align: left; font-size: 13px; }
            :global(.reader-content th) { background: #F9FAFB; font-weight: 600; }
          `}</style>
          {!loading && !error && !html && (
            <div className="text-sm text-[#8A92A6] italic">The reader returned nothing for this URL.</div>
          )}
        </div>

        {/* Footer actions. Same px-6 py-4 as the header — it was py-3 with a grey
            tint against the header's white, so the two ends of the dialog did not
            line up. */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          {/* The same control as the feed row. This used to be a link that
              generated a draft and navigated away, so one headline behaved two
              different ways depending on where you clicked it. */}
          <Link href={studioHref(item)}
            className="text-xs font-medium bg-brand text-white px-3 py-1.5 rounded-md hover:bg-brand-dark">
            <IconPencil size={13} stroke={1.8} className="inline -mt-0.5 mr-1" />Write this
          </Link>
          <a
            href={finalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#4A5468] hover:text-brand"
          >
            Open on {new URL(finalUrl).hostname.replace(/^www\./, "")} ↗
          </a>
          <button
            onClick={onClose}
            className="ml-auto text-xs text-[#8A92A6] hover:text-[#232D42]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------- inline mention reader -------- */
// Reddit → full thread + comments via the official API (/api/radar/reddit-thread,
// app-only OAuth — bypasses Reddit's scrape wall). Quora → snippet only (no API,
// login-walled). MouthShut/ValueMD/news → full inline read via Readability
// (/api/radar/article). Everything renders inside the dashboard.
type RThread = { title: string; author: string; subreddit: string; selftext: string; score: number; numComments: number; comments: { author: string; body: string; score: number; createdUtc: number }[]; permalink: string };
function MentionModal({ m, onClose }: { m: WebMention; onClose: () => void }) {
  const isReddit = m.source === "reddit.com";
  const isQuora = m.source === "quora.com";
  const useArticle = !isReddit && !isQuora;   // public sites → Readability reader
  const host = (() => { try { return new URL(m.url).hostname.replace(/^www\./, ""); } catch { return m.source || "the site"; } })();

  // Readability reader (MouthShut / ValueMD / news)
  const [loading, setLoading] = useState(useArticle);
  const [rawHtml, setRawHtml] = useState("");
  const [readErr, setReadErr] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState(m.url);
  useEffect(() => {
    if (!useArticle) return;
    const ctrl = new AbortController();
    setLoading(true); setReadErr(null);
    fetch(`/api/radar/article?url=${encodeURIComponent(m.url)}`, { signal: ctrl.signal })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
      .then((d: { html: string; finalUrl: string; error?: string }) => {
        setRawHtml(d.html || ""); setFinalUrl(d.finalUrl || m.url);
        if (d.error && !d.html) setReadErr(d.error);
      })
      .catch((e) => { if ((e as Error).name !== "AbortError") setReadErr((e as Error).message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [m.url, useArticle]);
  const html = useMemo(() => (rawHtml
    ? rawHtml.replace(/<(script|iframe|object|embed|noscript)[\s\S]*?<\/\1>/gi, "").replace(/\son\w+="[^"]*"/gi, "")
    : ""), [rawHtml]);

  // Reddit official-API thread + comments
  const [rLoading, setRLoading] = useState(isReddit);
  const [thread, setThread] = useState<RThread | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [rErr, setRErr] = useState<string | null>(null);
  useEffect(() => {
    if (!isReddit) return;
    const ctrl = new AbortController();
    setRLoading(true); setRErr(null); setNeedsAuth(false);
    fetch(`/api/radar/reddit-thread?url=${encodeURIComponent(m.url)}`, { signal: ctrl.signal })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
      .then((d: RThread & { needsAuth?: boolean }) => { if (d.needsAuth) setNeedsAuth(true); else setThread(d); })
      .catch((e) => { if ((e as Error).name !== "AbortError") setRErr((e as Error).message); })
      .finally(() => setRLoading(false));
    return () => ctrl.abort();
  }, [m.url, isReddit]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-[#8A92A6] flex items-center gap-2 mb-1">
              <span className="font-medium text-brand">{thread?.subreddit || m.source || host}</span><span>·</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SENT_STYLE[m.sentiment].dot }} />{SENT_STYLE[m.sentiment].label}</span>
              {thread && <><span>·</span><span>▲ {thread.score} · {thread.numComments} comments</span></>}
            </div>
            <h2 className="text-base font-medium text-[#232D42] leading-snug">{m.title}</h2>
          </div>
          <button onClick={onClose} className="text-[#A6ACBE] hover:text-[#232D42] text-2xl leading-none shrink-0">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {m.snippet && <div className="text-sm text-[#232D42] bg-[#FCFCFE] border border-gray-100 rounded-lg p-3 mb-4">{m.snippet}</div>}

          {/* Reddit — full thread + comments via the official API */}
          {isReddit && rLoading && <LoadingBlock label="Loading the Reddit thread…" />}
          {isReddit && !rLoading && thread && (
            <div>
              {thread.selftext && <p className="text-sm text-[#232D42] whitespace-pre-wrap mb-4 leading-relaxed">{thread.selftext}</p>}
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#A6ACBE] mb-2">{thread.comments.length} top comment{thread.comments.length === 1 ? "" : "s"}</div>
              <ul className="flex flex-col gap-3">
                {thread.comments.map((c, i) => (
                  <li key={i} className="border-l-2 border-gray-100 pl-3">
                    <div className="text-[11px] text-[#8A92A6] mb-0.5"><span className="font-medium text-[#232D42]">u/{c.author}</span> · ▲ {c.score}</div>
                    <div className="text-sm text-[#232D42] whitespace-pre-wrap leading-relaxed">{c.body}</div>
                  </li>
                ))}
                {thread.comments.length === 0 && <li className="text-xs text-[#8A92A6]">No comments on this thread yet.</li>}
              </ul>
            </div>
          )}
          {isReddit && !rLoading && !thread && needsAuth && (
            <div className="text-xs text-[#4A5468] bg-brand-light/50 border border-brand/15 rounded-lg p-3"><IconBook size={13} stroke={1.8} className="inline -mt-0.5 mr-1" />The full thread + all comments open on Reddit — use the button below.</div>
          )}
          {isReddit && !rLoading && !thread && !needsAuth && rErr && (
            <div className="text-xs text-[#8A92A6]">Couldn&apos;t load the thread ({rErr}). The snippet above is the preview — use “Open on reddit.com”.</div>
          )}

          {/* Quora — no API, login-walled */}
          {isQuora && <div className="text-xs text-[#4A5468] bg-brand-light/50 border border-brand/15 rounded-lg p-3">Quora has no API and requires login, so we preview the snippet here. Use <b>Open on {host}</b> to read the full answer.</div>}

          {/* Public sites (MouthShut / ValueMD / news) — Readability reader */}
          {useArticle && loading && <LoadingBlock label="Loading the full page inside the dashboard…" />}
          {useArticle && !loading && html && <article className="reader-content" dangerouslySetInnerHTML={{ __html: html }} />}
          {useArticle && !loading && !html && (
            <div className="text-xs text-[#8A92A6]">{readErr ? `Couldn't load the full page (${readErr}). ` : ""}The preview above is what we have — use “Open on {host}” for the full text.</div>
          )}
          <style jsx>{`
            :global(.reader-content){ color:#1F2937; font-size:14.5px; line-height:1.7; }
            :global(.reader-content h1),:global(.reader-content h2),:global(.reader-content h3){ font-weight:600; color:#111827; margin:16px 0 8px; }
            :global(.reader-content p){ margin:10px 0; }
            :global(.reader-content a){ color:#3A57E8; text-decoration:underline; }
            :global(.reader-content ul),:global(.reader-content ol){ margin:10px 0; padding-left:22px; }
            :global(.reader-content img){ max-width:100%; height:auto; border-radius:8px; margin:12px 0; }
          `}</style>
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-[#FCFCFE] flex items-center gap-3">
          <Link href={draftFromQuery(m.title, `From web mention: ${m.title}\nSource: ${m.source || host}\nURL: ${finalUrl}\n\n${m.snippet || ""}`)} className="text-xs font-medium bg-brand text-white px-3 py-1.5 rounded-md hover:bg-brand-dark"><IconPencil size={13} stroke={1.8} className="inline -mt-0.5 mr-1" />Write this</Link>
          <a href={thread?.permalink || finalUrl} target="_blank" rel="noreferrer" className="text-xs font-medium bg-brand-light text-brand border border-brand/20 px-3 py-1.5 rounded-md hover:bg-brand hover:text-white transition">{isReddit ? <><IconBook size={13} stroke={1.8} className="inline -mt-0.5 mr-1" />Read full thread on Reddit ↗</> : `Open on ${host} ↗`}</a>
          <button onClick={onClose} className="ml-auto text-xs text-[#8A92A6] hover:text-[#232D42]">Close</button>
        </div>
      </div>
    </div>
  );
}
