import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { readSnapshots } from "@/lib/snapshot";

// Reconstruct a period's account KPIs from the daily snapshots we stored in
// Supabase (lib/snapshot.ts) — used for historical months where Meta has already
// dropped the daily data. Returns the same shape the live /api/insights uses for
// totals/series, so the dashboard can consume it interchangeably.
//   GET /api/insights-stored?accountId=goocampus&from=2026-06-01&to=2026-06-30
export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const snaps = await readSnapshots(accountId, from, to);
  const reach = snaps.reduce((s, x) => s + (x.reach || 0), 0);
  const newFollowers = snaps.reduce((s, x) => s + (x.newFollowers || 0), 0);
  const profileVisits = snaps.reduce((s, x) => s + (x.profileVisits || 0), 0);
  const totalInteractions = snaps.reduce((s, x) => s + (x.totalInteractions || 0), 0);
  const followers = snaps.length ? snaps[snaps.length - 1].followers : 0;

  const series = snaps.map((x) => {
    const d = new Date(x.date + "T00:00:00Z");
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      reach: x.reach || 0,
      engagement: x.totalInteractions || 0,
      followers: x.followers || 0,
      newFollowers: x.newFollowers || 0,
    };
  });

  return NextResponse.json({
    stored: true,
    daysStored: snaps.length,
    coverageFrom: snaps.length ? snaps[0].date : null,
    coverageTo: snaps.length ? snaps[snaps.length - 1].date : null,
    totals: { followers, reach, engagement: totalInteractions, profileVisits, newFollowers, avgDailyGain: 0 },
    deltas: { followers: 0, reach: 0, engagement: 0, profileVisits: 0 },
    series,
    latestPost: null,
  });
}
