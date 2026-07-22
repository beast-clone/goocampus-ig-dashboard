"use client";
import { IconExternalLink, IconSearch, IconFileText, IconTargetArrow, IconInfoCircle } from "@tabler/icons-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { AiInsights } from "@/components/AiInsights";
import { useApi } from "@/lib/use-api";

const GOOGLE = "#4285F4"; // Google blue

type Resp = {
  source: "live";
  siteUrl: string;
  summary: { clicks: number; impressions: number; ctr: number; avgPosition: number };
  overTime: { date: string; clicks: number; impressions: number }[];
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  pages: { url: string; clicks: number; impressions: number; position: number }[];
  error?: string;
  enableUrl?: string;
  account?: string;
};

const SITE = "goocampusevents.com";
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

export default function GooglePage() {
  return (
    <HopeDashboardShell active="website" title="Website · Google Search" subtitle={`Google Search Console — ${SITE}`} hideAccountPicker>
      {({ range }) => <Inner range={range} />}
    </HopeDashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ view: "full", from: range.from, to: range.to }).toString();
  const { data, error, isLoading, refresh } = useApi<Resp>(`/api/website/gsc?${qs}`, { revalidateOnFocus: false });
  const gscUrl = `https://search.google.com/search-console?resource_id=${encodeURIComponent("https://" + SITE + "/")}`;
  const noData = data && !data.error && data.summary?.impressions === 0 && !data.queries?.length;

  // Not-yet-connected states surface via the API error body (403).
  const setupErr = data?.error || (error && /api_disabled|no_access/.test(error.message) ? "setup" : null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: GOOGLE }} />
          <span className="text-sm font-semibold text-gray-800">{SITE}</span>
          <span className="text-[11px] text-gray-400">· Google organic search performance</span>
        </div>
        <div className="flex items-center gap-3">
          {data?.source === "live" && !setupErr && (
            <span className="text-[11px] px-2.5 py-1 rounded-full border" style={{ background: "rgba(66,133,244,.08)", color: GOOGLE, borderColor: "rgba(66,133,244,.25)" }}>● Live · Search Console</span>
          )}
          <a href={gscUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <IconExternalLink size={14} stroke={1.8} /> Open in Search Console
          </a>
          <LiveIndicator loading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      {!setupErr && <AiInsights endpoint="/api/website/insights?source=gsc" accent={GOOGLE} label="Analyze this Search Console data with AI" />}

      {setupErr && (
        <div className="text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg p-4">
          Google Search Console isn&apos;t fully connected yet. Once the property access + API are enabled it fills in here automatically.
        </div>
      )}
      {error && !setupErr && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{error.message}</div>}
      {!data && isLoading && <div className="text-sm text-gray-400 py-16 text-center">Loading Google Search Console…</div>}

      {data && !setupErr && (
        <>
          {noData && (
            <div className="text-[12px] text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Google isn&apos;t reporting clicks or impressions for {SITE} in this window yet. This is connected and correct — numbers appear here as the site earns search visibility.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Clicks" value={fmt(data.summary.clicks)} sub="from Google search" accent info="How many people clicked through to your site from a Google search result." />
            <Stat label="Impressions" value={fmt(data.summary.impressions)} sub="in Google results" info="How many times your site appeared in Google search results — seen, whether or not it was clicked." />
            <Stat label="CTR" value={`${data.summary.ctr}%`} sub="click-through" info="Click-through rate = clicks ÷ impressions. Of everyone who saw you in results, the share who clicked." />
            <Stat label="Avg position" value={data.summary.avgPosition ? String(data.summary.avgPosition) : "—"} sub="in results" info="Your average ranking in Google results. 1–10 = page 1, 11–20 = page 2, and so on. Lower is better — 12.0 means you typically appear near the top of page 2." />
          </div>

          <Section title="Clicks & impressions">
            <TrafficChart data={data.overTime} clicks={data.summary.clicks} impressions={data.summary.impressions} />
          </Section>

          <Section title="Top queries" hint="what people search on Google to find you">
            <QueryTable rows={data.queries} />
          </Section>

          <Section title="Top pages" hint="impressions">
            <PageTable rows={data.pages} />
          </Section>
        </>
      )}
    </div>
  );
}

// Little ⓘ that reveals a plain-English definition on hover. `dir` flips the
// tooltip below its icon (for spots where opening upward would be clipped).
function InfoDot({ text, dir = "up", align = "center" }: { text: string; dir?: "up" | "down"; align?: "center" | "right" }) {
  const box = align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  const arrow = align === "right" ? "right-2" : "left-1/2 -translate-x-1/2";
  return (
    <span className="relative inline-flex group align-middle">
      <IconInfoCircle size={13} className="text-gray-300 hover:text-gray-500 cursor-help" />
      {/* normal-case / tracking-normal / font-normal reset the uppercase header
          styles the tooltip would otherwise inherit; white surface fits the light UI. */}
      <span className={`pointer-events-none absolute z-40 w-56 rounded-lg bg-white text-[#232D42] border border-gray-200 shadow-lg text-[11px] font-normal normal-case tracking-normal leading-relaxed px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity ${box} ${dir === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}>
        {text}
        <span className={`absolute ${arrow} w-2.5 h-2.5 bg-white border-gray-200 rotate-45 ${dir === "up" ? "top-full -mt-1.5 border-b border-r" : "bottom-full -mb-1.5 border-t border-l"}`} />
      </span>
    </span>
  );
}

function Stat({ label, value, sub, accent, info }: { label: string; value: string; sub?: string; accent?: boolean; info?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}{info && <InfoDot text={info} />}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: GOOGLE } : {}}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function TrafficChart({ data, clicks, impressions }: { data: { date: string; clicks: number; impressions: number }[]; clicks: number; impressions: number }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Google search over time</div>
        <div className="text-2xl font-semibold text-gray-900">{impressions.toLocaleString("en-IN")}<span className="text-xs font-normal text-gray-500 ml-2">impressions · {clicks.toLocaleString("en-IN")} clicks</span></div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gscImpr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GOOGLE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={GOOGLE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={40} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} width={42} />
            <Tooltip
              cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { date: string; clicks: number; impressions: number };
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs min-w-[150px]">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{p.date}</div>
                    <div className="text-base font-semibold text-gray-900">{p.impressions.toLocaleString("en-IN")} impressions</div>
                    <div className="text-xs text-gray-500">{p.clicks.toLocaleString("en-IN")} clicks</div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="impressions" stroke={GOOGLE} strokeWidth={2.5} fill="url(#gscImpr)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Position pill: green ≤3, blue ≤10, amber 11–20 (striking distance), grey beyond.
function pos(p: number) {
  if (!p) return { fg: "#94a3b8", bg: "transparent", txt: "—" };
  if (p <= 3) return { fg: "#0E9F6E", bg: "rgba(14,159,110,.12)", txt: p.toFixed(1) };
  if (p <= 10) return { fg: GOOGLE, bg: "rgba(66,133,244,.12)", txt: p.toFixed(1) };
  if (p <= 20) return { fg: "#B45309", bg: "rgba(245,158,11,.14)", txt: p.toFixed(1) };
  return { fg: "#94a3b8", bg: "rgba(148,163,184,.12)", txt: p.toFixed(1) };
}

function QueryTable({ rows }: { rows: { query: string; clicks: number; impressions: number; ctr: number; position: number }[] }) {
  if (!rows.length) return <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-400">No query data from Google yet.</div>;
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 border-b border-gray-50">
        <div>Query</div><div className="text-right w-14">Clicks</div><div className="text-right w-16">Impr.</div><div className="text-right w-12">CTR</div><div className="text-right w-14 flex items-center justify-end gap-1">Pos.<InfoDot dir="down" align="right" text="Average Google ranking for this query. Lower is better — 1–10 is page 1, 11–20 page 2. The 🎯 marks 'striking distance' (11–20): almost on page 1, worth a push." /></div>
      </div>
      {rows.map((r, i) => {
        const pp = pos(r.position);
        const striking = r.position > 10 && r.position <= 20;
        return (
          <div key={r.query + i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-[13px] border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              {striking ? <IconTargetArrow size={13} className="shrink-0" style={{ color: "#B45309" }} /> : <IconSearch size={13} className="text-gray-300 shrink-0" />}
              <span className="truncate text-gray-800">{r.query}</span>
            </div>
            <div className="text-right w-14 tabular-nums text-gray-900 font-medium">{fmt(r.clicks)}</div>
            <div className="text-right w-16 tabular-nums text-gray-600">{fmt(r.impressions)}</div>
            <div className="text-right w-12 tabular-nums text-gray-600">{r.ctr}%</div>
            <div className="text-right w-14 flex justify-end">
              <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ color: pp.fg, background: pp.bg }}>{pp.txt}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PageTable({ rows }: { rows: { url: string; clicks: number; impressions: number; position: number }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.impressions), 0);
  if (!rows.length) return <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-400">No page data from Google yet.</div>;
  return (
    <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
      {rows.map((r, i) => (
        <a key={r.url + i} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition group">
          <IconFileText size={15} stroke={1.7} className="text-gray-300 shrink-0" />
          <div className="text-[13px] text-gray-800 truncate flex-1 group-hover:text-gray-900">{r.url}</div>
          <div className="w-24 shrink-0 hidden sm:block">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${max ? (r.impressions / max) * 100 : 0}%`, background: GOOGLE }} /></div>
          </div>
          <span className="text-[13px] font-semibold text-gray-900 tabular-nums w-14 text-right">{fmt(r.impressions)}</span>
        </a>
      ))}
    </div>
  );
}
