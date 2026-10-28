import { NextResponse } from "next/server";
import { geoGuard } from "../_shared";
import { collect } from "@/lib/geo";
import { safeError } from "@/lib/errors";

// POST /api/geo/collect → pick up answers that have finished. The tab calls this
// every ~20 s while a check is running; the n8n cron calls /api/cron/geo the rest of the time.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const denied = await geoGuard();
  if (denied) return denied;
  try {
    return NextResponse.json(await collect(40_000));
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't collect answers"), { status: 500 });
  }
}
