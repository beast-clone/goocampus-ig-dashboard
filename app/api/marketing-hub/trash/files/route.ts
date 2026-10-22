import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { listFileTrash, restoreFiles, purgeFiles } from "@/lib/file-trash";

// GET  /api/marketing-hub/trash/files — task files in the recycle bin, newest first.
// POST /api/marketing-hub/trash/files  { action: "restore" | "purge", ids }
export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    return NextResponse.json({ items: await listFileTrash(sb) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load deleted files"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    const b = (await req.json().catch(() => ({}))) as { action?: string; ids?: string[] };
    const ids = (b.ids || []).filter((x) => typeof x === "string" && x).slice(0, 500);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const actor = getSessionUserId() || "system";
    if (b.action === "restore") return NextResponse.json(await restoreFiles(sb, ids, actor));
    if (b.action === "purge") return NextResponse.json(await purgeFiles(sb, ids, actor));
    return NextResponse.json({ error: "action must be restore or purge" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't update the bin"), { status: 502 });
  }
}
