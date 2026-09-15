import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { format, parseISO, subDays } from "date-fns";
import { getAdAccount, fetchAdsTotals, fetchAdsDaily, fetchCampaigns, fetchDaySummary, fetchActiveAdsForDay, fetchCampaignSpendForDay, fetchLiveAds } from "@/lib/meta-ads";
import { cachedShared } from "@/lib/api-cache";
import { safeError } from "@/lib/errors";

// Meta is nowhere near a rate limit at this cadence — one refresh is ~6 Graph
// calls, so 2-hourly is ~72 calls/day against limits in the thousands. The long
// ranges are the expensive ones (a year of daily insights), and nobody needs
// last February re-fetched every two hours, so those refresh more slowly.
const TWO_HOURS = 2 * 60 * 60_000;
const TWELVE_HOURS = 12 * 60 * 60_000;
const ttlFor = (from: string, to: string) => {
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1;
  return days > 120 ? TWELVE_HOURS : TWO_HOURS;
};

export async function GET(req: Request) {
  const __denied = await requireSection("ads");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || format(subDays(new Date(), 29), "yyyy-MM-dd");
  const to = url.searchParams.get("to") || format(new Date(), "yyyy-MM-dd");

  const acct = await getAdAccount();
  if (!acct) {
    return NextResponse.json({ error: "META_AD_ACCOUNT_ID or META_LONG_LIVED_USER_TOKEN not set" }, { status: 400 });
  }

  try {
    // Shared cache, so the TTL is a real promise rather than a per-instance
    // accident. `?force=1` is what the Refresh button calls.
    const force = url.searchParams.get("force") === "1";
    const { data: payload, fetchedAt, fromCache } = await cachedShared(`ads:${acct.id}:${from}:${to}`, ttlFor(from, to), async () => {
      // Yesterday = most recent complete day (matches Meta's "daily summary" notification)
      const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
      const [totals, daily, campaigns, daySummary, activeAds, yesterdayByCampaign, liveAds] = await Promise.all([
        fetchAdsTotals(acct, from, to),
        fetchAdsDaily(acct, from, to),
        fetchCampaigns(acct, from, to),
        fetchDaySummary(acct, yesterday),
        fetchActiveAdsForDay(acct, yesterday),
        fetchCampaignSpendForDay(acct, yesterday),
        // What is switched on right now, independent of the selected range.
        fetchLiveAds(acct, from, to),
      ]);

      const series = daily.map((d) => ({
        date: format(parseISO(d.date), "MMM d"),
        spend: d.spend,
        impressions: d.impressions,
        reach: d.reach,
        clicks: d.clicks,
        cpm: d.cpm,
        ctr: d.ctr,
        leads: d.leads,
      }));

      return {
        live: true,
        account: { id: acct.id, name: acct.name },
        totals,
        series,
        campaigns,
        daySummary,
        activeAds,
        yesterdayByCampaign,
        liveAds,
      };
    }, { force });

    // fetchedAt is what the tab shows as "Updated HH:MM" — without it nobody can
    // tell whether they are looking at live numbers or something hours old.
    return NextResponse.json({ ...payload, fetchedAt, fromCache });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load ads data"), { status: 500 });
  }
}
