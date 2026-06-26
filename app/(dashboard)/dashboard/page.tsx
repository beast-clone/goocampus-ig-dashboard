"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";
import { FollowerGrowthChart } from "@/components/FollowerGrowthChart";
import { LatestPost, type Post } from "@/components/LatestPost";

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
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const rangeDays = daysBetween(range.from, range.to);
  const isClamped = rangeDays > 30;

  const fetchData = () => {
    setLoading(true);
    const t0 = Date.now();
    const qs = new URLSearchParams({ accountId, from: range.from, to: range.to });
    fetch(`/api/insights?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.totals ? d : d.fallback ?? null);
        setFetchedAt(Date.now());
        setLatencyMs(Date.now() - t0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [accountId, range]); // eslint-disable-line react-hooks/exhaustive-deps

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
