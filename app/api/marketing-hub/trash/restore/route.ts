import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { getSessionUserId } from "@/lib/auth";
import { requireCapability, requireSection } from "@/lib/api-guard";
import { restoreTasks, TrashNotReady } from "@/lib/task-trash";

// POST /api/marketing-hub/trash/restore  { ids: string[] }
// Puts tasks back exactly as they were, same id, owner, comments and history.
// Same `delete_tasks` capability as deleting.
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
    const out = await restoreTasks(sb, ids, getSessionUserId() || "system");
    if (out.done.length) bustMarketingHubCache();
    return NextResponse.json({ ok: out.failed.length === 0, done: out.done.length, missing: out.missing, failed: out.failed });
  } catch (err) {
    if (err instanceof TrashNotReady) return NextResponse.json({ error: err.message, notReady: true }, { status: 409 });
    return NextResponse.json(safeError(err, "Restore failed"), { status: 502 });
  }
}
