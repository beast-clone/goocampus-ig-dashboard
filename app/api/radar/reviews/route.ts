import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getReviews } from "@/lib/google-reviews";

// GET /api/radar/reviews[?force=1]
//   Our Google Maps listing and what people have written on it.
//
// Served through the shared cache in lib/google-reviews, so a page load does not cost a
// Serper credit — only the hourly expiry does, or an explicit force.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 26;

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const res = await getReviews(force);
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load Google reviews"), { status: 502 });
  }
}
