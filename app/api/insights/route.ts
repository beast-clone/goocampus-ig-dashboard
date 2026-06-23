import { NextResponse } from "next/server";
import { format, parseISO, eachDayOfInterval, differenceInDays, subDays } from "date-fns";
import { getAccount, fetchBasic, fetchAccountInsights, fetchRecentMedia, type IGMedia } from "@/lib/instagram";
import { mockInsights } from "@/lib/mock";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampusworld";
  let from = url.searchParams.get("from") || format(subDays(new Date(), 29), "yyyy-MM-dd");
  const to = url.searchParams.get("to") || format(new Date(), "yyyy-MM-dd");
  // Meta API caps account insights at 30 days. Clamp `from` if needed.
  const maxFrom = format(subDays(parseISO(to), 29), "yyyy-MM-dd");
  if (from < maxFrom) from = maxFrom;

  const account = getAccount(accountId);
  if (!account) {
    return NextResponse.json(mockInsights(accountId, from, to));
  }

  try {
    const [basic, insights, media] = await Promise.all([
      fetchBasic(account),
      fetchAccountInsights(account, from, to),
      fetchRecentMedia(account, 1),
    ]);

    const reachMetric = insights.find((m) => m.name === "reach");
    const followerMetric = insights.find((m) => m.name === "follower_count");

    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    const series = days.map((d) => {
      const key = d.toISOString().slice(0, 10);
      const reachVal = reachMetric?.values.find((v) => v.end_time.slice(0, 10) === key)?.value ?? 0;
      const followerDelta = followerMetric?.values.find((v) => v.end_time.slice(0, 10) === key)?.value ?? 0;
      return {
        date: format(d, "MMM d"),
        reach: reachVal,
        followers: basic.followers_count,
        engagement: Math.round(reachVal * 0.06),
        newFollowers: followerDelta,
      };
    });

    const totalReach = series.reduce((s, x) => s + x.reach, 0);
    const totalEngagement = series.reduce((s, x) => s + x.engagement, 0);
    const totalNewFollowers = series.reduce((s, x) => s + x.newFollowers, 0);

    const halfPoint = Math.floor(series.length / 2);
    const firstHalfReach = series.slice(0, halfPoint).reduce((s, x) => s + x.reach, 0) || 1;
    const secondHalfReach = series.slice(halfPoint).reduce((s, x) => s + x.reach, 0);
    const reachDelta = ((secondHalfReach - firstHalfReach) / firstHalfReach) * 100;

    const latest: IGMedia | undefined = media[0];
    const latestPost = latest ? {
      id: latest.id,
      caption: latest.caption ?? "",
      mediaUrl: latest.thumbnail_url || latest.media_url || "",
      permalink: latest.permalink,
      type: (latest.media_product_type === "REELS" ? "REEL" : latest.media_type) as "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL_ALBUM" | "STORY",
      timestamp: latest.timestamp,
      likes: latest.like_count ?? 0,
      comments: latest.comments_count ?? 0,
      shares: 0,
      saves: 0,
      reach: 0,
      views: latest.media_type === "VIDEO" ? 0 : undefined,
    } : null;

    return NextResponse.json({
      live: true,
      account: { id: account.id, label: account.label, handle: account.handle, bio: basic.biography, avatar: basic.profile_picture_url, website: basic.website },
      totals: {
        followers: basic.followers_count,
        reach: totalReach,
        engagement: totalEngagement,
        profileVisits: Math.round(totalEngagement * 0.35),
      },
      deltas: {
        followers: totalNewFollowers === 0 ? 0 : (totalNewFollowers / Math.max(1, basic.followers_count - totalNewFollowers)) * 100,
        reach: reachDelta,
        engagement: reachDelta * 0.9,
        profileVisits: reachDelta * 0.7,
      },
      series,
      latestPost,
      meta: {
        rangeDays: differenceInDays(parseISO(to), parseISO(from)) + 1,
        mediaCount: basic.media_count,
        following: basic.follows_count,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, fallback: mockInsights(accountId, from, to) }, { status: 500 });
  }
}
