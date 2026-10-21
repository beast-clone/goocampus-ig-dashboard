import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { runDiagnostics } from "@/lib/diagnostics";
import { safeError } from "@/lib/errors";

// Guarded on the "system" section: lib/permissions.ts marks it adminOnly, and
// what this returns or does is platform posture, not day-to-day work.
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
