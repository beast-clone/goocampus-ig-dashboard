import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Retry a stuck/failed post — re-arm it in Supabase mh_posts (publish_status back to
// 'scheduled', clear the failure reason) so the worker attempts it again.
export async function POST(req: Request) {
  let body: { recordId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.recordId || typeof body.recordId !== "string") {
    return NextResponse.json({ error: "recordId required" }, { status: 400 });
  }
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb
      .from("mh_posts")
      .update({ publish_status: "scheduled", failure_reason: null })
      .eq("id", body.recordId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Retry failed"), { status: 502 });
  }
}
