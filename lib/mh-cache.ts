// Shared in-memory cache for the Marketing Hub read endpoint.
//
// Lives in its own module (not in the route.ts) for two reasons:
//   1. A Next.js App Router `route.ts` may only export route handlers
//      (GET/POST/…) — exporting a helper from it is a type error.
//   2. The mh_posts write routes (update / create / takeover) need to bust
//      this cache so an edit reflects immediately instead of snapping back
//      until the 12h TTL expires.
export type MhCacheEntry<T = unknown> = { at: number; payload: T };

const CACHE = new Map<string, MhCacheEntry>();

export function mhCacheGet<T = unknown>(key: string): MhCacheEntry<T> | undefined {
  return CACHE.get(key) as MhCacheEntry<T> | undefined;
}

export function mhCacheSet<T = unknown>(key: string, entry: MhCacheEntry<T>): void {
  CACHE.set(key, entry as MhCacheEntry);
}

// Clear every cached range so the next read re-queries Supabase.
export function bustMarketingHubCache(): void {
  CACHE.clear();
}
