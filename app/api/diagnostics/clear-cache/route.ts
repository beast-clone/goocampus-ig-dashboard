import { NextResponse } from "next/server";
import { clearCache } from "@/lib/api-cache";

// POST /api/diagnostics/clear-cache  { prefix? }
// Drops in-memory API cache entries (all, or by key prefix) so the next fetch is
// fresh. The "clear cache & refetch" repair action.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { prefix?: string };
  const cleared = clearCache(typeof b.prefix === "string" && b.prefix ? b.prefix : undefined);
  return NextResponse.json({ ok: true, cleared });
}
