"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import BestTimesToPost from "@/components/BestTimesToPost";
import { CountriesWorldMap, CitiesRegionMap } from "@/components/GeoMaps";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Legend, CartesianGrid } from "recharts";
import { useApi } from "@/lib/use-api";
import { FacebookAudience, LinkedInAudience, YouTubeAudience } from "@/components/PlatformAudience";

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

// Platform toggle (added 2026-07-12): Instagram is the ORIGINAL audience page
// (city map, active hours, post-time slots) — untouched. Facebook / LinkedIn /
// YouTube show every audience breakdown their APIs actually offer.
const AUD_TABS = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
] as const;
type AudTabKey = (typeof AUD_TABS)[number]["key"];

export default function AudiencePage() {
  const [platform, setPlatformState] = useState<AudTabKey>("instagram");
  // Locked mode: arriving via a platform folder's Audience link
  // (/dashboard/audience#youtube) shows ONLY that platform — no toggle. The
  // toggle belongs to the standalone "All platforms" entry (#all / no hash).
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "") as AudTabKey | "all" | "";
      if (AUD_TABS.some((t) => t.key === h)) {
        setPlatformState(h as AudTabKey);
        setLocked(true);
      } else {
        setLocked(false);
        if (h === "all" || h === "") setPlatformState("instagram");
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  return (
    <DashboardShell title="Audience">
      {({ accountId, range }) => (
        <div className="space-y-5">
          {locked ? (
            <div className="text-[12px] text-gray-500">
              <span className="text-gray-900 font-medium">{AUD_TABS.find((t) => t.key === platform)?.label} audience</span>
              {" · for all platforms in one place, open "}
              <a href="/dashboard/audience#all" className="text-brand hover:underline">Audience → All platforms</a>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg p-1.5 inline-flex items-center gap-1">
              {AUD_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setPlatformState(t.key)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${platform === t.key ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {platform === "instagram" && <Audience accountId={accountId} />}
          {platform === "facebook" && <FacebookAudience accountId={accountId} range={range} />}
          {platform === "linkedin" && <LinkedInAudience accountId={accountId} range={range} />}
          {platform === "youtube" && <YouTubeAudience accountId={accountId} range={range} />}
        </div>
      )}
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

  // Peak hour for display in the WHEN section header
  const peakHour = data.onlineFollowers.length > 0
    ? data.onlineFollowers.reduce((m, h) => h.value > m.value ? h : m)
    : null;

  // Top facts feeding the illustrated hero
  const topAgeEntry = sortedAge.reduce((m, e) => e.value > m.value ? e : m, { label: "", value: 0 });
  const maleShare = pctOf(data.gender.find((g) => g.label === "M")?.value || 0, genderTotal);
  const femaleShare = pctOf(data.gender.find((g) => g.label === "F")?.value || 0, genderTotal);
  const topCountry = data.countries[0];
  const topCity = data.cities[0]?.label?.split(",")[0] || null;
  const suggestedPost = peakHour ? new Date(0, 0, 0, peakHour.hour, -30).toTimeString().slice(0, 5) : null;

  // Character theme — dominant gender tints the illustration
  const dominant = maleShare >= femaleShare ? "M" : "F";
  const skin = "#F5D0A9";
  const hair = "#2C1810";
  const shirt = dominant === "M" ? "#7c3aed" : "#ec4899";
  const shirtDark = dominant === "M" ? "#5b21b6" : "#be185d";

  return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={lastLatencyMs} loading={loading} onRefresh={() => fetchData(true)} />

      <div className="flex items-center gap-2 mb-6 text-xs text-gray-500">
        <span>{data.account.handle}</span>
        <span>&middot;</span>
        <span>{data.account.followers.toLocaleString("en-IN")} followers</span>
        {/* Compact info icon replaces the loud yellow banner — hover for the "why doesn't range change?" explainer. */}
        <span className="ml-2 group relative inline-flex items-center cursor-help">
          <span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold" title="Meta only returns demographics as a single lifetime snapshot — not by date range">i</span>
          <span className="absolute left-6 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-[11px] text-gray-700 w-72 opacity-0 group-hover:opacity-100 pointer-events-none transition z-10">
            Meta returns demographics as a single &ldquo;lifetime&rdquo; snapshot, not by date range. So switching 7d / 30d / 90d up top has no effect here (it does change Overview, Posts, Reels, Ads).
          </span>
        </span>
      </div>

      {!data.available && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mb-4">
          <div className="font-medium mb-1">Demographics not available</div>
          <div className="text-xs">{data.reason || "Account needs 100+ followers and Meta hasn't computed for it yet."}</div>
        </div>
      )}



      {/* Age × Gender breakdown — cleaner version. One gender-split ribbon at the top
          replaces the previous separate donut (the pyramid already shows M vs F, so a
          second visual added noise). Pyramid bars are now anchored to the center label
          column and percentages sit inside the bar when they fit. */}
      <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 md:px-8 py-5 border-b border-gray-100">
          <div className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">🎂 Age &times; gender</div>
          <div className="text-xs text-gray-500 mt-1">Overall split first, then a full pyramid across every age band.</div>
        </div>

        <div className="px-6 md:px-8 pt-6">
          <GenderSplitRibbon gender={data.gender} total={genderTotal} />
        </div>

        <div className="p-6 md:p-8">
          {sortedAgeGender.length > 0 ? (
            <AgeGenderBars rows={sortedAgeGender} total={ageGenderTotal} />
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
      </section>

      {/* ═════════════════════ SECTION 2 — WHERE ═════════════════════
          One panel that holds countries + cities so the geo story is unified. */}
      <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 md:px-8 py-5 border-b border-gray-100 bg-gradient-to-r from-sky-50 to-cyan-50">
          <div className="text-[11px] uppercase tracking-widest text-sky-700 font-semibold">🌍 Where they are</div>
          <div className="text-sm text-gray-700 mt-1">
            Followers span <b>{data.countries.length}</b> countries. Top country: <b>{COUNTRY_NAME[data.countries[0]?.label] || data.countries[0]?.label || "—"}</b>
            {data.cities[0]?.label && <> · Top city: <b>{data.cities[0].label.split(",")[0]}</b></>}
          </div>
        </div>
        {/* Row 1 — Country list left, world map right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 border-b border-gray-100">
          <CountryRows countries={data.countries.slice(0, 10)} />
          <div className="p-4 md:p-6 bg-gray-50/40">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Countries on the map</div>
            <div className="aspect-[16/10] w-full bg-white rounded-xl overflow-hidden border border-gray-100">
              <CountriesWorldMap entries={data.countries.slice(0, 20)} />
            </div>
            <div className="text-[10px] text-gray-400 mt-2">Deeper purple = higher follower share. Hover a country for %.</div>
          </div>
        </div>

        {/* Row 2 — City list left, South Asia map right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <CityRows cities={data.cities.slice(0, 10)} />
          <div className="p-4 md:p-6 bg-gray-50/40">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Cities plotted (India &amp; neighbours)</div>
            <div className="aspect-[16/10] w-full bg-white rounded-xl overflow-hidden border border-gray-100">
              <CitiesRegionMap entries={data.cities.slice(0, 20)} />
            </div>
            <div className="text-[10px] text-gray-400 mt-2">Bigger cyan dot = more followers in that city.</div>
          </div>
        </div>
      </section>

      {/* ═════════════════════ SECTION 3 — WHEN ═════════════════════
          Peak hour headline + heatmap + hourly area chart, all one panel. */}
      <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 md:px-8 py-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="text-[11px] uppercase tracking-widest text-amber-700 font-semibold">⏰ When they&apos;re active</div>
          {peakHour ? (
            <div className="text-sm text-gray-700 mt-1">
              Peak hour: <b className="text-amber-700">{String(peakHour.hour).padStart(2, "0")}:00</b> — <b>{peakHour.value.toLocaleString("en-IN")}</b> followers online
              <span className="text-gray-500"> · Schedule posts ~30 min before this window for max reach.</span>
            </div>
          ) : (
            <div className="text-sm text-gray-700 mt-1">Followers-online data unavailable for this account.</div>
          )}
        </div>

        {/* Best times to post — action-oriented ranked view instead of a raw 7×24 grid.
            Same underlying data, but the reader gets the answer directly instead of
            having to decode colour intensity across 168 cells. */}
        {data.onlineGrid && (
          <div className="p-6 border-b border-gray-100">
            <BestTimesToPost grid={data.onlineGrid} />
          </div>
        )}

        {onlineSeries.length > 0 && (
          <div className="p-6">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">Average per hour, last 7 days</div>
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
      </section>
    </>
  );
}

// New — bare-content rows for use inside the unified "Where" panel (no outer card,
// no header — those live in the section wrapper now).
function CountryRows({ countries }: { countries: DemoEntry[] }) {
  const total = countries.reduce((s, c) => s + c.value, 0);
  return (
    <div className="p-6">
      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">Top countries</div>
      {countries.length === 0 ? <Empty /> : (
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
                    <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CityRows({ cities }: { cities: DemoEntry[] }) {
  const total = cities.reduce((s, c) => s + c.value, 0);
  return (
    <div className="p-6">
      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">Top cities</div>
      {cities.length === 0 ? <Empty /> : (
        <div className="space-y-3">
          {cities.map((c, i) => {
            const pct = pctOf(c.value, total);
            const parts = c.label.split(",").map((s) => s.trim());
            const cityName = parts[0] || c.label;
            const region = parts.slice(1).join(", ");
            return (
              <div key={c.label} className="flex items-center gap-3">
                <div className="w-7 text-center text-xs font-medium text-gray-400">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 truncate">
                      <span className="font-medium">{cityName}</span>
                      {region && <span className="text-gray-400 ml-1">{region}</span>}
                    </span>
                    <span className="text-gray-500">{pct.toFixed(1)}% &middot; {c.value.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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

// Same vertical-gradient-bar style used by BestTimesToPost's hour-of-day strip.
// For each age band we render TWO bars side-by-side: Male (violet gradient) and
// Female (pink gradient), with ♂ / ♀ icons floating above so the pair is
// unmistakable at a glance. The globally-peak bar gets the brighter pink-to-violet
// gradient (same signature as the hour strip).
// Simple person-figure icons — clean SVG (not emoji, not biology symbols).
// Rendered inline so they scale with text and can be tinted via currentColor.
function MaleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5.5" r="3" />
      <path d="M7 21v-7a5 5 0 0 1 10 0v7h-3v-6h-1v6h-2v-6h-1v6H7z" />
    </svg>
  );
}
function FemaleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5.5" r="3" />
      <path d="M12 9c-3 0-5 2.5-6 8h3v4h6v-4h3c-1-5.5-3-8-6-8z" />
    </svg>
  );
}

function AgeGenderBars({ rows, total }: { rows: { age: string; M: number; F: number; U: number }[]; total: number }) {
  const H = 180;
  const maxVal = Math.max(...rows.flatMap((r) => [r.M, r.F]), 1);
  let peakKey = "";
  let peakVal = 0;
  for (const r of rows) {
    if (r.M > peakVal) { peakVal = r.M; peakKey = `${r.age}-M`; }
    if (r.F > peakVal) { peakVal = r.F; peakKey = `${r.age}-F`; }
  }
  // Silence linter for `total` (retained in signature for callers that still pass it)
  void total;

  return (
    <div>
      {/* Legend — proper person-figure icons instead of biology symbols */}
      <div className="flex items-center gap-5 mb-4 text-xs">
        <div className="flex items-center gap-2">
          <MaleIcon className="w-4 h-4 text-violet-600" />
          <span className="text-gray-700 font-medium">Male</span>
        </div>
        <div className="flex items-center gap-2">
          <FemaleIcon className="w-4 h-4 text-pink-500" />
          <span className="text-gray-700 font-medium">Female</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-stretch gap-2 md:gap-4" style={{ height: `${H}px` }}>
          {rows.map((r) => {
            const mPx = Math.max((r.M / maxVal) * H, 4);
            const fPx = Math.max((r.F / maxVal) * H, 4);
            const mIsPeak = `${r.age}-M` === peakKey;
            const fIsPeak = `${r.age}-F` === peakKey;
            return (
              <div key={r.age} className="flex-1 flex flex-col justify-end">
                <div className="flex items-end justify-center gap-1.5 h-full">
                  <div className="flex-1 flex flex-col justify-end items-center" title={`${r.age} years · Male · ${r.M.toLocaleString("en-IN")}`}>
                    <div className="w-full rounded-t transition-all" style={{
                      height: `${mPx}px`,
                      background: mIsPeak ? "linear-gradient(180deg, #ec4899, #7c3aed)" : "linear-gradient(180deg, #a78bfa, #7c3aed)",
                      opacity: mIsPeak ? 1 : 0.6,
                    }} />
                  </div>
                  <div className="flex-1 flex flex-col justify-end items-center" title={`${r.age} years · Female · ${r.F.toLocaleString("en-IN")}`}>
                    <div className="w-full rounded-t transition-all" style={{
                      height: `${fPx}px`,
                      background: fIsPeak ? "linear-gradient(180deg, #7c3aed, #ec4899)" : "linear-gradient(180deg, #f9a8d4, #ec4899)",
                      opacity: fIsPeak ? 1 : 0.6,
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Under each bar pair: just the age label with "years" — no letters below,
            the top legend already tells you which colour is which. */}
        <div className="flex items-start gap-2 md:gap-4 mt-2">
          {rows.map((r) => (
            <div key={r.age} className="flex-1 text-center">
              <div className="text-xs font-semibold text-gray-700">{r.age} years</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Clean symmetric population pyramid. Bars grow OUT from the center age-label column
// (male leftward, female rightward) so the two sides meet cleanly in the middle instead
// of floating with variable-position labels at their far ends. Percentages sit inside
// the bar when there's room, and outside when the bar is too narrow to hold text.
function Pyramid({ rows, total }: { rows: { age: string; M: number; F: number; U: number }[]; total: number }) {
  if (total === 0) return <Empty />;
  const maxSide = Math.max(...rows.map((r) => Math.max(r.M, r.F))) || 1;
  const findBiggest = rows.reduce((b, r) => (r.M + r.F) > (b.M + b.F) ? r : b, rows[0]);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const mWidth = (r.M / maxSide) * 100;
        const fWidth = (r.F / maxSide) * 100;
        const mShare = pctOf(r.M, total);
        const fShare = pctOf(r.F, total);
        const isBiggest = r === findBiggest;
        // If the bar is wide enough (>18%), show the % INSIDE it; else keep it outside.
        const mLabelInside = mWidth > 18;
        const fLabelInside = fWidth > 18;
        return (
          <div key={r.age} className="grid grid-cols-[1fr_56px_1fr] items-center">
            {/* Male: bar anchored to RIGHT edge of the left column so it touches the center label */}
            <div className="flex items-center justify-end pr-1.5">
              {!mLabelInside && <span className="text-[11px] text-gray-500 tabular-nums mr-2">{mShare.toFixed(1)}%</span>}
              <div
                className="h-6 rounded-l-md flex items-center justify-start pl-2 text-[11px] font-medium text-white tabular-nums shadow-sm"
                style={{ width: `${Math.max(mWidth, 0.5)}%`, background: "linear-gradient(90deg, #6d28d9, #7c3aed)" }}
                title={`${r.M.toLocaleString("en-IN")} male`}
              >
                {mLabelInside && `${mShare.toFixed(1)}%`}
              </div>
            </div>

            {/* Center age label */}
            <div className={`text-center text-xs font-semibold ${isBiggest ? "text-brand" : "text-gray-700"}`}>
              {r.age}
            </div>

            {/* Female: bar anchored to LEFT edge of the right column so it touches the center label */}
            <div className="flex items-center justify-start pl-1.5">
              <div
                className="h-6 rounded-r-md flex items-center justify-end pr-2 text-[11px] font-medium text-white tabular-nums shadow-sm"
                style={{ width: `${Math.max(fWidth, 0.5)}%`, background: "linear-gradient(90deg, #ec4899, #db2777)" }}
                title={`${r.F.toLocaleString("en-IN")} female`}
              >
                {fLabelInside && `${fShare.toFixed(1)}%`}
              </div>
              {!fLabelInside && <span className="text-[11px] text-gray-500 tabular-nums ml-2">{fShare.toFixed(1)}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// One box per gender — clean vertical list of age bands with a horizontal bar.
// Replaces the shared pyramid, which put male and female sharing the same row (which
// the user found awkward). Bars scale to the biggest value inside that gender.
function GenderColumn({ label, rows, color, total }: {
  label: string;
  rows: { age: string; value: number }[];
  color: string;
  total: number;
}) {
  const maxValue = Math.max(...rows.map((r) => r.value), 1);
  const genderTotal = rows.reduce((s, r) => s + r.value, 0);
  const genderShare = pctOf(genderTotal, total);
  return (
    <div className="bg-gray-50/60 rounded-2xl p-5 border border-gray-100">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
          <span className="text-sm font-semibold text-gray-900">{label}</span>
        </div>
        <div className="text-xs text-gray-500">
          <span className="tabular-nums font-medium text-gray-700">{genderShare.toFixed(1)}%</span> of audience &middot; <span className="tabular-nums">{genderTotal.toLocaleString("en-IN")}</span>
        </div>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const barWidth = (r.value / maxValue) * 100;
          const shareOfTotal = pctOf(r.value, total);
          return (
            <div key={r.age} className="grid grid-cols-[52px_1fr_56px] items-center gap-3 text-xs">
              <div className="text-gray-700 font-medium">{r.age}</div>
              <div className="h-2 rounded-full bg-gray-200/60 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(barWidth, 0.5)}%`, background: `linear-gradient(90deg, ${color}, ${color}dd)` }} />
              </div>
              <div className="text-right tabular-nums text-gray-600">{shareOfTotal.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Single horizontal ribbon showing the overall gender split. Replaces the standalone
// donut chart — same info, way less visual weight, and it sets context before the pyramid.
function GenderSplitRibbon({ gender, total }: { gender: DemoEntry[]; total: number }) {
  if (total === 0) return null;
  const segs = gender
    .map((g) => ({ name: GENDER_LABELS[g.label] || g.label, value: g.value, pct: pctOf(g.value, total) }))
    .sort((a, b) => b.value - a.value);
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Overall gender split</div>
      <div className="flex h-8 rounded-lg overflow-hidden shadow-sm">
        {segs.map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-center text-[11px] font-semibold text-white tabular-nums transition-all"
            style={{
              width: `${s.pct}%`,
              background: s.name === "Male"
                ? "linear-gradient(90deg, #6d28d9, #7c3aed)"
                : s.name === "Female"
                  ? "linear-gradient(90deg, #ec4899, #db2777)"
                  : "linear-gradient(90deg, #94a3b8, #cbd5e1)",
            }}
            title={`${s.name}: ${s.value.toLocaleString("en-IN")}`}
          >
            {s.pct >= 8 && `${s.name} ${s.pct.toFixed(1)}%`}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-500">
        {segs.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{
                background: s.name === "Male" ? "#7c3aed" : s.name === "Female" ? "#ec4899" : "#cbd5e1",
              }}
            />
            <span>{s.name}</span>
            <span className="text-gray-400">·</span>
            <span className="tabular-nums">{s.value.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>
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

// Individual segment inside the summary bar. Sits directly on the pastel gradient
// with dark text for legibility — the vertical dividers come from the parent's
// `divide-x` utility.
function SummaryCell({ emoji, label, value, sub, className = "" }: {
  emoji: string;
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={`px-5 py-4 md:py-5 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base leading-none">{emoji}</span>
        <span className="text-[10px] uppercase tracking-widest text-gray-800/70 font-semibold">{label}</span>
      </div>
      <div className="text-lg md:text-xl font-bold text-gray-900 leading-tight truncate">{value}</div>
      {sub && <div className="text-[11px] text-gray-800/65 mt-0.5">{sub}</div>}
    </div>
  );
}

// SVG portrait — androgynous, minimal, colored by the dominant gender. Sits at the
// center of the hero with fact chips orbiting.
function PersonaCharacter({ skin, hair, shirt, shirtDark }: { skin: string; hair: string; shirt: string; shirtDark: string }) {
  return (
    <div className="relative w-56 md:w-64">
      <svg viewBox="0 0 260 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto drop-shadow-xl">
        <defs>
          <radialGradient id="persAura" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="persShirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={shirt} />
            <stop offset="100%" stopColor={shirtDark} />
          </linearGradient>
        </defs>

        {/* Aura backdrop */}
        <circle cx="130" cy="150" r="130" fill="url(#persAura)" />

        {/* Body / shoulders */}
        <path d="M 60 340 Q 60 260 130 250 Q 200 260 200 340 Z" fill="url(#persShirt)" />

        {/* Neck */}
        <rect x="115" y="200" width="30" height="30" rx="4" fill={skin} />

        {/* Head */}
        <ellipse cx="130" cy="150" rx="60" ry="70" fill={skin} />

        {/* Ears */}
        <ellipse cx="72" cy="155" rx="8" ry="14" fill={skin} />
        <ellipse cx="188" cy="155" rx="8" ry="14" fill={skin} />

        {/* Hair — soft short cap */}
        <path d="M 74 145 Q 70 90 130 82 Q 190 90 186 145 Q 186 122 130 118 Q 74 122 74 145 Z" fill={hair} />

        {/* Eyebrows */}
        <path d="M 100 138 Q 110 133 120 138" stroke={hair} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M 140 138 Q 150 133 160 138" stroke={hair} strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* Eyes */}
        <circle cx="108" cy="155" r="4" fill="#1f2937" />
        <circle cx="152" cy="155" r="4" fill="#1f2937" />
        {/* Eye highlights */}
        <circle cx="109.5" cy="153.5" r="1.2" fill="#fff" />
        <circle cx="153.5" cy="153.5" r="1.2" fill="#fff" />

        {/* Cheeks blush */}
        <ellipse cx="90" cy="180" rx="10" ry="6" fill={shirt} opacity="0.25" />
        <ellipse cx="170" cy="180" rx="10" ry="6" fill={shirt} opacity="0.25" />

        {/* Smile */}
        <path d="M 108 187 Q 130 202 152 187" stroke="#1f2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />

        {/* Chest highlight collar */}
        <path d="M 108 250 Q 130 268 152 250" stroke={shirtDark} strokeWidth="2" fill="none" opacity="0.5" />
      </svg>
    </div>
  );
}

// Small floating fact chip that sits around the character
function OrbitChip({ className = "", emoji, label, value, sub, tint = "violet", wide = false }: {
  className?: string;
  emoji: string;
  label: string;
  value: string;
  sub?: string;
  tint?: "violet" | "sky" | "pink" | "cyan" | "amber";
  wide?: boolean;
}) {
  const tints: Record<string, string> = {
    violet: "border-violet-200 bg-violet-50/90",
    sky: "border-sky-200 bg-sky-50/90",
    pink: "border-pink-200 bg-pink-50/90",
    cyan: "border-cyan-200 bg-cyan-50/90",
    amber: "border-amber-200 bg-amber-50/90",
  };
  const labelColors: Record<string, string> = {
    violet: "text-violet-700",
    sky: "text-sky-700",
    pink: "text-pink-700",
    cyan: "text-cyan-700",
    amber: "text-amber-700",
  };
  return (
    <div className={`${className} ${tints[tint]} ${wide ? "min-w-[220px]" : "min-w-[150px]"} rounded-2xl border shadow-md backdrop-blur-md px-3 py-2.5 pointer-events-auto`}>
      <div className="flex items-start gap-2.5">
        <div className="text-xl leading-none">{emoji}</div>
        <div className="flex-1 min-w-0">
          <div className={`text-[9px] uppercase tracking-wider ${labelColors[tint]} font-bold`}>{label}</div>
          <div className="text-sm font-bold text-gray-900 leading-tight truncate">{value}</div>
          {sub && <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
