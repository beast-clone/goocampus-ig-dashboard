// In-memory fixed-window rate limiter. Good enough for a single-instance Next.js dev/staging
// dashboard. On Netlify/Vercel (serverless, multi-instance) you'd swap this for Upstash Redis,
// but the limiter still raises the bar significantly against a brute-force script.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Periodically prune to prevent unbounded growth (max 10k keys kept).
function prune() {
  if (buckets.size < 10_000) return;
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k);
  }
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec?: number; remaining: number } {
  prune();
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || cur.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }
  if (cur.count >= max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)), remaining: 0 };
  }
  cur.count += 1;
  return { allowed: true, remaining: max - cur.count };
}

// Best-effort client-IP extraction (works with Netlify, Vercel, most proxies)
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") || headers.get("cf-connecting-ip") || "unknown";
}
