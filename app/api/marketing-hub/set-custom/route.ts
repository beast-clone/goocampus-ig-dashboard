import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// Set one custom-column value on a task. Body: { postId, key, value }
// Merges into mh_posts.custom (jsonb) so other custom values are preserved.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const body = (await req.json()) as { postId?: string; key?: string; value?: unknown };
    if (!body.postId || !body.key) return NextResponse.json({ error: "postId and key required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const cur = await sb.from("mh_posts").select("custom").eq("id", body.postId).single();
    if (cur.error) throw new Error(cur.error.message);
    const custom = { ...((cur.data?.custom as Record<string, unknown>) || {}) };
    if (body.value === "" || body.value === null || body.value === undefined) delete custom[body.key];
    else custom[body.key] = body.value;

    const { error } = await sb.from("mh_posts").update({ custom, updated_at: new Date().toISOString() }).eq("id", body.postId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, custom });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
