import { NextResponse } from "next/server";
import { requireSection, requireSchedulerPost } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { NOT_PUBLISHING, notUpdated, freshPublishState } from "@/lib/scheduler-lock";
import { safeError } from "@/lib/errors";
import { logQueueAction, istTime } from "@/lib/publish-history";

export const dynamic = "force-dynamic";

// POST /api/scheduler/cancel  { recordId }
// Removes a post from the publish queue: clears publish_status + schedule_time so it
// no longer shows as scheduled/publishing/failed. The content row itself is kept and
// drops back into the "Ready to schedule" backlog (reversible — nothing is destroyed).
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const { recordId, reason } = (await req.json()) as { recordId?: string; reason?: string };
    if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });
    { const __pages = await requireSchedulerPost(recordId); if (__pages) return __pages; }
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data: was } = await sb.from("mh_posts").select("publish_status, schedule_time, custom").eq("id", recordId).maybeSingle();
    const { data, error } = await sb
      .from("mh_posts")
      // failure_reason too: a failed post sent back to be fixed starts clean (22 Oct).
      .update({ publish_status: null, schedule_time: null, failure_reason: null, custom: freshPublishState(was?.custom) })
      .eq("id", recordId)
      .or(NOT_PUBLISHING)   // never while the publisher is sending it
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return notUpdated(sb, recordId);
    await logQueueAction(sb, recordId, "removed_from_queue", was?.publish_status || null, null,
      typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 300) : undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Cancel failed"), { status: 502 });
  }
}
