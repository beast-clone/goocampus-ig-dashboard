import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { safeError } from "@/lib/errors";

// Competitor YouTube uploads — public data via the YouTube Data API key (no OAuth
// needed; we only read public channels). Channels come from competitor-youtube.json.
//   GET /api/benchmark/youtube  ->  { videos: [...] }
export const dynamic = "force-dynamic";
const API = "https://www.googleapis.com/youtube/v3";

type ChannelCfg = { name: string; channelId: string };
type Vid = { id: string; title: string; channel: string; thumbnail: string; publishedAt: string; views: number; url: string };

function loadChannels(): ChannelCfg[] {
  try {
    const file = path.join(process.cwd(), "competitor-youtube.json");
    return (JSON.parse(fs.readFileSync(file, "utf8")).channels || []) as ChannelCfg[];
  } catch { return []; }
}

export async function GET() {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 500 });
    const channels = loadChannels();
    if (!channels.length) return NextResponse.json({ videos: [] });

    // 1) uploads playlist id per channel (one batched call).
    const ids = channels.map((c) => c.channelId).join(",");
    const chRes = await fetch(`${API}/channels?part=contentDetails&id=${ids}&key=${key}`).then((r) => r.json());
    const uploads: { channel: string; playlist: string }[] = (chRes.items || []).map((it: { id: string; contentDetails?: { relatedPlaylists?: { uploads?: string } } }) => ({
      channel: channels.find((c) => c.channelId === it.id)?.name || it.id,
      playlist: it.contentDetails?.relatedPlaylists?.uploads || "",
    })).filter((u: { playlist: string }) => u.playlist);

    // 2) recent uploads per channel, then 3) batch video stats for view counts.
    const raw: { id: string; channel: string; title: string; thumb: string; publishedAt: string }[] = [];
    for (const u of uploads) {
      const pl = await fetch(`${API}/playlistItems?part=snippet,contentDetails&maxResults=6&playlistId=${u.playlist}&key=${key}`).then((r) => r.json());
      for (const it of pl.items || []) {
        const sn = it.snippet || {};
        const th = sn.thumbnails || {};
        raw.push({
          id: it.contentDetails?.videoId,
          channel: u.channel,
          title: sn.title || "",
          thumb: (th.high || th.medium || th.default || {}).url || "",
          publishedAt: it.contentDetails?.videoPublishedAt || sn.publishedAt || "",
        });
      }
    }
    const vidIds = raw.map((v) => v.id).filter(Boolean);
    const statsMap: Record<string, number> = {};
    if (vidIds.length) {
      const st = await fetch(`${API}/videos?part=statistics&id=${vidIds.join(",")}&key=${key}`).then((r) => r.json());
      for (const it of st.items || []) statsMap[it.id] = Number(it.statistics?.viewCount || 0);
    }

    const videos: Vid[] = raw
      .filter((v) => v.id)
      .map((v) => ({ id: v.id, title: v.title, channel: v.channel, thumbnail: v.thumb, publishedAt: v.publishedAt, views: statsMap[v.id] || 0, url: `https://www.youtube.com/watch?v=${v.id}` }))
      .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));

    return NextResponse.json({ videos });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load competitor YouTube"), { status: 502 });
  }
}
