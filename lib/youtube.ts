// YouTube Analytics API client (live side of /api/youtube).
//
// Auth is a Google OAuth token authorized by an account that manages the
// channel (owner OR manager — the primary-owner role is NOT required to read
// analytics). Reading your own channel's stats needs no Google review, just the
// yt-analytics.readonly scope.
//
// Env (absence keeps the tab on demo data):
//   YOUTUBE_ACCESS_TOKEN    — OAuth access token, scope yt-analytics.readonly (+ youtube.readonly)
//   YOUTUBE_REFRESH_TOKEN   — refresh token (access tokens last ~1h; refresh with client id/secret)
//   YOUTUBE_CLIENT_ID       — OAuth client id
//   YOUTUBE_CLIENT_SECRET   — OAuth client secret
//   YOUTUBE_CHANNEL_IDS     — JSON map { "<key>": "UCxxxx", ... } filling CHANNELS[key].channelId
//
// Docs: https://developers.google.com/youtube/analytics/reference/reports/query

import { CHANNELS } from "@/app/api/youtube/route";

const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

export function youtubeToken(): string | null {
  return process.env.YOUTUBE_ACCESS_TOKEN || null;
}

// Live is possible with EITHER a stored access token OR refresh-token credentials
// (freshAccessToken below mints hourly access tokens from the refresh token).
export function hasYouTubeAuth(): boolean {
  const at = process.env.YOUTUBE_ACCESS_TOKEN;
  const rt = process.env.YOUTUBE_REFRESH_TOKEN;
  const id = process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  return !!(at || (rt && id && secret));
}

// Each channel is a separate Google brand account, so each needs its own refresh
// token: YOUTUBE_REFRESH_TOKENS = {"goocampus":"1//…","twelfthplus":"1//…"}.
// Falls back to the single YOUTUBE_REFRESH_TOKEN for unlisted channels.
function refreshTokenFor(channelKey?: string): string | null {
  try {
    const map = JSON.parse(process.env.YOUTUBE_REFRESH_TOKENS || "{}") as Record<string, unknown>;
    if (channelKey && typeof map[channelKey] === "string") return map[channelKey] as string;
  } catch { /* malformed map → fall through to the single-token env */ }
  return process.env.YOUTUBE_REFRESH_TOKEN || null;
}

// Access tokens expire hourly; exchange the refresh token for a fresh one when needed.
async function freshAccessToken(channelKey?: string): Promise<string> {
  const at = process.env.YOUTUBE_ACCESS_TOKEN;
  const rt = refreshTokenFor(channelKey);
  const id = process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  // Prefer the stored access token; if a refresh token + client creds exist, mint a fresh one.
  if (rt && id && secret) {
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: rt, grant_type: "refresh_token" }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j.access_token) return j.access_token as string;
      }
    } catch { /* fall back to stored token */ }
  }
  if (!at) throw new Error("No YouTube access token");
  return at;
}

async function ytGet(params: Record<string, string>, token: string): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${ANALYTICS}?${qs}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`YouTube ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// Analytics queries use channel==<id> (or channel==MINE for the auth'd channel).
function channelFilter(channelId: string): string {
  return channelId ? `channel==${channelId}` : "channel==MINE";
}

export async function buildLiveYouTube(channelKey: string, from: string, to: string) {
  const ch = CHANNELS[channelKey];
  if (!ch) throw new Error("unknown channel");
  const token = await freshAccessToken(channelKey);
  const ids = channelFilter(ch.channelId);

  // ── Views & watch time (+ subs) by day ──
  const daily = await ytGet({
    ids, startDate: from, endDate: to,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost",
    dimensions: "day", sort: "day",
  }, token).catch(() => ({ rows: [] }));

  const dayRows: any[] = daily.rows || [];
  // Column order matches the metrics list above.
  const viewsOverTime = dayRows.map((r) => ({
    date: r[0],
    views: r[1] || 0,
    watchHours: Math.round(((r[2] || 0) / 60) * 10) / 10,
  }));

  // Subscribers: reconstruct a running total ending at the current count.
  const subEvents = dayRows.map((r) => ({ date: r[0], gained: r[4] || 0, lost: r[5] || 0, net: (r[4] || 0) - (r[5] || 0) }));

  // Totals for the range
  const totals = await ytGet({
    ids, startDate: from, endDate: to,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost",
  }, token).catch(() => ({ rows: [[0, 0, 0, 0, 0]] }));
  const t = (totals.rows && totals.rows[0]) || [0, 0, 0, 0, 0];
  const totalViews = t[0] || 0;
  const totalWatchHours = Math.round((t[1] || 0) / 60);
  const avgViewDurationSec = t[2] || 0;
  const netSubs = (t[3] || 0) - (t[4] || 0);

  // Current subscriber count (lifetime) — from the Data API channels.statistics.
  let currentSubs = ch.baseSubs;
  try {
    if (ch.channelId) {
      const dr = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ch.channelId}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      if (dr.ok) {
        const dj = await dr.json();
        currentSubs = Number(dj.items?.[0]?.statistics?.subscriberCount || ch.baseSubs);
      }
    }
  } catch { /* keep fallback */ }

  let running = currentSubs - netSubs;
  const subscribersOverTime = subEvents.map((e) => {
    running += e.net;
    return { date: e.date, subscribers: running, gained: e.gained, lost: e.lost, net: e.net };
  });

  // ── Top videos ──
  const topRaw = await ytGet({
    ids, startDate: from, endDate: to,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments",
    dimensions: "video", sort: "-views", maxResults: "10",
  }, token).catch(() => ({ rows: [] }));
  const videoRows: any[] = topRaw.rows || [];
  const videoIds = videoRows.map((r) => r[0]).join(",");
  // Resolve titles + thumbnails via the Data API.
  const titleMap: Record<string, { title: string; thumb: string }> = {};
  if (videoIds) {
    try {
      const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      if (vr.ok) {
        const vj = await vr.json();
        for (const item of vj.items || []) {
          titleMap[item.id] = { title: item.snippet?.title || item.id, thumb: item.snippet?.thumbnails?.medium?.url || "" };
        }
      }
    } catch { /* leave ids */ }
  }
  const topVideos = videoRows.map((r) => {
    const id = r[0];
    return {
      id,
      title: titleMap[id]?.title || id,
      thumbnail: titleMap[id]?.thumb || "",
      views: r[1] || 0,
      watchHours: Math.round(((r[2] || 0) / 60) * 10) / 10,
      avgViewDurationSec: r[3] || 0,
      likes: r[4] || 0,
      comments: r[5] || 0,
      publishedDaysAgo: 0,
    };
  });

  // ── Traffic sources / geography / devices / demographics ──
  const pct = (rows: any[], labelIdx = 0, valIdx = 1) => {
    const total = rows.reduce((s, r) => s + (r[valIdx] || 0), 0);
    return rows
      .map((r) => ({ label: String(r[labelIdx]), value: r[valIdx] || 0, pct: total ? Math.round(((r[valIdx] || 0) / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.pct - a.pct);
  };

  const [trafficRaw, geoRaw, deviceRaw, demoRaw, cityRaw] = await Promise.all([
    ytGet({ ids, startDate: from, endDate: to, metrics: "views", dimensions: "insightTrafficSourceType", sort: "-views" }, token).catch(() => ({ rows: [] })),
    ytGet({ ids, startDate: from, endDate: to, metrics: "views", dimensions: "country", sort: "-views", maxResults: "8" }, token).catch(() => ({ rows: [] })),
    ytGet({ ids, startDate: from, endDate: to, metrics: "views", dimensions: "deviceType", sort: "-views" }, token).catch(() => ({ rows: [] })),
    ytGet({ ids, startDate: from, endDate: to, metrics: "viewerPercentage", dimensions: "ageGroup,gender", sort: "-viewerPercentage" }, token).catch(() => ({ rows: [] })),
    // Top cities — YouTube only returns cities that clear its privacy threshold,
    // so small channels may get few rows (that's Google, not us).
    ytGet({ ids, startDate: from, endDate: to, metrics: "views", dimensions: "city", sort: "-views", maxResults: "10" }, token).catch(() => ({ rows: [] })),
  ]);

  const TRAFFIC_LABELS: Record<string, string> = {
    YT_SEARCH: "YouTube search", RELATED_VIDEO: "Suggested videos", BROWSE: "Browse features",
    EXT_URL: "External", NO_LINK_OTHER: "Direct / unknown", SUBSCRIBER: "Subscriptions",
    CHANNEL: "Channel pages", PLAYLIST: "Playlists", NOTIFICATION: "Notifications",
  };
  const trafficSources = pct(trafficRaw.rows || []).map((r) => ({ source: TRAFFIC_LABELS[r.label] || r.label, views: r.value, pct: r.pct }));
  const geography = pct(geoRaw.rows || []).map((r) => ({ country: r.label, views: r.value, pct: r.pct }));
  const cities = pct(cityRaw.rows || []).map((r) => ({ city: r.label, views: r.value, pct: r.pct }));
  const devices = pct(deviceRaw.rows || []).map((r) => ({ device: (r.label.charAt(0) + r.label.slice(1).toLowerCase()), pct: r.pct }));

  // Demographics: rows are [ageGroup, gender, viewerPercentage]. Collapse to age + gender.
  const ageMap: Record<string, number> = {};
  const genderMap: Record<string, number> = {};
  for (const r of demoRaw.rows || []) {
    const age = String(r[0]).replace("age", "").replace("_", "–");
    ageMap[age] = (ageMap[age] || 0) + (r[2] || 0);
    const g = String(r[1]);
    genderMap[g] = (genderMap[g] || 0) + (r[2] || 0);
  }
  const ageGroups = Object.entries(ageMap).map(([group, p]) => ({ group, pct: Math.round(p * 10) / 10 })).sort((a, b) => b.pct - a.pct);
  const genderSplit = Object.entries(genderMap).map(([label, p]) => ({ label: label.charAt(0) + label.slice(1).toLowerCase(), pct: Math.round(p * 10) / 10 }));

  return {
    channel: { id: ch.id, name: ch.name, handle: ch.handle, channelId: ch.channelId },
    source: "live" as const,
    range: { from, to },
    summary: {
      subscribers: currentSubs,
      subscriberGain: netSubs,
      views: totalViews,
      watchHours: totalWatchHours,
      avgViewDurationSec,
      videos: topVideos.length,
    },
    viewsOverTime,
    subscribersOverTime,
    topVideos,
    traffic: { sources: trafficSources, geography, cities, devices, ageGroups, genderSplit },
  };
}
