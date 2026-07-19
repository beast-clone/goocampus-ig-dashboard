import { NextResponse } from "next/server";
import { searchWebMentions } from "@/lib/web-mentions";
import { safeError } from "@/lib/errors";

// GET /api/radar/search?q=<keyword|brand>
// Free keyword/brand intelligence — where a term is mentioned across the web
// (Google News) with a quick positive/negative/neutral read. Same engine backs
// the Brand-mentions lane (just seeded with the brand name).

export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json({ error: "Add a keyword to search (?q=…)" }, { status: 400 });
    if (q.length > 120) return NextResponse.json({ error: "Query too long" }, { status: 400 });

    const result = await searchWebMentions(q);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(safeError(err, "Search failed"), { status: 502 });
  }
}
