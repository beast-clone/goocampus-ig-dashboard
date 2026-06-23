import { NextResponse } from "next/server";
import { getAccount, fetchRecentMedia, fetchMediaInsights } from "@/lib/instagram";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampusworld";
  const limit = parseInt(url.searchParams.get("limit") || "25", 10);
  const withInsights = url.searchParams.get("insights") === "true";

  const account = getAccount(accountId);
  if (!account) return NextResponse.json({ posts: [], note: "No account configured" });

  try {
    const media = await fetchRecentMedia(account, limit);
    const posts = await Promise.all(
      media.map(async (m) => {
        let reach = 0, shares = 0, saves = 0, totalInteractions = 0, views: number | undefined, avgWatch: number | undefined;
        if (withInsights) {
          const insights = await fetchMediaInsights(account, m.id, m.media_type, m.media_product_type);
          for (const i of insights) {
            const v = i.values?.[0]?.value;
            if (typeof v !== "number") continue;
            if (i.name === "reach") reach = v;
            else if (i.name === "shares") shares = v;
            else if (i.name === "saved") saves = v;
            else if (i.name === "total_interactions") totalInteractions = v;
            else if (i.name === "views") views = v;
            else if (i.name === "ig_reels_avg_watch_time") avgWatch = v;
          }
        }
        return {
          id: m.id,
          caption: m.caption ?? "",
          mediaUrl: m.thumbnail_url || m.media_url || "",
          permalink: m.permalink,
          type: m.media_product_type === "REELS" ? "REEL" : m.media_type,
          timestamp: m.timestamp,
          likes: m.like_count ?? 0,
          comments: m.comments_count ?? 0,
          reach,
          shares,
          saves,
          totalInteractions,
          views,
          avgWatchMs: avgWatch,
        };
      })
    );
    return NextResponse.json({ live: true, posts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
