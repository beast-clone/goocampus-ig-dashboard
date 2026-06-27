// Multi-provider Instagram hashtag scrape router.
// Tries primary (Apify apidojo) → on failure falls back to HikerAPI.
// Persists provider health + cumulative monthly cost in Supabase `scraper_health` table.

import { getSupabase } from "@/lib/supabase";
import { scrapeHashtagViaApify } from "./instagram-apify";
import { scrapeHashtagViaHikerAPI } from "./instagram-hikerapi";
import { ScraperError, type ScrapeResult, type ScraperProvider } from "./types";

const RECOVER_PROBE_MS = 6 * 60 * 60 * 1000; // 6h between recovery probes

type HealthRow = {
  provider: ScraperProvider;
  status: "healthy" | "degraded" | "failed" | "recovering";
  last_success: string | null;
  last_failure: string | null;
  failure_reason: string | null;
  monthly_cost_estimate: number;
};

async function readHealth(provider: ScraperProvider): Promise<HealthRow | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("scraper_health").select("*").eq("provider", provider).maybeSingle();
  return (data as HealthRow) ?? null;
}

async function recordSuccess(provider: ScraperProvider, costUsd: number) {
  const db = getSupabase();
  if (!db) return;
  const prev = await readHealth(provider);
  const monthly = (prev?.monthly_cost_estimate ?? 0) + costUsd;
  await db.from("scraper_health").upsert({
    provider,
    status: "healthy",
    last_success: new Date().toISOString(),
    failure_reason: null,
    monthly_cost_estimate: monthly,
  }, { onConflict: "provider" });
}

async function recordFailure(provider: ScraperProvider, reason: string, status: HealthRow["status"]) {
  const db = getSupabase();
  if (!db) return;
  await db.from("scraper_health").upsert({
    provider,
    status,
    last_failure: new Date().toISOString(),
    failure_reason: reason,
  }, { onConflict: "provider" });
}

function shouldSkipProvider(h: HealthRow | null): boolean {
  if (!h) return false;
  if (h.status === "healthy" || h.status === "degraded") return false;
  if (h.status === "recovering") return false;
  // status === "failed" — skip unless we haven't probed in RECOVER_PROBE_MS
  if (!h.last_failure) return false;
  const sinceFailMs = Date.now() - new Date(h.last_failure).getTime();
  return sinceFailMs < RECOVER_PROBE_MS;
}

async function tryProvider(provider: ScraperProvider, hashtag: string, limit: number): Promise<ScrapeResult> {
  if (provider === "apify") {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new ScraperError("apify", "auth", "APIFY_API_TOKEN not set");
    return await scrapeHashtagViaApify({ token, hashtag, resultsLimit: limit });
  }
  const key = process.env.HIKERAPI_KEY;
  if (!key) throw new ScraperError("hikerapi", "auth", "HIKERAPI_KEY not set");
  return await scrapeHashtagViaHikerAPI({ key, hashtag, resultsLimit: limit });
}

export async function scrapeHashtagWithFallback(opts: {
  hashtag: string;
  resultsLimit?: number;
}): Promise<ScrapeResult> {
  const { hashtag, resultsLimit = 9 } = opts;
  const order: ScraperProvider[] = ["apify", "hikerapi"];

  const errors: Record<string, string> = {};
  for (const p of order) {
    const health = await readHealth(p);
    if (shouldSkipProvider(health)) {
      errors[p] = `skipped (status=${health?.status}, last_failure=${health?.last_failure})`;
      continue;
    }
    try {
      const result = await tryProvider(p, hashtag, resultsLimit);
      await recordSuccess(p, result.costEstimateUsd);
      return result;
    } catch (err) {
      const e = err as ScraperError;
      const reason = `${e.code}: ${e.message}`;
      errors[p] = reason;
      // Hard failures → mark failed (gets probed again after RECOVER_PROBE_MS).
      // Empty / rate_limit → degraded (still tries next time).
      const status: HealthRow["status"] = (e.code === "credit_exhausted" || e.code === "auth")
        ? "failed"
        : "degraded";
      await recordFailure(p, reason, status);
    }
  }
  throw new Error(`All providers failed: ${JSON.stringify(errors)}`);
}

export async function getProviderHealth(): Promise<Record<ScraperProvider, HealthRow | null>> {
  const [a, h] = await Promise.all([readHealth("apify"), readHealth("hikerapi")]);
  return { apify: a, hikerapi: h };
}
