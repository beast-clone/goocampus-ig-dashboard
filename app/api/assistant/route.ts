import { NextResponse } from "next/server";
import { search } from "@/lib/assistant";
import { safeError } from "@/lib/errors";

// POST /api/assistant { query } → { results: SearchResult[] }
//
// Plain internal search — NO AI, NO external API. Reads only this dashboard's own
// data (mh_posts + saved reports) and returns matches with their own Open / View
// actions. Nothing browses the internet; results are exact, free, and instant.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { query?: string; question?: string };
    const query = (body.query || body.question || "").trim();
    if (!query || query.length > 300) {
      return NextResponse.json({ error: "query required (max 300 chars)" }, { status: 400 });
    }
    const results = await search(query);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(safeError(err, "Search failed"), { status: 502 });
  }
}
