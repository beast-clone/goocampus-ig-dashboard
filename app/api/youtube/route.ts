import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { buildLiveYouTube, hasYouTubeAuth, resolveChannelId } from "@/lib/youtube";
import { CHANNELS } from "@/lib/youtube-channels";
import { cached } from "@/lib/api-cache";

// Best days to post, from REAL view data: which weekdays the channel's videos pull
// the most views (viewsOverTime aggregated by day-of-week). YouTube's API doesn't
// expose hour-level audience activity like Instagram does, so the DAY is data-driven
// and the TIME is a best-practice window for a student audience (labelled as such).
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function bestTimesFrom(viewsOverTime: { date: string; views: number }[]): { day: string; time: string; note: string }[] {
  const byDow = new Map<number, { sum: number; n: number }>();
  for (const d of viewsOverTime || []) {
    const dow = new Date(`${d.date}T00:00:00`).getDay();
    if (Number.isNaN(dow)) continue;
    const b = byDow.get(dow) || { sum: 0, n: 0 };
    b.sum += d.views || 0; b.n += 1; byDow.set(dow, b);
  }
  const ranked = [...byDow.entries()]
    .map(([dow, b]) => ({ dow, avg: b.n ? b.sum / b.n : 0 }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);
  const weekendTimes = ["11:00 AM", "10:30 AM", "12:00 PM"];
  const weekdayTimes = ["7:30 PM", "8:30 PM", "6:30 PM"];
  return ranked.map((r, i) => ({
    day: WEEKDAYS[r.dow],
    time: (r.dow === 0 || r.dow === 6 ? weekendTimes : weekdayTimes)[i] || (r.dow === 0 || r.dow === 6 ? "11:00 AM" : "7:30 PM"),
    note: i === 0 ? "your highest-viewed day" : "strong view day",
  }));
}

// GET /api/youtube?channel=<key>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// YouTube channel analytics for the GooCampus channels.
//
// Live only — no demo data. A channel without OAuth / a channel id answers 503
// "not connected"; a failed live call answers 502 with the reason. Goes live per-channel once a Google OAuth token with the
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
// ───────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  try {
    const url = new URL(req.url);
    const channelKey = (url.searchParams.get("channel") || "goocampus").toLowerCase();
    const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
    const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    if (!CHANNELS[channelKey]) {
      return NextResponse.json({ error: "unknown channel" }, { status: 400 });
    }

    const t0 = Date.now();
    const ytAuth = await hasYouTubeAuth();

    // If no channel-id env is set but OAuth is available, resolve the id from the
    // channel's @handle so live works with just OAuth (no YOUTUBE_CHANNEL_IDS needed).
    if (ytAuth && !CHANNELS[channelKey].channelId) {
      await resolveChannelId(channelKey).catch(() => null);
    }

    // Live when auth is available (access token OR refresh credentials) AND this
    // channel has a channelId (from env or resolved above).
    if (ytAuth && CHANNELS[channelKey].channelId) {
      try {
        // 10-min cache: YouTube Analytics takes 2–9s; tab flips shouldn't re-pay it.
        const live = await cached(`yt:${channelKey}:${from}:${to}`, 24 * 60 * 60_000, () => buildLiveYouTube(channelKey, from, to));
        return NextResponse.json({ ...live, bestTimes: bestTimesFrom(live.viewsOverTime), latencyMs: Date.now() - t0 });
      } catch (e) {
        return NextResponse.json({ error: `Couldn't load YouTube right now: ${e instanceof Error ? e.message : String(e)}`.slice(0, 240) }, { status: 502 });
      }
    }

    return NextResponse.json({ error: "YouTube isn't connected for this channel.", notConnected: true }, { status: 503 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "YouTube analytics failed" }, { status: 502 });
  }
}
