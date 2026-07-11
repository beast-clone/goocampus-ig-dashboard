"use client";
import Link from "next/link";
import { useApi } from "@/lib/use-api";

// Facebook / LinkedIn / YouTube overview panels for the Overview tab's platform
// toggle. The Instagram overview is the original page (untouched); these mirror
// its spirit — headline cards, trends, TOP PERFORMING CONTENT, audience/timing
// insights — using everything the platform APIs already return. Honest badges;
// deep dives stay in the sidebar tabs.

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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{title}</div>
        {hint && <div className="text-[10px] text-gray-400">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

// Tiny inline area sparkline — enough to show the trend without a chart library.
function Spark({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const W = 600, H = 64;
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const span = max - min || 1;
  const xy = points.map((v, i) => [ (i / (points.length - 1)) * W, H - 6 - ((v - min) / span) * (H - 14) ]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={area} fill={color} opacity="0.09" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Real derived insight: which weekday earned the most views/impressions in range.
function bestDay(series: { date: string; value: number }[]): { day: string; runnerUp: string } | null {
  if (series.length < 7) return null;
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const p of series) {
    const d = new Date(p.date).getDay();
    if (Number.isNaN(d)) continue;
    sums[d] += p.value;
    counts[d] += 1;
  }
  const avgs = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  const order = avgs.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  if (!order[0][0]) return null;
  return { day: WEEKDAYS[order[0][1]], runnerUp: WEEKDAYS[order[1][1]] };
}

// ── Facebook ────────────────────────────────────────────────────────────────

type FbPost = { id: string; message: string; createdTime: string; fullPicture: string | null; permalink: string | null; likes: number | null; comments: number | null; shares: number | null };
type FbResp = {
  source: "live";
  page: { name: string; followers: number | null; fanCount: number | null; link: string | null; picture: string | null };
  insights: { available: boolean; reach: number | null; engagement: number | null; pageViews: number | null };
  audience?: { available: boolean; countries: { code: string; count: number; pct: number }[] };
  posts: { available: boolean; reason?: string; items: FbPost[] };
  error?: string;
};

const FB_REGIONS = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;
function regionName(code: string): string {
  try { return FB_REGIONS?.of(code) || code; } catch { return code; }
}

export function FacebookOverview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ account: accountId, from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<FbResp>(`/api/facebook?${qs}`);
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading Facebook…</div>;
  if (!data || data.error) return <EmptyPlatform platform="Facebook page" brand="This brand" />;

  // Real derived insight from post dates: how often this page publishes.
  const postDates = (data.posts.items || []).map((p) => new Date(p.createdTime).getTime()).filter((t) => !Number.isNaN(t));
  const cadence = postDates.length >= 2
    ? Math.max(1, Math.round((Math.max(...postDates) - Math.min(...postDates)) / 86_400_000 / (postDates.length - 1)))
    : null;

  return (
    <div className="space-y-4">
      <PanelHeader title={data.page.name || "Facebook"} sub="Facebook Page" href="/dashboard/facebook" source={data.source} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Followers" value={fmt(data.page.followers)} sub="live from Meta" color="#1877F2" />
        <Stat label="Engagement" value={fmt(data.insights.engagement)} sub={data.insights.engagement === null ? "unavailable" : "post engagements in range"} />
        <Stat label="Page views" value={fmt(data.insights.pageViews)} sub={data.insights.pageViews === null ? "unavailable" : "in range"} />
        <Stat label="Posting rhythm" value={cadence ? `~${cadence}d` : "—"} sub={cadence ? "between posts lately" : "not enough posts"} />
      </div>
      {data.posts.available && data.posts.items.length > 0 && (() => {
        const score = (p: FbPost) => (p.likes ?? 0) + (p.comments ?? 0) * 2 + (p.shares ?? 0) * 3;
        const top = [...data.posts.items].sort((a, b) => score(b) - score(a)).slice(0, 4);
        return (
          <Section title="Top performing posts" hint="by likes, comments and shares">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {top.map((p, i) => (
                <a key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-gray-100 hover:border-gray-300">
                  <div className="relative">
                    {p.fullPicture
                      ? <img src={p.fullPicture} alt="" className="w-full aspect-[4/3] object-cover bg-gray-100" loading="lazy" />
                      : <div className="w-full aspect-[4/3] bg-gray-50" />}
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-white/90 rounded-full px-2 py-0.5 text-gray-700">#{i + 1}</span>
                  </div>
                  <div className="p-2">
                    <div className="text-[11px] text-gray-800 leading-snug line-clamp-2">{p.message || "(no text)"}</div>
                    <div className="text-[10px] text-gray-500 mt-1 flex gap-2 tabular-nums">
                      <span>👍 {fmt(p.likes)}</span>
                      <span>💬 {fmt(p.comments)}</span>
                      <span>↗ {fmt(p.shares)}</span>
                      <span className="text-gray-400 ml-auto">{new Date(p.createdTime).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </Section>
        );
      })()}
      {data.audience?.available && data.audience.countries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Section title="Where your audience is" hint="followers by country">
            {data.audience.countries.slice(0, 5).map((c) => (
              <div key={c.code} className="flex items-baseline justify-between text-sm py-0.5">
                <span className="text-gray-800">{regionName(c.code)}</span>
                <span className="text-gray-500 text-xs tabular-nums">{c.pct}% · {fmt(c.count)}</span>
              </div>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

// ── LinkedIn ────────────────────────────────────────────────────────────────

export const LI_PAGE: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: "gcworld",
  "12thplusdotcom": null,
  samvaya_matrimony: null,
};

type LiPost = {
  id: string; date: string; text: string; type: string;
  impressions: number; clicks: number; reactions: number; comments: number; shares: number;
  engagementRate: number; ctr: number; thumbnailUrl?: string | null; permalink?: string | null;
};
type DemoRow = { label: string; pct: number; count: number };
type LiResp = {
  source: "demo" | "live";
  page: { name: string };
  summary: { followers: number; followerGain: number; impressions: number; engagementRate: number; pageViews: number; posts: number };
  followersOverTime: { date: string; followers: number; newFollowers: number }[];
  posts: LiPost[];
  demographics: { jobFunction: DemoRow[]; location: DemoRow[]; industry: DemoRow[] };
  error?: string;
};

export function LinkedInOverview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const pageKey = LI_PAGE[accountId] ?? null;
  const qs = new URLSearchParams({ page: pageKey ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<LiResp>(pageKey ? `/api/linkedin?${qs}` : null);
  if (!pageKey) return <EmptyPlatform platform="LinkedIn page" brand="This brand" />;
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading LinkedIn…</div>;
  if (!data || data.error) return <EmptyPlatform platform="LinkedIn page" brand="This brand" />;

  const topPosts = [...(data.posts || [])].sort((a, b) => b.impressions - a.impressions).slice(0, 4);
  const best = bestDay((data.posts || []).map((p) => ({ date: p.date, value: p.impressions })));
  const jobs = (data.demographics?.jobFunction || []).slice(0, 3);
  const places = (data.demographics?.location || []).slice(0, 3);

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

      {data.followersOverTime?.length > 1 && (
        <Section title="Follower growth" hint="in range">
          <Spark points={data.followersOverTime.map((p) => p.followers)} color="#0A66C2" />
        </Section>
      )}

      {topPosts.length > 0 && (
        <Section title="Top performing posts" hint="by impressions">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topPosts.map((p, i) => (
              <a key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="flex gap-3 rounded-lg border border-gray-100 p-3 hover:border-gray-300">
                {p.thumbnailUrl
                  ? <img src={p.thumbnailUrl} alt="" className="w-16 h-16 rounded-md object-cover bg-gray-100 flex-shrink-0" loading="lazy" />
                  : <div className="w-16 h-16 rounded-md bg-blue-50 text-blue-800 flex items-center justify-center text-lg font-semibold flex-shrink-0">#{i + 1}</div>}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-gray-800 leading-snug line-clamp-2">{p.text || "(no text)"}</div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {p.type}
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1 flex gap-3 tabular-nums">
                    <span>👁 {fmt(p.impressions)}</span>
                    <span>👍 {fmt(p.reactions)}</span>
                    <span>💬 {fmt(p.comments)}</span>
                    <span>↗ {fmt(p.shares)}</span>
                    <span>{(p.engagementRate ?? 0).toFixed(1)}% eng</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {best && (
          <Section title="Best day to post" hint="from your posts in range">
            <div className="text-xl font-semibold" style={{ color: "#0A66C2" }}>{best.day}</div>
            <div className="text-[11px] text-gray-500 mt-1">Posts published on {best.day}s earned the most impressions. Next best: {best.runnerUp}.</div>
          </Section>
        )}
        {jobs.length > 0 && (
          <Section title="Who follows you" hint="top job functions">
            {jobs.map((j) => (
              <div key={j.label} className="flex items-baseline justify-between text-sm py-0.5">
                <span className="text-gray-800">{j.label}</span>
                <span className="text-gray-500 text-xs tabular-nums">{j.pct}%</span>
              </div>
            ))}
          </Section>
        )}
        {places.length > 0 && (
          <Section title="Where they are" hint="top locations">
            {places.map((l) => (
              <div key={l.label} className="flex items-baseline justify-between text-sm py-0.5">
                <span className="text-gray-800">{l.label}</span>
                <span className="text-gray-500 text-xs tabular-nums">{l.pct}%</span>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

// ── YouTube ─────────────────────────────────────────────────────────────────

export const YT_CHANNEL: Record<string, string | null> = {
  goocampus: "goocampus",
  goocampusworld: "goocampusworld", // = the Study Abroad channel
  "12thplusdotcom": "twelfthplus",
  samvaya_matrimony: null,
};

type YtVideo = { id: string; title: string; thumbnail: string; views: number; watchHours: number; avgViewDurationSec: number; likes: number; comments: number };
type YtResp = {
  source: "demo" | "live";
  channel: { name: string; handle: string };
  summary: { subscribers: number; subscriberGain: number; views: number; watchHours: number; avgViewDurationSec: number };
  viewsOverTime: { date: string; views: number; watchHours: number }[];
  topVideos: YtVideo[];
  traffic: {
    sources: { source: string; views: number; pct: number }[];
    geography: { country: string; views: number; pct: number }[];
    cities?: { city: string; views: number; pct: number }[];
    devices: { device: string; pct: number }[];
    ageGroups: { group: string; pct: number }[];
    genderSplit: { label: string; pct: number }[];
  };
  error?: string;
};

export function YouTubeOverview({ accountId, range }: { accountId: string; range: { from: string; to: string } }) {
  const channel = YT_CHANNEL[accountId] ?? null;
  const qs = new URLSearchParams({ channel: channel ?? "", from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<YtResp>(channel ? `/api/youtube?${qs}` : null);
  if (!channel) return <EmptyPlatform platform="YouTube channel" brand="This brand" />;
  if (isLoading && !data) return <div className="text-sm text-gray-400 py-16 text-center">Loading YouTube…</div>;
  if (!data || data.error) return <EmptyPlatform platform="YouTube channel" brand="This brand" />;

  const mins = Math.floor((data.summary.avgViewDurationSec ?? 0) / 60);
  const secs = Math.round((data.summary.avgViewDurationSec ?? 0) % 60);
  const [hero, ...rest] = data.topVideos || [];
  const best = bestDay((data.viewsOverTime || []).map((p) => ({ date: p.date, value: p.views })));
  const sources = (data.traffic?.sources || []).slice(0, 3);
  const countries = (data.traffic?.geography || []).slice(0, 3);
  const cities = (data.traffic?.cities || []).slice(0, 3);
  const ages = (data.traffic?.ageGroups || []).slice(0, 3);
  const genders = (data.traffic?.genderSplit || []).filter((g) => g.label !== "genderUserSpecified");
  const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <PanelHeader title={data.channel.name || "YouTube"} sub={data.channel.handle} href="/dashboard/youtube" source={data.source} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Subscribers" value={fmt(data.summary.subscribers)} sub={`+${data.summary.subscriberGain} in range`} color="#FF0000" />
        <Stat label="Views" value={fmt(data.summary.views)} sub="in range" />
        <Stat label="Watch time" value={`${fmt(Math.round(data.summary.watchHours))} h`} sub="hours watched" />
        <Stat label="Avg view duration" value={`${mins}:${String(secs).padStart(2, "0")}`} sub="min:sec" />
      </div>

      {data.viewsOverTime?.length > 1 && (
        <Section title="Views over time" hint="daily, in range">
          <Spark points={data.viewsOverTime.map((p) => p.views)} color="#FF0000" />
        </Section>
      )}

      {hero && (
        <Section title="Top performing video" hint="by views in range">
          <div className="flex flex-col md:flex-row gap-4">
            <a href={hero.id ? `https://www.youtube.com/watch?v=${hero.id}` : undefined} target="_blank" rel="noreferrer" className="block md:w-64 flex-shrink-0">
              {hero.thumbnail
                ? <img src={hero.thumbnail} alt="" className="w-full aspect-video object-cover rounded-lg bg-gray-100" loading="lazy" />
                : <div className="w-full aspect-video rounded-lg bg-gray-100" />}
            </a>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 leading-snug">{hero.title}</div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mt-3">
                <div><div className="text-lg font-semibold tabular-nums">{fmt(hero.views)}</div><div className="text-[10px] text-gray-500 uppercase">Views</div></div>
                <div><div className="text-lg font-semibold tabular-nums">{fmt(Math.round(hero.watchHours))}h</div><div className="text-[10px] text-gray-500 uppercase">Watch time</div></div>
                <div><div className="text-lg font-semibold tabular-nums">{dur(hero.avgViewDurationSec)}</div><div className="text-[10px] text-gray-500 uppercase">Avg view</div></div>
                <div><div className="text-lg font-semibold tabular-nums">{fmt(hero.likes)}</div><div className="text-[10px] text-gray-500 uppercase">Likes</div></div>
                <div><div className="text-lg font-semibold tabular-nums">{fmt(hero.comments)}</div><div className="text-[10px] text-gray-500 uppercase">Comments</div></div>
              </div>
            </div>
          </div>
          {rest.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-50 space-y-1.5">
              {rest.slice(0, 4).map((v, i) => (
                <a key={v.id ?? i} href={v.id ? `https://www.youtube.com/watch?v=${v.id}` : undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm group">
                  <span className="text-gray-400 text-xs w-4">{i + 2}</span>
                  {v.thumbnail
                    ? <img src={v.thumbnail} alt="" className="w-16 aspect-video object-cover rounded bg-gray-100 flex-shrink-0" loading="lazy" />
                    : <div className="w-16 aspect-video rounded bg-gray-100 flex-shrink-0" />}
                  <span className="flex-1 truncate text-gray-800 group-hover:text-brand">{v.title}</span>
                  <span className="text-gray-500 text-xs tabular-nums flex-shrink-0">{fmt(v.views)} views · {fmt(Math.round(v.watchHours))}h</span>
                </a>
              ))}
            </div>
          )}
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {best && (
          <Section title="Best day for views" hint="daily views by weekday, in range">
            <div className="text-xl font-semibold" style={{ color: "#FF0000" }}>{best.day}</div>
            <div className="text-[11px] text-gray-500 mt-1">{best.day}s average the most views for this channel. Next best: {best.runnerUp}.</div>
          </Section>
        )}
        {sources.length > 0 && (
          <Section title="Where views come from" hint="top traffic sources">
            {sources.map((s) => (
              <div key={s.source} className="flex items-baseline justify-between text-sm py-0.5">
                <span className="text-gray-800">{s.source}</span>
                <span className="text-gray-500 text-xs tabular-nums">{s.pct}% · {fmt(s.views)}</span>
              </div>
            ))}
          </Section>
        )}
        {countries.length > 0 && (
          <Section title="Top countries" hint="by views">
            {countries.map((c) => (
              <div key={c.country} className="flex items-baseline justify-between text-sm py-0.5">
                <span className="text-gray-800">{regionName(c.country)}</span>
                <span className="text-gray-500 text-xs tabular-nums">{c.pct}% · {fmt(c.views)}</span>
              </div>
            ))}
          </Section>
        )}
        {(ages.length > 0 || genders.length > 0) && (
          <Section title="Age & gender" hint="viewers in range">
            {ages.map((a) => (
              <div key={a.group} className="flex items-baseline justify-between text-sm py-0.5">
                <span className="text-gray-800">{a.group}</span>
                <span className="text-gray-500 text-xs tabular-nums">{a.pct}%</span>
              </div>
            ))}
            {genders.length > 0 && (
              <div className="text-xs text-gray-500 mt-1.5 pt-1.5 border-t border-gray-50">
                {genders.map((g) => `${g.label} ${g.pct}%`).join(" · ")}
              </div>
            )}
          </Section>
        )}
        {cities.length > 0 && (
          <Section title="Top cities" hint="by views">
            {cities.map((c) => (
              <div key={c.city} className="flex items-baseline justify-between text-sm py-0.5">
                <span className="text-gray-800">{c.city}</span>
                <span className="text-gray-500 text-xs tabular-nums">{c.pct}% · {fmt(c.views)}</span>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
