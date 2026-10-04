import { NextResponse } from "next/server";
import { requireSection, requireCapability } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// "Publish now" — set schedule_time to now in Supabase mh_posts so the publish worker
// picks the row up on its next tick. publish_status is (re)set to 'scheduled' in case
// the row was stuck/failed beforehand.
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  // Publishing is the most expensive action in the product: it is public,
  // immediate and not really undoable. The "content" section alone is held by
  // the Designer, Video-editor and Content-writer presets, i.e. everyone who
  // can open the tab — so section access was deciding who could post to the
  // brand accounts. approve_content exists precisely to separate "can work on
  // a task" from "can ship it". Admins pass automatically, so this changes
  // nothing until a non-admin account exists, which is when it should bite.
  const __noCap = await requireCapability("approve_content");
  if (__noCap) return __noCap;

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
      .update({ schedule_time: new Date().toISOString(), publish_status: "scheduled", failure_reason: null })
      .eq("id", body.recordId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Publish now failed"), { status: 502 });
  }
}
