import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { getSessionUserId } from "@/lib/auth";
import { requireCapability, requireSection } from "@/lib/api-guard";

// POST /api/marketing-hub/delete  { id, actor? }
// Removes ONE mh_posts row. Gated in the UI by the `delete_tasks` capability
// (Team permissions). Child rows are cleared first in case FKs aren't cascading.
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const denied = await requireCapability("delete_tasks");
    if (denied) return denied;

    const body = (await req.json()) as { id?: string };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const before = await sb.from("mh_posts").select("id, particulars").eq("id", body.id).single();
    if (before.error) throw new Error(before.error.message);

    const actor = getSessionUserId() || "system";

    // Clear child rows first (ignore errors — some may cascade or not exist).
    await sb.from("mh_post_collaborators").delete().eq("post_id", body.id);
    await sb.from("mh_attachments").delete().eq("post_id", body.id).then(() => {}, () => {});
    await sb.from("mh_activity").delete().eq("post_id", body.id).then(() => {}, () => {});

    const del = await sb.from("mh_posts").delete().eq("id", body.id);
    if (del.error) throw new Error(del.error.message);

    // Best-effort audit line (post_id now null since the row is gone).
    await sb.from("mh_activity").insert({ actor_key: actor, action: "deleted", detail: `deleted “${before.data?.particulars || "a task"}”` }).then(() => {}, () => {});

    bustMarketingHubCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Delete failed"), { status: 502 });
  }
}
