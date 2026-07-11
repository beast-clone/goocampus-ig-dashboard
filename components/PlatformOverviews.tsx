"use client";
import Link from "next/link";
import { useApi } from "@/lib/use-api";

// Facebook / LinkedIn / YouTube overview panels for the Overview tab's platform
// toggle. The Instagram overview is the original page (untouched); these are
// compact same-style summaries — headline stat cards + one flavour section —
// with "Open →" links to each platform's deep-dive tab in the sidebar.

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

function Badge({ source }: { source?: string }) {
  if (source === "live") {
    return <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">● Live</span>;
  }
  return <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Demo</span>;
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={color ? { color } : {}}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function PanelHeader({ title, href, source, sub }: { title: string; href: string; source?: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
      </div>
      <div className="flex items-center gap-3">
        <Badge source={source} />
        <Link href={href} className="text-xs font-medium text-brand hover:underline">Open deep dive →</Link>
      </div>
    </div>
  );
}

function EmptyPlatform({ platform, brand }: { platform: string; brand: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-14 text-center">
      <div className="text-base font-medium text-gray-700 mb-1">No {platform} yet</div>
      <p className="text-sm text-gray-400">{brand} doesn&apos;t have a {platform} presence connected to the dashboard.</p>
    </div>
  );
}

// ── Facebook ────────────────────────────────────────────────────────────────

type FbResp = {
  source: "live";
  page: { name: string; followers: number | null; fanCount: number | null; link: string | null; picture: string | null };
  insights: { available: boolean; reach: number | null; engagement: number | null };
  posts: { available: boolean; reason?: string; items: { id: string; message: string; createdTime: string; fullPicture: string | null; permalink: string | null }[] };
  error?: string;
};

export function FacebookOverview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ account: accountId, from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<FbResp>(`/api/facebook?${qs}`);
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading Facebook…</div>;
  if (!data || data.error) return <EmptyPlatform platform="Facebook page" brand="This brand" />;

  return (
    <div className="space-y-4">
      <PanelHeader title={data.page.name || "Facebook"} sub="Facebook Page" href="/dashboard/facebook" source={data.source} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Followers" value={fmt(data.page.followers)} sub="live from Meta" color="#1877F2" />
        <Stat label="Page likes" value={fmt(data.page.fanCount)} sub="live from Meta" />
        <Stat label="Reach" value={fmt(data.insights.reach)} sub={data.insights.reach === null ? "token lacks insights permission" : "in range"} />
        <Stat label="Engagement" value={fmt(data.insights.engagement)} sub={data.insights.engagement === null ? "token lacks insights permission" : "in range"} />
      </div>
      {data.posts.available && data.posts.items.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">Recent posts</div>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {data.posts.items.slice(0, 8).map((p) => (
              <a key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-100" title={p.message}>
                {p.fullPicture
                  ? <img src={p.fullPicture} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 p-1 text-center">{(p.message || "Post").slice(0, 40)}</div>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LinkedIn ────────────────────────────────────────────────────────────────

// Which dashboard account maps to which LinkedIn page key (live only for World).
const LI_PAGE: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: "gcworld",
  "12thplusdotcom": null,
  samvaya_matrimony: null,
};

type LiResp = {
  source: "demo" | "live";
  page: { name: string };
  summary: { followers: number; followerGain: number; impressions: number; engagementRate: number; pageViews: number; posts: number };
  error?: string;
};

export function LinkedInOverview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const pageKey = LI_PAGE[accountId] ?? null;
  const qs = new URLSearchParams({ page: pageKey ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<LiResp>(pageKey ? `/api/linkedin?${qs}` : null);
  if (!pageKey) return <EmptyPlatform platform="LinkedIn page" brand="This brand" />;
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading LinkedIn…</div>;
  if (!data || data.error) return <EmptyPlatform platform="LinkedIn page" brand="This brand" />;

  return (
    <div className="space-y-4">
      <PanelHeader title={data.page.name || "LinkedIn"} sub="LinkedIn Page" href="/dashboard/linkedin" source={data.source} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Followers" value={fmt(data.summary.followers)} sub={`+${data.summary.followerGain} in range`} color="#0A66C2" />
        <Stat label="Impressions" value={fmt(data.summary.impressions)} sub="in range" />
        <Stat label="Engagement rate" value={`${(data.summary.engagementRate ?? 0).toFixed(1)}%`} />
        <Stat label="Page views" value={fmt(data.summary.pageViews)} />
        <Stat label="Posts" value={fmt(data.summary.posts)} sub="in range" />
      </div>
    </div>
  );
}

// ── YouTube ─────────────────────────────────────────────────────────────────

// Which dashboard account maps to which YouTube channel key.
const YT_CHANNEL: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: "goocampusworld", // = the Study Abroad channel
  "12thplusdotcom": "twelfthplus",
  samvaya_matrimony: null,
};

type YtResp = {
  source: "demo" | "live";
  channel: { name: string; handle: string };
  summary: { subscribers: number; subscriberGain: number; views: number; watchHours: number; avgViewDurationSec: number };
  topVideos: { id?: string; title: string; views: number }[];
  error?: string;
};

export function YouTubeOverview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const channel = YT_CHANNEL[accountId] ?? null;
  const qs = new URLSearchParams({ channel: channel ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<YtResp>(channel ? `/api/youtube?${qs}` : null);
  if (!channel) return <EmptyPlatform platform="YouTube channel" brand="This brand" />;
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading YouTube…</div>;
  if (!data || data.error) return <EmptyPlatform platform="YouTube channel" brand="This brand" />;

  const mins = Math.round((data.summary.avgViewDurationSec ?? 0) / 60);
  const secs = Math.round((data.summary.avgViewDurationSec ?? 0) % 60);

  return (
    <div className="space-y-4">
      <PanelHeader title={data.channel.name || "YouTube"} sub={data.channel.handle} href="/dashboard/youtube" source={data.source} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Subscribers" value={fmt(data.summary.subscribers)} sub={`+${data.summary.subscriberGain} in range`} color="#FF0000" />
        <Stat label="Views" value={fmt(data.summary.views)} sub="in range" />
        <Stat label="Watch time" value={`${fmt(Math.round(data.summary.watchHours))} h`} sub="hours watched" />
        <Stat label="Avg view duration" value={`${mins}:${String(secs).padStart(2, "0")}`} sub="min:sec" />
      </div>
      {data.topVideos?.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-xs font-medium text-gray-500 mb-2">Top videos in range</div>
          <div className="space-y-1.5">
            {data.topVideos.slice(0, 5).map((v, i) => (
              <div key={v.id ?? i} className="flex items-baseline gap-3 text-sm">
                <span className="text-gray-400 text-xs w-4">{i + 1}</span>
                <span className="flex-1 truncate text-gray-800">{v.title}</span>
                <span className="text-gray-500 text-xs tabular-nums">{fmt(v.views)} views</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
