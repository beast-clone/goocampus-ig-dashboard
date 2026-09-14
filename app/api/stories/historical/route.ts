import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// Reads previously-snapshotted stories from Supabase, newest first. The Stories page
// renders these in a "Historical" section so the tab keeps stories long after Meta's
// 24-hour window drops them from the live /stories endpoint.
//
//   GET /api/stories/historical?accountId=X&limit=30
//
// Row shape written by the hourly snapshot cron — see /api/cron/snapshot-stories.

export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const from = url.searchParams.get("from") || undefined; // YYYY-MM-DD, inclusive
  const to = url.searchParams.get("to") || undefined;     // YYYY-MM-DD, inclusive
  // With an explicit range we want every story in it (a busy month can top 90), so
  // lift the cap to 500; the default browse view keeps its small limit.
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10) || 30, (from && to) ? 500 : 100);

  const db = getSupabase();
  if (!db) return NextResponse.json({ stories: [], note: "Supabase not configured" });

  try {
    let q = db
      .from("story_snapshots")
      .select("story_id, caption, permalink, posted_at, stored_image_url, media_type, reach, views, replies, follows, profile_visits, navigation, captured_at")
      .eq("account_id", accountId)
      .order("posted_at", { ascending: false })
      .limit(limit);
    if (from) q = q.gte("posted_at", `${from}T00:00:00`);
    if (to) q = q.lte("posted_at", `${to}T23:59:59`);
    const { data, error } = await q;

    if (error) {
      // Very common on first-ever call: table doesn't exist yet. Surface a helpful hint.
      if (/relation .* does not exist/i.test(error.message)) {
        return NextResponse.json({
          stories: [],
          note: "story_snapshots table not created yet — run the migration SQL in Supabase and enable the hourly cron",
        });
      }
      return NextResponse.json(safeError(new Error(error.message), "Failed to read snapshots"), { status: 502 });
    }

    // Reshape to match the same fields the Live section uses so the UI can reuse the same card
    const stories = (data ?? []).map((r) => ({
      id: r.story_id,
      caption: r.caption ?? "",
      mediaUrl: r.stored_image_url ?? "",   // served from Supabase Storage, no longer from Meta CDN
      permalink: r.permalink ?? "",
      timestamp: r.posted_at,
      mediaType: r.media_type ?? "IMAGE",
      reach: r.reach ?? 0,
      views: r.views ?? 0,
      replies: r.replies ?? 0,
      follows: r.follows ?? 0,
      profileVisits: r.profile_visits ?? 0,
      navigation: r.navigation ?? 0,
      capturedAt: r.captured_at,
    }));

    return NextResponse.json({ stories });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to read snapshots"), { status: 502 });
  }
}
