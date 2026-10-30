import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// Plan board (Content → Plan board, 30 Oct): each person's handwritten board, kept in
// discover_cache as `planboard:<user>` — strokes only (points in 0..1 of the board).
//   GET → { board: { strokes } }      PUT { strokes } → saves it
export const dynamic = "force-dynamic";

const MAX_BYTES = 3_000_000;   // ~a very full page of handwriting
const keyFor = (u: string) => `planboard:${u.toLowerCase()}`;

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  const me = getSessionUserId();
  const sb = getSupabase();
  if (!me || !sb) return NextResponse.json({ board: { strokes: [] } });
  try {
    const { data } = await sb.from("discover_cache").select("payload, last_fetched").eq("cache_key", keyFor(me)).maybeSingle();
    return NextResponse.json({ board: (data?.payload as object) || { strokes: [] }, savedAt: data?.last_fetched || null });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load your board"), { status: 502 });
  }
}

export async function PUT(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const me = getSessionUserId();
  const sb = getSupabase();
  if (!me || !sb) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return NextResponse.json({ error: "The board is full — clear some of it and try again." }, { status: 413 });
    const b = JSON.parse(raw) as { strokes?: unknown };
    if (!Array.isArray(b.strokes)) return NextResponse.json({ error: "strokes must be a list" }, { status: 400 });
    const savedAt = new Date().toISOString();
    const { error } = await sb.from("discover_cache").upsert(
      { cache_key: keyFor(me), source: "plan_board", last_fetched: savedAt, payload: { strokes: b.strokes } },
      { onConflict: "cache_key" },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, savedAt });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save your board"), { status: 400 });
  }
}
