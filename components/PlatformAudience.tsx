"use client";
import Link from "next/link";
import { useV2Href } from "@/lib/hopeHref";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { CountriesWorldMap } from "@/components/GeoMaps";
import { useApi } from "@/lib/use-api";
import { LI_PAGE, YT_CHANNEL, YT_CHANNEL_PILLS } from "@/components/PlatformOverviews";
import { useProfile } from "@/lib/profile";
import { useState } from "react";

// Facebook / LinkedIn / YouTube audience panels for the Audience tab — styled
// like the Instagram audience page: real charts (donuts, bar charts, the world
// map), not plain progress rows. Instagram's own audience page is untouched.

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

const REGIONS = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;
export function regionName(code: string): string {
  try { return REGIONS?.of(code) || code; } catch { return code; }
}

// Smooth opacity ramp of the accent colour across n slices (1.0 → 0.22).
function shades(base: string, n: number): string[] {
  const r = parseInt(base.slice(1, 3), 16), g = parseInt(base.slice(3, 5), 16), b = parseInt(base.slice(5, 7), 16);
  return Array.from({ length: n }, (_, i) => {
    const o = n <= 1 ? 1 : 1 - (i / (n - 1)) * 0.78;
    return `rgba(${r},${g},${b},${o.toFixed(3)})`;
  });
}

// Reusable donut for any {name, value} list — the standard chart for the
// Traffic & audience section (sources, countries, cities, devices…). Shows the
// donut + a legend with each slice's share.
export function PieList({ data, color, unit }: { data: { name: string; value: number }[]; color: string; unit?: string }) {
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((s, d) => s + d.value, 0) || 1;
  const cols = shades(color, rows.length);
  return (
    <div className="flex items-center h-full gap-3">
      <ResponsiveContainer width="48%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="86%" paddingAngle={2} strokeWidth={0}>
            {rows.map((_, i) => <Cell key={i} fill={cols[i]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => `${v.toLocaleString("en-IN")}${unit ? ` ${unit}` : ""} · ${Math.round((v / total) * 100)}%`} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1 min-w-0 overflow-y-auto max-h-full pr-1">
        {rows.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cols[i] }} />
            <span className="truncate text-gray-700 flex-1">{d.name}</span>
            <span className="text-gray-500 tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartCard({ title, hint, children, tall, empty }: { title: string; hint?: string; children: React.ReactNode; tall?: boolean; empty?: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{title}</div>
        {hint && <div className="text-[10px] text-gray-400">{hint}</div>}
      </div>
      <div style={{ height: tall ? 260 : 210 }}>
        {empty ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-400 text-center px-6">
            Not enough data yet — the platform hides this breakdown until the audience is bigger.
          </div>
        ) : children}
      </div>
    </div>
  );
}

// Donut with a compact legend — for gender, devices, seniority, company size.
export function Donut({ data, color }: { data: { name: string; pct: number }[]; color: string }) {
  const cols = shades(color, data.length);
  return (
    <div className="flex items-center h-full gap-2">
      <ResponsiveContainer width="55%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="pct" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
            {data.map((_, i) => <Cell key={i} fill={cols[i]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => `${v}%`} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.slice(0, 6).map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cols[i] }} />
            <span className="truncate text-gray-700 flex-1">{d.name}</span>
            <span className="text-gray-500 tabular-nums">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Vertical bar chart — for age groups, top cities.
export function VBars({ data, color, unit }: { data: { name: string; value: number }[]; color: string; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={data.length > 6 ? -28 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 46 : 24} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v: number) => `${v.toLocaleString("en-IN")}${unit ? ` ${unit}` : ""}`} />
        <Bar dataKey="value" fill={color} radius={[5, 5, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Age & gender as PIE charts (per Maheen): a Gender donut (Male/Female) + an
// Age donut (viewer % per bracket), side by side. Values are % of viewers.
const AGE_COLORS = ["#7C3AED", "#9F67F0", "#B98BF3", "#D0AEF6", "#E3CCF9", "#F1E4FC"];
export function AgeGenderPies({ ageGroups, genderSplit }: {
  ageGroups: { group: string; pct: number }[];
  genderSplit: { label: string; pct: number }[];
}) {
  const genders = (genderSplit || [])
    .filter((g) => g.label.toLowerCase() !== "genderuserspecified")
    .map((g) => ({ name: g.label.toLowerCase() === "male" ? "Male" : g.label.toLowerCase() === "female" ? "Female" : g.label, pct: g.pct }));
  const genderColor = (name: string) => (name === "Male" ? "#7C3AED" : name === "Female" ? "#DB2777" : "#9CA3AF");
  const ages = [...(ageGroups || [])].sort((a, b) => parseInt(a.group) - parseInt(b.group));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
      <div className="flex flex-col">
        <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Gender</div>
        <div className="flex-1 min-h-0 flex items-center gap-2">
          <ResponsiveContainer width="52%" height="100%">
            <PieChart>
              <Pie data={genders} dataKey="pct" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                {genders.map((g) => <Cell key={g.name} fill={genderColor(g.name)} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5 min-w-0">
            {genders.map((g) => (
              <div key={g.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: genderColor(g.name) }} />
                <span className="truncate text-gray-700 flex-1">{g.name}</span>
                <span className="text-gray-500 tabular-nums">{g.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Age</div>
        <div className="flex-1 min-h-0 flex items-center gap-2">
          <ResponsiveContainer width="52%" height="100%">
            <PieChart>
              <Pie data={ages} dataKey="pct" nameKey="group" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                {ages.map((_, i) => <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1 min-w-0">
            {ages.map((a, i) => (
              <div key={a.group} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: AGE_COLORS[i % AGE_COLORS.length] }} />
                <span className="truncate text-gray-700 flex-1">{a.group}</span>
                <span className="text-gray-500 tabular-nums">{a.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Horizontal bar chart — for long labels (job functions, industries, locations).
export function HBars({ data, color, unit }: { data: { name: string; value: number }[]; color: string; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} interval={0} />
        <Tooltip formatter={(v: number) => `${v.toLocaleString("en-IN")}${unit ? ` ${unit}` : ""}`} />
        <Bar dataKey="value" fill={color} radius={[0, 5, 5, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PanelHeader({ title, sub, href, live }: { title: string; sub?: string; href: string; live?: boolean }) {
  const v2 = useV2Href();
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
      </div>
      <div className="flex items-center gap-3">
        {live === true && <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>}
        {live === false && <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Demo</span>}
        <Link href={v2(href)} className="text-xs font-medium text-brand hover:underline">Open deep dive →</Link>
      </div>
    </div>
  );
}

function EmptyPlatform({ platform }: { platform: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center">
      <div className="text-base font-medium text-gray-700 mb-1">No {platform} yet</div>
      <p className="text-sm text-gray-400">This brand doesn&apos;t have a {platform} presence connected to the dashboard.</p>
    </div>
  );
}

// ── Facebook audience ───────────────────────────────────────────────────────

type FbResp = {
  page: { name: string; followers: number | null };
  audience?: { available: boolean; countries: { code: string; count: number; pct: number }[] };
  error?: string;
};

export function FacebookAudience({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ account: accountId, from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<FbResp>(`/api/facebook?${qs}`);
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading Facebook audience…</div>;
  if (!data || data.error) return <EmptyPlatform platform="Facebook page" />;

  const countries = data.audience?.available ? data.audience.countries : [];

  return (
    <div className="space-y-4">
      <PanelHeader title={data.page.name || "Facebook"} sub={`Facebook Page · ${fmt(data.page.followers)} followers`} href="/dashboard/facebook" live />
      {countries.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Followers around the world" hint={`${countries.length} countries`} tall>
            <CountriesWorldMap entries={countries.map((c) => ({ label: c.code, value: c.count }))} />
          </ChartCard>
          <ChartCard title="Top countries" hint="followers" tall>
            <HBars color="#1877F2" unit="followers" data={countries.slice(0, 8).map((c) => ({ name: regionName(c.code), value: c.count }))} />
          </ChartCard>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-400">No country data returned for this page yet — Meta shows it once a page has enough followers.</div>
      )}
      <p className="text-[11px] text-gray-400">
        Country split is the only audience breakdown Meta still provides for Facebook Pages — city, age and gender were removed from Meta&apos;s API for everyone.
      </p>
    </div>
  );
}

// ── LinkedIn audience ───────────────────────────────────────────────────────

type DemoRow = { label: string; pct: number; count: number };
type LiResp = {
  source: "demo" | "live";
  page: { name: string };
  summary: { followers: number };
  demographics: { jobFunction: DemoRow[]; seniority: DemoRow[]; industry: DemoRow[]; location: DemoRow[]; companySize: DemoRow[] };
  error?: string;
};

export function LinkedInAudience({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const pageKey = LI_PAGE[accountId] ?? null;
  const qs = new URLSearchParams({ page: pageKey ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<LiResp>(pageKey ? `/api/linkedin?${qs}` : null);
  if (!pageKey) return <EmptyPlatform platform="LinkedIn page" />;
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading LinkedIn audience…</div>;
  if (!data || data.error) return <EmptyPlatform platform="LinkedIn page" />;

  const d = data.demographics;
  const allEmpty = ["jobFunction", "seniority", "industry", "location", "companySize"]
    .every((k) => !(d as Record<string, DemoRow[]>)[k]?.length);
  const bars = (list: DemoRow[], n = 8) => (list || []).slice(0, n).map((r) => ({ name: r.label, value: r.count || Math.round(r.pct) }));
  const donut = (list: DemoRow[], n = 6) => (list || []).slice(0, n).map((r) => ({ name: r.label, pct: r.pct }));
  const LB = "#0A66C2";

  return (
    <div className="space-y-4">
      <PanelHeader title={data.page.name || "LinkedIn"} sub={`LinkedIn Page · ${fmt(data.summary.followers)} followers`} href="/dashboard/linkedin" live={data.source === "live"} />
      {allEmpty ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-900">
          <div className="font-medium mb-1">LinkedIn&apos;s daily data allowance is used up</div>
          LinkedIn only lets us ask for follower demographics a few times per day, and today&apos;s quota is spent.
          It resets automatically — this section fills itself back in tomorrow.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Job function" hint="what your followers do">
            <HBars color={LB} unit="followers" data={bars(d.jobFunction)} />
          </ChartCard>
          <ChartCard title="Seniority" hint="how senior they are">
            <Donut color={LB} data={donut(d.seniority)} />
          </ChartCard>
          <ChartCard title="Location" hint="where they are">
            <HBars color={LB} unit="followers" data={bars(d.location)} />
          </ChartCard>
          <ChartCard title="Industry">
            <HBars color={LB} unit="followers" data={bars(d.industry, 6)} />
          </ChartCard>
          <ChartCard title="Company size">
            <Donut color={LB} data={donut(d.companySize)} />
          </ChartCard>
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        LinkedIn offers professional demographics only — it never exposes members&apos; age or gender to any app.
      </p>
    </div>
  );
}

// ── YouTube audience ────────────────────────────────────────────────────────

type YtResp = {
  source: "demo" | "live";
  channel: { name: string; handle: string };
  summary: { subscribers: number };
  traffic: {
    sources: { source: string; views: number; pct: number }[];
    geography: { country: string; views: number; pct: number }[];
    cities?: { city: string; views: number; pct: number }[];
    devices: { device: string; pct: number }[];
    ageGroups: { group: string; pct: number }[];
    genderSplit: { label: string; pct: number }[];
    ageGender?: { group: string; male: number; female: number }[];
  };
  error?: string;
};

export function YouTubeAudience({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  // MAIN mode: channel pills make every channel reachable. PROFILE mode: locked
  // to the brand's own channel — no pills, no cross-brand data.
  const profile = useProfile();
  const [channelPick, setChannelPick] = useState<string | null>(null);
  const channel = profile ? (YT_CHANNEL[profile] ?? "") : (channelPick ?? YT_CHANNEL[accountId] ?? "goocampus");
  const qs = new URLSearchParams({ channel, from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<YtResp>(channel ? `/api/youtube?${qs}` : null);

  if (profile && !channel) return <EmptyPlatform platform="YouTube channel" />;

  const pills = profile ? null : (
    <div className="bg-white border border-gray-100 rounded-lg p-1.5 inline-flex items-center gap-1">
      {YT_CHANNEL_PILLS.map((c) => (
        <button
          key={c.key}
          onClick={() => setChannelPick(c.key)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${channel === c.key ? "bg-red-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  if (isLoading && !data) return <div className="space-y-4">{pills}<div className="text-sm text-gray-400 py-16 text-center">Loading YouTube audience…</div></div>;
  if (!data || data.error) return <div className="space-y-4">{pills}<EmptyPlatform platform="YouTube channel" /></div>;

  const t = data.traffic;
  const YR = "#FF0000";

  return (
    <div className="space-y-4">
      <PanelHeader title={data.channel.name || "YouTube"} sub={`${data.channel.handle} · ${fmt(data.summary.subscribers)} subscribers`} href="/dashboard/youtube" live={data.source === "live"} />
      {pills}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartCard title="Traffic sources" hint="views" empty={!(t.sources || []).length}>
          <PieList color={YR} unit="views" data={(t.sources || []).slice(0, 8).map((s) => ({ name: s.source, value: s.views }))} />
        </ChartCard>
        <ChartCard title="Top countries" hint="views" empty={!(t.geography || []).length}>
          <PieList color={YR} unit="views" data={(t.geography || []).slice(0, 8).map((g) => ({ name: regionName(g.country), value: g.views }))} />
        </ChartCard>
        <ChartCard title="Top cities" hint="views · Google hides small cities" empty={!(t.cities || []).length}>
          <PieList color={YR} unit="views" data={(t.cities || []).slice(0, 8).map((c) => ({ name: c.city, value: c.views }))} />
        </ChartCard>
        <ChartCard title="Devices" hint="% of views" empty={!(t.devices || []).length}>
          <PieList color={YR} unit="%" data={(t.devices || []).map((d) => ({ name: d.device, value: d.pct }))} />
        </ChartCard>
        <ChartCard title="Age & gender" hint="% of viewers in range" empty={!(t.ageGroups || []).length && !(t.genderSplit || []).length}>
          <AgeGenderPies ageGroups={t.ageGroups || []} genderSplit={t.genderSplit || []} />
        </ChartCard>
      </div>
      <p className="text-[11px] text-gray-400">
        Audience describes who WATCHED in the selected date range. State-level breakdown isn&apos;t possible — Google only offers it for the US.
      </p>
    </div>
  );
}
