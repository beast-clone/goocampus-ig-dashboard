import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getApifyToken, parsePastRuns, fetchRunAds } from "@/lib/apify";
import { cacheKey, readCache, writeCache } from "@/lib/competitor-cache";

export async function POST() {
  const __denied = await requireSection("ads");
  if (__denied) return __denied;

  const token = getApifyToken();
  if (!token) return NextResponse.json({ error: "APIFY_API_TOKEN not set" }, { status: 400 });

  try {
    const runs = await parsePastRuns(token);

    // Group runs by cache key — keep newest only (Apify returns desc order already)
    const byKey = new Map<string, typeof runs[number]>();
    for (const r of runs) {
      const k = cacheKey(r.query, r.country, r.activeOnly, r.fullCreative);
      if (!byKey.has(k)) byKey.set(k, r);
    }

    const results = [];
    for (const [key, run] of byKey) {
      // Skip if Airtable already has a newer entry for this key
      const existing = await readCache(key);
      if (existing && new Date(existing.lastScraped) > new Date(run.startedAt)) {
        results.push({ query: run.query, country: run.country, status: "skipped_newer_cache", adCount: existing.ads.length });
        continue;
      }
      const ads = await fetchRunAds(token, run.datasetId);
      if (ads.length === 0) {
        results.push({ query: run.query, country: run.country, status: "empty_dataset", adCount: 0 });
        continue;
      }
      await writeCache({
        key,
        query: run.query,
        country: run.country,
        activeOnly: run.activeOnly,
        fullCreative: run.fullCreative,
        ads,
      });
      results.push({
        query: run.query, country: run.country,
        runStartedAt: run.startedAt, status: "synced", adCount: ads.length,
      });
    }

    return NextResponse.json({
      totalRunsFound: runs.length,
      uniqueQueriesSynced: results.filter((r) => r.status === "synced").length,
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
