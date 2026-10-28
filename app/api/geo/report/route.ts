import { NextResponse } from "next/server";
import { geoGuard, geoDb } from "../_shared";
import { safeError } from "@/lib/errors";

// GET /api/geo/report?from=YYYY-MM-DD&to=YYYY-MM-DD&brand=<id>&engine=<engine>[&format=csv]
// → one row per answer in the period (question, AI, named us?, spot, who else, sources),
// plus totals and what changed against the previous answer to the same question.
export const dynamic = "force-dynamic";
const ENGINE_LABEL: Record<string, string> = { chatgpt: "ChatGPT", google: "Google AI", gemini: "Gemini", perplexity: "Perplexity" };

export async function GET(req: Request) {
  const denied = await geoGuard();
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);
  const from = sp.get("from") || new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  try {
    let q = geoDb().from("geo_answers")
      .select("question_id, engine, status, named, cited, position, competitors, sources, cost, created_at, error, geo_questions(question, topic), geo_brands(name)")
      .gte("created_at", `${from}T00:00:00+05:30`).lte("created_at", `${to}T23:59:59+05:30`).order("created_at", { ascending: false }).limit(5000);
    if (sp.get("brand")) q = q.eq("brand_id", sp.get("brand")!);
    if (sp.get("engine")) q = q.eq("engine", sp.get("engine")!);
    const { data, error } = await q;
    if (error) throw error;
    // The answer before each one (same question + AI), for "gained / lost".
    const qids = Array.from(new Set((data || []).map((r) => r.question_id)));
    const { data: prev } = qids.length ? await geoDb().from("geo_answers").select("question_id, engine, named, created_at").in("question_id", qids).eq("status", "done").lt("created_at", `${from}T00:00:00+05:30`).order("created_at", { ascending: false }).limit(5000) : { data: [] };
    const before = new Map<string, boolean | null>();
    for (const p of prev || []) { const k = `${p.question_id}|${p.engine}`; if (!before.has(k)) before.set(k, p.named); }
    type Row = { question_id: string; engine: string; status: string; named: boolean | null; cited: boolean | null; position: number | null; competitors: string[]; sources: { domain: string }[]; cost: number; created_at: string; error: string | null; geo_questions: { question: string; topic: string } | null; geo_brands: { name: string } | null };
    const rows = ((data || []) as unknown as Row[]).map((r) => {
      const b = before.get(`${r.question_id}|${r.engine}`);
      const change = r.status !== "done" || b === undefined || b === null ? "" : b && !r.named ? "Lost" : !b && r.named ? "Gained" : "";
      return { date: r.created_at, brand: r.geo_brands?.name || "", topic: r.geo_questions?.topic || "", question: r.geo_questions?.question || "", ai: ENGINE_LABEL[r.engine] || r.engine,
        status: r.status, named: r.named, cited: r.cited, position: r.position, others: r.competitors || [], sources: (r.sources || []).map((s) => s.domain).slice(0, 6), change, cost: Number(r.cost || 0), error: r.error };
    });
    const done = rows.filter((r) => r.status === "done");
    const others: Record<string, number> = {};
    for (const r of done) for (const o of r.others) others[o] = (others[o] || 0) + 1;
    const summary = {
      from, to, answers: done.length, named: done.filter((r) => r.named).length, cost: rows.reduce((s, r) => s + r.cost, 0),
      questions: new Set(rows.map((r) => r.question)).size, gained: rows.filter((r) => r.change === "Gained").length, lost: rows.filter((r) => r.change === "Lost").length,
      topOthers: Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
    if (sp.get("format") === "csv") {
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head = ["Date", "Brand", "Topic", "Question", "AI", "Named us", "Our spot", "Named instead", "Sources", "Change", "Cost (USD)"];
      const body = rows.map((r) => [new Date(r.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), r.brand, r.topic, r.question, r.ai,
        r.status !== "done" ? (r.status === "failed" ? "Failed" : "Waiting") : r.named ? "Yes" : "No", r.position ?? "", r.others.join("; "), r.sources.join("; "), r.change, r.cost.toFixed(4)].map(esc).join(","));
      return new NextResponse([head.map(esc).join(","), ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="geo-seo-${from}-to-${to}.csv"` } });
    }
    return NextResponse.json({ summary, rows });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't build the report"), { status: 500 });
  }
}
