import { NextResponse } from "next/server";
import { getApifyToken, searchCompetitorAds } from "@/lib/apify";
import { cacheKey, readCache, writeCache, isStale, formatAge } from "@/lib/competitor-cache";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");
  const country = url.searchParams.get("country") || "IN";
  const activeOnly = url.searchParams.get("active") !== "false";
  const limit = parseInt(url.searchParams.get("limit") || "30", 10);
  const fullCreative = url.searchParams.get("full") === "true";
  const force = url.searchParams.get("force") === "true";

  if (!query) return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });

  const key = cacheKey(query, country, activeOnly, fullCreative);

  // Try cache first (unless force-refresh requested)
  if (!force) {
    const cached = await readCache(key);
    if (cached && !isStale(cached)) {
      return NextResponse.json({
        live: false,
        source: "cache",
        cachedAt: cached.lastScraped,
        cacheAge: formatAge(cached.ageMs),
        query, country,
        count: cached.ads.length,
        ads: cached.ads,
      });
    }
  }

  // Cache miss / stale / forced → hit Apify
  const token = getApifyToken();
  if (!token) {
    return NextResponse.json({
      error: "APIFY_API_TOKEN not set in .env.local. Get it from https://console.apify.com/account/integrations.",
    }, { status: 400 });
  }

  try {
    const ads = await searchCompetitorAds({ token, query, country, activeOnly, limit, fullCreative });
    await writeCache({ key, query, country, activeOnly, fullCreative, ads });
    return NextResponse.json({
      live: true,
      source: "live",
      cachedAt: new Date().toISOString(),
      cacheAge: "just now",
      query, country,
      count: ads.length,
      ads,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
