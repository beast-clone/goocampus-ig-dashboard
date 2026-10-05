import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { runDiagnostics } from "@/lib/diagnostics";
import { safeError } from "@/lib/errors";

// POST /api/diagnostics/run — on-demand full diagnostic + auto-repair. Session-
// protected by middleware. Returns the report (also stored in mh_diagnostics_runs).
export async function POST() {
  // Diagnostics is admin-only (the "system" section) — the page and its actions.
  const denied = await requireSection("system");
  if (denied) return denied;
  try {
    return NextResponse.json(await runDiagnostics("manual"));
  } catch (err) {
    return NextResponse.json(safeError(err, "Diagnostics run failed"), { status: 502 });
  }
}
