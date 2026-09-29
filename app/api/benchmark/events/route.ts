import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// What the competitor watcher found (mh_competitor_events), newest first.
//   GET /api/benchmark/events?accountId=goocampus&handle=hellomentor.in[&kinds=blog,event,page]
// `watchingSince` is when the watcher first read this competitor's website — so the
// Briefing can say "watching since …, nothing new yet" instead of looking broken.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const handle = (url.searchParams.get("handle") || "").toLowerCase();
  const kinds = (url.searchParams.get("kinds") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ events: [], watchingSince: null });
  try {
    let q = sb.from("mh_competitor_events").select("id, kind, title, url, published_at, detected_at")
      .eq("account_id", accountId).eq("handle", handle).order("detected_at", { ascending: false }).limit(60);
    if (kinds.length) q = q.in("kind", kinds);
    const [{ data, error }, { data: first }] = await Promise.all([
      q,
      sb.from("mh_competitor_seen").select("first_seen").eq("account_id", accountId).eq("handle", handle).eq("source", "sitemap")
        .order("first_seen", { ascending: true }).limit(1),
    ]);
    if (error) throw new Error(error.message);
    return NextResponse.json({ events: data || [], watchingSince: (first?.[0] as { first_seen?: string } | undefined)?.first_seen || null });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't read competitor activity"), { status: 502 });
  }
}
