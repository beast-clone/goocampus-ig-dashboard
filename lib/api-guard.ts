import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { hasCapability, canAccessSection, type Capability, type Section } from "@/lib/permissions";

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

// ---------- Authorization guards ----------
//
// Authentication is enforced in middleware.ts (every /api/* needs a valid signed
// session). AUTHORIZATION was not — capability/section checks lived only in the UI
// (team/page.tsx), so any logged-in user could bypass them by calling the API
// directly. These close that gap, mirroring `requireAdmin` in
// app/api/admin/team/route.ts. Each returns `null` when allowed, or a 403
// NextResponse to return immediately when not:
//
//   const denied = await requireCapability("delete_tasks");
//   if (denied) return denied;
export async function requireCapability(cap: Capability): Promise<NextResponse | null> {
  const me = await rosterById(getSessionUserId());
  if (!hasCapability(me, cap)) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }
  return null;
}

export async function requireSection(sec: Section): Promise<NextResponse | null> {
  const me = await rosterById(getSessionUserId());
  if (!canAccessSection(me, sec)) {
    return NextResponse.json({ error: "You don't have access to this section." }, { status: 403 });
  }
  return null;
}
