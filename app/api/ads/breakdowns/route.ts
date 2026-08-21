import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { format, subDays } from "date-fns";
import { getAdAccount, fetchAdsBreakdown, type AdBreakdownRow } from "@/lib/meta-ads";
import { cached } from "@/lib/api-cache";
import { safeError } from "@/lib/errors";

const DAY_MS = 24 * 60 * 60_000; // Ads breakdowns refreshed once/day

// GET /api/ads/breakdowns?from=&to=
// Meta ad performance split by platform, placement, age, gender, and region.
// Each breakdown is fetched independently and fails soft (→ []) so one bad
// dimension never breaks the whole response.

export async function GET(req: Request) {
  const __denied = await requireSection("ads");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || format(subDays(new Date(), 29), "yyyy-MM-dd");
  const to = url.searchParams.get("to") || format(new Date(), "yyyy-MM-dd");

  const acct = await getAdAccount();
  if (!acct) return NextResponse.json({ error: "Ad account not configured" }, { status: 400 });

  const safe = (p: Promise<AdBreakdownRow[]>) => p.catch(() => [] as AdBreakdownRow[]);

  try {
    // Cache once/day — this fans out to 5 Meta Ads breakdown calls.
    const payload = await cached(`adsbd:${acct.id}:${from}:${to}`, DAY_MS, async () => {
      const [platform, placement, age, gender, region] = await Promise.all([
        safe(fetchAdsBreakdown(acct, from, to, "publisher_platform", ["publisher_platform"])),
        safe(fetchAdsBreakdown(acct, from, to, "publisher_platform,platform_position", ["platform_position"])),
        safe(fetchAdsBreakdown(acct, from, to, "age", ["age"])),
        safe(fetchAdsBreakdown(acct, from, to, "gender", ["gender"])),
        safe(fetchAdsBreakdown(acct, from, to, "region", ["region"])),
      ]);
      return { platform, placement, age, gender, region: region.slice(0, 10) };
    });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load ad breakdowns"), { status: 500 });
  }
}
