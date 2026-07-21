"use client";
import { IconExternalLink, IconSearch, IconFileText } from "@tabler/icons-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { AiInsights } from "@/components/AiInsights";
import { useApi } from "@/lib/use-api";

const BING = "#0F9D8C"; // Bing teal

type Resp = {
  source: "live" | "stored";
  history?: { days: number; storedTotal: number; from: string; to: string };
  siteUrl: string;
  latencyMs: number;
  summary: { clicks: number; impressions: number; ctr: number; avgPosition: number };
  overTime: { date: string; clicks: number; impressions: number }[];
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  pages: { url: string; clicks: number; impressions: number; position: number }[];
  error?: string;
};

const SITE = "goocampusevents.com";
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

export default function SearchPage() {
  return (
    <HopeDashboardShell active="website" title="Website · Bing" subtitle={`Bing Webmaster — ${SITE}`} hideAccountPicker>
      {({ range }) => <Inner range={range} />}
    </HopeDashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ from: range.from, to: range.to }).toString();
  const { data, error, isLoading, refresh } = useApi<Resp>(`/api/website/search?${qs}`, { revalidateOnFocus: false });
  const bingUrl = `https://www.bing.com/webmasters/home?siteUrl=https://${SITE}/`;
  const noData = data && data.summary.impressions === 0 && !data.queries.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: BING }} />
          <span className="text-sm font-semibold text-gray-800">{SITE}</span>
          <span className="text-[11px] text-gray-400">· {data?.source === "stored" ? `search · ${data.history?.days} days of stored history` : "search performance"}</span>
        </div>
        <div className="flex items-center gap-3">
          {data?.history != null && (data.history.storedTotal ?? 0) > 0 && (
            <span className="text-[11px] px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">◷ {data.history.storedTotal} days saved</span>
          )}
          {data?.source === "live" && (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200">● Live · Bing Webmaster</span>
          )}
          <a href={bingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <IconExternalLink size={14} stroke={1.8} /> Open in Bing
          </a>
          <LiveIndicator loading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      <AiInsights endpoint="/api/website/insights?source=bing" accent={BING} label="Analyze this Bing data with AI" />

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{error.message}</div>}
      {!data && isLoading && <div className="text-sm text-gray-400 py-16 text-center">Loading Bing Webmaster…</div>}

      {data && (
        <>
          {noData && (
            <div className="text-[12px] text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Bing isn&apos;t reporting search clicks or impressions for {SITE} yet. This is connected and correct — numbers will appear here once the site starts ranking in Bing search.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Clicks" value={fmt(data.summary.clicks)} sub="from Bing search" accent />
            <Stat label="Impressions" value={fmt(data.summary.impressions)} sub="in Bing results" />
            <Stat label="CTR" value={`${data.summary.ctr}%`} sub="click-through" />
            <Stat label="Avg position" value={data.summary.avgPosition ? String(data.summary.avgPosition) : "—"} sub="in results" />
          </div>

          <Section title="Clicks & impressions">
            <TrafficChart data={data.overTime} clicks={data.summary.clicks} impressions={data.summary.impressions} />
          </Section>

          <Section title="Top queries" hint="impressions · what people search to find you">
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

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: BING } : {}}>{value}</div>
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
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Bing search over time</div>
        <div className="text-2xl font-semibold text-gray-900">{impressions.toLocaleString("en-IN")}<span className="text-xs font-normal text-gray-500 ml-2">impressions · {clicks.toLocaleString("en-IN")} clicks</span></div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="bingImpr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BING} stopOpacity={0.18} />
                <stop offset="100%" stopColor={BING} stopOpacity={0} />
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
            <Area type="monotone" dataKey="impressions" stroke={BING} strokeWidth={2.5} fill="url(#bingImpr)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function QueryTable({ rows }: { rows: { query: string; clicks: number; impressions: number; ctr: number; position: number }[] }) {
  if (!rows.length) return <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-400">No query data from Bing yet.</div>;
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 border-b border-gray-50">
        <div>Query</div><div className="text-right w-14">Clicks</div><div className="text-right w-16">Impr.</div><div className="text-right w-12">CTR</div><div className="text-right w-12">Pos.</div>
      </div>
      {rows.map((r, i) => (
        <div key={r.query + i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-[13px] border-b border-gray-50 last:border-0">
          <div className="flex items-center gap-2 min-w-0"><IconSearch size={13} className="text-gray-300 shrink-0" /><span className="truncate text-gray-800">{r.query}</span></div>
          <div className="text-right w-14 tabular-nums text-gray-900 font-medium">{fmt(r.clicks)}</div>
          <div className="text-right w-16 tabular-nums text-gray-600">{fmt(r.impressions)}</div>
          <div className="text-right w-12 tabular-nums text-gray-600">{r.ctr}%</div>
          <div className="text-right w-12 tabular-nums text-gray-600">{r.position || "—"}</div>
        </div>
      ))}
    </div>
  );
}

function PageTable({ rows }: { rows: { url: string; clicks: number; impressions: number; position: number }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.impressions), 0);
  if (!rows.length) return <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-400">No page data from Bing yet.</div>;
  return (
    <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
      {rows.map((r, i) => (
        <a key={r.url + i} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition group">
          <IconFileText size={15} stroke={1.7} className="text-gray-300 shrink-0" />
          <div className="text-[13px] text-gray-800 truncate flex-1 group-hover:text-gray-900">{r.url}</div>
          <div className="w-24 shrink-0 hidden sm:block">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${max ? (r.impressions / max) * 100 : 0}%`, background: BING }} /></div>
          </div>
          <span className="text-[13px] font-semibold text-gray-900 tabular-nums w-14 text-right">{fmt(r.impressions)}</span>
        </a>
      ))}
    </div>
  );
}
