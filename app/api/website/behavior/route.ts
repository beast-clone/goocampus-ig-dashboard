import { NextResponse } from "next/server";
import { buildClarity, hasClarityAuth } from "@/lib/clarity";
import { cached } from "@/lib/api-cache";

// GET /api/website/behavior
//
// Microsoft Clarity behavior metrics for goocampusevents.com — last 3 days.
// Cached 3h because Clarity caps the export API at 10 calls/project/day.
export async function GET() {
  if (!hasClarityAuth()) {
    return NextResponse.json({ error: "Clarity not configured — set CLARITY_API_TOKEN." }, { status: 503 });
  }
  const t0 = Date.now();
  try {
    const data = await cached("clarity:3", 3 * 60 * 60_000, () => buildClarity(3));
    return NextResponse.json({ ...data, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Clarity failed" }, { status: 502 });
  }
}
