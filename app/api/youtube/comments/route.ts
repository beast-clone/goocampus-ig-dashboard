import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { fetchVideoComments, hasYouTubeAuth } from "@/lib/youtube";
import { CHANNELS } from "@/lib/youtube-channels";
import { cached } from "@/lib/api-cache";

// GET /api/youtube/comments?channel=<key>&video=<id>
// Top comments on a video, shown inside the in-dashboard player modal.
export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const channelKey = (url.searchParams.get("channel") || "goocampus").toLowerCase();
  const video = url.searchParams.get("video") || "";
  if (!CHANNELS[channelKey]) return NextResponse.json({ error: "unknown channel" }, { status: 400 });
  if (!video) return NextResponse.json({ error: "missing video id" }, { status: 400 });
  if (!(await hasYouTubeAuth())) return NextResponse.json({ available: false, reason: "YouTube not connected", comments: [] });
  try {
    const data = await cached(`ytc:${channelKey}:${video}`, 24 * 60 * 60_000, () => fetchVideoComments(channelKey, video));
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ available: false, reason: e instanceof Error ? e.message : String(e), comments: [] }, { status: 502 });
  }
}
