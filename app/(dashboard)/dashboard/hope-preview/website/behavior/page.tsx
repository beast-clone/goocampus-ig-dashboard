"use client";
import { ChartCard, PieList } from "@/components/PlatformAudience";
import { IconExternalLink, IconAlertTriangle, IconFileText } from "@tabler/icons-react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { AiInsights } from "@/components/AiInsights";
import { useApi } from "@/lib/use-api";

const CL = "#6E48F8"; // Clarity violet

type Cat = { name: string; value: number };
type Resp = {
  source: "live";
  projectId: string;
  numOfDays: number;
  latencyMs: number;
  traffic: { sessions: number; botSessions: number; distinctUsers: number; pagesPerSession: number };
  scrollDepth: number;
  engagement: { totalTimeSec: number; activeTimeSec: number };
  signals: { name: string; sessionsPct: number; count: number }[];
  devices: Cat[];
  browsers: Cat[];
  os: Cat[];
  countries: Cat[];
  referrers: Cat[];
  pages: { url: string; visits: number }[];
  error?: string;
};

const SITE = "goocampusevents.com";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
function secs(s: number): string {
  if (s >= 60) { const m = Math.floor(s / 60); return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`; }
  return `${s}s`;
}

export default function BehaviorPage() {
  return (
    <HopeDashboardShell active="website" title="Website · Clarity" subtitle={`Microsoft Clarity — ${SITE}`} hideAccountPicker hideRange>
      {() => <Inner />}
    </HopeDashboardShell>
  );
}

function Inner() {
  // Clarity allows only 10 calls/day → don't revalidate on focus; lean on the 3h server cache.
  const { data, error, isLoading, refresh } = useApi<Resp>("/api/website/behavior", { revalidateOnFocus: false, dedupingInterval: 3 * 60 * 60_000 });
  const clarityUrl = data?.projectId ? `https://clarity.microsoft.com/projects/view/${data.projectId}/dashboard` : "https://clarity.microsoft.com/";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: CL }} />
          <span className="text-sm font-semibold text-gray-800">{SITE}</span>
          <span className="text-[11px] text-gray-400">· behavior, last 3 days (Clarity API limit)</span>
        </div>
        <div className="flex items-center gap-3">
          {data?.source === "live" && (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200">● Live · Microsoft Clarity</span>
          )}
          <a href={clarityUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <IconExternalLink size={14} stroke={1.8} /> Open in Clarity
          </a>
          <LiveIndicator loading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        Clarity&apos;s heatmaps and session recordings can&apos;t be pulled by any API — for those, use <a href={clarityUrl} target="_blank" rel="noreferrer" className="text-violet-700 underline">Open in Clarity</a>. This page shows the aggregate signals the API does expose.
      </div>

      <AiInsights endpoint="/api/website/insights?source=clarity" accent={CL} label="Analyze this Clarity data with AI" />

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{error.message}</div>}
      {!data && isLoading && <div className="text-sm text-gray-400 py-16 text-center">Loading Clarity…</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Stat label="Sessions" value={fmt(data.traffic.sessions)} sub={`${fmt(data.traffic.botSessions)} bots excl.`} accent />
            <Stat label="Distinct users" value={fmt(data.traffic.distinctUsers)} sub="unique" />
            <Stat label="Pages / session" value={String(data.traffic.pagesPerSession)} sub="average" />
            <Stat label="Active time" value={secs(data.engagement.activeTimeSec)} sub={`${secs(data.engagement.totalTimeSec)} total`} />
            <Stat label="Scroll depth" value={`${data.scrollDepth}%`} sub="average" />
            <Stat label="Bot sessions" value={fmt(data.traffic.botSessions)} sub="filtered out" />
          </div>

          <Section title="Frustration & error signals" hint="% of sessions affected · last 3 days">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {data.signals.map((s) => (
                <div key={s.name} className="bg-white border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <IconAlertTriangle size={13} stroke={1.8} className={s.sessionsPct > 0 ? "text-amber-500" : "text-gray-300"} />
                    <span className="text-[11px] font-medium text-gray-600 leading-tight">{s.name}</span>
                  </div>
                  <div className="text-xl font-semibold tabular-nums" style={{ color: s.sessionsPct > 0 ? CL : "#9ca3af" }}>{s.sessionsPct}%</div>
                  <div className="text-[11px] text-gray-400">{fmt(s.count)} total</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Popular pages" hint="visits">
            <PageList pages={data.pages} />
          </Section>

          <Section title="Breakdown">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <ChartCard title="Devices" hint="sessions" empty={!data.devices.length}>
                <PieList color={CL} unit="sessions" data={data.devices.slice(0, 8)} />
              </ChartCard>
              <ChartCard title="Browsers" hint="sessions" empty={!data.browsers.length}>
                <PieList color={CL} unit="sessions" data={data.browsers.slice(0, 8)} />
              </ChartCard>
              <ChartCard title="Operating systems" hint="sessions" empty={!data.os.length}>
                <PieList color={CL} unit="sessions" data={data.os.slice(0, 8)} />
              </ChartCard>
              <ChartCard title="Countries" hint="sessions" empty={!data.countries.length}>
                <PieList color={CL} unit="sessions" data={data.countries.slice(0, 8)} />
              </ChartCard>
              <ChartCard title="Referrers" hint="sessions" empty={!data.referrers.length}>
                <PieList color={CL} unit="sessions" data={data.referrers.slice(0, 8)} />
              </ChartCard>
            </div>
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
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: CL } : {}}>{value}</div>
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

function PageList({ pages }: { pages: { url: string; visits: number }[] }) {
  const max = pages.reduce((m, p) => Math.max(m, p.visits), 0);
  if (!pages.length) return <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-400">No page data in the last 3 days.</div>;
  return (
    <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
      {pages.map((p, i) => (
        <a key={p.url + i} href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition group">
          <span className="text-[11px] font-semibold text-gray-400 w-5 tabular-nums">{i + 1}</span>
          <IconFileText size={15} stroke={1.7} className="text-gray-300 shrink-0" />
          <div className="text-[13px] text-gray-800 truncate flex-1 group-hover:text-gray-900">{p.url}</div>
          <div className="w-24 shrink-0 hidden sm:block">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${max ? (p.visits / max) * 100 : 0}%`, background: CL }} />
            </div>
          </div>
          <span className="text-[13px] font-semibold text-gray-900 tabular-nums w-12 text-right">{fmt(p.visits)}</span>
        </a>
      ))}
    </div>
  );
}
