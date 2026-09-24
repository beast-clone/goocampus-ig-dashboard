import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { facebookBaseline } from "@/lib/scheduler-helpers";
import { safeError } from "@/lib/errors";

// What the last Facebook posts on a page actually got.
//
//   POST /api/scheduler/fb-baseline { publishToPage }
//     -> { baseline: { posts, likes, comments, shares, avgEngagement, best } }
//
// The Instagram side of the composer predicts reach from past posts. Facebook can't:
// Meta serves no reach or impressions for Page posts on any current API version. So
// this returns the measured engagement instead, and the composer states it as a fact
// about past posts rather than dressing it up as a forecast.
export const dynamic = "force-dynamic";

// Same 30-minute cache as the reach predictor — this is a per-page fact, and the
// composer asks for it on every page change.
type Entry = { at: number; payload: unknown };
const cache = new Map<string, Entry>();
const TTL_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;

  let body: { publishToPage?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const page = body.publishToPage;
  if (!page) return NextResponse.json({ error: "publishToPage required" }, { status: 400 });

  const hit = cache.get(page);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ ...(hit.payload as object), cached: true });

  try {
    const baseline = await facebookBaseline(page);
    const payload = { baseline };
    cache.set(page, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't read the Facebook page"), { status: 502 });
  }
}
