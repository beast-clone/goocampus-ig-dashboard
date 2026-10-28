import { NextResponse } from "next/server";
import { geoGuard, geoDb } from "../_shared";
import { dfsAccount } from "@/lib/dataforseo";
import { monthSpend, monthlyLimit } from "@/lib/geo";
import { safeError } from "@/lib/errors";

// GET /api/geo/usage → the DataForSEO account (balance, total added, today) and
// GEO spend: this month, per week, per AI, per brand, and on finding questions.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await geoGuard();
  if (denied) return denied;
  try {
    const db = geoDb();
    const since = new Date(Date.now() - 12 * 7 * 86400_000).toISOString();
    const [account, spent, limit, { data: ans }, { data: topics }, { data: brands }] = await Promise.all([
      dfsAccount().catch((e) => ({ error: String(e?.message || e) })),
      monthSpend(), monthlyLimit(),
      db.from("geo_answers").select("engine, brand_id, cost, created_at").gte("created_at", since).limit(20000),
      db.from("geo_topics").select("topic, cost, created_at, created_by").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      db.from("geo_brands").select("id, name"),
    ]);
    const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
    const weekOf = (iso: string) => { const d = new Date(iso); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const byWeek: Record<string, number> = {}, byEngine: Record<string, number> = {}, byBrand: Record<string, number> = {};
    const name = new Map((brands || []).map((b) => [b.id, b.name]));
    for (const a of ans || []) {
      const c = Number(a.cost || 0);
      byWeek[weekOf(a.created_at)] = (byWeek[weekOf(a.created_at)] || 0) + c;
      if (new Date(a.created_at) >= month) {
        byEngine[a.engine] = (byEngine[a.engine] || 0) + c;
        const n = name.get(a.brand_id) || "—"; byBrand[n] = (byBrand[n] || 0) + c;
      }
    }
    let topicsMonth = 0;
    for (const t of topics || []) { byWeek[weekOf(t.created_at)] = (byWeek[weekOf(t.created_at)] || 0) + Number(t.cost || 0); if (new Date(t.created_at) >= month) topicsMonth += Number(t.cost || 0); }
    return NextResponse.json({
      account, spent, limit, byEngine, byBrand, topicsMonth,
      weeks: Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([week, cost]) => ({ week, cost })),
      topics: topics || [],
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load usage"), { status: 500 });
  }
}
