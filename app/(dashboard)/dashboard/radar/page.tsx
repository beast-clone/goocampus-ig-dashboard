"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";

type Alert = {
  id: string;
  name: string;
  primaryInterest: string;
  feedUrl: string;
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
                <FeedRow key={it.id} item={it} />
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
    </>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
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
        <div className="flex-1 min-w-0">
          <a href={item.link} target="_blank" rel="noreferrer" className="block group">
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
            </div>
          </a>
        </div>
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
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Wire up your first Google Alert</h2>
        <p className="text-sm text-gray-600 mb-5">
          The Radar pulls from Google Alerts RSS feeds you paste in. Every ~6 hours, or on demand,
          it fetches the latest matches so you can spot what&apos;s worth turning into a post.
        </p>
        <ol className="text-left text-sm text-gray-700 space-y-2 mb-6 max-w-md mx-auto">
          <li>
            <span className="inline-block bg-brand-light text-brand font-mono text-[11px] px-1.5 rounded mr-2">1</span>
            Go to <a href="https://www.google.com/alerts" target="_blank" rel="noreferrer" className="text-brand hover:underline">google.com/alerts</a>{" "}
            and create an alert for a topic (e.g. &quot;AMC registration&quot;).
          </li>
          <li>
            <span className="inline-block bg-brand-light text-brand font-mono text-[11px] px-1.5 rounded mr-2">2</span>
            Under <b>Deliver to</b>, switch from your email to <b>RSS feed</b>. Save.
          </li>
          <li>
            <span className="inline-block bg-brand-light text-brand font-mono text-[11px] px-1.5 rounded mr-2">3</span>
            Copy the feed URL (it looks like <code className="bg-gray-100 px-1 rounded text-[11px]">google.com/alerts/feeds/…/…</code>).
          </li>
          <li>
            <span className="inline-block bg-brand-light text-brand font-mono text-[11px] px-1.5 rounded mr-2">4</span>
            Paste it into <b>⚙ Manage alerts</b> below, along with the Primary Interest it belongs to.
          </li>
        </ol>
        <button
          onClick={onOpenSettings}
          className="text-sm font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark"
        >
          ⚙ Manage alerts
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
  const [feedUrl, setFeedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function addAlert(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/radar/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, primaryInterest: interest, feedUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setName(""); setFeedUrl("");
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
            <div className="text-sm font-semibold">⚙ Manage Google Alerts</div>
            <div className="text-[11px] text-gray-500">Paste each RSS feed URL and tag it with a Primary Interest.</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl">×</button>
        </div>

        <form onSubmit={addAlert} className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">Add a new alert</div>
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
          {error && <div className="text-[11px] text-rose-600 mt-2">{error}</div>}
          <div className="flex justify-end mt-3">
            <button
              type="submit"
              disabled={saving}
              className="text-xs font-medium bg-brand text-white px-4 py-2 rounded-md hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save alert"}
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
                    <span className="font-mono truncate">{a.feedUrl.replace(/^https?:\/\//, "")}</span>
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
