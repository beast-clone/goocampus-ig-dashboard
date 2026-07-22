import { getSupabase } from "@/lib/supabase";
import type { CompetitorAd } from "@/lib/apify";

const CACHE_TABLE = "competitor_ads_cache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type CachedScrape = {
  ads: CompetitorAd[];
  lastScraped: string;
  ageMs: number;
  source: "cache" | "live";
};

export function cacheKey(query: string, country: string, activeOnly: boolean, fullCreative: boolean): string {
  return `${query.trim().toLowerCase()}|${country.toLowerCase()}|${activeOnly ? 1 : 0}|${fullCreative ? 1 : 0}`;
}

export async function readCache(key: string): Promise<CachedScrape | null> {
  const db = getSupabase();
  if (!db) return null;
  try {
    // .limit(1)+[0], not .maybeSingle() — maybeSingle() returns null for a single
    // row with a large jsonb payload, which here would silently re-scrape Apify
    // (a paid call) on every search instead of serving the cache.
    const { data, error } = await db
      .from(CACHE_TABLE)
      .select("last_scraped, payload")
      .eq("cache_key", key)
      .limit(1);
    const row = data?.[0];
    if (error || !row) return null;
    const ads = (row.payload as CompetitorAd[]) ?? [];
    const ageMs = Date.now() - new Date(row.last_scraped as string).getTime();
    return { ads, lastScraped: row.last_scraped as string, ageMs, source: "cache" };
  } catch (err) {
    console.error("[competitor-cache] read failed:", (err as Error).message);
    return null;
  }
}

export function isStale(entry: CachedScrape): boolean {
  return entry.ageMs > CACHE_TTL_MS;
}

export async function writeCache(opts: {
  key: string;
  query: string;
  country: string;
  activeOnly: boolean;
  fullCreative: boolean;
  ads: CompetitorAd[];
}): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { key, query, country, activeOnly, fullCreative, ads } = opts;
  try {
    const { error } = await db.from(CACHE_TABLE).upsert(
      {
        cache_key: key,
        query,
        country,
        active_only: activeOnly,
        full_creative: fullCreative,
        last_scraped: new Date().toISOString(),
        ad_count: ads.length,
        payload: ads,
      },
      { onConflict: "cache_key" }
    );
    if (error) console.error("[competitor-cache] write failed:", error.message);
  } catch (err) {
    console.error("[competitor-cache] write failed:", (err as Error).message);
  }
}

export function formatAge(ageMs: number): string {
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
