import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getAdAccount, fetchCampaigns } from "@/lib/meta-ads";
import { askPerplexityJSON, hasAI } from "@/lib/ai";

// GET /api/ads/analyst?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// The AI Ads Analyst. Diagnostics are DETERMINISTIC (rule-based on live Meta
// numbers) — never guessed — so a flag is mathematically true or absent. The
// AI (Perplexity) only phrases the verdict + recommendations ON TOP of those
// numbers; a deterministic fallback runs if AI is unavailable. Cached 6h.
export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");

// The single biggest issue, said in plain words a beginner understands.
const PLAIN_ISSUE: Record<string, string> = {
  cpl: "a few campaigns are paying far too much for each lead",
  fatigue: "some ads are being shown to the same people too often",
  pacing: "some ads aren't spending their full budget, so they reach fewer people",
  ctr: "some ads aren't getting enough clicks",
  cpm: "it's getting expensive just to reach people",
  learning: "some new ads are still settling in",
  ok: "nothing major — things look healthy",
};

type Diag = { key: string; label: string; status: "good" | "warn" | "crit"; evidence: string; fix: string; campaigns: string[] };

const CACHE = new Map<string, { at: number; payload: unknown }>();
const TTL = 6 * 60 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const force = url.searchParams.get("force") === "1";
    if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

    const key = `${from}|${to}`;
    const hit = CACHE.get(key);
    if (!force && hit && Date.now() - hit.at < TTL) return NextResponse.json({ ...(hit.payload as object), cached: true });

    const acct = getAdAccount();
    if (!acct) return NextResponse.json({ error: "No ad account connected" }, { status: 200 });
    const campaigns = (await fetchCampaigns(acct, from, to)).filter((c) => c.spend > 0);
    if (campaigns.length === 0) return NextResponse.json({ error: "No spend in this window" }, { status: 200 });

    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
    const spend = campaigns.reduce((s, c) => s + c.spend, 0);
    const leads = campaigns.reduce((s, c) => s + c.leads, 0);
    const avgCPL = leads > 0 ? spend / leads : 0;
    const avgCPM = campaigns.reduce((s, c) => s + c.cpm, 0) / campaigns.length;
    const withLeads = campaigns.filter((c) => c.leads > 0);
    const best = withLeads.slice().sort((a, b) => a.costPerLead - b.costPerLead)[0] || null;
    const worst = withLeads.slice().sort((a, b) => b.costPerLead - a.costPerLead)[0] || null;

    // ---------- Deterministic diagnostics (each a fixed threshold on real data) ----------
    const diagnostics: Diag[] = [];
    const fatigued = campaigns.filter((c) => c.frequency > 3.5);
    if (fatigued.length)
      diagnostics.push({ key: "fatigue", label: "Ad fatigue", status: fatigued.some((c) => c.frequency > 5) ? "crit" : "warn",
        evidence: fatigued.map((c) => `${c.campaign_name} (freq ${c.frequency.toFixed(1)})`).join("; "),
        fix: "Change the picture or video, or show it to new people — they’re seeing it too often.", campaigns: fatigued.map((c) => c.campaign_name) });

    const pricey = withLeads.filter((c) => avgCPL > 0 && c.costPerLead > avgCPL * 1.5);
    if (pricey.length)
      diagnostics.push({ key: "cpl", label: "High cost per lead", status: "crit",
        evidence: pricey.map((c) => `${c.campaign_name} ${inr(c.costPerLead)} vs avg ${inr(avgCPL)}`).join("; "),
        fix: "Move budget to your cheaper campaigns, or narrow who these ads target.", campaigns: pricey.map((c) => c.campaign_name) });

    const learning = campaigns.filter((c) => c.status === "ACTIVE" && c.leads > 0 && c.leads < 50);
    if (learning.length)
      diagnostics.push({ key: "learning", label: "Learning phase", status: "warn",
        evidence: learning.map((c) => `${c.campaign_name} (${c.leads}/50 conversions)`).join("; "),
        fix: "Don’t change it for about 2 days — it’s still learning who to show it to.", campaigns: learning.map((c) => c.campaign_name) });

    const underPacing = campaigns.filter((c) => c.daily_budget > 0 && c.spend / days < c.daily_budget * 0.75);
    if (underPacing.length)
      diagnostics.push({ key: "pacing", label: "Budget under-pacing", status: "warn",
        evidence: underPacing.map((c) => `${c.campaign_name} avg ${inr(c.spend / days)}/day of ${inr(c.daily_budget)}`).join("; "),
        fix: "Raise the bid or widen the audience so it spends its full budget and reaches more people.", campaigns: underPacing.map((c) => c.campaign_name) });

    const lowCtr = campaigns.filter((c) => c.ctr > 0 && c.ctr < 1.0);
    if (lowCtr.length)
      diagnostics.push({ key: "ctr", label: "Low click-through", status: "warn",
        evidence: lowCtr.map((c) => `${c.campaign_name} CTR ${c.ctr.toFixed(2)}%`).join("; "),
        fix: "Test a stronger picture or opening line so more people click.", campaigns: lowCtr.map((c) => c.campaign_name) });

    const cpmOut = campaigns.filter((c) => avgCPM > 0 && c.cpm > avgCPM * 1.5);
    if (cpmOut.length)
      diagnostics.push({ key: "cpm", label: "High CPM", status: "warn",
        evidence: cpmOut.map((c) => `${c.campaign_name} CPM ${inr(c.cpm)} vs avg ${inr(avgCPM)}`).join("; "),
        fix: "Check whether two ads are chasing the same people, or try a slightly different audience.", campaigns: cpmOut.map((c) => c.campaign_name) });

    if (!diagnostics.length)
      diagnostics.push({ key: "ok", label: "All clear", status: "good", evidence: "No fatigue, CPL, pacing, CTR or CPM issues tripped.", fix: "", campaigns: [] });

    // ---------- Per-campaign efficiency table (for the full report) ----------
    const table = campaigns
      .slice()
      .sort((a, b) => b.spend - a.spend)
      .map((c) => ({
        name: c.campaign_name, spend: Math.round(c.spend), leads: c.leads,
        cpl: Math.round(c.costPerLead), vsAvg: avgCPL > 0 && c.leads > 0 ? Math.round(((c.costPerLead - avgCPL) / avgCPL) * 100) : null,
        frequency: +c.frequency.toFixed(1), ctr: +c.ctr.toFixed(2),
      }));

    const totals = { spend: Math.round(spend), campaigns: campaigns.length, leads, avgCPL: Math.round(avgCPL), days };

    // ---------- AI narrative (grounded on the numbers above) with a fallback ----------
    let summary: { verdict: string; recommendations: string[] } | null = null;
    let aiUsed = false;
    if (hasAI()) {
      const facts = {
        spend: totals.spend, campaigns: totals.campaigns, leads, avgCPL: totals.avgCPL,
        best: best && { name: best.campaign_name, cpl: Math.round(best.costPerLead) },
        worst: worst && { name: worst.campaign_name, cpl: Math.round(worst.costPerLead) },
        diagnostics: diagnostics.map((d) => ({ label: d.label, status: d.status, evidence: d.evidence })),
      };
      summary = await askPerplexityJSON<{ verdict: string; recommendations: string[] }>(
        `You are explaining Meta (Facebook/Instagram) ads to someone who has NEVER run ads and doesn't know any jargon. Use ONLY the facts given — never invent numbers. Write for a total beginner: no acronyms without a plain explanation, everyday words, friendly and clear. Return a JSON object with:
- "verdict": 1–2 plain sentences: how much was spent, how many leads (people who shared contact details) that got, roughly the cost per lead in rupees, and the single biggest thing to fix — explained simply.
- "recommendations": exactly 3 clear actions. Each names a real campaign and explains, in plain words, WHY (what the number means for a beginner), and WHAT to do. No bare metrics like "CPL" or "frequency 3.6" without explaining them.`,
        `Facts: ${JSON.stringify(facts)}`,
        { model: "sonar", timeoutMs: 20_000 },
      ).catch(() => null);
      if (summary?.verdict && Array.isArray(summary.recommendations) && summary.recommendations.length >= 2) aiUsed = true;
      else summary = null;
    }
    if (!summary || !summary.verdict) {
      // Deterministic fallback — always correct, beginner-friendly, never blocks the demo.
      const topIssue = diagnostics.find((d) => d.status === "crit") || diagnostics[0];
      const recs: string[] = [];
      if (best && worst && best.campaign_name !== worst.campaign_name)
        recs.push(`Move budget from “${worst.campaign_name}” — it pays ${inr(worst.costPerLead)} for each lead, which is very expensive — into “${best.campaign_name}”, which gets a lead for just ${inr(best.costPerLead)}. Same money, far more leads.`);
      if (fatigued[0]) recs.push(`Change the picture or video on “${fatigued[0].campaign_name}”. People have already seen it about ${Math.round(fatigued[0].frequency)} times and are starting to ignore it, so it's slowly wasting money.`);
      if (learning[0]) recs.push(`Leave “${learning[0].campaign_name}” alone for about 2 days. It's still new and Facebook is figuring out who to show it to — editing it now makes it start over.`);
      while (recs.length < 3) recs.push("Look at the coloured flags below and start with the red ones — those are the issues costing you the most money.");
      summary = {
        verdict: `You spent ${inr(spend)} across ${totals.campaigns} ad campaigns and got ${num(leads)} leads — that's about ${inr(avgCPL)} to get one person's contact details. The main thing to fix: ${PLAIN_ISSUE[topIssue.key] || topIssue.label.toLowerCase()}.`,
        recommendations: recs.slice(0, 3),
      };
    }

    const payload = { window: { from, to }, generatedAt: new Date().toISOString(), totals,
      best: best && { name: best.campaign_name, cpl: Math.round(best.costPerLead) },
      worst: worst && { name: worst.campaign_name, cpl: Math.round(worst.costPerLead) },
      diagnostics, table, summary, aiUsed, cached: false };
    CACHE.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Ads analyst failed"), { status: 502 });
  }
}
