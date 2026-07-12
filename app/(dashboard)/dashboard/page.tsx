"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { LatestPostsStrip } from "@/components/LatestPostsStrip";
import { PostingCadenceBar } from "@/components/PostingCadenceBar";
import { AudienceOnlineHeatmap } from "@/components/AudienceOnlineHeatmap";
import { OverviewExtras } from "@/components/OverviewExtras";
import { FacebookOverview, LinkedInOverview, YouTubeOverview } from "@/components/PlatformOverviews";
import { ACCOUNTS } from "@/lib/accounts";
import { useProfile } from "@/lib/profile";
import { hasPlatform } from "@/lib/brand-platforms";
import { useApi } from "@/lib/use-api";
import type { Post } from "@/components/LatestPost";

type Insights = {
  totals: { followers: number; reach: number; engagement: number; profileVisits: number; newFollowers: number; avgDailyGain: number };
  deltas: { followers: number; reach: number; engagement: number; profileVisits: number };
  series: { date: string; followers: number; reach: number; engagement: number; newFollowers: number }[];
  latestPost: Post | null;
};

type Tip = {
  metric: "followers" | "reach" | "engagement" | "profileVisits";
  headline: string;
  detail: string;
  action: string;
  tone: "grow" | "hold" | "fix";
};

// Plain-English fallback translations shown until AI tips arrive (or when they fail).
const PLAIN_DEFAULT: Record<Tip["metric"], { detail: string; action: string }> = {
  followers:     { detail: "Total accounts following you.",              action: "Keep the current cadence — growth is holding." },
  reach:         { detail: "Unique people who saw your content.",        action: "Post more Reels to lift this fastest." },
  engagement:    { detail: "Likes, comments, saves and shares combined.", action: "Ask a direct question in your next caption." },
  profileVisits: { detail: "People who tapped your handle to see the bio.", action: "A/B test the bio link CTA." },
};

// Platform toggle on the Overview tab: Instagram is the original overview
// (unchanged); Facebook / LinkedIn / YouTube get compact same-style summaries.
// Deep dives stay in the sidebar's Analytics tabs.
const PLATFORM_TABS = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
] as const;
type PlatformKey = (typeof PLATFORM_TABS)[number]["key"];

export default function OverviewPage() {
  const [platform, setPlatform] = useState<PlatformKey>("instagram");
  const profile = useProfile();
  return (
    <DashboardShell title="Overview">
      {({ accountId, range }) => (
        <div className="space-y-5">
          <div className="bg-white border border-gray-100 rounded-lg p-1.5 inline-flex items-center gap-1">
            {PLATFORM_TABS.map((t) => {
              // Profile mode: platforms the brand doesn't have are grayed out.
              const disabled = !!profile && !hasPlatform(profile, t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => !disabled && setPlatform(t.key)}
                  disabled={disabled}
                  title={disabled ? "Not connected for this brand" : undefined}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${disabled ? "text-gray-300 cursor-not-allowed" : platform === t.key ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {platform === "instagram" && <Overview accountId={accountId} range={range} />}
          {platform === "facebook" && <FacebookOverview accountId={accountId} range={range} />}
          {platform === "linkedin" && <LinkedInOverview accountId={accountId} range={range} />}
          {platform === "youtube" && <YouTubeOverview accountId={accountId} range={range} />}
        </div>
      )}
    </DashboardShell>
  );
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function pct(n: number): string {
  const sign = n > 0 ? "▲" : n < 0 ? "▼" : "▬";
  return `${sign} ${Math.abs(n).toFixed(1)}%`;
}

function Overview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const rangeDays = daysBetween(range.from, range.to);
  const isClamped = rangeDays > 30;

  const qs = new URLSearchParams({ accountId, from: range.from, to: range.to }).toString();
  const { data: raw, isLoading, refresh } = useApi<{ totals: unknown; fallback?: Insights }>(`/api/insights?${qs}`);
  const data = (raw as unknown as Insights | undefined) ?? (raw?.fallback as Insights | undefined) ?? null;
  const loading = isLoading;

  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const fetchStartRef = useRef<number>(0);
  useEffect(() => { if (isLoading) fetchStartRef.current = Date.now(); }, [isLoading]);
  useEffect(() => {
    if (data && !isLoading) { setFetchedAt(Date.now()); setLatencyMs(Date.now() - fetchStartRef.current); }
  }, [data, isLoading]);
  const fetchData = () => refresh();

  // Pull AI tips (one per KPI). Cached server-side 12h so tab switches are cheap.
  const [tips, setTips] = useState<Tip[] | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ accountId, from: range.from, to: range.to }).toString();
    fetch(`/api/overview-tips?${q}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setTips(d?.tips || null))
      .catch(() => setTips(null));
  }, [accountId, range.from, range.to]);

  const tipByMetric = useMemo(() => {
    const m: Partial<Record<Tip["metric"], Tip>> = {};
    (tips || []).forEach((t) => { m[t.metric] = t; });
    return m;
  }, [tips]);

  if (!data) return (
    <div className="max-w-[1400px] mx-auto">
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />
      <div className="text-sm text-gray-500 mt-4">Loading…</div>
    </div>
  );

  // Compose narrative fold sentence dynamically.
  const gainWord = data.totals.newFollowers >= 0 ? "gained" : "lost";
  const fldDown = data.deltas.followers < 0;
  const bothDown = data.deltas.reach < -3 && data.deltas.engagement < -3;
  const oneDown = (data.deltas.reach < -3 || data.deltas.engagement < -3) && !bothDown;
  const bothUp = data.deltas.reach > 3 && data.deltas.engagement > 3;

  return (
    <div className="max-w-[1400px] mx-auto">
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />

      {isClamped && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
          <span className="font-medium">Showing last 30 days</span>
          <span className="text-amber-700/80">— Meta caps account-level reach/engagement at 30 days.</span>
        </div>
      )}

      {/* NARRATIVE FOLD — what happened, in plain English */}
      <section className="pb-5 mb-6 border-b border-gray-200">
        <div className="text-[12px] text-gray-500 mb-1"><span className="text-gray-900 font-medium">Overview</span> · {ACCOUNTS.find((a) => a.id === accountId)?.handle ?? accountId} · last {rangeDays} days</div>
        <h1 className="text-[22px] leading-[1.4] text-gray-900 font-normal">
          You <b className={fldDown ? "text-rose-700 font-semibold" : "text-emerald-700 font-semibold"}>{gainWord} {fmt(Math.abs(data.totals.newFollowers))} followers</b> this period.
          {bothDown && (
            <>{" "}But <b className="text-rose-700 font-semibold">Reach dropped {Math.abs(data.deltas.reach).toFixed(0)}%</b> and <b className="text-rose-700 font-semibold">Engagement dropped {Math.abs(data.deltas.engagement).toFixed(0)}%</b> — growth is coming from something other than your posts.</>
          )}
          {oneDown && !bothDown && (
            <>{" "}{data.deltas.reach < -3
              ? <>Reach is <b className="text-rose-700 font-semibold">down {Math.abs(data.deltas.reach).toFixed(0)}%</b> — worth checking cadence.</>
              : <>Engagement is <b className="text-rose-700 font-semibold">down {Math.abs(data.deltas.engagement).toFixed(0)}%</b> — captions and hooks need work.</>
            }</>
          )}
          {bothUp && <>{" "}And your posts are <b className="text-emerald-700 font-semibold">reaching more people</b> too. Solid month.</>}
        </h1>
      </section>

      {/* STATUS TILES — 5 across, wraps to 2 columns on tablets, 1 on phones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-6">
        <StatusTile
          label="Followers"
          value={fmt(data.totals.followers)}
          delta={data.deltas.followers}
          plain={tipByMetric.followers?.detail || PLAIN_DEFAULT.followers.detail}
          action={tipByMetric.followers?.action || PLAIN_DEFAULT.followers.action}
        />
        <StatusTile
          label="Reach"
          value={fmt(data.totals.reach)}
          delta={data.deltas.reach}
          plain={tipByMetric.reach?.detail || PLAIN_DEFAULT.reach.detail}
          action={tipByMetric.reach?.action || PLAIN_DEFAULT.reach.action}
        />
        <StatusTile
          label="Engagement"
          value={fmt(data.totals.engagement)}
          delta={data.deltas.engagement}
          plain={tipByMetric.engagement?.detail || PLAIN_DEFAULT.engagement.detail}
          action={tipByMetric.engagement?.action || PLAIN_DEFAULT.engagement.action}
        />
        <StatusTile
          label="Profile Visits"
          value={fmt(data.totals.profileVisits)}
          delta={data.deltas.profileVisits}
          plain={tipByMetric.profileVisits?.detail || PLAIN_DEFAULT.profileVisits.detail}
          action={tipByMetric.profileVisits?.action || PLAIN_DEFAULT.profileVisits.action}
        />
        {/* Engagement rate — account-level, computed from insights totals */}
        {(() => {
          const erPct = data.totals.reach > 0 ? (data.totals.engagement / data.totals.reach) * 100 : 0;
          const erDelta =
            data.deltas.engagement && data.deltas.reach
              ? data.deltas.engagement - data.deltas.reach   // rough approximation of ER trend
              : 0;
          return (
            <StatusTile
              label="Engagement Rate"
              value={`${erPct.toFixed(1)}%`}
              delta={erDelta}
              plain="Of every 100 people who saw your posts, this many reacted."
              action={erPct >= 5 ? "Above 5% is strong for education content — keep the hook style." : "Aim for 5%. Try direct questions in captions."}
            />
          );
        })()}
      </div>

      {/* LATEST POSTS — highest priority. Click opens in-dashboard modal. */}
      <LatestPostsStrip accountId={accountId} range={range} />

      {/* PERFORMANCE — post mix + engagement rate + hashtags + format comparison + repost opportunities */}
      <OverviewExtras accountId={accountId} range={range} />

      {/* POSTING CADENCE — compact weekly-bar view */}
      <PostingCadenceBar accountId={accountId} range={range} />

      {/* BEST TIMES TO POST NEXT — plain-list version, no heatmap grid */}
      <AudienceOnlineHeatmap accountId={accountId} />
    </div>
  );
}

function StatusTile({ label, value, delta, plain, action }: {
  label: string;
  value: string;
  delta: number;
  plain: string;
  action: string;
}) {
  const tone: "up" | "down" | "flat" = delta > 1 ? "up" : delta < -1 ? "down" : "flat";
  const deltaClass =
    tone === "up"   ? "text-emerald-800 bg-emerald-50" :
    tone === "down" ? "text-rose-800 bg-rose-50"       :
                      "text-gray-600 bg-gray-100";
  return (
    <article className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 flex flex-col gap-2 min-h-[168px]">
      <div className="flex items-baseline justify-between">
        <div className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-gray-500">{label}</div>
        <div className={`text-[11.5px] font-semibold px-2 py-0.5 rounded ${deltaClass} tabular-nums`}>
          {pct(delta)}
        </div>
      </div>
      <div className="text-[30px] leading-none font-medium tracking-tight tabular-nums text-gray-900">{value}</div>
      <div className="text-[12.5px] text-gray-600 leading-snug">{plain}</div>
      <div className="mt-auto pt-2 border-t border-dashed border-gray-200 text-[12.5px] text-brand leading-snug">
        {action}
      </div>
    </article>
  );
}
