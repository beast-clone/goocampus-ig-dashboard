import { NextResponse } from "next/server";
import { requireSection, requireSchedulerPost } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { NOT_PUBLISHING, notUpdated, freshPublishState } from "@/lib/scheduler-lock";
import { safeError } from "@/lib/errors";
import { logQueueAction, istTime } from "@/lib/publish-history";
import { trashTasks } from "@/lib/task-trash";
import { getSessionUserId } from "@/lib/auth";

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
    // Its "also as a Story" goes with it — to the recycle bin, unless it's already out
    // (enqueue syncStory, 27 Oct). A Story left queued would post on its own.
    const { data: stories } = await sb.from("mh_posts").select("id, publish_status").eq("custom->>story_of", recordId);
    const open = (stories || []).filter((s) => s.publish_status !== "published" && s.publish_status !== "publishing").map((s) => s.id);
    if (open.length) await trashTasks(sb, open, (getSessionUserId() || "scheduler").toLowerCase());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Cancel failed"), { status: 502 });
  }
}
