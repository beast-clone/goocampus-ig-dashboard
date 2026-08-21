import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Reschedule a queued post — update its schedule_time in Supabase mh_posts.
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  let body: { recordId?: string; scheduleTime?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.recordId || typeof body.recordId !== "string") {
    return NextResponse.json({ error: "recordId required" }, { status: 400 });
  }
  if (!body.scheduleTime || typeof body.scheduleTime !== "string" || Number.isNaN(Date.parse(body.scheduleTime))) {
    return NextResponse.json({ error: "scheduleTime required (valid ISO 8601)" }, { status: 400 });
  }

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb
      .from("mh_posts")
      .update({ schedule_time: new Date(body.scheduleTime).toISOString(), publish_status: "scheduled" })
      .eq("id", body.recordId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Reschedule failed"), { status: 502 });
  }
}
