import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionIsAdmin } from "@/lib/auth";
import { requireSection } from "@/lib/api-guard";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { listPurged, recoverPurged, TrashNotReady } from "@/lib/task-trash";

// The archive: snapshots that were emptied from the recycle bin. "Delete forever" no
// longer destroys anything (sql/019_trash_two_tier.sql) — it stamps the row and drops
// it out of the bin, and this is the only way back.
//
// GET  /api/marketing-hub/trash/archive              — list them
// POST /api/marketing-hub/trash/archive { ids: [] }  — put them back in the bin
//
// Admin only, on both. Everyone with delete_tasks can empty the bin; undoing that is
// the safety net, and a safety net anyone can reach is not one.
export const dynamic = "force-dynamic";

const ADMIN_ONLY = NextResponse.json({ error: "Only an admin can open the deleted archive." }, { status: 403 });

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return ADMIN_ONLY;
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    return NextResponse.json({ items: await listPurged(sb) });
  } catch (err) {
    if (err instanceof TrashNotReady) return NextResponse.json({ items: [], notReady: true, error: err.message });
    return NextResponse.json(safeError(err, "Couldn't load the archive"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return ADMIN_ONLY;
  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
    const ids = [...new Set((body.ids || []).filter((x) => typeof x === "string" && x))];
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const out = await recoverPurged(sb, ids);
    if (out.done.length) bustMarketingHubCache();
    return NextResponse.json({ ok: out.failed.length === 0, done: out.done.length, missing: out.missing, failed: out.failed });
  } catch (err) {
    if (err instanceof TrashNotReady) return NextResponse.json({ error: err.message, notReady: true }, { status: 409 });
    return NextResponse.json(safeError(err, "Recover failed"), { status: 502 });
  }
}
