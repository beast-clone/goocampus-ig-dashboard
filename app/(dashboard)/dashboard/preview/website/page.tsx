"use client";
import { ChartCard, PieList, regionName } from "@/components/PlatformAudience";
import { IconExternalLink, IconFileText, IconTargetArrow, IconBolt } from "@tabler/icons-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { AiInsights } from "@/components/AiInsights";
import { useApi } from "@/lib/use-api";

const GA = "#E37400"; // Google Analytics orange

type Cat = { name: string; value: number; pct: number };
type Resp = {
  source: "live";
  property: string;
  range: { from: string; to: string };
  latencyMs: number;
  summary: { users: number; newUsers: number; sessions: number; engagedSessions: number; pageViews: number; keyEvents: number; avgSessionSec: number; engagementRate: number; bounceRate: number; viewsPerSession: number };
  realtime: { activeUsers: number; byCountry: { name: string; value: number }[]; byDevice: { name: string; value: number }[] } | null;
  usersOverTime: { date: string; users: number; sessions: number; keyEvents: number }[];
  topPages: { path: string; title: string; views: number }[];
  landingPages: { path: string; sessions: number; keyEvents: number }[];
  events: { name: string; count: number; keyEvents: number }[];
  channels: { channel: string; sessions: number; pct: number }[];
  sourceMedium: { name: string; sessions: number; pct: number }[];
  countries: { country: string; users: number; pct: number }[];
  cities: { city: string; users: number; pct: number }[];
  devices: { device: string; sessions: number; pct: number }[];
  browsers: Cat[];
  os: Cat[];
  languages: Cat[];
  newVsReturning: Cat[];
  age: Cat[];
  gender: Cat[];
  error?: string;
};

const SITE = "goocampusevents.com";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
function duration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function WebsitePage() {
  return (
    <PreviewDashboardShell active="website" title="Website" subtitle={`Google Analytics — ${SITE}`} hideAccountPicker>
      {({ range }) => <Inner range={range} />}
    </PreviewDashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ from: range.from, to: range.to }).toString();
  const { data, error, isLoading, refresh } = useApi<Resp>(`/api/website/traffic?${qs}`);
  const gaUrl = data?.property
    ? `https://analytics.google.com/analytics/web/#/p${data.property}/reports/intelligenthome`
    : "https://analytics.google.com/";

  return (
    <div className="space-y-5">
      {/* Site + status */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: GA }} />
          <span className="text-base font-medium text-[#232D42]">{SITE}</span>
        </div>
        <div className="flex items-center gap-3">
          {data?.source === "live" && (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live · Google Analytics</span>
          )}
          <a href={gaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <IconExternalLink size={14} stroke={1.8} /> Open in GA
          </a>
          <LiveIndicator loading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      <AiInsights endpoint={`/api/website/insights?source=ga&${qs}`} accent={GA} label="Analyze this Google Analytics data with AI" />

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{error.message}</div>}
      {!data && isLoading && <div className="text-sm text-gray-400 py-16 text-center">Loading Google Analytics…</div>}

      {data && (
        <>
          {/* Realtime + primary KPIs */}
          {data.realtime && <Realtime rt={data.realtime} />}

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Stat label="Users" value={fmt(data.summary.users)} sub={`${fmt(data.summary.newUsers)} new`} accent />
            <Stat label="Sessions" value={fmt(data.summary.sessions)} sub={`${fmt(data.summary.engagedSessions)} engaged`} />
            <Stat label="Page views" value={fmt(data.summary.pageViews)} sub={`${data.summary.viewsPerSession}/session`} />
            <Stat label="Key events" value={fmt(data.summary.keyEvents)} sub="conversions" />
            <Stat label="Avg session" value={duration(data.summary.avgSessionSec)} sub="min:sec" />
            <Stat label="Engagement" value={`${data.summary.engagementRate}%`} sub={`${data.summary.bounceRate}% bounce`} />
          </div>

          <Section title="Users & sessions">
            <UsersChart data={data.usersOverTime} totalUsers={data.summary.users} totalSessions={data.summary.sessions} />
          </Section>

          <Section title="Conversions & events" hint="key events = GA conversions">
            <EventsTable events={data.events} />
          </Section>

          <Section title="Pages">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Titled title="Top pages" hint="views">
                <PageList rows={data.topPages.map((p) => ({ title: p.title, path: p.path, value: p.views, href: `https://${SITE}${p.path}` }))} />
              </Titled>
              <Titled title="Landing pages" hint="sessions · entries">
                <PageList rows={data.landingPages.map((p) => ({ title: p.path === "(not set)" ? "(not set)" : p.path, path: p.keyEvents ? `${p.keyEvents} key events` : "", value: p.sessions, href: `https://${SITE}${p.path}` }))} />
              </Titled>
            </div>
          </Section>

          <Section title="Acquisition">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChartCard title="Channels" hint="sessions" empty={!data.channels.length}>
                <PieList color={GA} unit="sessions" data={data.channels.slice(0, 8).map((c) => ({ name: c.channel, value: c.sessions }))} />
              </ChartCard>
              <ChartCard title="Source / medium" hint="sessions" empty={!data.sourceMedium.length}>
                <PieList color={GA} unit="sessions" data={data.sourceMedium.slice(0, 8).map((c) => ({ name: c.name, value: c.sessions }))} />
              </ChartCard>
            </div>
          </Section>

          <Section title="Locations">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChartCard title="Top countries" hint="users" empty={!data.countries.length}>
                <PieList color={GA} unit="users" data={data.countries.slice(0, 8).map((c) => ({ name: regionName(c.country), value: c.users }))} />
              </ChartCard>
              <ChartCard title="Top cities" hint="users" empty={!data.cities.length}>
                <PieList color={GA} unit="users" data={data.cities.slice(0, 8).map((c) => ({ name: c.city, value: c.users }))} />
              </ChartCard>
            </div>
          </Section>

          <Section title="Technology">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ChartCard title="Devices" hint="sessions" empty={!data.devices.length}>
                <PieList color={GA} unit="sessions" data={data.devices.map((d) => ({ name: d.device, value: d.sessions }))} />
              </ChartCard>
              <ChartCard title="Browsers" hint="sessions" empty={!data.browsers.length}>
                <PieList color={GA} unit="sessions" data={data.browsers.slice(0, 8).map((d) => ({ name: d.name, value: d.value }))} />
              </ChartCard>
              <ChartCard title="Operating systems" hint="sessions" empty={!data.os.length}>
                <PieList color={GA} unit="sessions" data={data.os.slice(0, 8).map((d) => ({ name: d.name, value: d.value }))} />
              </ChartCard>
            </div>
          </Section>

          <Section title="Audience" hint="age & gender need Google Signals enabled in GA">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <ChartCard title="New vs returning" hint="users" empty={!data.newVsReturning.length}>
                <PieList color={GA} unit="users" data={data.newVsReturning.map((d) => ({ name: d.name || "(unknown)", value: d.value }))} />
              </ChartCard>
              <ChartCard title="Age" hint="users" empty={!data.age.length}>
                <PieList color={GA} unit="users" data={data.age.map((d) => ({ name: d.name, value: d.value }))} />
              </ChartCard>
              <ChartCard title="Gender" hint="users" empty={!data.gender.length}>
                <PieList color={GA} unit="users" data={data.gender.map((d) => ({ name: d.name, value: d.value }))} />
              </ChartCard>
              <ChartCard title="Languages" hint="sessions" empty={!data.languages.length}>
                <PieList color={GA} unit="sessions" data={data.languages.slice(0, 8).map((d) => ({ name: d.name, value: d.value }))} />
              </ChartCard>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Realtime({ rt }: { rt: { activeUsers: number; byCountry: { name: string; value: number }[]; byDevice: { name: string; value: number }[] } }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-wrap items-center gap-x-8 gap-y-3">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <div>
          <div className="text-2xl font-semibold text-gray-900 tabular-nums leading-none">{rt.activeUsers}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">active in last 30 min</div>
        </div>
      </div>
      <MiniInline label="By device" items={rt.byDevice} />
      <MiniInline label="Top countries" items={rt.byCountry.slice(0, 4)} />
    </div>
  );
}
function MiniInline({ label, items }: { label: string; items: { name: string; value: number }[] }) {
  if (!items.length) return null;
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">{label}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((it) => (
          <span key={it.name} className="text-[12px] text-gray-600">{it.name} <b className="text-gray-900 tabular-nums">{it.value}</b></span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: GA } : {}}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-base font-medium text-[#232D42]">{title}</div>
        {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Titled({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-baseline justify-between px-4 py-2.5 border-b border-gray-50">
        <div className="text-base font-medium text-[#232D42]">{title}</div>
        {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function PageList({ rows }: { rows: { title: string; path: string; value: number; href: string }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  if (!rows.length) return <div className="p-8 text-center text-sm text-gray-400">No data in range.</div>;
  return (
    <div className="divide-y divide-gray-50">
      {rows.map((r, i) => (
        <a key={r.href + i} href={r.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition group">
          <span className="text-[11px] font-semibold text-gray-400 w-5 tabular-nums">{i + 1}</span>
          <IconFileText size={15} stroke={1.7} className="text-gray-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-gray-800 truncate group-hover:text-gray-900">{r.title}</div>
            {r.path && <div className="text-[11px] text-gray-400 truncate">{r.path}</div>}
          </div>
          <div className="w-24 shrink-0 hidden sm:block">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${max ? (r.value / max) * 100 : 0}%`, background: GA }} />
            </div>
          </div>
          <span className="text-[13px] font-semibold text-gray-900 tabular-nums w-16 text-right">{fmt(r.value)}</span>
        </a>
      ))}
    </div>
  );
}

function EventsTable({ events }: { events: { name: string; count: number; keyEvents: number }[] }) {
  if (!events.length) return <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-400">No events in range.</div>;
  const max = events.reduce((m, e) => Math.max(m, e.count), 0);
  return (
    <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
      {events.map((e) => (
        <div key={e.name} className="flex items-center gap-3 px-4 py-2.5">
          {e.keyEvents > 0
            ? <IconTargetArrow size={15} stroke={1.8} className="text-emerald-500 shrink-0" />
            : <IconBolt size={15} stroke={1.7} className="text-gray-300 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-gray-800 truncate font-mono">{e.name}</div>
            {e.keyEvents > 0 && <div className="text-[11px] text-emerald-600">{fmt(e.keyEvents)} key events (conversion)</div>}
          </div>
          <div className="w-28 shrink-0 hidden sm:block">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${max ? (e.count / max) * 100 : 0}%`, background: e.keyEvents > 0 ? "#10b981" : GA }} />
            </div>
          </div>
          <span className="text-[13px] font-semibold text-gray-900 tabular-nums w-16 text-right">{fmt(e.count)}</span>
        </div>
      ))}
    </div>
  );
}

function UsersChart({ data, totalUsers, totalSessions }: { data: { date: string; users: number; sessions: number; keyEvents: number }[]; totalUsers: number; totalSessions: number }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Users over time</div>
          <div className="text-2xl font-semibold text-gray-900">{totalUsers.toLocaleString("en-IN")}<span className="text-xs font-normal text-gray-500 ml-2">users · {totalSessions.toLocaleString("en-IN")} sessions</span></div>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gaUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GA} stopOpacity={0.18} />
                <stop offset="100%" stopColor={GA} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={40} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} width={42} />
            <Tooltip
              cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { date: string; users: number; sessions: number; keyEvents: number };
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs min-w-[150px]">
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">{p.date}</div>
                    <div className="text-base font-semibold text-gray-900">{p.users.toLocaleString("en-IN")} users</div>
                    <div className="text-xs text-gray-500">{p.sessions.toLocaleString("en-IN")} sessions · {p.keyEvents} key events</div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="users" stroke={GA} strokeWidth={2.5} fill="url(#gaUsers)" dot={false} activeDot={{ r: 5, fill: GA, stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
