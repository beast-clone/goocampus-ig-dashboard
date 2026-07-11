"use client";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import { LI_PAGE, YT_CHANNEL } from "@/components/PlatformOverviews";

// Facebook / LinkedIn / YouTube audience panels for the Audience tab's platform
// toggle. The Instagram audience page (city map, active hours, post-time slots)
// is the original — untouched. These show every audience breakdown each
// platform's API actually offers, honestly labelled when a platform offers less.

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

const REGIONS = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;
function regionName(code: string): string {
  try { return REGIONS?.of(code) || code; } catch { return code; }
}

function BarList({ title, hint, rows, color }: {
  title: string; hint?: string; color: string;
  rows: { label: string; pct: number; sub?: string }[];
}) {
  const max = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{title}</div>
        {hint && <div className="text-[10px] text-gray-400">{hint}</div>}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 text-sm">
            <span className="w-36 truncate text-gray-800">{r.label}</span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(3, (r.pct / max) * 100)}%`, background: color }} />
            </div>
            <span className="w-24 text-right text-xs text-gray-500 tabular-nums">{r.sub ? `${r.sub} · ` : ""}{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHeader({ title, sub, href, live }: { title: string; sub?: string; href: string; live?: boolean }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
      </div>
      <div className="flex items-center gap-3">
        {live === true && <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>}
        {live === false && <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Demo</span>}
        <Link href={href} className="text-xs font-medium text-brand hover:underline">Open deep dive →</Link>
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

  return (
    <div className="space-y-4">
      <PanelHeader title={data.page.name || "Facebook"} sub={`Facebook Page · ${fmt(data.page.followers)} followers`} href="/dashboard/facebook" live />
      {data.audience?.available && data.audience.countries.length > 0 ? (
        <BarList
          title="Followers by country"
          hint={`${data.audience.countries.length} countries`}
          color="#1877F2"
          rows={data.audience.countries.slice(0, 12).map((c) => ({ label: regionName(c.code), pct: c.pct, sub: c.count.toLocaleString("en-IN") }))}
        />
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-sm text-gray-400">No country data returned for this page yet.</div>
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
  const rows = (list: DemoRow[]) => (list || []).slice(0, 8).map((r) => ({ label: r.label, pct: r.pct, sub: r.count ? r.count.toLocaleString("en-IN") : undefined }));

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BarList title="Job function" hint="what your followers do" color="#0A66C2" rows={rows(d.jobFunction)} />
          <BarList title="Seniority" hint="how senior they are" color="#0A66C2" rows={rows(d.seniority)} />
          <BarList title="Industry" color="#0A66C2" rows={rows(d.industry)} />
          <BarList title="Location" hint="where they are" color="#0A66C2" rows={rows(d.location)} />
          <BarList title="Company size" color="#0A66C2" rows={rows(d.companySize)} />
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
    geography: { country: string; views: number; pct: number }[];
    cities?: { city: string; views: number; pct: number }[];
    devices: { device: string; pct: number }[];
    ageGroups: { group: string; pct: number }[];
    genderSplit: { label: string; pct: number }[];
  };
  error?: string;
};

export function YouTubeAudience({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const channel = YT_CHANNEL[accountId] ?? null;
  const qs = new URLSearchParams({ channel: channel ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<YtResp>(channel ? `/api/youtube?${qs}` : null);
  if (!channel) return <EmptyPlatform platform="YouTube channel" />;
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading YouTube audience…</div>;
  if (!data || data.error) return <EmptyPlatform platform="YouTube channel" />;

  const t = data.traffic;
  return (
    <div className="space-y-4">
      <PanelHeader title={data.channel.name || "YouTube"} sub={`${data.channel.handle} · ${fmt(data.summary.subscribers)} subscribers`} href="/dashboard/youtube" live={data.source === "live"} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BarList title="Age groups" hint="viewers in range" color="#FF0000" rows={t.ageGroups.map((a) => ({ label: a.group, pct: a.pct }))} />
        <BarList title="Gender" hint="viewers in range" color="#FF0000" rows={t.genderSplit.map((g) => ({ label: g.label, pct: g.pct }))} />
        <BarList title="Top countries" hint="by views" color="#FF0000" rows={t.geography.slice(0, 8).map((g) => ({ label: regionName(g.country), pct: g.pct, sub: fmt(g.views) }))} />
        {(t.cities?.length ?? 0) > 0 && (
          <BarList title="Top cities" hint="by views · Google hides small cities" color="#FF0000" rows={t.cities!.slice(0, 8).map((c) => ({ label: c.city, pct: c.pct, sub: fmt(c.views) }))} />
        )}
        <BarList title="Devices" color="#FF0000" rows={t.devices.map((d) => ({ label: d.device, pct: d.pct }))} />
      </div>
      <p className="text-[11px] text-gray-400">
        Audience describes who WATCHED in the selected date range. State-level breakdown isn&apos;t possible — Google only offers it for the US.
      </p>
    </div>
  );
}
