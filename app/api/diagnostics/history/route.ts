import { NextResponse } from "next/server";
import { diagnosticsHistory, diagnosticsRun } from "@/lib/diagnostics";
import { requireSection } from "@/lib/api-guard";

// Guarded on the "system" section: lib/permissions.ts marks it adminOnly, and
// what this returns or does is platform posture, not day-to-day work.
// GET /api/diagnostics/history            -> last 30 run summaries
// GET /api/diagnostics/history?id=<uuid>  -> one full stored report
export async function GET(req: Request) {
  const __denied = await requireSection("system");
  if (__denied) return __denied;
  const id = new URL(req.url).searchParams.get("id");
  if (id) return NextResponse.json({ run: await diagnosticsRun(id) });
  return NextResponse.json({ runs: await diagnosticsHistory(30) });
}
