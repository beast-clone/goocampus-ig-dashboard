// Tiny in-memory TTL cache for slow platform API calls (YouTube analytics can
// take 2–9s; LinkedIn's follower-statistics quota is precious). Keyed per
// channel/page + date range, so switching tabs or reloading within the TTL is
// instant instead of re-hitting Google/LinkedIn.

const store = new Map<string, { at: number; data: unknown }>();

// `shouldCache` (optional): only store the result when it returns true. Lets callers
// avoid caching a degraded/rate-limited payload for the full TTL (so it retries and
// self-heals next request instead of serving bad data for 24h).
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, shouldCache?: (data: T) => boolean): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await fn();
  if (!shouldCache || shouldCache(data)) {
    store.set(key, { at: Date.now(), data });
    // Light housekeeping so the map doesn't grow forever in a long-lived server.
    if (store.size > 200) {
      const cutoff = Date.now() - 60 * 60_000;
      for (const [k, v] of store) if (v.at < cutoff) store.delete(k);
    }
  }
  return data;
}

// Clear cached entries (all, or those whose key starts with `prefix`). Returns
// how many were dropped. Used by the Diagnostics "clear cache & refetch" repair.
export function clearCache(prefix?: string): number {
  if (!prefix) { const n = store.size; store.clear(); return n; }
  let n = 0;
  for (const k of store.keys()) if (k.startsWith(prefix)) { store.delete(k); n++; }
  return n;
}

// ---------------------------------------------------------------------------
// Shared cache (Supabase `discover_cache`)
//
// The Map above is per-process. On Netlify every serverless instance keeps its
// own copy and a cold start throws it away, so a "24 hour" TTL never actually
// meant 24 hours — two visitors on two instances each triggered their own fetch,
// and the true refresh rate was unpredictable and far higher than intended.
// Anything whose TTL is a real promise (rate-limited upstreams, paid APIs) needs
// one copy every instance can see.
//
// Falls back to the in-memory path when Supabase isn't configured, so local dev
// and the tests keep working unchanged.
import { getSupabase } from "@/lib/supabase";

export type Fetched<T> = { data: T; fetchedAt: string; fromCache: boolean };

export async function cachedShared<T>(
  key: string, ttlMs: number, fn: () => Promise<T>, opts?: { force?: boolean },
): Promise<Fetched<T>> {
  const db = getSupabase();
  if (!db) {
    const data = await cached(key, ttlMs, fn);
    return { data, fetchedAt: new Date().toISOString(), fromCache: false };
  }

  if (!opts?.force) {
    const { data: row } = await db
      .from("discover_cache")
      .select("payload, last_fetched")
      .eq("cache_key", key)
      .maybeSingle();
    const at = row?.last_fetched ? new Date(row.last_fetched as string).getTime() : 0;
    if (row?.payload && Number.isFinite(at) && Date.now() - at < ttlMs) {
      return { data: row.payload as T, fetchedAt: new Date(at).toISOString(), fromCache: true };
    }
  }

  const data = await fn();
  const fetchedAt = new Date().toISOString();
  // A write failure must not fail the request — worst case the next caller
  // refetches, which is exactly the old behaviour.
  await db
    .from("discover_cache")
    .upsert({ cache_key: key, source: "api-cache", last_fetched: fetchedAt, payload: data }, { onConflict: "cache_key" })
    .then(undefined, () => undefined);
  return { data, fetchedAt, fromCache: false };
}
