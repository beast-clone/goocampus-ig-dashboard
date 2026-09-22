import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSocialKeywords } from "@/lib/social-keywords";

// GET /api/seo/social[?fresh=1] → keywords & hashtags for Instagram + YouTube, scored
// from our posts and the doctor-education competitors' (lib/social-keywords.ts).
// Cached 24h; ?fresh=1 re-reads everything.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  try {
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    return NextResponse.json(await getSocialKeywords(fresh));
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load keyword data"), { status: 502 });
  }
}
