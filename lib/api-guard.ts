import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/auth";

// Per-user (falls back to IP) rate-limit guard for expensive routes — the ones
// that call paid third parties (OpenAI/Perplexity, HikerAPI, Airtable). Returns a
// 429 NextResponse when the caller is over the limit, else null.
//
// NOTE: the underlying limiter is in-memory + per-instance (see lib/rate-limit.ts),
// so on serverless this raises the bar against credit-drain abuse but is not a
// hard global cap. Swap for Upstash Redis if a strict cap is needed.
export function guardRate(req: Request, name: string, max: number, windowMs: number): NextResponse | null {
  const who = getSessionUserId() || getClientIp(req.headers);
  const rl = rateLimit(`${name}:${who}`, max, windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests — please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec || 60) } },
    );
  }
  return null;
}
