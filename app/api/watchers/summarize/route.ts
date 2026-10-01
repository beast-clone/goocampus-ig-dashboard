import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { summarizeNotice } from "@/lib/pdf-summary";
import { safeError } from "@/lib/errors";

// Summarise one notice on request — for ones listed before summaries existed, or
// that were already on the page.   POST /api/watchers/summarize { id }
// New notices get theirs automatically when a check finds them (lib/watchers.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!sb || !id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const { data, error } = await sb.from("mh_watcher_items").select("id, title, item_url").eq("id", id).single();
    if (error || !data) throw new Error(error?.message || "Notice not found");
    const s = await summarizeNotice(data.title, data.item_url);
    if (!s?.text) return NextResponse.json({ error: "Couldn't read this notice." }, { status: 422 });
    await sb.from("mh_watcher_items").update({ summary: s.text, summary_from: s.from }).eq("id", id);
    return NextResponse.json({ summary: s.text, from: s.from });
  } catch (err) { return NextResponse.json(safeError(err, "Summary failed"), { status: 502 }); }
}
