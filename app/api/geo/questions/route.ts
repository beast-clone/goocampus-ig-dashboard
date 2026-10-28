import { NextResponse } from "next/server";
import { geoGuard, geoDb, bad } from "../_shared";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// POST  /api/geo/questions { brandId, topic, items: [{ question, kind, source }] } → track them
// PATCH /api/geo/questions { id, paused? | question? | remove? }
const KINDS = ["real", "search", "choose", "own"];

export async function POST(req: Request) {
  const denied = await geoGuard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const topic = String(b.topic || "").trim().slice(0, 100) || "Other";
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40)
    .map((x: { question?: string; kind?: string; source?: string }) => ({ question: String(x.question || "").trim().slice(0, 300), kind: KINDS.includes(String(x.kind)) ? x.kind : "own", source: x.source ? String(x.source).slice(0, 200) : null }))
    .filter((x: { question: string }) => x.question.length > 5);
  if (!b.brandId || !items.length) return bad("Pick at least one question.");
  try {
    const db = geoDb();
    const { data: have } = await db.from("geo_questions").select("question").eq("brand_id", b.brandId).is("deleted_at", null);
    const seen = new Set((have || []).map((h) => h.question.toLowerCase()));
    const rows = items.filter((x: { question: string }) => !seen.has(x.question.toLowerCase()))
      .map((x: object) => ({ ...x, brand_id: b.brandId, topic, added_by: getSessionUserId() }));
    if (rows.length) { const { error } = await db.from("geo_questions").insert(rows); if (error) throw error; }
    return NextResponse.json({ added: rows.length, skipped: items.length - rows.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't add the questions"), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const denied = await geoGuard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (!b.id) return bad("Which question?");
  const patch: Record<string, unknown> = {};
  if (typeof b.paused === "boolean") patch.paused = b.paused;
  if (typeof b.question === "string" && b.question.trim().length > 5) { patch.question = b.question.trim().slice(0, 300); patch.kind = "own"; }
  // Removing keeps the row (its past answers stay in the reports); it just stops being asked.
  if (b.remove === true) patch.deleted_at = new Date().toISOString();
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  try {
    const { error } = await geoDb().from("geo_questions").update(patch).eq("id", b.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't update the question"), { status: 500 });
  }
}
