"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";
import { LatestPost, type Post } from "@/components/LatestPost";

type Insights = {
  totals: { followers: number; reach: number; engagement: number; profileVisits: number };
  deltas: { followers: number; reach: number; engagement: number; profileVisits: number };
  series: { date: string; followers: number; reach: number; engagement: number }[];
  latestPost: Post | null;
};

export default function OverviewPage() {
  return (
    <DashboardShell title="Overview">
      {({ accountId, range }) => <Overview accountId={accountId} range={range} />}
    </DashboardShell>
  );
}

function Overview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ accountId, from: range.from, to: range.to });
    fetch(`/api/insights?${qs}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [accountId, range]);

  if (loading || !data) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Followers" value={data.totals.followers.toLocaleString()} delta={data.deltas.followers} />
        <MetricCard label="Reach" value={data.totals.reach.toLocaleString()} delta={data.deltas.reach} />
        <MetricCard label="Engagement" value={data.totals.engagement.toLocaleString()} delta={data.deltas.engagement} />
        <MetricCard label="Profile Visits" value={data.totals.profileVisits.toLocaleString()} delta={data.deltas.profileVisits} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <TrendChart title="Followers over time" data={data.series} dataKey="followers" />
        <TrendChart title="Reach over time" data={data.series} dataKey="reach" />
        <TrendChart title="Engagement over time" data={data.series} dataKey="engagement" />
        <LatestPost post={data.latestPost} />
      </div>
    </>
  );
}
