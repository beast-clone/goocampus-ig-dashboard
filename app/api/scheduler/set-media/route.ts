import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { NOT_PUBLISHING, notUpdated, freshPublishState } from "@/lib/scheduler-lock";
import { sendBackForReview } from "@/lib/re-review";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// POST /api/scheduler/set-media  { postId, mediaUrls: string[] }
// Saves directly-uploaded media (Supabase Storage URLs) onto an mh_posts row so
// the "To schedule" card shows the real thumbnail — no more Slack link.
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const { postId, mediaUrls } = (await req.json()) as { postId?: string; mediaUrls?: string[] };
    if (!postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });
    if (!Array.isArray(mediaUrls)) return NextResponse.json({ error: "mediaUrls must be an array" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    // Swapping the media is a creative change: an approved / queued post goes back to
    // Content Review (lib/re-review.ts), and any upload made from the old files is dropped.
    const { data: cur } = await sb.from("mh_posts").select("custom, media_urls").eq("id", postId).maybeSingle();
    const changed = JSON.stringify(cur?.media_urls || []) !== JSON.stringify(mediaUrls);
    const { data, error } = await sb
      .from("mh_posts")
      .update({ media_urls: mediaUrls.length ? mediaUrls : null, ...(changed ? { custom: freshPublishState(cur?.custom) } : {}) })
      .eq("id", postId)
      .or(NOT_PUBLISHING)   // never while the publisher is sending it
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return notUpdated(sb, postId);
    const sentBack = changed ? await sendBackForReview(sb, postId, getSessionUserId() || null, null) : false;

    return NextResponse.json({ ok: true, count: mediaUrls.length, sentBack });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to save media"), { status: 502 });
  }
}
