import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { buildSearchConsole, buildSearchConsoleFull, hasGSCAuth, GscNoAccessError, GscApiDisabledError, gscSiteUrl, gscServiceAccount, listGscSites } from "@/lib/search-console";
import { cached } from "@/lib/api-cache";

// GET /api/website/gsc?from=YYYY-MM-DD&to=YYYY-MM-DD
// Google Search Console for goocampusevents.com → winning keywords + striking-
// distance gaps. GSC data lags ~2 days, so default to a 28-day window ending 2
// days ago. Cached 6h (matches the other website-analytics lanes).
const daysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  if (!hasGSCAuth()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  // Setup helper: ?sites=1 lists every property the service account can read, so
  // we can confirm the exact property string (domain vs URL-prefix).
  if (url.searchParams.get("sites") === "1") {
    try { return NextResponse.json({ sites: await listGscSites() }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "sites failed" }, { status: 502 }); }
  }
  const to = url.searchParams.get("to") || daysAgo(2);
  const from = url.searchParams.get("from") || daysAgo(30);
  // view=full → the Website · Google Search sub-tab payload (summary + over-time
  // + top queries + top pages). Default → the Radar winning/striking lanes.
  const full = url.searchParams.get("view") === "full";
  try {
    const data = full
      ? await cached(`gsc:full:${from}:${to}`, 6 * 60 * 60_000, () => buildSearchConsoleFull(from, to))
      : await cached(`gsc:${from}:${to}`, 6 * 60 * 60_000, () => buildSearchConsole(from, to));
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof GscApiDisabledError) {
      // Cloud project just needs the Search Console API switched on (one click).
      return NextResponse.json({ error: "api_disabled", enableUrl: err.enableUrl }, { status: 403 });
    }
    if (err instanceof GscNoAccessError) {
      // Everything is wired — the property owner just needs to grant the service
      // account read access. Surface exactly what to add and where.
      return NextResponse.json({ error: "no_access", account: gscServiceAccount(), siteUrl: gscSiteUrl() }, { status: 403 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "GSC failed" }, { status: 502 });
  }
}
