import { NextResponse } from "next/server";
import { buildLiveYouTube, hasYouTubeAuth } from "@/lib/youtube";
import { cached } from "@/lib/api-cache";

// GET /api/youtube?channel=<key>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// YouTube channel analytics for the GooCampus channels.
//
// ⚠️  DEMO by default. Goes live per-channel once a Google OAuth token with the
// yt-analytics.readonly scope is present (LINKEDIN-style swap). Reading your own
// channel's analytics needs NO Google review — just the OAuth scope, authorized
// by any account that manages the channel (owner OR manager).
//
// ── HOW TO GO LIVE ─────────────────────────────────────────────────────────
// 1. Google Cloud Console → enable "YouTube Analytics API" + "YouTube Data API v3"
//    (reuse the project from the YouTube Scheduler upload workflow if it exists).
// 2. OAuth consent screen → add your Google account as a test user (or publish).
// 3. Create OAuth client → get client id/secret → run the consent flow with scope
//    https://www.googleapis.com/auth/yt-analytics.readonly (+ youtube.readonly),
//    picking the Brand Account/channel you manage → obtain access + refresh tokens.
// 4. Set env:
//    YOUTUBE_ACCESS_TOKEN, YOUTUBE_REFRESH_TOKEN, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET
//    plus a channel-id map (see lib/youtube.ts CHANNELS).
// The live fetchers in lib/youtube.ts return the SAME shape as buildDemo below,
// so the UI needs no changes.
// ───────────────────────────────────────────────────────────────────────────

export const CHANNELS: Record<string, { id: string; name: string; handle: string; channelId: string; baseSubs: number; scale: number }> = {
  goocampus:      { id: "goocampus",      name: "GooCampus",        handle: "@goocampus",       channelId: "", baseSubs: 24300, scale: 1.0 },
  goocampusworld: { id: "goocampusworld", name: "Study Abroad",     handle: "@goocampusstudyabroad", channelId: "", baseSubs: 8600,  scale: 0.44 },
  twelfthplus:    { id: "twelfthplus",    name: "12thplus",         handle: "@12thplus",        channelId: "", baseSubs: 5100,  scale: 0.3 },
};

// Fill channelIds from env: YOUTUBE_CHANNEL_IDS = {"goocampus":"UCxxxx", ...}.
// Channels without an id stay on demo data.
try {
  const map = JSON.parse(process.env.YOUTUBE_CHANNEL_IDS || "{}") as Record<string, unknown>;
  for (const [k, v] of Object.entries(map)) {
    if (CHANNELS[k] && typeof v === "string") CHANNELS[k].channelId = v;
  }
} catch { /* malformed env → all channels stay demo */ }

// ── deterministic PRNG (stable across refreshes; seeded by channel+range) ──
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function daysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const start = new Date(fromIso + "T00:00:00Z");
  const end = new Date(toIso + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
function pctBreakdown(rand: () => number, labels: string[], total: number) {
  const weights = labels.map(() => 0.4 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  return labels
    .map((label, i) => {
      const pct = (weights[i] / sum) * 100;
      return { label, pct: Math.round(pct * 10) / 10, value: Math.round((pct / 100) * total) };
    })
    .sort((a, b) => b.pct - a.pct);
}

const VIDEO_TITLES = [
  "How to crack AMC MCQ in 90 days — full roadmap",
  "MBBS abroad vs India: the honest 2026 comparison",
  "PLAB 1 preparation: my exact 8-week timeline",
  "NEET PG counselling explained (state + AIQ)",
  "Germany Approbation process for Indian doctors",
  "Day in the life: medical resident in Australia",
  "5 mistakes that fail your medical licensing exam",
  "NZREX vs AMC vs PLAB — which pathway is right for you?",
  "Free MBBS cutoff predictor walkthrough",
  "Scholarships for Indian medical students abroad",
];

function buildDemo(channelKey: string, from: string, to: string) {
  const ch = CHANNELS[channelKey] || CHANNELS.goocampus;
  const days = daysBetween(from, to);
  const rand = mulberry32(hashSeed(`${ch.id}:${from}:${to}`));

  // Views & watch time over time
  const viewsOverTime = days.map((date) => {
    const views = Math.round((350 + rand() * 900) * ch.scale + (rand() < 0.1 ? rand() * 3000 * ch.scale : 0));
    const avgViewSec = 120 + rand() * 240; // 2–6 min
    const watchHours = Math.round((views * avgViewSec / 3600) * 10) / 10;
    return { date, views, watchHours };
  });
  const totalViews = viewsOverTime.reduce((s, d) => s + d.views, 0);
  const totalWatchHours = Math.round(viewsOverTime.reduce((s, d) => s + d.watchHours, 0));
  const avgViewDurationSec = totalViews ? Math.round((totalWatchHours * 3600) / totalViews) : 0;

  // Subscribers over time (gained/lost → running total ending at baseSubs)
  const subDaily = days.map(() => {
    const gained = Math.round((8 + rand() * 30) * ch.scale + (rand() < 0.08 ? rand() * 120 * ch.scale : 0));
    const lost = Math.round(gained * (0.1 + rand() * 0.25));
    return { gained, lost, net: gained - lost };
  });
  const netTotal = subDaily.reduce((s, d) => s + d.net, 0);
  let running = ch.baseSubs - netTotal;
  const subscribersOverTime = days.map((date, i) => {
    running += subDaily[i].net;
    return { date, subscribers: running, gained: subDaily[i].gained, lost: subDaily[i].lost, net: subDaily[i].net };
  });
  const currentSubs = running;

  // Top videos
  const nVideos = Math.min(VIDEO_TITLES.length, 8);
  const topVideos = Array.from({ length: nVideos }, (_, i) => {
    const views = Math.round((800 + rand() * 9000) * ch.scale);
    const avgSec = 140 + rand() * 260;
    const watchHours = Math.round((views * avgSec / 3600) * 10) / 10;
    const likes = Math.round(views * (0.02 + rand() * 0.05));
    const comments = Math.round(likes * (0.05 + rand() * 0.2));
    const publishedDaysAgo = Math.round(rand() * 120);
    return {
      id: `demo-${ch.id}-${i}`,
      title: VIDEO_TITLES[i],
      thumbnail: `https://picsum.photos/seed/yt${ch.id}${i}/320/180`,
      views,
      watchHours,
      avgViewDurationSec: Math.round(avgSec),
      likes,
      comments,
      publishedDaysAgo,
    };
  }).sort((a, b) => b.views - a.views);

  // Traffic sources
  const trafficSources = pctBreakdown(rand, ["YouTube search", "Suggested videos", "Browse features", "External", "Channel pages", "Direct / unknown"], totalViews)
    .map((r) => ({ source: r.label, views: r.value, pct: r.pct }));

  // Geography
  const geography = pctBreakdown(rand, ["India", "United States", "United Arab Emirates", "United Kingdom", "Australia", "Canada", "Nepal"], totalViews)
    .map((r) => ({ country: r.label, views: r.value, pct: r.pct }));

  // Devices
  const devices = pctBreakdown(rand, ["Mobile", "Desktop", "Tablet", "TV"], 100).map((r) => ({ device: r.label, pct: r.pct }));

  // Demographics (age × implicit gender split)
  const ageGroups = pctBreakdown(rand, ["18–24", "25–34", "35–44", "45–54", "13–17", "55+"], 100).map((r) => ({ group: r.label, pct: r.pct }));
  const genderSplit = (() => {
    const male = 45 + Math.round(rand() * 20);
    return [{ label: "Male", pct: male }, { label: "Female", pct: 100 - male }];
  })();

  return {
    channel: { id: ch.id, name: ch.name, handle: ch.handle },
    source: "demo" as const,
    range: { from, to },
    summary: {
      subscribers: currentSubs,
      subscriberGain: netTotal,
      views: totalViews,
      watchHours: totalWatchHours,
      avgViewDurationSec,
      videos: topVideos.length,
    },
    viewsOverTime,
    subscribersOverTime,
    topVideos,
    traffic: { sources: trafficSources, geography, devices, ageGroups, genderSplit },
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const channelKey = (url.searchParams.get("channel") || "goocampus").toLowerCase();
    const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
    const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    if (!CHANNELS[channelKey]) {
      return NextResponse.json({ error: "unknown channel" }, { status: 400 });
    }

    const t0 = Date.now();

    // Live when auth is available (access token OR refresh credentials) AND this
    // channel has a configured channelId.
    if (hasYouTubeAuth() && CHANNELS[channelKey].channelId) {
      try {
        // 10-min cache: YouTube Analytics takes 2–9s; tab flips shouldn't re-pay it.
        const live = await cached(`yt:${channelKey}:${from}:${to}`, 24 * 60 * 60_000, () => buildLiveYouTube(channelKey, from, to));
        return NextResponse.json({ ...live, latencyMs: Date.now() - t0 });
      } catch (e) {
        const payload = buildDemo(channelKey, from, to);
        return NextResponse.json({ ...payload, source: "demo", liveError: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 });
      }
    }

    const payload = buildDemo(channelKey, from, to);
    return NextResponse.json({ ...payload, source: "demo", latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "YouTube analytics failed" }, { status: 502 });
  }
}
