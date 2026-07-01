"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import PostingHeatmap from "@/components/PostingHeatmap";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { useApi } from "@/lib/use-api";

type DemoEntry = { label: string; value: number };
type AudienceData = {
  account: { id: string; label: string; handle: string; followers: number; following: number };
  age: DemoEntry[];
  gender: DemoEntry[];
  cities: DemoEntry[];
  countries: DemoEntry[];
  ageGender: { age: string; M: number; F: number; U: number }[];
  onlineFollowers: { hour: number; value: number }[];
  onlineGrid?: (number | null)[][];
  available: boolean;
  reason?: string;
};

const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const GENDER_LABELS: Record<string, string> = { M: "Male", F: "Female", U: "Unspecified" };
const GENDER_COLORS: Record<string, string> = { Male: "#7c3aed", Female: "#ec4899", Unspecified: "#cbd5e1" };

function sortAge<T extends { label?: string; age?: string }>(arr: T[], key: "label" | "age"): T[] {
  return [...arr].sort((a, b) => AGE_ORDER.indexOf((a[key] as string) || "") - AGE_ORDER.indexOf((b[key] as string) || ""));
}

function pctOf(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

// ISO 3166-1 alpha-2 → flag emoji
function flag(code: string): string {
  if (!code || code.length !== 2) return "🏳️";
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const COUNTRY_NAME: Record<string, string> = {
  IN: "India", PK: "Pakistan", GB: "United Kingdom", US: "United States",
  AE: "UAE", AU: "Australia", CA: "Canada", NG: "Nigeria", PH: "Philippines",
  GE: "Georgia", RU: "Russia", BD: "Bangladesh", LK: "Sri Lanka", NP: "Nepal",
  SG: "Singapore", MY: "Malaysia", DE: "Germany", FR: "France", ZA: "South Africa",
  SA: "Saudi Arabia", QA: "Qatar", OM: "Oman", KW: "Kuwait", BH: "Bahrain",
  IE: "Ireland", NZ: "New Zealand", IT: "Italy", ES: "Spain",
};

export default function AudiencePage() {
  return (
    <DashboardShell title="Audience">
      {({ accountId }) => <Audience accountId={accountId} />}
    </DashboardShell>
  );
}

function Audience({ accountId }: { accountId: string }) {
  const { data, error, isLoading, refresh } = useApi<AudienceData>(`/api/audience?accountId=${encodeURIComponent(accountId)}`);
  const loading = isLoading;
  const fetchData = () => refresh();

  // Track fetchedAt + latency for the LiveIndicator chip
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fetchStartRef = useRef<number>(0);
  useEffect(() => { if (isLoading) fetchStartRef.current = Date.now(); }, [isLoading]);
  useEffect(() => {
    if (data && !isLoading) { setFetchedAt(Date.now()); setLastLatencyMs(Date.now() - fetchStartRef.current); }
  }, [data, isLoading]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const persona = useMemo(() => buildPersona(data), [data]);
  void tick; // legacy — kept for safety, no-op

  if (loading && !data) return <div className="text-sm text-gray-500">Loading live audience…</div>;
  if (error) return <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-4 rounded-lg">{error.message}</div>;
  if (!data) return <div className="text-sm text-gray-500">No data.</div>;

  const ageGenderTotal = data.ageGender.reduce((s, r) => s + r.M + r.F + r.U, 0);
  const sortedAgeGender = sortAge(data.ageGender, "age");
  const sortedAge = sortAge(data.age, "label");
  const ageTotal = sortedAge.reduce((s, e) => s + e.value, 0);
  const genderTotal = data.gender.reduce((s, e) => s + e.value, 0);
  const genderData = data.gender.map((g) => ({
    name: GENDER_LABELS[g.label] || g.label,
    value: g.value,
  }));

  const onlineSeries = data.onlineFollowers.map((h) => ({
    hour: `${String(h.hour).padStart(2, "0")}:00`,
    followers: h.value,
  }));

  return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={lastLatencyMs} loading={loading} onRefresh={() => fetchData(true)} />
      <div className="mb-4 text-xs text-gray-500">
        {data.account.handle} &middot; {data.account.followers.toLocaleString("en-IN")} followers
      </div>

      {/* Lifetime data explanation banner */}
      <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 mb-4 flex items-start gap-2">
        <span className="text-base leading-none">ℹ️</span>
        <div>
          <span className="font-medium">Why doesn&apos;t the 7d / 30d / 90d button change this page?</span>{" "}
          <span className="text-amber-800">Meta only returns demographics as a single &ldquo;lifetime&rdquo; snapshot — not by date range. So changing the picker has no effect on this tab. It will change Overview / Posts / Reels / Ads.</span>
        </div>
      </div>

      {!data.available && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mb-4">
          <div className="font-medium mb-1">Demographics not available</div>
          <div className="text-xs">{data.reason || "Account needs 100+ followers and Meta hasn't computed for it yet."}</div>
        </div>
      )}

      {/* Persona summary */}
      {persona && (
        <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest opacity-80 mb-1">Your typical follower</div>
          <div className="text-xl font-medium leading-snug">{persona}</div>
        </div>
      )}

      {/* Top row: Age × Gender pyramid + Gender donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium">Age &times; Gender</div>
            <div className="text-xs text-gray-400">
              <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: "#7c3aed" }} />Male
              <span className="inline-block w-2.5 h-2.5 rounded-sm ml-3 mr-1 align-middle" style={{ background: "#ec4899" }} />Female
            </div>
          </div>
          {sortedAgeGender.length > 0 ? (
            <Pyramid rows={sortedAgeGender} total={ageGenderTotal} />
          ) : sortedAge.length > 0 ? (
            <div className="space-y-2">
              {sortedAge.map((a) => (
                <SimpleBar key={a.label} label={a.label} value={a.value} pct={pctOf(a.value, ageTotal)} color="#7c3aed" />
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm font-medium mb-3">Gender</div>
          {genderData.length > 0 ? (
            <>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={genderData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {genderData.map((g) => (
                        <Cell key={g.name} fill={GENDER_COLORS[g.name] || "#cbd5e1"} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {genderData.map((g) => (
                  <div key={g.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: GENDER_COLORS[g.name] || "#cbd5e1" }} />
                      <span className="text-gray-700">{g.name}</span>
                    </div>
                    <span className="text-gray-500">{pctOf(g.value, genderTotal).toFixed(1)}% &middot; {g.value.toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty />}
        </div>
      </div>

      {/* Geography */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <CountryCard countries={data.countries.slice(0, 10)} />
        <CityCard cities={data.cities.slice(0, 10)} />
      </div>

      {/* Best time to post heatmap */}
      {data.onlineGrid && (
        <div className="mb-6">
          <PostingHeatmap grid={data.onlineGrid} />
        </div>
      )}

      {/* Online activity */}
      {onlineSeries.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-sm font-medium">When followers are online</div>
              <div className="text-xs text-gray-500">Average per hour, last 7 days</div>
            </div>
            <PeakBadge data={onlineSeries.map((s) => ({ hour: parseInt(s.hour, 10), value: s.followers }))} />
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={onlineSeries} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="onlineG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="#94a3b8" tickMargin={6} interval={2} />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={48} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Area type="monotone" dataKey="followers" stroke="#7c3aed" strokeWidth={2} fill="url(#onlineG)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}

function buildPersona(data: AudienceData | null): string | null {
  if (!data || !data.available) return null;
  const topAge = sortAge(data.age, "label").reduce((max, e) => e.value > max.value ? e : max, { label: "", value: 0 });
  const totalGender = data.gender.reduce((s, e) => s + e.value, 0);
  const maleVal = data.gender.find((g) => g.label === "M")?.value || 0;
  const femaleVal = data.gender.find((g) => g.label === "F")?.value || 0;
  const malePct = pctOf(maleVal, totalGender);
  const femalePct = pctOf(femaleVal, totalGender);
  const genderPhrase = Math.abs(malePct - femalePct) < 5
    ? "with an even male-female split"
    : malePct > femalePct
      ? `slightly male-leaning (${malePct.toFixed(0)}%)`
      : `slightly female-leaning (${femalePct.toFixed(0)}%)`;
  const topCity = data.cities[0]?.label?.split(",")[0] || null;
  const topCountry = data.countries[0]?.label;
  const peakHour = data.onlineFollowers.length > 0
    ? data.onlineFollowers.reduce((m, h) => h.value > m.value ? h : m).hour
    : null;
  const parts: string[] = [];
  if (topAge.label) parts.push(`a **${topAge.label}-year-old**`);
  parts.push(genderPhrase);
  if (topCountry) parts.push(`based in **${COUNTRY_NAME[topCountry] || topCountry}**`);
  if (topCity) parts.push(`mostly in **${topCity}**`);
  if (peakHour !== null) parts.push(`most active around **${String(peakHour).padStart(2, "0")}:00**`);
  const sentence = parts.join(", ").replace(/\*\*(.+?)\*\*/g, "$1");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function Pyramid({ rows, total }: { rows: { age: string; M: number; F: number; U: number }[]; total: number }) {
  if (total === 0) return <Empty />;
  const maxSide = Math.max(...rows.map((r) => Math.max(r.M, r.F))) || 1;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const mPct = (r.M / maxSide) * 100;
        const fPct = (r.F / maxSide) * 100;
        const mShare = pctOf(r.M, total);
        const fShare = pctOf(r.F, total);
        return (
          <div key={r.age} className="grid grid-cols-[1fr_60px_1fr] items-center gap-2">
            <div className="flex items-center justify-end">
              <span className="text-[10px] text-gray-400 mr-2">{mShare.toFixed(1)}%</span>
              <div className="h-5 rounded-l-md" style={{ width: `${mPct}%`, background: "#7c3aed" }} title={`${r.M.toLocaleString("en-IN")} male`} />
            </div>
            <div className="text-center text-xs font-medium text-gray-700">{r.age}</div>
            <div className="flex items-center">
              <div className="h-5 rounded-r-md" style={{ width: `${fPct}%`, background: "#ec4899" }} title={`${r.F.toLocaleString("en-IN")} female`} />
              <span className="text-[10px] text-gray-400 ml-2">{fShare.toFixed(1)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CountryCard({ countries }: { countries: DemoEntry[] }) {
  const total = countries.reduce((s, c) => s + c.value, 0);
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="text-sm font-medium mb-4">Top countries</div>
      {countries.length === 0 && <Empty />}
      <div className="space-y-3">
        {countries.map((c) => {
          const pct = pctOf(c.value, total);
          return (
            <div key={c.label} className="flex items-center gap-3">
              <div className="text-xl leading-none w-7">{flag(c.label)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-700 truncate">{COUNTRY_NAME[c.label] || c.label}</span>
                  <span className="text-gray-500">{pct.toFixed(1)}% &middot; {c.value.toLocaleString("en-IN")}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CityCard({ cities }: { cities: DemoEntry[] }) {
  const total = cities.reduce((s, c) => s + c.value, 0);
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="text-sm font-medium mb-4">Top cities</div>
      {cities.length === 0 && <Empty />}
      <div className="space-y-3">
        {cities.map((c) => {
          const pct = pctOf(c.value, total);
          const parts = c.label.split(",").map((s) => s.trim());
          const cityName = parts[0] || c.label;
          const region = parts.slice(1).join(", ");
          return (
            <div key={c.label} className="flex items-center gap-3">
              <div className="w-7 text-center text-xs font-medium text-gray-400">{cities.indexOf(c) + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-700 truncate">
                    <span className="font-medium">{cityName}</span>
                    {region && <span className="text-gray-400 ml-1">{region}</span>}
                  </span>
                  <span className="text-gray-500">{pct.toFixed(1)}% &middot; {c.value.toLocaleString("en-IN")}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-pink-500" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeakBadge({ data }: { data: { hour: number; value: number }[] }) {
  if (data.length === 0) return null;
  const peak = data.reduce((m, h) => h.value > m.value ? h : m);
  return (
    <div className="text-xs text-gray-500">
      Peak: <span className="font-medium text-brand">{String(peak.hour).padStart(2, "0")}:00</span>
      <span className="text-gray-400"> &middot; {peak.value.toLocaleString("en-IN")} online</span>
    </div>
  );
}

function SimpleBar({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500">{pct.toFixed(1)}% &middot; {value.toLocaleString("en-IN")}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-gray-400 py-4 text-center">No data.</div>;
}
