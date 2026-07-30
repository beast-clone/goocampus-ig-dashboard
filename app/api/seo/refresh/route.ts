import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { serperRank } from "@/lib/seo";
import { safeError } from "@/lib/errors";

// POST /api/seo/refresh
// Re-checks every tracked keyword's live Google rank (via Serper) and writes a fresh
// snapshot, building the movement history. Also runnable on a daily cron. Free (Serper).
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data: kws, error } = await sb.from("seo_keywords").select("id, keyword");
    if (error) throw new Error(error.message);
    let checked = 0;
    const rows: { keyword_id: string; position: number | null }[] = [];
    // Sequential — kind to the free Serper tier and its rate limit.
    for (const k of kws || []) {
      const report = await serperRank(k.keyword);
      rows.push({ keyword_id: k.id, position: report.bestPosition });
      checked++;
    }
    if (rows.length) await sb.from("seo_rank_snapshots").insert(rows);
    return NextResponse.json({ ok: true, checked });
  } catch (err) {
    return NextResponse.json(safeError(err, "Rank refresh failed"), { status: 502 });
  }
}
