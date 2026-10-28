import { NextResponse } from "next/server";
import { geoGuard, geoDb } from "./_shared";
import { monthSpend, monthlyLimit, COST_PER_QUESTION } from "@/lib/geo";
import { hasDataForSeo } from "@/lib/dataforseo";
import { safeError } from "@/lib/errors";
import { getSessionIsAdmin } from "@/lib/auth";

// GET /api/geo → brands, questions with their latest answer per AI, recent checks,
// this month's spend and limit. One call feeds the whole GEO SEO tab.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await geoGuard();
  if (denied) return denied;
  try {
    const db = geoDb();
    const [{ data: brands }, { data: questions }, { data: runs }, spent, limit] = await Promise.all([
      db.from("geo_brands").select("id, name, domain, aliases").order("position"),
      db.from("geo_questions").select("id, brand_id, topic, question, kind, source, paused, added_by, created_at").is("deleted_at", null).order("created_at"),
      db.from("geo_runs").select("*").order("started_at", { ascending: false }).limit(40),
      monthSpend(), monthlyLimit(),
    ]);
    const ids = (questions || []).map((q) => q.id);
    // Latest finished answer per question × AI, plus how many times each was asked.
    const latest: Record<string, Record<string, { named: boolean | null; position: number | null; competitors: string[]; status: string; at: string }>> = {};
    const asked: Record<string, number> = {};
    if (ids.length) {
      const { data: ans } = await db.from("geo_answers").select("question_id, engine, status, named, position, competitors, created_at, run_id")
        .in("question_id", ids).order("created_at", { ascending: false }).limit(5000);
      const runsSeen: Record<string, Set<string>> = {};
      for (const a of ans || []) {
        (runsSeen[a.question_id] ||= new Set()).add(a.run_id);
        // Newest finished answer per AI; a newer one still waiting or failed doesn't hide it.
        const q = (latest[a.question_id] ||= {});
        const cur = q[a.engine];
        if (!cur || (cur.status !== "done" && a.status === "done"))
          q[a.engine] = { named: a.named, position: a.position, competitors: a.competitors || [], status: a.status, at: a.created_at };
      }
      for (const [k, v] of Object.entries(runsSeen)) asked[k] = v.size;
    }
    const running = (runs || []).filter((r) => r.status === "running");
    let runCounts: Record<string, { done: number; failed: number; pending: number; named: number; cost: number }> = {};
    if (runs?.length) {
      const { data: rc } = await db.from("geo_answers").select("run_id, status, named, cost").in("run_id", runs.map((r) => r.id));
      runCounts = {};
      for (const a of rc || []) {
        const c = (runCounts[a.run_id] ||= { done: 0, failed: 0, pending: 0, named: 0, cost: 0 });
        c[a.status as "done" | "failed" | "pending"]++; if (a.named) c.named++; c.cost += Number(a.cost || 0);
      }
    }
    return NextResponse.json({
      connected: hasDataForSeo(), canEditLimit: getSessionIsAdmin(),
      brands: brands || [], questions: (questions || []).map((q) => ({ ...q, latest: latest[q.id] || {}, asked: asked[q.id] || 0 })),
      runs: (runs || []).map((r) => ({ ...r, counts: runCounts[r.id] || null })), running: running.length,
      spent, limit, costPerQuestion: COST_PER_QUESTION,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load GEO SEO"), { status: 500 });
  }
}
