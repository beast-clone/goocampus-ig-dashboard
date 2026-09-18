import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { requireSection } from "@/lib/api-guard";
import { listTrash, TrashNotReady } from "@/lib/task-trash";

// GET /api/marketing-hub/trash — tasks in the recycle bin, newest deletion first.
export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    return NextResponse.json({ items: await listTrash(sb) });
  } catch (err) {
    if (err instanceof TrashNotReady) return NextResponse.json({ items: [], notReady: true, error: err.message });
    return NextResponse.json(safeError(err, "Couldn't load the recycle bin"), { status: 502 });
  }
}
