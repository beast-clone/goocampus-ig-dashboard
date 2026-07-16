import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Drag-to-reschedule from the Post Planner calendar. Writes the new planned date to
// mh_posts.publishing_date — the SAME row/field the team's Marketing Hub works from,
// so the change reflects for them immediately. Only touches publishing_date (does NOT
// enqueue the post for publishing).
export async function POST(req: Request) {
  let body: { id?: string; dateISO?: string; note?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!body.dateISO || typeof body.dateISO !== "string" || Number.isNaN(Date.parse(body.dateISO))) {
    return NextResponse.json({ error: "dateISO required (valid ISO 8601)" }, { status: 400 });
  }

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const when = new Date(body.dateISO);
    // In-app "notification" for the owner: stamp a note the team's table can surface.
    const note = (body.note && body.note.trim())
      || `Moved to ${when.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`;
    const { error } = await sb
      .from("mh_posts")
      .update({ publishing_date: when.toISOString(), planner_note: note, planner_note_at: new Date().toISOString() })
      .eq("id", body.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Move failed"), { status: 502 });
  }
}
