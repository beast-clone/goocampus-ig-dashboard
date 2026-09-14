import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getAccount, getDefaultAccountId, fetchRecentMedia } from "@/lib/instagram";

// Best-performing Instagram content for the report: recent posts in the window,
// ranked by engagement (likes + comments), with thumbnails.
//   GET /api/reports/instagram-top?from=&to=&limit=6&accountId=
//     → { available, posts: [{ permalink, thumb, type, likes, comments, timestamp }] }
export const dynamic = "force-dynamic";
const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  try {
    const u = new URL(req.url);
    const accountId = u.searchParams.get("accountId") || getDefaultAccountId();
    const acc = getAccount(accountId);
    if (!acc) return NextResponse.json({ available: false, posts: [] });
    const to = isYMD(u.searchParams.get("to") || "") ? u.searchParams.get("to")! : new Date().toISOString().slice(0, 10);
    const from = isYMD(u.searchParams.get("from") || "") ? u.searchParams.get("from")! : new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const limit = Math.min(12, Math.max(1, Number(u.searchParams.get("limit")) || 6));

    const media = await fetchRecentMedia(acc, 100).catch(() => [] as Awaited<ReturnType<typeof fetchRecentMedia>>);
    const inWindow = (media || []).filter((m) => {
      const ts = (m.timestamp || "").slice(0, 10);
      return ts && ts >= from && ts <= to && m.media_product_type !== "STORY";
    });
    const posts = inWindow
      .map((m) => ({
        permalink: m.permalink,
        thumb: m.thumbnail_url || m.media_url || "",
        type: m.media_product_type === "REELS" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Post",
        likes: m.like_count || 0,
        comments: m.comments_count || 0,
        timestamp: m.timestamp || "",
      }))
      .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
      .slice(0, limit);

    return NextResponse.json({ available: posts.length > 0, window: { from, to }, posts });
  } catch (err) {
    return NextResponse.json(safeError(err, "Instagram top-content failed"), { status: 502 });
  }
}
