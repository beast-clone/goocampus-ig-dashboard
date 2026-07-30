import { NextResponse } from "next/server";
import { serperRank } from "@/lib/seo";
import { safeError } from "@/lib/errors";

// GET /api/seo/rank?q=<keyword>
// Live Google (India) rank check for one keyword via Serper — where our sites rank,
// who's on page 1, People-Also-Ask + related searches. Free (Serper), no DataForSEO.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ error: "keyword (q) is required" }, { status: 400 });
    return NextResponse.json(await serperRank(q));
  } catch (err) {
    return NextResponse.json(safeError(err, "Rank check failed"), { status: 502 });
  }
}
