import { NextResponse } from "next/server";
import { buildGA4Traffic, buildGA4Realtime, hasGA4Auth } from "@/lib/ga4";
import { cached } from "@/lib/api-cache";

// GET /api/website/traffic?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Google Analytics 4 for goocampusevents.com (GooCampus Events property).
// Heavy report set is cached 10 min; realtime ("active now") is kept fresh (30s).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  if (!hasGA4Auth()) {
    return NextResponse.json({ error: "GA4 not configured — set GA4_PROPERTY_ID / GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY." }, { status: 503 });
  }

  const t0 = Date.now();
  try {
    const [data, realtime] = await Promise.all([
      cached(`ga4:traffic:${from}:${to}`, 10 * 60_000, () => buildGA4Traffic(from, to)),
      cached(`ga4:realtime`, 30_000, () => buildGA4Realtime()).catch(() => null), // realtime is best-effort
    ]);
    return NextResponse.json({ ...data, realtime, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "GA4 traffic failed" }, { status: 502 });
  }
}
