import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { requireSection, requireCapability } from "@/lib/api-guard";
import { getSessionUserId, getSessionIsAdmin } from "@/lib/auth";
import { listFileTrash, listPurgedFiles, restoreFiles, purgeFiles, recoverPurgedFiles } from "@/lib/file-trash";

// GET  /api/marketing-hub/trash/files            — task files in the recycle bin, newest first.
// GET  /api/marketing-hub/trash/files?emptied=1  — admin: files emptied from the bin.
// POST /api/marketing-hub/trash/files  { action: "restore" | "purge" | "recover", ids }
//   restore — anyone with the content section (puts a file back on its task)
//   purge   — only people who may delete tasks, same as the task bin
//   recover — admin only: an emptied file back into the bin
export async function GET(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    if (new URL(req.url).searchParams.get("emptied")) {
      if (!getSessionIsAdmin()) return NextResponse.json({ error: "Admins only" }, { status: 403 });
      return NextResponse.json({ items: await listPurgedFiles(sb) });
    }
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
    if (b.action === "purge") {
      const noCap = await requireCapability("delete_tasks");
      if (noCap) return noCap;
      return NextResponse.json(await purgeFiles(sb, ids, actor));
    }
    if (b.action === "recover") {
      if (!getSessionIsAdmin()) return NextResponse.json({ error: "Admins only" }, { status: 403 });
      return NextResponse.json(await recoverPurgedFiles(sb, ids));
    }
    return NextResponse.json({ error: "action must be restore, purge or recover" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't update the bin"), { status: 502 });
  }
}
