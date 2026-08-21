"use client";
import { useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { useApi } from "@/lib/use-api";
import { AiInsights } from "@/components/AiInsights";
import {
  IconSearch, IconTrendingUp, IconStar, IconRefresh, IconPlus, IconX, IconTargetArrow, IconBulb, IconTrophy,
} from "@tabler/icons-react";

const BRAND = "#3A57E8";

// ---- data shapes ----
type Kw = { query: string; clicks: number; impressions: number; ctr: number; position: number };
type GscData = { source?: string; siteUrl?: string; totals?: { clicks: number; impressions: number; queries: number }; winning?: Kw[]; striking?: Kw[]; error?: string };
type GscFull = { summary?: { clicks: number; impressions: number; ctr: number; avgPosition: number }; overTime?: { date: string; clicks: number; impressions: number }[]; pages?: { url: string; clicks: number; impressions: number; position: number }[]; error?: string };
type Serp = { position: number; title: string; link: string; domain: string; snippet: string; ours: boolean };
type RankReport = { keyword: string; organic: Serp[]; ours: { domain: string; position: number }[]; bestPosition: number | null; peopleAlsoAsk: string[]; relatedSearches: string[]; source: string; error?: string };
type Tracked = { id: string; keyword: string; domain: string; latest: { position: number | null; checkedAt: string } | null; previous: { position: number | null } | null; history: { position: number | null; checkedAt: string }[] };

const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString("en-IN");

// Rank → colour (green page-1-top, blue page-1, amber page-2, grey beyond/none).
function posColor(p: number | null | undefined): { bg: string; fg: string } {
  if (p == null) return { bg: "#F1F3F8", fg: "#8A92A6" };
  if (p <= 3) return { bg: "#E3F5EA", fg: "#157F3C" };
  if (p <= 10) return { bg: "#E9ECFB", fg: "#2138B0" };
  if (p <= 20) return { bg: "#FCF0DA", fg: "#B45309" };
  return { bg: "#F1F3F8", fg: "#6B7280" };
}
function PosBadge({ p }: { p: number | null | undefined }) {
  const c = posColor(p);
  return <span className="text-[12px] font-semibold px-2 py-0.5 rounded-md tabular-nums" style={{ background: c.bg, color: c.fg }}>{p == null ? "—" : `#${p}`}</span>;
}

// Tiny inline sparkline for rank history (lower position = higher on the chart).
function RankSpark({ history }: { history: { position: number | null }[] }) {
  const pts = history.map((h) => h.position).filter((p): p is number => p != null);
  if (pts.length < 2) return <span className="text-[11px] text-gray-300">—</span>;
  const w = 64, h = 20, max = Math.max(...pts, 1), min = Math.min(...pts);
  const span = Math.max(1, max - min);
  const d = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = ((p - min) / span) * (h - 4) + 2; // higher rank (small p) → top
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = pts[pts.length - 1] < pts[0]; // rank improved (number went down)
  return <svg width={w} height={h} className="overflow-visible"><path d={d} fill="none" stroke={up ? "#1AA053" : "#E11D48"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function SeoPage() {
  return (
    <HopeDashboardShell active="seo" title="SEO" hideAccountPicker subtitle="Where you rank on Google — free, from Search Console + live rank checks. No paid data.">
      {({ range }) => <Inner range={range} />}
    </HopeDashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ from: range.from, to: range.to }).toString();
  const { data: gsc } = useApi<GscData>(`/api/website/gsc?${qs}`);
  const { data: full } = useApi<GscFull>(`/api/website/gsc?view=full&${qs}`);
  const notConfigured = gsc?.error === "not_configured" || gsc?.error === "no_access" || gsc?.error === "api_disabled";

  const striking = gsc?.striking || [];
  const winning = gsc?.winning || [];
  // On page 1 but leaking clicks — high impressions, weak CTR → rewrite the title/meta.
  const lowCtr = [...winning].filter((w) => w.impressions >= 50 && w.ctr < 3).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
  const pages = full?.pages || [];

  return (
    <div className="hope-scope space-y-6">
      {/* Pinned rankings board — always-visible "where GooCampus ranks" */}
      <RankingsBoard />

      {/* Totals.
          Clicks and impressions come from `full.summary` — Search Console queried
          with NO dimensions, which is Google's own total for the window. They used
          to be summed from the per-QUERY rows, and Google withholds rare queries
          for privacy, so that sum always came out short: the tile read "0 clicks"
          on a window where the pages list below it showed a page earning 3.
          Keywords ranked still comes from the query rows — that one IS a count of
          the queries you show for. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Clicks" value={fmt(full?.summary?.clicks)} sub="from Google search" />
        <Stat label="Impressions" value={fmt(full?.summary?.impressions)} sub="times you appeared" />
        <Stat label="Avg position" value={full?.summary?.avgPosition != null ? String(full.summary.avgPosition) : "—"} sub="across all queries" />
        <Stat label="Keywords ranked" value={fmt(gsc?.totals?.queries)} sub="queries Google will name" />
      </div>

      {notConfigured ? (
        <Card>
          <div className="text-center py-8">
            <div className="text-[15px] font-semibold text-[#232D42] mb-1">Search Console isn&apos;t connected yet</div>
            <div className="text-[13px] text-gray-500 max-w-md mx-auto">Grant the service account read access to your Search Console property to unlock the free ranking data. The live rank checker below still works.</div>
          </div>
        </Card>
      ) : (
        <>
          {/* SECTION 1 — Search Console opportunities */}
          <SectionTitle icon={<IconTargetArrow size={16} />} title="Your biggest wins" sub="Straight from Google Search Console — where a little effort moves you up fastest." />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHead icon={<IconStar size={15} className="text-amber-500" />} title="Striking distance — page 2" sub="Rank 11–20 with real demand. Push these onto page 1 first." />
              <KwTable rows={striking} empty="No page-2 keywords in this range." showCtr={false} />
            </Card>
            <Card>
              <CardHead icon={<IconSearch size={15} className="text-brand" />} title="Win more clicks" sub="On page 1 but low CTR — rewrite the title/meta to earn the click." />
              <KwTable rows={lowCtr} empty="No low-CTR page-1 keywords — nice." showCtr />
            </Card>
          </div>
          {pages.length > 0 && (
            <Card>
              <CardHead icon={<IconTrendingUp size={15} className="text-brand" />} title="Top pages" sub="Your best-performing URLs in this window." />
              <div className="divide-y divide-gray-50">
                {pages.slice(0, 8).map((p) => (
                  <div key={p.url} className="flex items-center gap-3 py-2 text-[13px]">
                    <PosBadge p={p.position} />
                    <a href={p.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-brand hover:underline">{p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</a>
                    <span className="text-gray-500 tabular-nums whitespace-nowrap">{fmt(p.clicks)} clicks · {fmt(p.impressions)} impr</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* SECTION 2 — Live rank checker + tracker */}
      <SectionTitle icon={<IconSearch size={16} />} title="Rank checker & tracker" sub="Live Google (India) results via Serper — free. Check any keyword, or track a list over time." />
      <RankChecker />
      <TrackedKeywords />

      {/* SECTION 3 — AI SEO playbook */}
      <SectionTitle icon={<IconBulb size={16} />} title="AI SEO playbook" sub="Turn the numbers above into an ordered action plan." />
      <AiInsights endpoint={`/api/website/insights?source=gsc&${qs}`} accent={BRAND} label="Get an AI SEO playbook from your Search Console data" />
    </div>
  );
}

// ---------- Section 2a: live rank checker ----------
function RankChecker() {
  const [kw, setKw] = useState("");
  const [loading, setLoading] = useState(false);
  const [rep, setRep] = useState<RankReport | null>(null);
  const [added, setAdded] = useState(false);
  async function check(q: string) {
    const term = q.trim();
    if (!term) return;
    setLoading(true); setRep(null); setAdded(false);
    try {
      const r = await fetch(`/api/seo/rank?q=${encodeURIComponent(term)}`);
      setRep(await r.json());
    } catch { setRep({ keyword: term, organic: [], ours: [], bestPosition: null, peopleAlsoAsk: [], relatedSearches: [], source: "none", error: "Check failed" }); }
    finally { setLoading(false); }
  }
  async function track() {
    if (!rep) return;
    await fetch("/api/seo/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: rep.keyword }) });
    setAdded(true);
  }
  return (
    <Card>
      <div className="flex gap-2 mb-3">
        <input value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") check(kw); }}
          placeholder="Check a keyword — e.g. NEET PG coaching, MBBS abroad after 12th"
          className="flex-1 text-sm text-gray-900 rounded-lg border border-gray-200 px-3 py-2" />
        <button onClick={() => check(kw)} disabled={loading || !kw.trim()} className="text-sm font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50 whitespace-nowrap">
          {loading ? "Checking…" : "Check rank"}
        </button>
      </div>
      {rep && (
        rep.error ? <div className="text-[13px] text-rose-600">{rep.error}</div> :
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] text-gray-500">Your best rank for <b className="text-[#232D42]">“{rep.keyword}”</b>:</span>
            <PosBadge p={rep.bestPosition} />
            {rep.bestPosition == null && <span className="text-[12px] text-gray-400">not in the top 10 — a growth target</span>}
            <button onClick={track} disabled={added} className="ml-auto text-[12px] font-medium text-brand border border-brand rounded-lg px-2.5 py-1 hover:bg-brand-light disabled:opacity-50">
              {added ? "✓ Tracking" : "+ Track this keyword"}
            </button>
          </div>
          {/* Page-1 results */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Who&apos;s on page 1</div>
            <div className="space-y-1">
              {rep.organic.map((o) => (
                <div key={o.position} className={`flex items-start gap-2 text-[13px] px-2 py-1.5 rounded-lg ${o.ours ? "bg-brand-light" : ""}`}>
                  <span className="text-gray-400 tabular-nums w-6 flex-shrink-0">{o.position}.</span>
                  <div className="min-w-0 flex-1">
                    <a href={o.link} target="_blank" rel="noreferrer" className={`truncate block ${o.ours ? "text-brand font-semibold" : "text-gray-800"} hover:underline`}>{o.title || o.domain}</a>
                    <span className="text-[11px] text-gray-400">{o.domain}{o.ours ? " · you" : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Ideas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rep.peopleAlsoAsk.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">People also ask (content ideas)</div>
                <ul className="space-y-1">{rep.peopleAlsoAsk.map((q, i) => <li key={i} className="text-[12.5px] text-gray-600">• {q}</li>)}</ul>
              </div>
            )}
            {rep.relatedSearches.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Related searches</div>
                <div className="flex flex-wrap gap-1.5">{rep.relatedSearches.map((q, i) => (
                  <button key={i} onClick={() => { setKw(q); check(q); }} className="text-[12px] bg-gray-50 hover:bg-brand-light text-gray-700 rounded-full px-2.5 py-1">{q}</button>
                ))}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Pinned board: "Where GooCampus ranks" ----------
// Always-visible summary of our live Google positions for the keywords we track.
// Reuses the tracked-keywords data; best (lowest) position first, unranked last.
function RankingsBoard() {
  const { data, refresh } = useApi<{ keywords: Tracked[] }>("/api/seo/keywords");
  const [busy, setBusy] = useState(false);
  const rows = [...(data?.keywords || [])].sort((a, b) => (a.latest?.position ?? 999) - (b.latest?.position ?? 999));
  const onPage1 = rows.filter((r) => (r.latest?.position ?? 99) <= 10).length;
  const notRanked = rows.filter((r) => r.latest?.position == null).length;

  async function recheck() { setBusy(true); await fetch("/api/seo/refresh", { method: "POST" }); setBusy(false); refresh(); }
  const delta = (t: Tracked) => {
    const now = t.latest?.position, prev = t.previous?.position;
    if (now == null || prev == null) return null;
    return prev - now; // + = moved up
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 md:p-5">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-brand mt-0.5"><IconTrophy size={17} /></span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-[#232D42]">Where GooCampus ranks</div>
          <div className="text-[12.5px] text-gray-500">Live Google (India) position for the keywords you track. Lower is better — #1 is the top of page 1.</div>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-shrink-0">
          {rows.length > 0 && <span className="text-[12px] text-gray-500 hidden sm:inline"><b className="text-emerald-600">{onPage1}</b> on page 1 · <b className="text-gray-600">{notRanked}</b> to win</span>}
          <button onClick={recheck} disabled={busy || rows.length === 0} className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1 hover:border-gray-300 disabled:opacity-50">
            <IconRefresh size={13} className={busy ? "animate-spin" : ""} /> Re-check
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-[13px] text-gray-400 text-center py-6">No keywords tracked yet. Check a keyword below and hit <b>+ Track this keyword</b> — it will show up here with its live position.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {rows.map((t) => {
            const d = delta(t);
            const p = t.latest?.position ?? null;
            return (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <PosBadge p={p} />
                <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-[#232D42]" title={t.keyword}>{t.keyword}</span>
                {p == null && <span className="text-[11px] text-gray-400 whitespace-nowrap">not top 10</span>}
                {d != null && d !== 0 && <span className={`text-[11.5px] font-semibold tabular-nums ${d > 0 ? "text-emerald-600" : "text-rose-600"}`}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</span>}
                <RankSpark history={t.history} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Section 2b: tracked keywords ----------
function TrackedKeywords() {
  const { data, refresh } = useApi<{ keywords: Tracked[] }>("/api/seo/keywords");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<null | "add" | "refresh">(null);
  const rows = data?.keywords || [];
  if (typeof window !== "undefined") window.addEventListener("seo:tracked-changed", () => refresh(), { once: true });

  async function add() {
    const k = adding.trim(); if (!k) return;
    setBusy("add");
    await fetch("/api/seo/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: k }) });
    setAdding(""); setBusy(null); refresh();
  }
  async function remove(id: string) { await fetch(`/api/seo/keywords?id=${id}`, { method: "DELETE" }); refresh(); }
  async function refreshAll() { setBusy("refresh"); await fetch("/api/seo/refresh", { method: "POST" }); setBusy(null); refresh(); }
  const delta = (t: Tracked) => {
    const now = t.latest?.position, prev = t.previous?.position;
    if (now == null || prev == null) return null;
    return prev - now; // positive = improved (moved up)
  };

  return (
    <Card>
      <CardHead icon={<IconTrendingUp size={15} className="text-brand" />} title="Tracked keywords" sub="Saved keywords, re-checked over time. Uses your free Serper credits."
        right={<button onClick={refreshAll} disabled={busy !== null || rows.length === 0} className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1 hover:border-gray-300 disabled:opacity-50"><IconRefresh size={13} className={busy === "refresh" ? "animate-spin" : ""} /> Re-check all</button>} />
      <div className="flex gap-2 mb-3">
        <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a keyword to track…" className="flex-1 text-sm text-gray-900 rounded-lg border border-gray-200 px-3 py-2" />
        <button onClick={add} disabled={busy !== null || !adding.trim()} className="inline-flex items-center gap-1 text-sm font-medium bg-brand text-white px-3 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50"><IconPlus size={15} /> Add</button>
      </div>
      {rows.length === 0 ? (
        <div className="text-[13px] text-gray-400 text-center py-4">No tracked keywords yet — add one above, or track one from a rank check.</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map((t) => {
            const d = delta(t);
            return (
              <div key={t.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="flex-1 min-w-0 truncate font-medium text-[#232D42]">{t.keyword}</span>
                <RankSpark history={t.history} />
                {d != null && d !== 0 && <span className={`text-[12px] font-semibold tabular-nums ${d > 0 ? "text-emerald-600" : "text-rose-600"}`}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</span>}
                <PosBadge p={t.latest?.position ?? null} />
                <button onClick={() => remove(t.id)} className="text-gray-300 hover:text-rose-500" title="Stop tracking"><IconX size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------- small UI atoms ----------
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-gray-100 rounded-2xl p-4 md:p-5">{children}</div>;
}
function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="text-[12px] text-gray-500">{label}</div>
      <div className="text-[22px] font-semibold text-[#232D42] tabular-nums mt-0.5">{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}
function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2 pt-1">
      <span className="text-brand mt-0.5">{icon}</span>
      <div><div className="text-[15px] font-semibold text-[#232D42]">{title}</div><div className="text-[12.5px] text-gray-500">{sub}</div></div>
    </div>
  );
}
function CardHead({ icon, title, sub, right }: { icon: React.ReactNode; title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mb-3">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0"><div className="text-[13.5px] font-semibold text-[#232D42]">{title}</div><div className="text-[12px] text-gray-500">{sub}</div></div>
      {right && <div className="ml-auto flex-shrink-0">{right}</div>}
    </div>
  );
}
function KwTable({ rows, empty, showCtr }: { rows: Kw[]; empty: string; showCtr: boolean }) {
  if (rows.length === 0) return <div className="text-[13px] text-gray-400 py-3">{empty}</div>;
  return (
    <div className="divide-y divide-gray-50">
      {rows.map((r) => (
        <div key={r.query} className="flex items-center gap-3 py-2 text-[13px]">
          <PosBadge p={r.position} />
          <span className="flex-1 min-w-0 truncate text-gray-800" title={r.query}>{r.query}</span>
          <span className="text-gray-500 tabular-nums whitespace-nowrap">{showCtr ? `${r.ctr}% CTR · ` : ""}{fmt(r.impressions)} impr</span>
        </div>
      ))}
    </div>
  );
}
