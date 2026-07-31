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
