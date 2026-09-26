import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionIsAdmin } from "@/lib/auth";
import { requireSection } from "@/lib/api-guard";

// GET /api/marketing-hub/trash/archive/<id>
//
// The report on one deleted task. Recovering an archived task does NOT put it back on
// the board — an admin checking why something was deleted does not want it reappearing
// in everyone's list. He gets a read-only account of what the task WAS: the brief, who
// owned it, where it had got to, who deleted it and when, and who emptied it from the
// bin. Built entirely from the snapshot, so it works long after the task is gone.
//
// Admin only, like the archive listing it belongs to.
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) {
    return NextResponse.json({ error: "Only an admin can open a deleted-task report." }, { status: 403 });
  }
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const r = await sb.from("mh_posts_trash").select("*").eq("id", params.id).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) return NextResponse.json({ error: "No record of that task." }, { status: 404 });

    const snap = r.data as Row;
    const post = (snap.post || {}) as Row;
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const activity = arr(snap.activity) as Row[];

    return NextResponse.json({
      report: {
        id: snap.id,
        title: str(post.particulars) || str(snap.particulars) || "(untitled)",
        type: str(post.type),
        sbu: str(post.sbu),
        status: str(post.status),               // where it had got to when it was deleted
        owner: str(post.owner_key),
        priority: str(post.priority),
        publishingDate: str(post.publishing_date),
        createdAt: str(post.created_at),
        createdBy: str(post.created_by),
        content: str(post.content) || str(post.caption),
        outputLink: str(post.output_link),
        platforms: arr(post.platforms),
        collaborators: arr(snap.collaborators).map((c) => (c as Row).member_key).filter(Boolean),
        counts: {
          attachments: arr(snap.attachments).length,
          comments: arr(snap.comments).length,
          activity: activity.length,
        },
        // The last few things that happened before it was deleted — usually the reason
        // it was deleted is sitting right here.
        lastActivity: activity
          .slice()
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
          .slice(0, 8)
          .map((a) => ({ at: str(a.created_at), actor: str(a.actor_key), action: str(a.action), from: str(a.from_value), to: str(a.to_value) })),
        deletedAt: str(snap.deleted_at),
        deletedBy: str(snap.deleted_by),
        purgedAt: str(snap.purged_at),
        purgedBy: str(snap.purged_by),
      },
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't build the report"), { status: 502 });
  }
}
