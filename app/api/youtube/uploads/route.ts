import { NextResponse } from "next/server";
import { fetchChannelUploads, hasYouTubeAuth } from "@/lib/youtube";
import { CHANNELS } from "@/lib/youtube-channels";
import { cached } from "@/lib/api-cache";

// GET /api/youtube/uploads?channel=<key>
// The channel's FULL upload library (all Shorts + long-form ever posted) with
// lifetime stats — powers the Reels-style Shorts / Long-form pages.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const channelKey = (url.searchParams.get("channel") || "goocampus").toLowerCase();
  const ch = CHANNELS[channelKey];
  if (!ch) return NextResponse.json({ error: "unknown channel" }, { status: 400 });
  if (!hasYouTubeAuth() || !ch.channelId) {
    return NextResponse.json({ channel: { name: ch.name, handle: ch.handle }, source: "unavailable", videos: [] });
  }
  try {
    // 30-min cache: the uploads list changes rarely and this makes 5+ Data API calls.
    const videos = await cached(`ytup:${channelKey}`, 24 * 60 * 60_000, () => fetchChannelUploads(channelKey));
    return NextResponse.json({ channel: { name: ch.name, handle: ch.handle }, source: "live", videos });
  } catch (e) {
    return NextResponse.json({ channel: { name: ch.name, handle: ch.handle }, source: "error", error: e instanceof Error ? e.message : String(e), videos: [] }, { status: 502 });
  }
}
