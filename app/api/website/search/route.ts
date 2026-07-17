import { NextResponse } from "next/server";
import { buildBing, hasBingAuth } from "@/lib/bing";
import { cached } from "@/lib/api-cache";

// GET /api/website/search
//
// Bing Webmaster search performance for goocampusevents.com. Bing data updates
// ~daily, so cache 6h.
export async function GET() {
  if (!hasBingAuth()) {
    return NextResponse.json({ error: "Bing not configured — set BING_WEBMASTER_API_KEY / BING_SITE_URL." }, { status: 503 });
  }
  const t0 = Date.now();
  try {
    const data = await cached("bing:search", 6 * 60 * 60_000, () => buildBing());
    return NextResponse.json({ ...data, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bing search failed" }, { status: 502 });
  }
}
