import { NextResponse } from "next/server";
import { buildClarity, hasClarityAuth } from "@/lib/clarity";
import { readClarityHistory } from "@/lib/web-history";
import { cached } from "@/lib/api-cache";

// GET /api/website/behavior?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Clarity's export API only exposes the last ~3 days (capped at 10 calls/day),
// so a daily snapshot builds long-term history in Supabase. Once enough days are
// stored (> the live 3-day window), we serve the selected range from history;
// otherwise we fall back to the live 3-day view. `history.days` drives the UI badge.
export async function GET(req: Request) {
  if (!hasClarityAuth()) {
    return NextResponse.json({ error: "Clarity not configured — set CLARITY_API_TOKEN." }, { status: 503 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const t0 = Date.now();
  try {
    // Live 3-day view is always fetched — it carries the dimension breakdowns
    // (devices/browsers/countries/pages) that don't aggregate cleanly per-day.
    const live = await cached("clarity:3", 3 * 60 * 60_000, () => buildClarity(3));
    const hist = from && to ? await readClarityHistory(from, to) : null;
    const totalDays = (await readClarityHistory("2000-01-01", to || "2100-12-31"))?.days ?? 0;

    // Use stored history for the KPIs + trend once we have more than the live window.
    if (hist && hist.days > 3) {
      return NextResponse.json({
        ...live, source: "stored", history: { days: hist.days, storedTotal: totalDays, from, to },
        traffic: hist.traffic, scrollDepth: hist.scrollDepth, engagement: hist.engagement,
        signals: hist.signals, overTime: hist.overTime, latencyMs: Date.now() - t0,
      });
    }
    return NextResponse.json({ ...live, source: "live", history: { days: 3, storedTotal: totalDays, from, to }, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Clarity failed" }, { status: 502 });
  }
}
