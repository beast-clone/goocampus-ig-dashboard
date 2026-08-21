import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getTopPerformers } from "@/lib/scheduler-helpers";
import { safeError } from "@/lib/errors";

type CacheEntry = { fetchedAt: number; payload: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour — top posts don't change minute to minute

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const page = url.searchParams.get("publishToPage") || "";
  if (!page) return NextResponse.json({ error: "publishToPage required" }, { status: 400 });

  const cacheKey = `top:${page}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return NextResponse.json({ ...cached.payload as object, cached: true });
  }

  try {
    const top = await getTopPerformers(page, 5, 90);
    const payload = { top };
    cache.set(cacheKey, { fetchedAt: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load top performers"), { status: 502 });
  }
}
