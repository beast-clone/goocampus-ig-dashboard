import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { listAlerts } from "@/lib/content-radar";
import { getDomainTrends } from "@/lib/google-trends";
import { safeError } from "@/lib/errors";

// GET /api/radar/trends — free, key-less "what's trending in your domain" signals.
// Seeds come from the topics you already track (active alerts); if you track
// nothing yet we fall back to the core funnel exams so the lane is never blank.
// Pass ?force=1 to bypass the 30-min cache.

const DEFAULT_SEEDS = [
  "NEET PG 2026",
  "AMC exam",
  "PLAB 2",
  "OET for doctors",
  "DHA exam",
  "AHPRA registration",
];

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const force = new URL(req.url).searchParams.get("force") === "1";

    let seeds: string[] = [];
    try {
      const alerts = await listAlerts();
      seeds = alerts
        .filter((a) => a.active)
        .map((a) => a.searchQuery || a.name)
        .filter((s): s is string => Boolean(s && s.trim()));
    } catch {
      // Alerts store unavailable — fall through to defaults below.
    }
    if (seeds.length === 0) seeds = DEFAULT_SEEDS;

    const trends = await getDomainTrends({ seeds, force });
    return NextResponse.json(trends);
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load trends"), { status: 502 });
  }
}
