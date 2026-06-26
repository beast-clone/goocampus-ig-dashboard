import Airtable from "airtable";
import type { CompetitorAd } from "@/lib/apify";

const CACHE_TABLE = process.env.AIRTABLE_TABLE_COMPETITOR_ADS || "IG_Competitor_Ads";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type CachedScrape = {
  ads: CompetitorAd[];
  lastScraped: string;
  ageMs: number;
  source: "cache" | "live";
};

function getBase() {
  const key = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!key || !baseId) return null;
  return new Airtable({ apiKey: key }).base(baseId);
}

export function cacheKey(query: string, country: string, activeOnly: boolean, fullCreative: boolean): string {
  return `${query.trim().toLowerCase()}|${country.toLowerCase()}|${activeOnly ? 1 : 0}|${fullCreative ? 1 : 0}`;
}

export async function readCache(key: string): Promise<CachedScrape | null> {
  const base = getBase();
  if (!base) return null;
  try {
    const records = await base(CACHE_TABLE).select({
      filterByFormula: `{Cache Key} = "${key.replace(/"/g, '\\"')}"`,
      maxRecords: 1,
    }).firstPage();
    if (records.length === 0) return null;
    const r = records[0];
    const lastScrapedStr = r.get("Last Scraped") as string;
    const payload = r.get("Payload JSON") as string;
    if (!lastScrapedStr || !payload) return null;
    const ads = JSON.parse(payload) as CompetitorAd[];
    const ageMs = Date.now() - new Date(lastScrapedStr).getTime();
    return { ads, lastScraped: lastScrapedStr, ageMs, source: "cache" };
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
  const base = getBase();
  if (!base) return;
  const { key, query, country, activeOnly, fullCreative, ads } = opts;
  const now = new Date().toISOString();
  try {
    // Find existing row to upsert
    const existing = await base(CACHE_TABLE).select({
      filterByFormula: `{Cache Key} = "${key.replace(/"/g, '\\"')}"`,
      maxRecords: 1,
    }).firstPage();
    const fields = {
      "Cache Key": key,
      Query: query,
      Country: country,
      "Active Only": activeOnly,
      "Full Creative": fullCreative,
      "Last Scraped": now,
      "Ad Count": ads.length,
      "Payload JSON": JSON.stringify(ads),
    };
    if (existing.length > 0) {
      await base(CACHE_TABLE).update(existing[0].id, fields);
    } else {
      await base(CACHE_TABLE).create(fields);
    }
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
