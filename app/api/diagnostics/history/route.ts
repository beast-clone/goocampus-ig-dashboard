import { NextResponse } from "next/server";
import { diagnosticsHistory, diagnosticsRun } from "@/lib/diagnostics";

// GET /api/diagnostics/history            -> last 30 run summaries
// GET /api/diagnostics/history?id=<uuid>  -> one full stored report
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) return NextResponse.json({ run: await diagnosticsRun(id) });
  return NextResponse.json({ runs: await diagnosticsHistory(30) });
}
