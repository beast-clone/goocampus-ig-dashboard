import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Edit a post's caption from the queue view — writes mh_posts.caption in Supabase.
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  let body: { recordId?: string; caption?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.recordId || typeof body.recordId !== "string") {
    return NextResponse.json({ error: "recordId required" }, { status: 400 });
  }
  if (typeof body.caption !== "string") {
    return NextResponse.json({ error: "caption required (string)" }, { status: 400 });
  }
  if (body.caption.length > 2200) {
    return NextResponse.json({ error: "Caption exceeds 2200 char limit" }, { status: 400 });
  }

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb
      .from("mh_posts")
      .update({ caption: body.caption })
      .eq("id", body.recordId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Caption update failed"), { status: 502 });
  }
}
