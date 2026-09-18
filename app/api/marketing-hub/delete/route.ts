import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { getSessionUserId } from "@/lib/auth";
import { requireCapability, requireSection } from "@/lib/api-guard";
import { trashTasks, TrashNotReady } from "@/lib/task-trash";

// POST /api/marketing-hub/delete  { id } | { ids: string[] }
// Moves tasks to the recycle bin (lib/task-trash.ts) — it no longer erases them.
// Restore and Delete forever live under /api/marketing-hub/trash. Gated by the
// `delete_tasks` capability (Team permissions), as before.
//
// If the bin table doesn't exist yet this refuses outright (409) rather than
// falling back to a hard delete: nothing is ever erased without a way back.
const MAX = 500;

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const denied = await requireCapability("delete_tasks");
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as { id?: string; ids?: string[] };
    const ids = [...new Set((body.ids?.length ? body.ids : body.id ? [body.id] : []).filter((x) => typeof x === "string" && x))];
    if (!ids.length) return NextResponse.json({ error: "id or ids required" }, { status: 400 });
    if (ids.length > MAX) return NextResponse.json({ error: `Delete at most ${MAX} at a time.` }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const actor = getSessionUserId() || "system";
    const out = await trashTasks(sb, ids, actor);
    if (out.done.length) {
      await sb.from("mh_activity").insert({ actor_key: actor, action: "deleted",
        detail: `moved ${out.done.length} task${out.done.length === 1 ? "" : "s"} to the recycle bin` }).then(() => {}, () => {});
      bustMarketingHubCache();
    }
    return NextResponse.json({ ok: out.failed.length === 0, moved: out.done.length, missing: out.missing, failed: out.failed },
      { status: out.done.length || !out.failed.length ? 200 : 502 });
  } catch (err) {
    if (err instanceof TrashNotReady) return NextResponse.json({ error: err.message, notReady: true }, { status: 409 });
    return NextResponse.json(safeError(err, "Delete failed"), { status: 502 });
  }
}
