import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { getSessionUserId } from "@/lib/auth";
import { requireCapability, requireSection } from "@/lib/api-guard";
import { purgeTasks, TrashNotReady, PurgeNotReady } from "@/lib/task-trash";

// POST /api/marketing-hub/trash/purge  { ids: string[] }
// "Delete forever" from the recycle bin — which no longer means forever. The snapshot
// is stamped as archived, not destroyed, and stays recoverable by an admin. Same
// `delete_tasks` capability as deleting. See sql/019_trash_two_tier.sql.
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const denied = await requireCapability("delete_tasks");
    if (denied) return denied;
    const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
    const ids = [...new Set((body.ids || []).filter((x) => typeof x === "string" && x))];
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const actor = (await getSessionUserId()) || "unknown";
    const out = await purgeTasks(sb, ids, actor);
    if (out.done.length) bustMarketingHubCache();
    return NextResponse.json({ ok: out.failed.length === 0, done: out.done.length, missing: out.missing, failed: out.failed });
  } catch (err) {
    if (err instanceof TrashNotReady || err instanceof PurgeNotReady) return NextResponse.json({ error: err.message, notReady: true }, { status: 409 });
    return NextResponse.json(safeError(err, "Delete forever failed"), { status: 502 });
  }
}
