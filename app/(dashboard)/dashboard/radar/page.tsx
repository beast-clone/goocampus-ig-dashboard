"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";

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
    <DashboardShell title="Content Radar" subtitle="Every Google Alert you subscribe to, grouped by primary interest. Turn any headline into a post brief.">
      {() => <Radar />}
    </DashboardShell>
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

  // Bucket items by their alert.primaryInterest so we can render section-per-interest.
  const grouped = useMemo(() => {
    const m = new Map<string, FeedItem[]>();
    for (const it of items) {
      if (!m.has(it.primaryInterest)) m.set(it.primaryInterest, []);
      m.get(it.primaryInterest)!.push(it);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <>
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[11px] text-gray-500">
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

      {/* Interest chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {interestChips.map((i) => (
          <button
            key={i}
            onClick={() => setActiveInterest(i)}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              activeInterest === i
                ? "bg-brand text-white border-brand"
                : "bg-white text-gray-700 border-gray-200 hover:border-brand/40"
            }`}
          >
            {i === "all" ? "All interests" : i}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {!loading && alerts.length === 0 && (
        <EmptyState onOpenSettings={() => setSettingsOpen(true)} />
      )}

      {/* Feed */}
      {alerts.length > 0 && items.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <div className="text-sm text-gray-700 mb-1">No cached items yet.</div>
          <div className="text-xs text-gray-500 mb-4">Hit &quot;Pull latest from Google&quot; to fetch your feeds for the first time.</div>
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50"
          >
            {refreshing ? "Fetching…" : "Pull latest from Google"}
          </button>
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([interest, list]) => (
          <section key={interest} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-baseline gap-3 px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">{interest}</h2>
              <span className="text-[11px] text-gray-500">{list.length} headline{list.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {list.map((it) => (
                <FeedRow key={it.id} item={it} onRead={() => setReaderItem(it)} />
              ))}
            </ul>
          </section>
        ))}
      </div>

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
    return new Date(item.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }, [item.publishedAt]);

  return (
    <li className="px-5 py-3.5 hover:bg-gray-50/70 transition">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onRead} className="flex-1 min-w-0 text-left group">
          <div className="text-sm font-medium text-gray-900 group-hover:text-brand leading-snug">
            {item.title}
          </div>
          {item.snippet && (
            <div className="text-[12px] text-gray-600 mt-1 line-clamp-2 leading-snug">
              {item.snippet}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500">
            {item.source && (
              <span className="font-medium text-gray-700">{item.source}</span>
            )}
            <span>·</span>
            <span>{relative}</span>
            <span>·</span>
            <span className="italic">{item.alertName}</span>
            <span>·</span>
            <span className="text-brand group-hover:underline">📖 Read in dashboard</span>
          </div>
        </button>
        <Link
          href={draftHref}
          className="shrink-0 text-xs font-medium bg-white text-brand border border-brand/30 px-3 py-1.5 rounded-md hover:bg-brand-light whitespace-nowrap"
        >
          Turn into post →
        </Link>
      </div>
    </li>
  );
}

function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
      <div className="max-w-xl mx-auto text-center">
        <div className="text-4xl mb-3">📡</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Track your first topic</h2>
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
            <div className="text-[11px] text-gray-500">Type a topic — we&apos;ll pull fresh news for it. No leaving the dashboard.</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl">×</button>
        </div>

        <form onSubmit={addAlert} className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">Add a topic</div>
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
                <select
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  className="text-xs px-3 py-2 rounded-md border border-gray-200 bg-white"
                >
                  {INTEREST_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
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
                <select
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  className="text-xs px-3 py-2 rounded-md border border-gray-200 bg-white"
                >
                  {INTEREST_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <input
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://www.google.com/alerts/feeds/…/…"
                className="w-full mt-2 text-xs px-3 py-2 rounded-md border border-gray-200 bg-white font-mono"
                required
              />
              <div className="text-[10px] text-gray-500 mt-1.5">
                Advanced: paste an RSS URL from a Google Alert you set up manually.
              </div>
            </>
          )}
          {error && <div className="text-[11px] text-rose-600 mt-2">{error}</div>}
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] text-gray-500 hover:text-brand underline"
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
                  <div className="text-[11px] text-gray-500">
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
                    <div className="text-[11px] text-rose-600 mt-1">⚠ {a.lastError}</div>
                  )}
                  {a.lastFetchedAt && !a.lastError && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Last pulled {new Date(a.lastFetchedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => pullOne(a.id)}
                    disabled={rowBusy === a.id}
                    className="text-[11px] px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {rowBusy === a.id ? "…" : "↻ Pull"}
                  </button>
                  <button
                    onClick={() => del(a.id)}
                    disabled={rowBusy === a.id}
                    className="text-[11px] px-2.5 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
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
            <div className="text-[11px] text-gray-500 flex items-center gap-2 mb-1">
              <span className="font-medium text-brand">{item.primaryInterest}</span>
              <span>·</span>
              <span>{item.source || "unknown"}</span>
              <span>·</span>
              <span>{new Date(item.publishedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 leading-snug">
              {item.title || articleTitle}
            </h2>
            {byline && <div className="text-[11px] text-gray-500 mt-1 italic">{byline}</div>}
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
            :global(.reader-content a) { color: #6D5AE6; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
            :global(.reader-content a:hover) { color: #4C3AD0; }
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
