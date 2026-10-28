import { NextResponse } from "next/server";
import { geoGuard, geoDb } from "../_shared";
import { dfsErrors } from "@/lib/dataforseo";
import { safeError } from "@/lib/errors";

// GET /api/geo/errors → DataForSEO's own error log + answers that failed in our checks.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await geoGuard();
  if (denied) return denied;
  try {
    const [dfs, { data: failed }] = await Promise.all([
      dfsErrors().catch(() => null),
      geoDb().from("geo_answers").select("id, engine, error, cost, created_at, done_at, geo_questions(question)").eq("status", "failed").order("created_at", { ascending: false }).limit(200),
    ]);
    return NextResponse.json({ dataforseo: dfs, failed: failed || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load errors"), { status: 500 });
  }
}
