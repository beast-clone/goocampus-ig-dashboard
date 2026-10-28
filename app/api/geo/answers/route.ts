import { NextResponse } from "next/server";
import { geoGuard, geoDb, bad } from "../_shared";
import { safeError } from "@/lib/errors";

// GET /api/geo/answers?question=<id> → every answer to that question, newest first
// (the full text, sources, who else was named), for the right-hand panel.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await geoGuard();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("question");
  if (!id) return bad("Which question?");
  try {
    const { data, error } = await geoDb().from("geo_answers")
      .select("id, run_id, engine, status, named, cited, position, competitors, sources, answer, model, error, cost, created_at, done_at")
      .eq("question_id", id).order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ answers: data || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load the answers"), { status: 500 });
  }
}
