import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";

// One competitor's YouTube channel — subscribers, total views, recent uploads.
//
//   GET /api/benchmark/youtube-channel?channelId=UC...
//
// The existing /api/benchmark/youtube reads a fixed competitor-youtube.json and
// returns everyone's uploads mixed together; a competitor profile needs one named
// channel. Public data only — the API key is enough, no OAuth, because we are
// reading channels we do not own.
export const dynamic = "force-dynamic";

const API = "https://www.googleapis.com/youtube/v3";

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  // The quota is per project and shared with the rest of the YouTube pages.
  const limited = guardRate(req, "yt-channel", 30, 300_000);
  if (limited) return limited;

  const channelId = (new URL(req.url).searchParams.get("channelId") || "").trim();
  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 500 });

  try {
    const ch = await fetch(`${API}/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(channelId)}&key=${key}`)
      .then((r) => r.json());
    const item = (ch.items || [])[0];
    // A channel id that doesn't resolve is a typo, not an outage — say so plainly
    // rather than rendering an empty panel.
    if (!item) return NextResponse.json({ found: false, reason: "No channel with that ID." });

    const stats = item.statistics || {};
    const uploads = item.contentDetails?.relatedPlaylists?.uploads;

    let videos: { id: string; title: string; thumbnail: string; publishedAt: string; views: number; url: string }[] = [];
    if (uploads) {
      const pl = await fetch(`${API}/playlistItems?part=snippet,contentDetails&maxResults=8&playlistId=${uploads}&key=${key}`)
        .then((r) => r.json());
      const ids = (pl.items || []).map((it: { contentDetails?: { videoId?: string } }) => it.contentDetails?.videoId).filter(Boolean);
      // View counts are not on playlistItems, so one batched videos call gets them.
      const statsById = new Map<string, number>();
      if (ids.length) {
        const vs = await fetch(`${API}/videos?part=statistics&id=${ids.join(",")}&key=${key}`).then((r) => r.json());
        for (const v of vs.items || []) statsById.set(v.id, Number(v.statistics?.viewCount || 0));
      }
      videos = (pl.items || []).map((it: { snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { videoId?: string } }) => {
        const id = it.contentDetails?.videoId || "";
        const t = it.snippet?.thumbnails || {};
        return {
          id,
          title: it.snippet?.title || "",
          thumbnail: t.medium?.url || t.default?.url || "",
          publishedAt: it.snippet?.publishedAt || "",
          views: statsById.get(id) || 0,
          url: `https://www.youtube.com/watch?v=${id}`,
        };
      }).filter((v: { id: string }) => v.id);
    }

    return NextResponse.json({
      found: true,
      channel: {
        id: channelId,
        title: item.snippet?.title || channelId,
        thumbnail: item.snippet?.thumbnails?.default?.url || "",
        subscribers: Number(stats.subscriberCount || 0),
        // Channels can hide their subscriber count; 0 then means "hidden", not zero.
        subscribersHidden: stats.hiddenSubscriberCount === true,
        views: Number(stats.viewCount || 0),
        videoCount: Number(stats.videoCount || 0),
      },
      videos,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't read that YouTube channel"), { status: 502 });
  }
}
