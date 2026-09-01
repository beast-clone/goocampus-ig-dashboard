import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { format, parseISO, eachDayOfInterval, differenceInDays, subDays } from "date-fns";
import { getAccount, fetchBasic, fetchAccountInsights, fetchAccountReachUnique, fetchRecentMedia, type IGMedia } from "@/lib/instagram";
import { mockInsights } from "@/lib/mock";
import { safeError } from "@/lib/errors";

export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

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
    const [basic, insights, uniqueReach, media] = await Promise.all([
      fetchBasic(account),
      fetchAccountInsights(account, from, to),
      fetchAccountReachUnique(account, from, to),
      fetchRecentMedia(account, 1),
    ]);

    const reachMetric = insights.find((m) => m.name === "reach");
    const followerMetric = insights.find((m) => m.name === "follower_count");

    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    // Build per-day delta first
    const deltaByDay = new Map<string, number>();
    for (const d of days) {
      const key = d.toISOString().slice(0, 10);
      const delta = followerMetric?.values.find((v) => v.end_time.slice(0, 10) === key)?.value ?? 0;
      deltaByDay.set(key, delta);
    }
    // Reconstruct historical totals by working backward from today's count.
    // total[i] = current_total - sum(deltas from day i+1 to last)
    const totalsByDay = new Map<string, number>();
    let cumulativeAfter = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const key = days[i].toISOString().slice(0, 10);
      totalsByDay.set(key, basic.followers_count - cumulativeAfter);
      cumulativeAfter += deltaByDay.get(key) ?? 0;
    }

    const series = days.map((d) => {
      const key = d.toISOString().slice(0, 10);
      const reachVal = reachMetric?.values.find((v) => v.end_time.slice(0, 10) === key)?.value ?? 0;
      const followerDelta = deltaByDay.get(key) ?? 0;
      return {
        date: format(d, "MMM d"),
        reach: reachVal,
        followers: totalsByDay.get(key) ?? basic.followers_count,
        engagement: Math.round(reachVal * 0.06),
        newFollowers: followerDelta,
      };
    });

    // Headline reach = unique accounts over the window, deduplicated by Meta.
    // Summing the daily series would count a repeat viewer once per day they
    // saw us. Keep the daily sum only as a fallback if that call failed.
    const dailyReachSum = series.reduce((s, x) => s + x.reach, 0);
    const totalReach = uniqueReach ?? dailyReachSum;
    // Engagement and profile visits stay estimates — Instagram's account
    // insights don't expose them — but they are defined as a share of reach, so
    // they follow the corrected reach. Anchoring them here (rather than summing
    // the per-day estimates) is what keeps Eng. Rate at the intended 6%.
    const totalEngagement = Math.round(totalReach * 0.06);
    const totalNewFollowers = series.reduce((s, x) => s + x.newFollowers, 0);
    const avgDailyGain = series.length > 0 ? totalNewFollowers / series.length : 0;

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
        newFollowers: totalNewFollowers,
        avgDailyGain: avgDailyGain,
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
        // "unique" = Meta deduplicated the window; "daily-sum" = that call failed
        // and the figure is the inflated per-day sum.
        reachBasis: uniqueReach != null ? "unique" : "daily-sum",
        rangeDays: differenceInDays(parseISO(to), parseISO(from)) + 1,
        mediaCount: basic.media_count,
        following: basic.follows_count,
      },
    });
  } catch (err) {
    const safe = safeError(err, "Failed to load insights");
    return NextResponse.json({ ...safe, fallback: mockInsights(accountId, from, to) }, { status: 500 });
  }
}
