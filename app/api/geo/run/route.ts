import { NextResponse } from "next/server";
import { geoGuard } from "../_shared";
import { guardRate } from "@/lib/api-guard";
import { startRun } from "@/lib/geo";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// POST /api/geo/run { brandId? } → "Check now": queue every active question (one
// brand, or all) to the 4 AIs. Answers arrive over the next few minutes (collect).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await geoGuard();
  if (denied) return denied;
  const limited = guardRate(req, "geo-run", 6, 600_000);
  if (limited) return limited;
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await startRun({ brandId: b.brandId ? String(b.brandId) : null, trigger: "manual", by: getSessionUserId() }));
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't start the check"), { status: 400 });
  }
}
