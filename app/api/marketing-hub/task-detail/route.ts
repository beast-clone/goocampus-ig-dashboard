import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// GET /api/marketing-hub/task-detail?id=<uuid>
// Bundles everything the My Day detail panel needs in one call:
//   - collaborators (with role + display name from mh_team_members)
//   - attachments (reference / mood-board files)
//   - comments (inline thread, most recent 20)
//   - activity (log, most recent 10)

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const [collabsRes, attachRes, commentsRes, activityRes, ownerRes, teamRes] = await Promise.all([
      sb.from("mh_post_collaborators").select("member_key, added_at").eq("post_id", id),
      sb.from("mh_attachments").select("id, filename, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at").eq("post_id", id).order("uploaded_at", { ascending: false }),
      sb.from("mh_comments").select("id, author_key, body, resolved, created_at").eq("post_id", id).order("created_at", { ascending: false }).limit(20),
      sb.from("mh_activity").select("id, actor_key, action, from_value, to_value, detail, created_at").eq("post_id", id).order("created_at", { ascending: false }).limit(10),
      sb.from("mh_posts").select("owner_key, start_at, synced_to_scheduler").eq("id", id).single(),
      sb.from("mh_team_members").select("key, display_name, role"),
    ]);

    if (collabsRes.error) throw new Error(collabsRes.error.message);
    if (attachRes.error) throw new Error(attachRes.error.message);
    if (commentsRes.error) throw new Error(commentsRes.error.message);
    if (activityRes.error) throw new Error(activityRes.error.message);

    type Team = { key: string; display_name: string; role: string };
    const team = (teamRes.data as Team[] | null) || [];
    const teamMap = new Map(team.map((t) => [t.key, t]));

    const nameOf = (k: string | null) => (k && teamMap.get(k)?.display_name) || k || "—";
    const roleOf = (k: string | null) => (k && teamMap.get(k)?.role) || null;

    const ownerKey = ownerRes.data?.owner_key || null;
    const collabList = (collabsRes.data || []).map((c: { member_key: string; added_at: string }) => ({
      key: c.member_key,
      name: nameOf(c.member_key),
      role: roleOf(c.member_key),
      addedAt: c.added_at,
    }));

    // Prepend owner as writer/primary if not already in collab list
    const collaborators = ownerKey && !collabList.find((c) => c.key === ownerKey)
      ? [{ key: ownerKey, name: nameOf(ownerKey), role: roleOf(ownerKey) || "writer", addedAt: null as string | null }, ...collabList]
      : collabList;

    return NextResponse.json({
      collaborators,
      attachments: attachRes.data || [],
      comments: (commentsRes.data || []).map((c: { author_key: string; body: string; resolved: boolean; created_at: string; id: string }) => ({
        ...c,
        authorName: nameOf(c.author_key),
      })),
      activity: (activityRes.data || []).map((a: { actor_key: string; action: string; from_value: string; to_value: string; detail: string; created_at: string; id: string }) => ({
        ...a,
        actorName: nameOf(a.actor_key),
      })),
      scheduler: {
        syncedToScheduler: ownerRes.data?.synced_to_scheduler || false,
        startAt: ownerRes.data?.start_at || null,
      },
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Task detail fetch failed"), { status: 502 });
  }
}
