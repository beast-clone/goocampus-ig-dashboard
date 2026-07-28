"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { HopeSelect } from "@/app/(dashboard)/dashboard/hope-preview/HopeSelect";
import { LiveIndicator } from "@/components/LiveIndicator";
import {
  IconSearch, IconTrendingUp, IconFlame, IconNews, IconRefresh, IconPencil,
  IconBrandReddit, IconBrandGoogle, IconStar, IconMessageQuestion, IconMessage2, IconStethoscope,
  IconTargetArrow, IconSeo, IconWorldSearch, IconShieldCheck,
} from "@tabler/icons-react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import { fmtDateShort, fmtDateTime } from "@/lib/date";

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
    <HopeDashboardShell active="radar" title="Content Radar" subtitle="What's trending in your domain right now — news, search, your SEO and brand mentions — turned into a post in one click." hideAccountPicker>
      {() => <Radar />}
    </HopeDashboardShell>
  );
}

function Radar() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [activeInterest, setActiveInterest] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // In-app reader — set to an item when the user clicks a headline.
  const [readerItem, setReaderItem] = useState<FeedItem | null>(null);
  // Free trend signals (Google Trends RSS breakouts + autocomplete ideas).
  const [trends, setTrends] = useState<TrendsResp | null>(null);
  const [trendsRefreshing, setTrendsRefreshing] = useState(false);
  // Real brand mentions (Google News search for the brand) — powers the pulse
  // row's brand tile and the Brand-watch card.
  const [brand, setBrand] = useState<MentionResult | null>(null);

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

  useEffect(() => {
    fetch(`/api/radar/search?q=${encodeURIComponent(BRAND_QUERY)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setBrand(d as MentionResult); })
      .catch(() => { /* brand watch is best-effort */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [activeInterest]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <>
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-xs text-gray-500">
            {alerts.filter((a) => a.active).length} active alert{alerts.filter((a) => a.active).length === 1 ? "" : "s"} ·{" "}
            {items.length} headline{items.length === 1 ? "" : "s"} in the last pull
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={load} />
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="text-xs font-medium bg-white text-brand border border-brand/30 px-3 py-1.5 rounded-lg hover:bg-brand-light disabled:opacity-50"
          >
            {refreshing ? "Refreshing feeds…" : "↻ Pull latest from Google"}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-xs font-medium bg-brand text-white px-3 py-1.5 rounded-lg hover:bg-brand-dark"
          >
            ⚙ Manage alerts
          </button>
        </div>
      </div>

      {banner && (
        <div className="bg-brand-light/50 border border-brand/20 rounded-lg px-3 py-2 mb-4 text-[12px] text-brand flex items-center justify-between">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="text-brand/70 hover:text-brand text-sm">×</button>
        </div>
      )}

      {/* Pulse row — at-a-glance stats from real signals (brand mentions first, on top) */}
      <PulseRow brand={brand} trends={trends} items={items} />

      {/* Keyword & brand search — "what's the internet saying about X" (below the pulse) */}
      <div id="sec-mentions" className="scroll-mt-24"><KeywordIntel /></div>

      {/* Hero strip — breakouts if any, else the top rising searches */}
      <div id="sec-rising" className="scroll-mt-24"><BreakoutStrip trends={trends} refreshing={trendsRefreshing} onRefresh={() => loadTrends(true)} /></div>

      {/* Empty state (no topics tracked yet) */}
      {!loading && alerts.length === 0 && (
        <EmptyState onOpenSettings={() => setSettingsOpen(true)} />
      )}

      {/* Two-column: unified feed (left) + rising / SEO sidebar (right) */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] gap-4 items-start">
          {/* LEFT — News feed */}
          <section id="sec-headlines" className="scroll-mt-24 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 flex-wrap">
              <IconNews size={17} stroke={1.8} className="text-brand" />
              <h2 className="text-base font-medium text-[#232D42]">Latest in your domain</h2>
              <span className="text-xs text-gray-500">· {items.length} news headline{items.length === 1 ? "" : "s"}</span>
              {interestChips.length > 1 && (
                <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                  {interestChips.map((i) => (
                    <button key={i} onClick={() => setActiveInterest(i)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                        activeInterest === i ? "bg-brand text-white border-brand" : "bg-white text-gray-600 border-gray-200 hover:border-brand/40"
                      }`}>
                      {i === "all" ? "All" : i}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {items.length === 0 && !loading ? (
              <div className="p-8 text-center">
                <div className="text-sm text-gray-700 mb-1">No cached items yet.</div>
                <div className="text-xs text-gray-500 mb-4">Hit &quot;Pull latest from Google&quot; to fetch your feeds for the first time.</div>
                <button onClick={refreshAll} disabled={refreshing}
                  className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50">
                  {refreshing ? "Fetching…" : "Pull latest from Google"}
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((it) => (
                  <FeedRow key={it.id} item={it} onRead={() => setReaderItem(it)} />
                ))}
              </ul>
            )}
          </section>

          {/* RIGHT — rising searches + your-SEO (Brand watch moved up top) */}
          <aside className="flex flex-col gap-4">
            <RisingSidebar trends={trends} />
            <SeoLanes />
          </aside>
        </div>
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal
          alerts={alerts}
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

function FeedRow({ item, onRead }: { item: FeedItem; onRead: () => void }) {
  // Compose a query string that pre-fills the Scheduler's create-post modal with
  // the headline + snippet + interest so the user can go straight to writing.
  const draftHref = useMemo(() => {
    const p = new URLSearchParams({
      title: item.title,
      brief: `Headline: ${item.title}\nSource: ${item.source || "unknown"}\nURL: ${item.link}\n\n${item.snippet}`,
      interest: item.primaryInterest,
    });
    return `/dashboard/scheduler?draft=${encodeURIComponent(p.toString())}`;
  }, [item]);

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

  return (
    <li className="flex gap-3 px-5 py-3.5 hover:bg-[#FBFCFE] transition items-start">
      <span className="w-[34px] h-[34px] rounded-lg grid place-items-center text-[13px] font-semibold text-white shrink-0"
        style={{ background: avatarColor(src) }}>
        {src.replace(/^www\./, "").charAt(0).toUpperCase()}
      </span>
      <button type="button" onClick={onRead} className="flex-1 min-w-0 text-left group flex flex-col gap-1">
        <div className="text-sm font-medium text-[#232D42] group-hover:text-brand leading-snug">{item.title}</div>
        <div className="flex items-center gap-2 text-[11.5px] text-gray-500 flex-wrap">
          <span className="font-medium text-gray-600">{src}</span>
          <span className="opacity-50">·</span>
          <span>{relative}</span>
          <span className="opacity-50">·</span>
          <span className="inline-flex items-center gap-1.5" style={{ color: SENT_COLOR[sentiment] }}>
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: SENT_COLOR[sentiment] }} />{SENT_LABEL[sentiment]}
          </span>
          <span className="opacity-50">·</span>
          <span>{item.primaryInterest}</span>
        </div>
      </button>
      <Link href={draftHref}
        className="shrink-0 self-center inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand border border-gray-100 px-3 py-1.5 rounded-lg hover:bg-brand-light hover:border-brand/30 whitespace-nowrap">
        <IconPencil size={13} stroke={1.8} /> Post
      </Link>
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
  const p = new URLSearchParams({ title: query, brief });
  return `/dashboard/scheduler?draft=${encodeURIComponent(p.toString())}`;
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
  neutral: { dot: "#8A92A6", label: "Neutral", text: "text-gray-500" },
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
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="w-7 h-7 rounded-lg bg-brand-light text-brand grid place-items-center"><IconWorldSearch size={16} stroke={1.8} /></span>
          <div>
            <h2 className="text-base font-medium text-[#232D42] leading-tight">Search the web &amp; your brand</h2>
            <div className="text-[11px] text-gray-500">Type any keyword or your brand — see where it&apos;s mentioned online + the mood. Free · News + Reddit · Quora · MouthShut · ValueMD</div>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); run(input); }} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-brand/50">
            <IconSearch size={16} stroke={1.8} className="text-gray-400" />
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. GooCampus · AMC exam 2026 · PLAB 2"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
          </div>
          <button type="submit" disabled={loading}
            className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50">
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[11px] text-gray-400">Try:</span>
          {[BRAND_QUERY, "AMC exam 2026", "PLAB 2 2026", "NEET PG 2026"].map((s) => (
            <button key={s} onClick={() => { setInput(s); run(s); }}
              className="text-[11px] bg-gray-50 hover:bg-brand-light text-gray-600 hover:text-brand border border-gray-100 px-2 py-0.5 rounded-full transition">
              {s}
            </button>
          ))}
        </div>

        {/* Sources — where we look for mentions. One live now; the rest connect free. */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-0.5">Sources we scan</span>
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
                        : "bg-gray-50 border-gray-200 text-gray-600 cursor-default"
                  }`}>
                  <s.Icon size={15} stroke={1.8} />
                  <span className="font-medium">{s.platform}</span>
                  {s.live
                    ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-white/70 border border-[#1aa053]/20"}`}>{res ? n : "✓"}</span>
                    : <span className="text-[10px] font-semibold text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded-full">+ Connect</span>}
                </button>
              );
            })}
            {srcFilter
              ? <button type="button" onClick={() => setSrcFilter(null)} className="text-[11px] font-medium text-brand hover:underline ml-1">Show all sources</button>
              : <span className="text-[11px] text-gray-400 ml-1">Tap a source to see only its mentions · {SOURCES.filter((s) => s.live).length}/{SOURCES.length} live</span>}
          </div>
        </div>
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
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
                  <span key={s} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-50">
                    <span className="w-2 h-2 rounded-full" style={{ background: SENT_STYLE[s].dot }} />
                    {res.counts[s]} {SENT_STYLE[s].label.toLowerCase()}
                  </span>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
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
                      <button type="button" onClick={() => setReaderMention(m)} className="text-left block w-full text-sm text-gray-900 hover:text-brand leading-snug line-clamp-2">{m.title}</button>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {m.source && <><span className="font-medium text-gray-600">{m.source}</span><span className="opacity-50">·</span></>}
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

// Pulse row — four at-a-glance stat tiles built from real signals.
function PulseRow({ brand, trends, items }: { brand: MentionResult | null; trends: TrendsResp | null; items: FeedItem[] }) {
  const risingCount = trends ? trends.ideas.reduce((s, g) => s + g.ideas.length, 0) : 0;
  const breakoutCount = trends?.breakouts.length ?? 0;
  const c = brand?.counts;
  const total = c?.total ?? 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const jump = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
      {/* brand mentions + sentiment bar → jumps to the mentions list */}
      <div role="button" tabIndex={0} onClick={jump("sec-mentions")} className="bg-white rounded-lg border border-gray-100 p-4 flex flex-col gap-2.5 cursor-pointer hover:border-brand/40 transition">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-brand-light text-brand"><IconShieldCheck size={15} stroke={1.8} /></span>
          <span className="text-[11.5px] text-gray-500 font-medium">Brand mentions · 30d</span>
        </div>
        <div className="text-2xl font-semibold text-[#232D42] leading-none">{total}<span className="text-xs font-medium text-gray-400"> {total === 1 ? "mention" : "mentions"}</span></div>
        {total > 0 ? (
          <>
            <div className="h-1.5 rounded-full flex overflow-hidden bg-gray-100">
              <span style={{ width: `${pct(c!.positive)}%`, background: "#1aa053" }} />
              <span style={{ width: `${pct(c!.neutral)}%`, background: "#8A92A6" }} />
              <span style={{ width: `${pct(c!.negative)}%`, background: "#c03221" }} />
            </div>
            <div className="text-[11px] text-gray-500"><b className="text-[#1aa053]">{c!.positive} pos</b> · {c!.neutral} neu · <b className="text-[#c03221]">{c!.negative} neg</b></div>
          </>
        ) : (
          <div className="text-[11px] text-gray-400">Connect Reddit / Reviews to widen brand coverage</div>
        )}
      </div>
      {/* rising */}
      <PulseTile icon={<IconTrendingUp size={15} stroke={1.8} />} tint="#1aa053" bg="rgba(26,160,83,.1)"
        label="Rising searches" value={risingCount} meta="around your tracked topics" onClick={jump("sec-rising")} />
      {/* headlines */}
      <PulseTile icon={<IconNews size={15} stroke={1.8} />} tint="#3a57e8" bg="rgba(58,87,232,.1)"
        label="Headlines today" value={items.length} meta="from your tracked topics" onClick={jump("sec-headlines")} />
      {/* breakouts */}
      <PulseTile icon={<IconFlame size={15} stroke={1.8} />} tint="#f16a1b" bg="rgba(241,106,27,.1)"
        label="Breakouts" value={breakoutCount} meta="national spikes in your niche" onClick={jump("sec-rising")} />
    </div>
  );
}
function PulseTile({ icon, tint, bg, label, value, meta, onClick }: { icon: React.ReactNode; tint: string; bg: string; label: string; value: number; meta: string; onClick?: () => void }) {
  return (
    <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} className={`bg-white rounded-lg border border-gray-100 p-4 flex flex-col gap-2.5${onClick ? " cursor-pointer hover:border-brand/40 transition" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ color: tint, background: bg }}>{icon}</span>
        <span className="text-[11.5px] text-gray-500 font-medium">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-[#232D42] leading-none">{value}</div>
      <div className="text-[11px] text-gray-400">{meta}</div>
    </div>
  );
}


// Hero strip — real Google Trends breakouts when they exist, otherwise the top
// rising searches, so the strip is never empty and never fabricated.
function BreakoutStrip({ trends, refreshing, onRefresh }: {
  trends: TrendsResp | null; refreshing: boolean; onRefresh: () => void;
}) {
  if (!trends) return null;
  const hasBreak = trends.breakouts.length > 0;
  const rising = trends.ideas.flatMap((g) => g.ideas.map((q) => ({ q, seed: g.seed }))).slice(0, 4);
  if (!hasBreak && rising.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        {hasBreak ? (
          <><span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#f16a1b]"><IconFlame size={14} stroke={1.8} /> Breakout this week</span>
            <span className="text-[11px] text-gray-400">national search breakouts in your niche</span></>
        ) : (
          <><span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#1aa053]"><IconTrendingUp size={14} stroke={1.8} /> Rising searches</span>
            <span className="text-[11px] text-gray-400">what people are searching around your topics — tap to draft</span></>
        )}
        <span className="ml-auto text-[10px] text-gray-400">Free · Google Trends + Suggest · {trends.geos.join("/")}</span>
        <button onClick={onRefresh} disabled={refreshing}
          className="inline-flex items-center text-brand hover:text-brand-dark disabled:opacity-50" title="Refresh trends">
          <IconRefresh size={14} stroke={1.8} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {hasBreak
          ? trends.breakouts.slice(0, 4).map((b) => (
            <div key={`${b.geo}-${b.title}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-brand/30 transition flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#f16a1b] bg-[#f16a1b]/10 px-2 py-0.5 rounded-full"><IconFlame size={12} stroke={2} /> {b.traffic}</span>
                <span className="text-[10px] text-gray-500">{b.geo}</span>
              </div>
              <div className="text-sm font-medium text-gray-900 capitalize leading-snug">{b.title}</div>
              {b.articles[0] && <div className="text-[11px] text-gray-500 line-clamp-2">{b.articles[0].title}</div>}
              <Link href={draftFromQuery(b.title, `Trending breakout: ${b.title}\nRegion: ${b.geo}`)}
                className="mt-auto inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"><IconPencil size={13} stroke={1.8} /> Turn into post</Link>
            </div>
          ))
          : rising.map((r) => (
            <div key={r.q} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-brand/30 transition flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1aa053] bg-[#1aa053]/10 px-2 py-0.5 rounded-full"><IconTrendingUp size={12} stroke={2} /> Rising</span>
                <span className="text-[10px] text-gray-500 truncate">{r.seed}</span>
              </div>
              <div className="text-sm font-medium text-gray-900 leading-snug capitalize">{r.q}</div>
              <Link href={draftFromQuery(r.q, `Trending search idea: ${r.q}\nSource: Google Suggest (rising around "${r.seed}")`)}
                className="mt-auto inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"><IconPencil size={13} stroke={1.8} /> Turn into post</Link>
            </div>
          ))}
      </div>
    </div>
  );
}

// Sidebar: real rising searches grouped by the topics you track.
function RisingSidebar({ trends }: { trends: TrendsResp | null }) {
  const groups = trends?.ideas || [];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
        <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ color: "#6f42c1", background: "rgba(111,66,193,.12)" }}><IconTrendingUp size={16} stroke={1.8} /></span>
        <h3 className="text-sm font-medium text-[#232D42]">Rising searches</h3>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-gray-400">Google Trends</span>
      </div>
      <div className="p-3">
        {groups.length === 0 ? (
          <div className="text-xs text-gray-500 px-1 py-2">Loading rising searches…</div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <div key={g.seed}>
                <div className="text-[11px] font-medium text-gray-500 mb-1.5">{g.seed}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.ideas.slice(0, 6).map((q) => (
                    <Link key={q}
                      href={draftFromQuery(q, `Trending search idea: ${q}\nSource: Google Suggest (rising around "${g.seed}")`)}
                      className="text-[11px] bg-gray-50 hover:bg-brand-light text-gray-700 hover:text-brand border border-gray-100 hover:border-brand/30 px-2 py-1 rounded-full transition">
                      {q}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Content Radar SEO lanes (Google Search Console for goocampusevents.com) ──
type SeoKeyword = { query: string; clicks: number; impressions: number; ctr: number; position: number };
type GscResp = { winning: SeoKeyword[]; striking: SeoKeyword[]; totals: { clicks: number; impressions: number; queries: number }; range: { from: string; to: string } };

const seoCardShell = "bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden";
function SeoHeader({ Icon, title, sub }: { Icon: TablerIcon; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
      <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ color: "#1aa053", background: "rgba(26,160,83,.12)" }}><Icon size={16} stroke={1.8} /></span>
      <h3 className="text-sm font-medium text-[#232D42]">{title}</h3>
      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-gray-400">{sub}</span>
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
      <div className="p-4 text-xs text-gray-500">Couldn&apos;t load Search Console right now. It refreshes on the next pull.</div>
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
        <div className="p-4 text-xs text-gray-500">{empty}</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.map((r) => (
            <li key={r.query} className="flex items-center gap-2 px-4 py-2">
              <PosPill pos={r.position} />
              <span className="text-xs text-[#232D42] truncate flex-1" title={r.query}>{r.query}</span>
              <span className="text-[11px] text-gray-500 tabular-nums flex-shrink-0" title={`${r.clicks} clicks · ${r.impressions} impressions · ${r.ctr}% CTR`}>
                {metric === "clicks"
                  ? <><b className="text-gray-700">{r.clicks.toLocaleString()}</b> click{r.clicks === 1 ? "" : "s"}</>
                  : <><b className="text-gray-700">{r.impressions.toLocaleString()}</b> impr</>}
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
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: `${90 - i * 12}%` }} />)}
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
      <div className="p-4 text-xs text-gray-600 leading-relaxed space-y-2">
        <p>Search Console is wired up. To switch it on, add this service account as a <b>Full</b> or <b>Restricted</b> user on the <b>{siteUrl || "goocampusevents.com"}</b> property:</p>
        <code className="block bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-700 break-all select-all">{account || "the dashboard service account"}</code>
        <p className="text-gray-400">Search Console → Settings → Users and permissions → Add user. Then the winning keywords + striking-distance gaps fill in automatically.</p>
      </div>
    </div>
  );
}

// The Cloud project just needs the Search Console API switched on (one click).
function SeoEnableApiCard({ enableUrl }: { enableUrl?: string }) {
  return (
    <div className={seoCardShell}>
      <SeoHeader Icon={IconShieldCheck} title="One click to go live" sub="Search Console" />
      <div className="p-4 text-xs text-gray-600 leading-relaxed space-y-2.5">
        <p>The service account already has access — the last step is enabling the <b>Search Console API</b> in the Google Cloud project that owns it.</p>
        {enableUrl ? (
          <a href={enableUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-brand text-white px-3 py-1.5 rounded-lg hover:bg-brand-dark">
            <IconBrandGoogle size={14} stroke={1.8} /> Enable Search Console API ↗
          </a>
        ) : (
          <p className="text-gray-500">Google Cloud Console → APIs &amp; Services → enable &ldquo;Google Search Console API&rdquo;.</p>
        )}
        <p className="text-gray-400">Takes a few minutes to propagate, then the winning keywords + striking-distance gaps fill in automatically.</p>
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
        <div className="text-xs text-gray-500 leading-relaxed mb-3">
          Connect <b className="text-gray-700">Search Console</b> for goocampusevents.com to see your domain&apos;s real {title.toLowerCase()} — free, refreshes weekly.
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
    <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
      <div className="max-w-xl mx-auto text-center">
        <div className="text-4xl mb-3">📡</div>
        <h2 className="text-base font-medium text-[#232D42] mb-2">Track your first topic</h2>
        <p className="text-sm text-gray-600 mb-5">
          Type in a topic — like <i>AMC exam 2026</i>, <i>DHA licensing</i>, or <i>NEET PG cutoff</i> — and
          the Radar pulls fresh news for it every time you hit refresh. Read the article body inline,
          then turn it into a post without leaving the dashboard.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {["AMC exam 2026", "DHA licensing UAE", "NEET PG cutoff", "AHPRA IMG registration", "PLAB 2 dates"].map((t) => (
            <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{t}</span>
          ))}
        </div>
        <button
          onClick={onOpenSettings}
          className="text-sm font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark"
        >
          + Track a topic
        </button>
      </div>
    </div>
  );
}

function SettingsModal({ alerts, onClose, onChanged }: {
  alerts: Alert[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [interest, setInterest] = useState(INTEREST_OPTIONS[0]);
  const [searchQuery, setSearchQuery] = useState("");
  // Advanced: paste a Google Alerts RSS URL instead of using topic search.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function addAlert(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      // Auto-fill the friendly name from the topic if the user left it blank.
      const finalName = name.trim() || searchQuery.trim() || "Untitled alert";
      const payload: Record<string, string> = {
        name: finalName,
        primaryInterest: interest,
      };
      if (showAdvanced && feedUrl.trim()) {
        payload.feedUrl = feedUrl.trim();
      } else if (searchQuery.trim()) {
        payload.searchQuery = searchQuery.trim();
      } else {
        throw new Error("Type a topic to track");
      }
      const r = await fetch("/api/radar/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setName(""); setSearchQuery(""); setFeedUrl("");
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

  async function del(id: string) {
    if (!confirm("Delete this alert and all its cached items?")) return;
    setRowBusy(id);
    try {
      await fetch(`/api/radar/alerts/${id}`, { method: "DELETE" });
      onChanged();
    } finally { setRowBusy(null); }
  }

  async function pullOne(id: string) {
    setRowBusy(id);
    try {
      await fetch("/api/radar/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      onChanged();
    } finally { setRowBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-semibold">⚙ Track topics</div>
            <div className="text-xs text-gray-500">Type a topic — we&apos;ll pull fresh news for it. No leaving the dashboard.</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl">×</button>
        </div>

        <form onSubmit={addAlert} className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Add a topic</div>
          {!showAdvanced && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="What to track — e.g. AMC exam 2026, DHA licensing, NEET PG cutoff"
                  className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white"
                  required={!showAdvanced}
                  autoFocus
                />
                <HopeSelect value={interest} onChange={setInterest} options={INTEREST_OPTIONS.map((o) => ({ value: o, label: o }))} />
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional label (defaults to the topic)"
                className="w-full mt-2 text-xs px-3 py-2 rounded-md border border-gray-200 bg-white"
              />
            </>
          )}
          {showAdvanced && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Friendly name — e.g. AMC registration updates"
                  className="text-xs px-3 py-2 rounded-md border border-gray-200 bg-white"
                  required
                />
                <HopeSelect value={interest} onChange={setInterest} options={INTEREST_OPTIONS.map((o) => ({ value: o, label: o }))} />
              </div>
              <input
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://www.google.com/alerts/feeds/…/…"
                className="w-full mt-2 text-xs px-3 py-2 rounded-md border border-gray-200 bg-white font-mono"
                required
              />
              <div className="text-xs text-gray-500 mt-1.5">
                Advanced: paste an RSS URL from a Google Alert you set up manually.
              </div>
            </>
          )}
          {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-gray-500 hover:text-brand underline"
            >
              {showAdvanced ? "← Use topic search instead" : "Use a Google Alerts RSS URL instead →"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-md hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & fetch"}
            </button>
          </div>
        </form>

        {alerts.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-gray-500">No alerts yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {alerts.map((a) => (
              <li key={a.id} className="px-5 py-3 flex items-start gap-3">
                <label className={`shrink-0 w-8 h-4 rounded-full relative cursor-pointer transition ${a.active ? "bg-brand" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition ${a.active ? "left-4" : "left-0.5"}`} />
                  <input type="checkbox" className="sr-only" checked={a.active} disabled={rowBusy === a.id} onChange={(e) => toggle(a.id, e.target.checked)} />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{a.name}</div>
                  <div className="text-xs text-gray-500">
                    <span className="text-brand">{a.primaryInterest}</span>
                    <span className="mx-1.5">·</span>
                    {a.searchQuery ? (
                      <span>🔍 tracking: <span className="text-gray-700">{a.searchQuery}</span></span>
                    ) : a.feedUrl ? (
                      <span>📡 <span className="font-mono">{a.feedUrl.replace(/^https?:\/\//, "").slice(0, 60)}</span></span>
                    ) : (
                      <span className="text-rose-600">no source configured</span>
                    )}
                  </div>
                  {a.lastError && (
                    <div className="text-xs text-rose-600 mt-1">⚠ {a.lastError}</div>
                  )}
                  {a.lastFetchedAt && !a.lastError && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Last pulled {fmtDateTime(a.lastFetchedAt)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => pullOne(a.id)}
                    disabled={rowBusy === a.id}
                    className="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {rowBusy === a.id ? "…" : "↻ Pull"}
                  </button>
                  <button
                    onClick={() => del(a.id)}
                    disabled={rowBusy === a.id}
                    className="text-xs px-2.5 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
        const d = await r.json();
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

  const draftHref = useMemo(() => {
    const p = new URLSearchParams({
      title: item.title,
      brief: `Headline: ${item.title}\nSource: ${item.source || "unknown"}\nURL: ${finalUrl}\n\n${item.snippet}`,
      interest: item.primaryInterest,
    });
    return `/dashboard/scheduler?draft=${encodeURIComponent(p.toString())}`;
  }, [item, finalUrl]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 flex items-center gap-2 mb-1">
              <span className="font-medium text-brand">{item.primaryInterest}</span>
              <span>·</span>
              <span>{item.source || "unknown"}</span>
              <span>·</span>
              <span>{fmtDateTime(item.publishedAt)}</span>
            </div>
            <h2 className="text-base font-medium text-[#232D42] leading-snug">
              {item.title || articleTitle}
            </h2>
            {byline && <div className="text-xs text-gray-500 mt-1 italic">{byline}</div>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="text-center py-10">
              <div className="inline-block w-8 h-8 border-2 border-gray-200 border-t-brand rounded-full animate-spin" />
              <div className="text-xs text-gray-500 mt-3">Loading article inside the dashboard…</div>
            </div>
          )}
          {!loading && error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
              <div className="text-sm font-semibold text-rose-900 mb-1">Couldn&apos;t pull the article body.</div>
              <div className="text-xs text-rose-700 mb-3">{error}</div>
              <div className="text-xs text-gray-600 mb-3">
                Here&apos;s the summary we have:
              </div>
              <div className="text-sm text-gray-800 bg-white border border-gray-200 rounded p-3">
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
            <div className="text-sm text-gray-500 italic">The reader returned nothing for this URL.</div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-3">
          <Link
            href={draftHref}
            className="text-xs font-medium bg-brand text-white px-3 py-1.5 rounded-md hover:bg-brand-dark"
          >
            ✍ Turn into post
          </Link>
          <a
            href={finalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-600 hover:text-brand"
          >
            Open on {new URL(finalUrl).hostname.replace(/^www\./, "")} ↗
          </a>
          <button
            onClick={onClose}
            className="ml-auto text-xs text-gray-500 hover:text-gray-900"
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 flex items-center gap-2 mb-1">
              <span className="font-medium text-brand">{thread?.subreddit || m.source || host}</span><span>·</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SENT_STYLE[m.sentiment].dot }} />{SENT_STYLE[m.sentiment].label}</span>
              {thread && <><span>·</span><span>▲ {thread.score} · {thread.numComments} comments</span></>}
            </div>
            <h2 className="text-base font-medium text-[#232D42] leading-snug">{m.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-2xl leading-none shrink-0">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {m.snippet && <div className="text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-lg p-3 mb-4">{m.snippet}</div>}

          {/* Reddit — full thread + comments via the official API */}
          {isReddit && rLoading && <div className="text-center py-8"><div className="inline-block w-7 h-7 border-2 border-gray-200 border-t-brand rounded-full animate-spin" /><div className="text-xs text-gray-500 mt-3">Loading the Reddit thread…</div></div>}
          {isReddit && !rLoading && thread && (
            <div>
              {thread.selftext && <p className="text-sm text-gray-800 whitespace-pre-wrap mb-4 leading-relaxed">{thread.selftext}</p>}
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{thread.comments.length} top comment{thread.comments.length === 1 ? "" : "s"}</div>
              <ul className="flex flex-col gap-3">
                {thread.comments.map((c, i) => (
                  <li key={i} className="border-l-2 border-gray-100 pl-3">
                    <div className="text-[11px] text-gray-500 mb-0.5"><span className="font-medium text-gray-700">u/{c.author}</span> · ▲ {c.score}</div>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{c.body}</div>
                  </li>
                ))}
                {thread.comments.length === 0 && <li className="text-xs text-gray-500">No comments on this thread yet.</li>}
              </ul>
            </div>
          )}
          {isReddit && !rLoading && !thread && needsAuth && (
            <div className="text-xs text-gray-600 bg-brand-light/50 border border-brand/15 rounded-lg p-3">📖 The full thread + all comments open on Reddit — use the button below.</div>
          )}
          {isReddit && !rLoading && !thread && !needsAuth && rErr && (
            <div className="text-xs text-gray-500">Couldn&apos;t load the thread ({rErr}). The snippet above is the preview — use “Open on reddit.com”.</div>
          )}

          {/* Quora — no API, login-walled */}
          {isQuora && <div className="text-xs text-gray-600 bg-brand-light/50 border border-brand/15 rounded-lg p-3">Quora has no API and requires login, so we preview the snippet here. Use <b>Open on {host}</b> to read the full answer.</div>}

          {/* Public sites (MouthShut / ValueMD / news) — Readability reader */}
          {useArticle && loading && <div className="text-center py-8"><div className="inline-block w-7 h-7 border-2 border-gray-200 border-t-brand rounded-full animate-spin" /><div className="text-xs text-gray-500 mt-3">Loading the full page inside the dashboard…</div></div>}
          {useArticle && !loading && html && <article className="reader-content" dangerouslySetInnerHTML={{ __html: html }} />}
          {useArticle && !loading && !html && (
            <div className="text-xs text-gray-500">{readErr ? `Couldn't load the full page (${readErr}). ` : ""}The preview above is what we have — use “Open on {host}” for the full text.</div>
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
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-3">
          <Link href={draftFromQuery(m.title, `From web mention: ${m.title}\nSource: ${m.source || host}\nURL: ${finalUrl}\n\n${m.snippet || ""}`)} className="text-xs font-medium bg-brand text-white px-3 py-1.5 rounded-md hover:bg-brand-dark">✍ Turn into post</Link>
          <a href={thread?.permalink || finalUrl} target="_blank" rel="noreferrer" className="text-xs font-medium bg-brand-light text-brand border border-brand/20 px-3 py-1.5 rounded-md hover:bg-brand hover:text-white transition">{isReddit ? "📖 Read full thread on Reddit ↗" : `Open on ${host} ↗`}</a>
          <button onClick={onClose} className="ml-auto text-xs text-gray-500 hover:text-gray-900">Close</button>
        </div>
      </div>
    </div>
  );
}
