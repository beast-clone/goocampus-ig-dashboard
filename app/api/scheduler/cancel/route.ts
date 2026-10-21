import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { NOT_PUBLISHING, notUpdated } from "@/lib/scheduler-lock";
import { safeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// POST /api/scheduler/cancel  { recordId }
// Removes a post from the publish queue: clears publish_status + schedule_time so it
// no longer shows as scheduled/publishing/failed. The content row itself is kept and
// drops back into the "Ready to schedule" backlog (reversible — nothing is destroyed).
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const { recordId } = (await req.json()) as { recordId?: string };
    if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb
      .from("mh_posts")
      .update({ publish_status: null, schedule_time: null })
      .eq("id", recordId)
      .or(NOT_PUBLISHING)   // never while the publisher is sending it
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return notUpdated(sb, recordId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Cancel failed"), { status: 502 });
  }
}
