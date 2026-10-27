import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";

// The Scheduler took a file off the post it is scheduling (27 Oct). The file stays on
// the task — only this post goes out without it — but who did it and why goes in the
// task's history, so a dropped LinkedIn PDF can be traced. Body: { postId, file, reason }
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const b = (await req.json()) as { postId?: string; file?: string; reason?: string };
    if (!b.postId || !b.file) return NextResponse.json({ error: "postId and file required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("mh_activity").insert({
      post_id: b.postId, actor_key: getSessionUserId() || null, action: "post_media_removed",
      to_value: String(b.file).slice(0, 200), ...(b.reason ? { detail: String(b.reason).slice(0, 300) } : {}),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not record it"), { status: 502 });
  }
}
