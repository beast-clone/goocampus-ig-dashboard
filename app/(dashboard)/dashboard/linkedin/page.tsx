"use client";
import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useApi } from "@/lib/use-api";

const LI = "#0A66C2"; // LinkedIn blue

type Post = {
  id: string; date: string; text: string; type: string;
  impressions: number; clicks: number; reactions: number; comments: number; shares: number; engagementRate: number;
};
type DemoRow = { label: string; pct: number; count: number };
type Resp = {
  page: { id: string; name: string; handle: string; vanityName: string };
  source: "demo" | "live";
  partial?: boolean;
  liveError?: string;
  range: { from: string; to: string };
  latencyMs: number;
  summary: { followers: number; followerGain: number; impressions: number; engagementRate: number; pageViews: number; uniqueVisitors: number; posts: number };
  followersOverTime: { date: string; followers: number; newFollowers: number }[];
  posts: Post[];
  visitors: { totalPageViews: number; uniqueVisitors: number; byPage: { page: string; views: number }[]; overTime: { date: string; views: number; unique: number }[] };
  demographics: { jobFunction: DemoRow[]; seniority: DemoRow[]; industry: DemoRow[]; location: DemoRow[]; companySize: DemoRow[] };
  error?: string;
};

const PAGES = [
  { key: "goocampus", label: "GooCampus" },
  { key: "gcworld", label: "GooCampus World" },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

export default function LinkedInPage() {
  return (
    <DashboardShell title="LinkedIn" subtitle="Company page analytics — followers, posts, visitors, audience.">
      {({ range }) => <Inner range={range} />}
    </DashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  const [page, setPage] = useState("goocampus");
  const qs = new URLSearchParams({ page, from: range.from, to: range.to }).toString();
  const { data, error, isLoading, refresh } = useApi<Resp>(`/api/linkedin?${qs}`);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  useEffect(() => { if (data) setFetchedAt(Date.now()); }, [data]);

  return (
    <div className="space-y-5">
      {/* Page switcher + status */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {PAGES.map((p) => (
            <button
              key={p.key}
              onClick={() => setPage(p.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${page === p.key ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
              style={page === p.key ? { background: LI } : {}}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data?.source === "live" ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200" title={data.partial ? "Live LinkedIn data. Per-post stats are still sample — coming in a follow-up." : "Live LinkedIn data."}>
              ● Live{data.partial ? " · post stats sample" : ""}
            </span>
          ) : data?.liveError ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200" title={data.liveError}>
              ⚠ Live call failed · showing demo
            </span>
          ) : (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200" title="LinkedIn API not yet connected for this page — showing representative sample data.">
              ⚠ Demo data
            </span>
          )}
          <LiveIndicator isLoading={isLoading} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{error.message}</div>}
      {!data && isLoading && <div className="text-sm text-gray-400 py-16 text-center">Loading LinkedIn analytics…</div>}

      {data && (
        <>
          {/* Summary stat row */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Stat label="Followers" value={fmt(data.summary.followers)} sub={`+${fmt(data.summary.followerGain)} in range`} accent />
            <Stat label="Impressions" value={fmt(data.summary.impressions)} sub="in range" />
            <Stat label="Engagement rate" value={`${data.summary.engagementRate}%`} sub="avg / post" />
            <Stat label="Posts" value={String(data.summary.posts)} sub="published" />
            <Stat label="Page views" value={fmt(data.summary.pageViews)} sub="in range" />
            <Stat label="Unique visitors" value={fmt(data.summary.uniqueVisitors)} sub="in range" />
          </div>

          {/* Followers growth */}
          <Section title="Followers growth">
            <FollowersChart data={data.followersOverTime} totalGain={data.summary.followerGain} />
          </Section>

          {/* Post performance */}
          <Section title="Post performance">
            <PostsTable posts={data.posts} />
          </Section>

          {/* Page visitors */}
          <Section title="Page visitors">
            <Visitors visitors={data.visitors} />
          </Section>

          {/* Follower demographics */}
          <Section title="Follower demographics">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {([
                ["Job function", data.demographics.jobFunction],
                ["Seniority", data.demographics.seniority],
                ["Industry", data.demographics.industry],
                ["Location", data.demographics.location],
                ["Company size", data.demographics.companySize],
              ] as [string, DemoRow[]][])
                .filter(([, rows]) => rows && rows.length > 0)
                .map(([title, rows]) => <DemoCard key={title} title={title} rows={rows} />)}
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
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={accent ? { color: LI } : {}}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-800 mb-2">{title}</div>
      {children}
    </div>
  );
}

function FollowersChart({ data, totalGain }: { data: { date: string; followers: number; newFollowers: number }[]; totalGain: number }) {
  const validDays = data.filter((d) => d.newFollowers !== 0);
  const peak = validDays.length ? validDays.reduce((m, d) => (d.newFollowers > m.newFollowers ? d : m)) : null;
  const avg = validDays.length ? totalGain / data.length : 0;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Followers over time</div>
          <div className="text-2xl font-semibold text-gray-900">+{totalGain.toLocaleString("en-IN")}<span className="text-xs font-normal text-gray-500 ml-2">in range</span></div>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-0.5">
          <div>avg <span className="font-medium text-gray-700">+{avg.toFixed(0)}/day</span></div>
          {peak && <div>best day <span className="font-medium text-emerald-600">+{peak.newFollowers} on {peak.date}</span></div>}
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="liFollowerArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LI} stopOpacity={0.18} />
                <stop offset="100%" stopColor={LI} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={40} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} domain={["dataMin - 50", "dataMax + 50"]} width={42} />
            <Tooltip
              cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { date: string; followers: number; newFollowers: number };
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs min-w-[140px]">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{p.date}</div>
                    <div className="text-base font-semibold text-gray-900">{p.followers.toLocaleString("en-IN")}</div>
                    <div className="text-xs font-medium text-emerald-600">+{p.newFollowers} that day</div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="followers" stroke={LI} strokeWidth={2.5} fill="url(#liFollowerArea)" dot={false} activeDot={{ r: 5, fill: LI, stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  ARTICLE: { bg: "#E6F1FB", text: "#0A66C2" },
  IMAGE: { bg: "#EAF3DE", text: "#27500A" },
  VIDEO: { bg: "#FAEEDA", text: "#633806" },
};

function PostsTable({ posts }: { posts: Post[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2.5 font-medium">Post</th>
              <th className="px-3 py-2.5 font-medium text-right">Impr.</th>
              <th className="px-3 py-2.5 font-medium text-right">Clicks</th>
              <th className="px-3 py-2.5 font-medium text-right">Reactions</th>
              <th className="px-3 py-2.5 font-medium text-right">Comments</th>
              <th className="px-3 py-2.5 font-medium text-right">Shares</th>
              <th className="px-3 py-2.5 font-medium text-right">Eng. rate</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p, i) => (
              <tr key={p.id} className={`border-b border-gray-50 ${i === 0 ? "bg-blue-50/40" : ""}`}>
                <td className="px-4 py-3 max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: (TYPE_STYLE[p.type] || TYPE_STYLE.IMAGE).bg, color: (TYPE_STYLE[p.type] || TYPE_STYLE.IMAGE).text }}>{p.type}</span>
                    <span className="truncate text-gray-800">{p.text}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{p.date}{i === 0 && <span className="ml-2 text-blue-600 font-medium">· Top post</span>}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium">{fmt(p.impressions)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(p.clicks)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(p.reactions)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(p.comments)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(p.shares)}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium" style={{ color: LI }}>{p.engagementRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Visitors({ visitors }: { visitors: Resp["visitors"] }) {
  const maxViews = Math.max(...visitors.byPage.map((b) => b.views), 1);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Page views over time</div>
        <div className="text-2xl font-semibold text-gray-900 mb-3">{visitors.totalPageViews.toLocaleString("en-IN")}<span className="text-xs font-normal text-gray-500 ml-2">{visitors.uniqueVisitors.toLocaleString("en-IN")} unique</span></div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={visitors.overTime} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="liVisitorArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LI} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={LI} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickMargin={6} interval="preserveStartEnd" minTickGap={40} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip cursor={{ stroke: "#cbd5e1" }} />
              <Area type="monotone" dataKey="views" stroke={LI} strokeWidth={2} fill="url(#liVisitorArea)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">Views by page section</div>
        <div className="space-y-2.5">
          {visitors.byPage.map((b) => (
            <div key={b.page}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700">{b.page}</span>
                <span className="tabular-nums text-gray-500">{b.views.toLocaleString("en-IN")}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(b.views / maxViews) * 100}%`, background: LI }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoCard({ title, rows }: { title: string; rows: DemoRow[] }) {
  const max = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">{title}</div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-700">{r.label}</span>
              <span className="tabular-nums text-gray-500">{r.pct}% · {fmt(r.count)}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(r.pct / max) * 100}%`, background: LI }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
