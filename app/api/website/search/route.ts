import { NextResponse } from "next/server";
import { buildBing, hasBingAuth } from "@/lib/bing";
import { readBingHistory } from "@/lib/web-history";
import { cached } from "@/lib/api-cache";

// GET /api/website/search?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Bing's API returns its own rolling window (no date-range param). A daily
// snapshot stores its per-day rows in Supabase so the 7/30/90-day toggle works
// and history survives Bing trimming its window. Serve the range from history
// when available; else fall back to the live window. `history.days` drives the UI.
export async function GET(req: Request) {
  if (!hasBingAuth()) {
    return NextResponse.json({ error: "Bing not configured — set BING_WEBMASTER_API_KEY / BING_SITE_URL." }, { status: 503 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const t0 = Date.now();
  try {
    const live = await cached("bing:search", 6 * 60 * 60_000, () => buildBing());
    const hist = from && to ? await readBingHistory(from, to) : null;
    const totalDays = (await readBingHistory("2000-01-01", to || "2100-12-31"))?.days ?? 0;

    if (hist && hist.days > 0) {
      return NextResponse.json({
        ...live, source: "stored", history: { days: hist.days, storedTotal: totalDays, from, to },
        summary: hist.summary, overTime: hist.overTime,
        queries: hist.queries.length ? hist.queries : live.queries,
        pages: hist.pages.length ? hist.pages : live.pages,
        latencyMs: Date.now() - t0,
      });
    }
    return NextResponse.json({ ...live, source: "live", history: { days: 0, storedTotal: totalDays, from, to }, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bing search failed" }, { status: 502 });
  }
}
