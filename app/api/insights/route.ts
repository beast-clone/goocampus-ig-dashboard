import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { format, parseISO, eachDayOfInterval, differenceInDays, subDays } from "date-fns";
import { getAccount, fetchBasic, fetchAccountInsights, fetchAccountReachUnique, fetchAccountEngagement, fetchRecentMedia, type IGMedia } from "@/lib/instagram";
import { mockInsights } from "@/lib/mock";
import { safeError } from "@/lib/errors";

// Period-over-period change, or null when either side is missing or the
// baseline is zero (which would divide by zero / read as an infinite jump).
function pctChange(cur?: number, prev?: number): number | null {
  if (typeof cur !== "number" || typeof prev !== "number" || prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

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
    // Equal-length window immediately before this one, so engagement and
    // profile views get a real period-over-period delta instead of a guess.
    const spanDays = differenceInDays(parseISO(to), parseISO(from)) + 1;
    const prevTo = format(subDays(parseISO(from), 1), "yyyy-MM-dd");
    const prevFrom = format(subDays(parseISO(prevTo), spanDays - 1), "yyyy-MM-dd");

    const [basic, insights, uniqueReach, engagement, prevEngagement, media] = await Promise.all([
      fetchBasic(account),
      fetchAccountInsights(account, from, to),
      fetchAccountReachUnique(account, from, to),
      fetchAccountEngagement(account, from, to),
      fetchAccountEngagement(account, prevFrom, prevTo),
      fetchRecentMedia(account, 1),
    ]);

    const reachMetric = insights.find((m) => m.name === "reach");
    const followerMetric = insights.find((m) => m.name === "follower_count");

    // Day keys must be LOCAL calendar dates, matching `from`/`to` and the
    // "MMM d" label below. `d.toISOString()` looked equivalent but is not: east
    // of UTC it converts local midnight back into the previous day, so in IST
    // every lookup missed by one. The first point then found nothing and drew a
    // phantom 0, and the last real day was dropped off the end entirely.
    //
    // Matching on the calendar date is right: asking Meta for a window covering
    // only 31 Aug returns end_time 2026-08-31, and only 2 Aug returns
    // 2026-08-02 — end_time's date IS the day the value belongs to.
    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    // Build per-day delta first
    const deltaByDay = new Map<string, number>();
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const delta = followerMetric?.values.find((v) => v.end_time.slice(0, 10) === key)?.value ?? 0;
      deltaByDay.set(key, delta);
    }
    // Reconstruct historical totals by working backward from today's count.
    // total[i] = current_total - sum(deltas from day i+1 to last)
    const totalsByDay = new Map<string, number>();
    let cumulativeAfter = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const key = format(days[i], "yyyy-MM-dd");
      totalsByDay.set(key, basic.followers_count - cumulativeAfter);
      cumulativeAfter += deltaByDay.get(key) ?? 0;
    }

    const daily = days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return {
        date: format(d, "MMM d"),
        reach: reachMetric?.values.find((v) => v.end_time.slice(0, 10) === key)?.value ?? 0,
        followers: totalsByDay.get(key) ?? basic.followers_count,
        newFollowers: deltaByDay.get(key) ?? 0,
      };
    });

    // Headline reach = unique accounts over the window, deduplicated by Meta.
    // Summing the daily series would count a repeat viewer once per day they
    // saw us. Keep the daily sum only as a fallback if that call failed.
    const dailyReachSum = daily.reduce((s, x) => s + x.reach, 0);
    const totalReach = uniqueReach ?? dailyReachSum;

    // Engagement and profile views are now MEASURED, not guessed from reach.
    // Fall back to the old 6%/35% estimate only if Meta's call failed.
    const measured = engagement != null;
    const totalEngagement = engagement?.interactions ?? Math.round(totalReach * 0.06);
    const totalProfileVisits = engagement?.profileViews ?? Math.round(totalEngagement * 0.35);

    // Meta gives one window total for these — total_interactions and
    // profile_views both reject metric_type=time_series — so there is no real
    // daily engagement to chart. Spread the real total across the days in
    // proportion to that day's reach: the total is then correct and the shape
    // is honest about being reach-driven. The UI labels the line estimated.
    const series = daily.map((x) => ({
      ...x,
      engagement: measured
        ? (dailyReachSum > 0 ? Math.round(totalEngagement * (x.reach / dailyReachSum)) : 0)
        : Math.round(x.reach * 0.06),
    }));

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
        profileVisits: totalProfileVisits,
        newFollowers: totalNewFollowers,
        avgDailyGain: avgDailyGain,
      },
      deltas: {
        followers: totalNewFollowers === 0 ? 0 : (totalNewFollowers / Math.max(1, basic.followers_count - totalNewFollowers)) * 100,
        // NOTE: reach's delta is the trend WITHIN the window (first half vs
        // second), unchanged. Engagement and profile views have no daily series
        // to split, so theirs compare against the previous window of equal
        // length — a real period-over-period change, but a different question
        // from reach's. Only if that comparison is unavailable do they fall
        // back to the old made-up multiples of the reach trend.
        reach: reachDelta,
        engagement: pctChange(engagement?.interactions, prevEngagement?.interactions) ?? reachDelta * 0.9,
        profileVisits: pctChange(engagement?.profileViews, prevEngagement?.profileViews) ?? reachDelta * 0.7,
      },
      series,
      latestPost,
      meta: {
        // "unique" = Meta deduplicated the window; "daily-sum" = that call failed
        // and the figure is the inflated per-day sum.
        reachBasis: uniqueReach != null ? "unique" : "daily-sum",
        // "measured" = real total_interactions / profile_views from Meta;
        // "estimated" = that call failed and we're back on the 6%/35% guess.
        engagementBasis: measured ? "measured" : "estimated",
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
