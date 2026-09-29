import { NextResponse } from "next/server";
import { getAccount, fetchCompetitor, type CompetitorSnapshot } from "@/lib/instagram";
import { guardRate, requireSection } from "@/lib/api-guard";

// Competitors come only from the caller (the tracked list in mh_competitors). This used
// to fall back to a hard-coded pair in competitors.json whenever no handles were given,
// which is why removed competitors kept coming back (Praveen, 29 Sep). No list, no rows.
export async function GET(req: Request) {
  const __denied = await requireSection("ads");
  if (__denied) return __denied;

  const limited = guardRate(req, "benchmark", 15, 300_000);
  if (limited) return limited;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const customHandles = (url.searchParams.get("handles") || "").split(",").map((s) => s.trim()).filter(Boolean);

  const account = getAccount(accountId);
  if (!account) return NextResponse.json({ error: `Unknown account: ${accountId}` }, { status: 404 });

  const handles: string[] = customHandles;

  const t0 = Date.now();
  const results = await Promise.allSettled(handles.map((h) => fetchCompetitor(account, h)));
  const competitors: (CompetitorSnapshot | { error: string; username: string })[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { error: (r.reason as Error).message, username: handles[i] };
  });

  return NextResponse.json({
    niche: customHandles.length ? "Custom" : "",
    niches: [] as string[],
    queriedAt: new Date().toISOString(),
    latencyMs: Date.now() - t0,
    sourceAccount: { id: account.id, handle: account.handle },
    competitors,
  });
}
