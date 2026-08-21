import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getTopTimeSuggestions } from "@/lib/scheduler-helpers";
import { safeError } from "@/lib/errors";

// Simple module-cache to avoid hammering Meta on every form interaction
type CacheEntry = { fetchedAt: number; payload: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000; // 30 min

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const page = url.searchParams.get("publishToPage") || "";
  if (!page) return NextResponse.json({ error: "publishToPage required" }, { status: 400 });

  const cacheKey = `suggest:${page}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return NextResponse.json({ ...cached.payload as object, cached: true });
  }

  try {
    const suggestions = await getTopTimeSuggestions(page, 3);
    const payload = { suggestions };
    cache.set(cacheKey, { fetchedAt: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load time suggestions"), { status: 502 });
  }
}
