import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { checkWatcher, type Watcher } from "@/lib/watchers";
import { safeError } from "@/lib/errors";

// "Check now" on one watcher.   POST /api/watchers/check { id }
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!sb || !id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const { data, error } = await sb.from("mh_watchers").select("*").eq("id", id).single();
    if (error || !data) throw new Error(error?.message || "Watcher not found");
    return NextResponse.json(await checkWatcher(data as Watcher));
  } catch (err) { return NextResponse.json(safeError(err, "Check failed"), { status: 502 }); }
}
