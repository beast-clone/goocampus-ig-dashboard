import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { noticeDate } from "@/lib/watchers";

// What the watchers found, newest first.
//   GET /api/watchers/items?group=UG&watcher=<id>&days=30&all=1
// group: UG also includes "UG & PG" notices (and PG likewise). all=1 also includes documents
// that were already on the page when it was first read (the baseline).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ items: [] });
  const p = new URL(req.url).searchParams;
  try {
    let q = sb.from("mh_watcher_items").select("id, watcher_id, item_url, title, grp, baseline, detected_at, emailed_at, telegram_at")
      .order("detected_at", { ascending: false }).order("title", { ascending: true }).limit(p.get("all") === "1" ? 1000 : 300);
    // What was already there is shown as documents only (PDFs etc.) — the rest of a
    // first read is the site's menu and footer, which is noise in a news list.
    if (p.get("all") !== "1") q = q.eq("baseline", false);
    else q = q.or("baseline.eq.false,item_url.ilike.*.pdf*,item_url.ilike.*.doc*,item_url.ilike.*.xls*");
    const g = p.get("group");
    if (g === "UG" || g === "PG") q = q.in("grp", [g, "UG & PG"]);
    else if (g) q = q.eq("grp", g);
    if (p.get("watcher")) q = q.eq("watcher_id", p.get("watcher")!);
    const days = Number(p.get("days") || 0);
    if (days > 0) q = q.gte("detected_at", new Date(Date.now() - days * 86_400_000).toISOString());
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // posted_at: the notice's own date when it carries one (see noticeDate), else
    // when we found it. Newest first — the page groups by day from this.
    const items = ((data || []) as { title: string | null; item_url: string; detected_at: string }[])
      .map((i) => ({ ...i, posted_at: noticeDate(i.title, i.item_url) }))
      .sort((a, b) => Date.parse(b.posted_at || b.detected_at) - Date.parse(a.posted_at || a.detected_at));
    return NextResponse.json({ items });
  } catch (err) { return NextResponse.json(safeError(err, "Couldn't load notices"), { status: 502 }); }
}
