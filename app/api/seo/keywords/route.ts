import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { serperRank } from "@/lib/seo";
import { safeError } from "@/lib/errors";

// Tracked-keyword list for the SEO rank tracker (Supabase seo_keywords + seo_rank_snapshots).
// GET    → list with each keyword's latest rank + recent history (for the sparkline)
// POST   { keyword } → add it, run one live check now so it shows a position immediately
// DELETE ?id=<uuid>  → remove it (snapshots cascade)
export const dynamic = "force-dynamic";

type Snap = { keyword_id: string; position: number | null; checked_at: string };

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data: kws, error } = await sb.from("seo_keywords").select("id, keyword, domain, created_at").order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (kws || []).map((k) => k.id);
    const byKw = new Map<string, { position: number | null; checkedAt: string }[]>();
    if (ids.length) {
      const { data: snaps } = await sb.from("seo_rank_snapshots").select("keyword_id, position, checked_at").in("keyword_id", ids).order("checked_at", { ascending: false }).limit(2000);
      for (const s of (snaps as Snap[] | null) || []) {
        const arr = byKw.get(s.keyword_id) || [];
        arr.push({ position: s.position, checkedAt: s.checked_at });
        byKw.set(s.keyword_id, arr);
      }
    }
    const keywords = (kws || []).map((k) => {
      const hist = (byKw.get(k.id) || []).slice(0, 30);       // newest first
      return {
        id: k.id, keyword: k.keyword, domain: k.domain,
        latest: hist[0] || null,
        previous: hist[1] || null,
        history: [...hist].reverse(),                          // oldest→newest for the sparkline
      };
    });
    return NextResponse.json({ keywords });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load tracked keywords"), { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keyword?: string; domain?: string };
    const keyword = (body.keyword || "").trim();
    if (!keyword) return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    const domain = (body.domain || "goocampusevents.com").trim();
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { data: row, error } = await sb.from("seo_keywords")
      .upsert({ keyword, domain }, { onConflict: "keyword,domain" })
      .select("id, keyword, domain")
      .single();
    if (error) throw new Error(error.message);

    // Run one live check now so the keyword shows a rank immediately.
    const report = await serperRank(keyword);
    await sb.from("seo_rank_snapshots").insert({ keyword_id: row.id, position: report.bestPosition });
    return NextResponse.json({ id: row.id, keyword: row.keyword, domain: row.domain, position: report.bestPosition });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to add keyword"), { status: 502 });
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("seo_keywords").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to remove keyword"), { status: 502 });
  }
}
