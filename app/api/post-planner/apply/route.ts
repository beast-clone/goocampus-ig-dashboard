import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// "Apply plan" from the AI Post Planner — write the AI-suggested dates into
// mh_posts.publishing_date for each post, so the team's Publishing Calendar picks
// up the whole sequence at once. Only touches publishing_date.
export async function POST(req: Request) {
  let body: { items?: { id: string; dateISO: string }[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: "items required" }, { status: 400 });

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    let applied = 0;
    for (const it of items) {
      if (!it.id || !it.dateISO || Number.isNaN(Date.parse(it.dateISO))) continue;
      const { error } = await sb
        .from("mh_posts")
        .update({
          publishing_date: new Date(it.dateISO).toISOString(),
          planner_note: "Date set from AI plan",
          planner_note_at: new Date().toISOString(),
        })
        .eq("id", it.id);
      if (error) throw new Error(error.message);
      applied++;
    }
    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    return NextResponse.json(safeError(err, "Apply plan failed"), { status: 502 });
  }
}
