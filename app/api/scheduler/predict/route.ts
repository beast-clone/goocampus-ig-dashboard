import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { predictForCaption } from "@/lib/scheduler-helpers";
import { safeError } from "@/lib/errors";

// Cache per (page, caption-hashtag-signature) for 30 min
type CacheEntry = { fetchedAt: number; payload: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

function captionKey(caption: string): string {
  // Cache key = sorted hashtag set + sorted topic-keyword set (so different captions
  // with the same topic signals share cache, but truly different captions don't collide).
  const tags = (caption.match(/#([\p{L}\p{N}_]+)/gu) || []).map((t) => t.toLowerCase()).sort();
  const STOP = new Set(["the","a","an","is","are","was","were","of","in","on","at","to","for","with","by","from","this","that","these","those","your","my","our","you","we","me","us","it","its","has","have","had","will","would","should","could","can","do","does","did","but","and","or","if","so","as","like","than","then","what","when","where","who","why","how","all","any","some","every","no","not","none","only","just","very","more","less","most","least","here","there","now","today","tomorrow","yesterday"]);
  const kws = ((caption.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) || [])
    .filter((t) => !STOP.has(t) && !/^\d+$/.test(t))
    .sort()
    .slice(0, 30));  // cap to keep key bounded
  return `t:${tags.join(",") || "_"}|k:${kws.join(",") || "_"}`;
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  let body: { publishToPage?: string; caption?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const page = body.publishToPage;
  const caption = body.caption || "";
  if (!page) return NextResponse.json({ error: "publishToPage required" }, { status: 400 });
  if (caption.length > 5000) return NextResponse.json({ error: "Caption too long" }, { status: 400 });

  const cacheKey = `predict:${page}:${captionKey(caption)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return NextResponse.json({ ...cached.payload as object, cached: true });
  }

  try {
    const prediction = await predictForCaption(page, caption);
    const payload = { prediction };
    cache.set(cacheKey, { fetchedAt: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to predict reach"), { status: 502 });
  }
}
