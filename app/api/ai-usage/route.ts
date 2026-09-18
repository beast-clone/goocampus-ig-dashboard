import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// GET /api/ai-usage → Perplexity spend from the ai_usage log (sql/012_ai_usage.sql).
//   { budget, today, week, month, byFeature, byPerson, recentErrors, notReady? }
// Totals are in US dollars as Perplexity reports them. Periods use India time,
// since that's the team's working day. Budget: AI_MONTHLY_BUDGET_USD, default $10.
export const dynamic = "force-dynamic";

type Row = { created_at: string; feature: string; actor: string | null; cost_usd: number | string | null; ok: boolean; error: string | null; model: string | null };
type Bucket = { calls: number; cost: number; errors: number };

const IST = 5.5 * 3_600_000;
// Start of the current IST day / week (Monday) / month, as UTC ISO strings.
function istStarts(now = new Date()) {
  const ist = new Date(now.getTime() + IST);
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST;
  const week = day - ((ist.getUTCDay() + 6) % 7) * 86_400_000;
  const month = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST;
  return { day, week, month };
}

export async function GET() {
  const denied = await requireSection("system");
  if (denied) return denied;
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const budget = Number(process.env.AI_MONTHLY_BUDGET_USD) || 10;
    const { day, week, month } = istStarts();
    const since = new Date(Math.min(week, month)).toISOString();

    const { data, error } = await sb.from("ai_usage")
      .select("created_at, feature, actor, cost_usd, ok, error, model")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(20_000);
    if (error) {
      if (/ai_usage|schema cache|does not exist/i.test(error.message)) {
        return NextResponse.json({ notReady: true, budget, error: "Usage tracking isn't set up yet — run sql/012_ai_usage.sql in the Supabase SQL editor." });
      }
      throw new Error(error.message);
    }

    const empty = (): Bucket => ({ calls: 0, cost: 0, errors: 0 });
    const add = (b: Bucket, r: Row) => { b.calls += 1; b.cost += Number(r.cost_usd) || 0; if (!r.ok) b.errors += 1; };
    const today = empty(), wk = empty(), mo = empty();
    const byFeature = new Map<string, Bucket>(), byPerson = new Map<string, Bucket>();
    for (const r of (data || []) as Row[]) {
      const t = Date.parse(r.created_at);
      if (t >= day) add(today, r);
      if (t >= week) add(wk, r);
      if (t >= month) {
        add(mo, r);
        if (!byFeature.has(r.feature)) byFeature.set(r.feature, empty());
        add(byFeature.get(r.feature)!, r);
        const who = r.actor || "background";
        if (!byPerson.has(who)) byPerson.set(who, empty());
        add(byPerson.get(who)!, r);
      }
    }
    const list = (m: Map<string, Bucket>) => [...m].map(([key, b]) => ({ key, ...b })).sort((a, b) => b.cost - a.cost || b.calls - a.calls);
    const recentErrors = ((data || []) as Row[]).filter((r) => !r.ok).slice(0, 5)
      .map((r) => ({ at: r.created_at, feature: r.feature, error: r.error }));

    return NextResponse.json({ budget, today, week: wk, month: mo, byFeature: list(byFeature), byPerson: list(byPerson), recentErrors });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load AI usage"), { status: 502 });
  }
}
