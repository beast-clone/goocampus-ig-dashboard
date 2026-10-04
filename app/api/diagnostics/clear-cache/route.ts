import { NextResponse } from "next/server";
import { clearCache } from "@/lib/api-cache";
import { requireSection } from "@/lib/api-guard";

// Guarded on the "system" section: lib/permissions.ts marks it adminOnly, and
// what this returns or does is platform posture, not day-to-day work.
// POST /api/diagnostics/clear-cache  { prefix? }
// Drops in-memory API cache entries (all, or by key prefix) so the next fetch is
// fresh. The "clear cache & refetch" repair action.
export async function POST(req: Request) {
  const __denied = await requireSection("system");
  if (__denied) return __denied;
  const b = (await req.json().catch(() => ({}))) as { prefix?: string };
  const cleared = clearCache(typeof b.prefix === "string" && b.prefix ? b.prefix : undefined);
  return NextResponse.json({ ok: true, cleared });
}
