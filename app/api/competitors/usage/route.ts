import { NextResponse } from "next/server";
import { getApifyToken } from "@/lib/apify";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// Apify monthly compute usage for the Competitor Ads tab, so the demo can show
// how much of the $5 free-tier budget the scraper has burned this cycle.
// Cached 5 min — the number barely moves and every page mount would otherwise
// hit Apify.
let cache: { at: number; body: unknown } | null = null;
const TTL = 5 * 60 * 1000;

export async function GET() {
  const token = getApifyToken();
  if (!token) return NextResponse.json({ error: "APIFY_API_TOKEN not set" }, { status: 400 });

  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body);

  try {
    const r = await fetchWithTimeout(`https://api.apify.com/v2/users/me/limits?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`Apify ${r.status}`);
    const j = (await r.json()) as { data?: { limits?: { maxMonthlyUsageUsd?: number }; current?: { monthlyUsageUsd?: number }; monthlyUsageCycle?: { endAt?: string } } };
    const usedUsd = j.data?.current?.monthlyUsageUsd ?? 0;
    const limitUsd = j.data?.limits?.maxMonthlyUsageUsd ?? 0;
    const resetAt = j.data?.monthlyUsageCycle?.endAt ?? null;
    const body = { usedUsd, limitUsd, resetAt };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
