import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { recordApiCall, callsThisMonth } from "@/lib/api-usage";
import { safeError } from "@/lib/errors";

// Competitor mentions via Serper (Google Search) — unlike Google News RSS, this returns
// a REAL snippet + a DIRECT link per result, so the in-dashboard preview can show what
// each mention is about. Quoted name → relevant results. Respects the shared Serper cap.
//   GET /api/benchmark/mentions?names=Hello Mentor,Academically Global
export const dynamic = "force-dynamic";
const BUDGET = Number(process.env.SERPER_MONTHLY_BUDGET) || 200;
const POS = /\b(best|top|great|excellent|success|trusted|recommend|helped?|amazing|award|100%|leading|genuine|reliable)\b/i;
const NEG = /\b(scam|fraud|fake|worst|avoid|complaint|refund|cheat|poor|warning|lawsuit|misuse|theft|waste|disappoint)\b/i;
const sentiment = (t: string): "positive" | "negative" | "neutral" => (NEG.test(t) ? "negative" : POS.test(t) ? "positive" : "neutral");
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export async function GET(req: Request) {
  try {
    const key = process.env.SERPER_API_KEY;
    if (!key) return NextResponse.json({ mentions: [], error: "No Serper key" });
    const names = (new URL(req.url).searchParams.get("names") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
    if (!names.length) return NextResponse.json({ mentions: [] });
    if (callsThisMonth("Serper") >= BUDGET) return NextResponse.json({ mentions: [], capped: true });

    type Item = { title: string; url: string; snippet: string; source: string; platform: string; publishedAt: string; sentiment: string; about: string };
    const byName: Item[][] = [];
    for (const name of names) {
      const r = await fetchWithTimeout("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `"${name}"`, gl: "in", num: 10 }),
        timeoutMs: 12_000, cache: "no-store",
      });
      recordApiCall("Serper", r.ok, r.status);
      if (!r.ok) { byName.push([]); continue; }
      const j = (await r.json()) as { organic?: { title?: string; link?: string; snippet?: string; date?: string }[] };
      byName.push((j.organic || []).filter((o) => o.link && o.title).map((o) => ({
        title: o.title!, url: o.link!, snippet: o.snippet || "", source: host(o.link!), platform: host(o.link!),
        publishedAt: o.date || "", sentiment: sentiment(`${o.title} ${o.snippet || ""}`), about: name,
      })));
    }
    // Round-robin so every competitor is represented, not just the first.
    const seen = new Set<string>();
    const mentions: Item[] = [];
    for (let i = 0; i < 10 && mentions.length < 12; i++) {
      for (const list of byName) {
        const m = list[i];
        if (m && !seen.has(m.url)) { seen.add(m.url); mentions.push(m); }
      }
    }
    return NextResponse.json({ mentions });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load mentions"), { status: 502 });
  }
}
