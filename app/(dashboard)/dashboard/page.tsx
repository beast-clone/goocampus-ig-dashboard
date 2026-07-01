"use client";
import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";
import { FollowerGrowthChart } from "@/components/FollowerGrowthChart";
import { LatestPost, type Post } from "@/components/LatestPost";
import { useApi } from "@/lib/use-api";

type Insights = {
  totals: { followers: number; reach: number; engagement: number; profileVisits: number; newFollowers: number; avgDailyGain: number };
  deltas: { followers: number; reach: number; engagement: number; profileVisits: number };
  series: { date: string; followers: number; reach: number; engagement: number; newFollowers: number }[];
  latestPost: Post | null;
};

export default function OverviewPage() {
  return (
    <DashboardShell title="Overview">
      {({ accountId, range }) => <Overview accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function Overview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const rangeDays = daysBetween(range.from, range.to);
  const isClamped = rangeDays > 30;

  // SWR handles caching + race-safety + dedup. Repeat visits use the cache; a
  // background revalidate refreshes within the 60s dedupe window.
  const qs = new URLSearchParams({ accountId, from: range.from, to: range.to }).toString();
  const { data: raw, isLoading, refresh } = useApi<{ totals: unknown; fallback?: Insights }>(`/api/insights?${qs}`);
  const data = (raw as unknown as Insights | undefined) ?? (raw?.fallback as Insights | undefined) ?? null;
  const loading = isLoading;

  // Track latency of the last successful fetch and when it landed — used by LiveIndicator.
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const fetchStartRef = useRef<number>(0);
  useEffect(() => { if (isLoading) fetchStartRef.current = Date.now(); }, [isLoading]);
  useEffect(() => {
    if (data && !isLoading) { setFetchedAt(Date.now()); setLatencyMs(Date.now() - fetchStartRef.current); }
  }, [data, isLoading]);
  const fetchData = () => refresh();

  if (!data) return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />
      <div className="text-sm text-gray-500">Loading…</div>
    </>
  );

  return (
    <>
      <LiveIndicator fetchedAt={fetchedAt} latencyMs={latencyMs} loading={loading} onRefresh={fetchData} />
      {isClamped && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
          <span className="font-medium">Showing last 30 days</span>
          <span className="text-amber-700/80">— Meta API caps account-level reach/engagement at 30 days, regardless of the picker.</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <MetricCard label="Followers" value={data.totals.followers.toLocaleString("en-IN")} delta={data.deltas.followers} />
        <MetricCard label="New in range" value={`${data.totals.newFollowers >= 0 ? "+" : ""}${data.totals.newFollowers.toLocaleString("en-IN")}`} />
        <MetricCard label="Reach" value={data.totals.reach.toLocaleString("en-IN")} delta={data.deltas.reach} />
        <MetricCard label="Engagement" value={data.totals.engagement.toLocaleString("en-IN")} delta={data.deltas.engagement} />
        <MetricCard label="Profile Visits" value={data.totals.profileVisits.toLocaleString("en-IN")} delta={data.deltas.profileVisits} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <FollowerGrowthChart data={data.series} totalGain={data.totals.newFollowers} />
        <TrendChart title="Reach over time" data={data.series} dataKey="reach" />
        <TrendChart title="Engagement over time" data={data.series} dataKey="engagement" />
        <LatestPost post={data.latestPost} />
      </div>
    </>
  );
}
