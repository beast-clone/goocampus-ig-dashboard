import { NextResponse } from "next/server";
import { format, parseISO, subDays } from "date-fns";
import { getAdAccount, fetchAdsTotals, fetchAdsDaily, fetchCampaigns, fetchDaySummary, fetchActiveAdsForDay, fetchCampaignSpendForDay } from "@/lib/meta-ads";
import { cached } from "@/lib/api-cache";
import { safeError } from "@/lib/errors";

const DAY_MS = 24 * 60 * 60_000; // Ads refreshed once/day

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || format(subDays(new Date(), 29), "yyyy-MM-dd");
  const to = url.searchParams.get("to") || format(new Date(), "yyyy-MM-dd");

  const acct = await getAdAccount();
  if (!acct) {
    return NextResponse.json({ error: "META_AD_ACCOUNT_ID or META_LONG_LIVED_USER_TOKEN not set" }, { status: 400 });
  }

  try {
    // Cache the whole payload once/day — this route fans out to 6 Meta Ads calls.
    const payload = await cached(`ads:${acct.id}:${from}:${to}`, DAY_MS, async () => {
      // Yesterday = most recent complete day (matches Meta's "daily summary" notification)
      const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
      const [totals, daily, campaigns, daySummary, activeAds, yesterdayByCampaign] = await Promise.all([
        fetchAdsTotals(acct, from, to),
        fetchAdsDaily(acct, from, to),
        fetchCampaigns(acct, from, to),
        fetchDaySummary(acct, yesterday),
        fetchActiveAdsForDay(acct, yesterday),
        fetchCampaignSpendForDay(acct, yesterday),
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
      };
    });

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load ads data"), { status: 500 });
  }
}
