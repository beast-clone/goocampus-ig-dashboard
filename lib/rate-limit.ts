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
// How many proxies in front of this app append to X-Forwarded-For. On Netlify
// that is their edge, so 1. Override only if another proxy is added in front.
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);

/**
 * The caller's IP, as far as it can be trusted — this is what the login limiter
 * counts against, so getting it wrong is the difference between 5 guesses per
 * quarter hour and unlimited ones.
 *
 * X-Forwarded-For is built left-to-right: each proxy APPENDS the address it saw.
 * Whatever the client sent arrives first, so the leftmost entry is attacker
 * controlled — send "X-Forwarded-For: 1.2.3.4" and Netlify appends your real
 * address after it. Reading [0], as this did, meant an attacker could pick a
 * fresh identity per request and never hit a limit.
 *
 * Counting in from the RIGHT instead lands on what our nearest trusted proxy
 * actually observed, which no client can write.
 */
export function getClientIp(headers: Headers): string {
  // Netlify sets this from the TCP connection and strips any client-supplied
  // copy, so it is the authoritative answer wherever it exists.
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf?.trim()) return nf.trim();

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((v) => v.trim()).filter(Boolean);
    if (parts.length) {
      const idx = Math.max(0, parts.length - TRUSTED_PROXY_HOPS);
      return parts[idx] || parts[parts.length - 1];
    }
  }
  return headers.get("x-real-ip") || headers.get("cf-connecting-ip") || "unknown";
}
