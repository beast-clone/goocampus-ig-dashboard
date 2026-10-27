import { NextResponse } from "next/server";
import { requireSection, requireSchedulerPost } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { trashTasks } from "@/lib/task-trash";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/scheduler/discard-draft  { recordId }
// Deletes a draft from the Scheduler's Drafts list: the draft and its "also as a
// Story" go to the recycle bin (restorable). Only ever a draft — a scheduled or
// published post is refused, so this can't be used to delete anything else.
export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    const { recordId } = (await req.json()) as { recordId?: string };
    if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });
    { const pages = await requireSchedulerPost(recordId); if (pages) return pages; }
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { data: row } = await sb.from("mh_posts").select("id, publish_status").eq("id", recordId).maybeSingle();
    if (!row) return NextResponse.json({ error: "That draft is already gone." }, { status: 404 });
    if (row.publish_status !== "draft") return NextResponse.json({ error: "Only a draft can be deleted here." }, { status: 409 });

    const { data: stories } = await sb.from("mh_posts").select("id").eq("custom->>story_of", recordId).eq("publish_status", "draft");
    const ids = [recordId, ...(stories || []).map((s) => s.id)];
    const out = await trashTasks(sb, ids, (getSessionUserId() || "scheduler").toLowerCase());
    if (out.failed.length) return NextResponse.json({ error: out.failed[0].error }, { status: 502 });
    return NextResponse.json({ ok: true, binned: out.done.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't delete the draft"), { status: 502 });
  }
}
