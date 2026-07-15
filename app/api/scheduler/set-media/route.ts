import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// POST /api/scheduler/set-media  { postId, mediaUrls: string[] }
// Saves directly-uploaded media (Supabase Storage URLs) onto an mh_posts row so
// the "To schedule" card shows the real thumbnail — no more Slack link.
export async function POST(req: Request) {
  try {
    const { postId, mediaUrls } = (await req.json()) as { postId?: string; mediaUrls?: string[] };
    if (!postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });
    if (!Array.isArray(mediaUrls)) return NextResponse.json({ error: "mediaUrls must be an array" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { error } = await sb
      .from("mh_posts")
      .update({ media_urls: mediaUrls.length ? mediaUrls : null })
      .eq("id", postId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, count: mediaUrls.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to save media"), { status: 502 });
  }
}
