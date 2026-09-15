import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getAdAccount, fetchCampaigns } from "@/lib/meta-ads";
import { askPerplexityJSON, hasAI } from "@/lib/ai";
import { guardRate, requireSection } from "@/lib/api-guard";

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
  const __denied = await requireSection("ads");
  if (__denied) return __denied;

  const limited = guardRate(req, "ads-analyst", 15, 300_000);
  if (limited) return limited;
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const force = url.searchParams.get("force") === "1";
    // Optional: narrow the whole analysis to one campaign, for the panel beside
    // the live list. Empty means the account-wide view, exactly as before.
    const campaignFilter = (url.searchParams.get("campaign") || "").trim();
    if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

    const key = `${from}|${to}|${campaignFilter}`;
    const hit = CACHE.get(key);
    if (!force && hit && Date.now() - hit.at < TTL) return NextResponse.json({ ...(hit.payload as object), cached: true });

    const acct = await getAdAccount();
    if (!acct) return NextResponse.json({ error: "No ad account connected" }, { status: 200 });
    const campaigns = (await fetchCampaigns(acct, from, to)).filter((c) => c.spend > 0);
    if (campaigns.length === 0) return NextResponse.json({ error: "No spend in this window" }, { status: 200 });

    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
    // Window totals stay honest: money spent by a campaign that has since been
    // switched off was still really spent, and belongs in "you spent X".
    const spend = campaigns.reduce((s, c) => s + c.spend, 0);
    const leads = campaigns.reduce((s, c) => s + c.leads, 0);
    const avgCPL = leads > 0 ? spend / leads : 0;

    // ...but every piece of ADVICE below is restricted to campaigns still switched
    // on. A stopped campaign cannot be fixed, paused or rebudgeted — there is
    // nothing left to act on — so flagging it is pure noise. This is exactly what
    // made the analyst lead with "Fix Gulf DHA Prometric": it spent inside the
    // window, was the most expensive thing in it, and had already been turned off.
    // Benchmarks are computed over the live set too, so "1.5x the average" compares
    // a running campaign against the other running campaigns, not against history.
    const live = campaigns.filter((c) => c.status === "ACTIVE");
    const stoppedCount = campaigns.length - live.length;
    const liveSpend = live.reduce((s, c) => s + c.spend, 0);
    const liveLeads = live.reduce((s, c) => s + c.leads, 0);
    const avgCPL_live = liveLeads > 0 ? liveSpend / liveLeads : 0;
    const avgCPM = live.length ? live.reduce((s, c) => s + c.cpm, 0) / live.length : 0;
    const withLeads = live.filter((c) => c.leads > 0);

    // Nothing running: say so plainly instead of falling through to "All clear",
    // which would read as "your ads are healthy" when in fact none are on.
    if (live.length === 0) {
      const payload = {
        window: { from, to }, generatedAt: new Date().toISOString(),
        totals: { spend: Math.round(spend), campaigns: campaigns.length, leads, avgCPL: Math.round(avgCPL), days },
        stoppedCount, liveCount: 0, best: null, worst: null,
        diagnostics: [{ key: "none", label: "Nothing running", status: "warn" as const,
          evidence: `All ${campaigns.length} campaigns that spent in this window are now switched off.`,
          fix: "Switch a campaign back on, or create a new one, before there is anything to advise on.", campaigns: [] }],
        table: [], aiUsed: false, cached: false,
        summary: { verdict: `${inr(spend)} was spent in this window and brought in ${num(leads)} leads, but no campaign is running right now — so there is nothing to change today.`, recommendations: [] },
      };
      CACHE.set(key, { at: Date.now(), payload });
      return NextResponse.json(payload);
    }
    const best = withLeads.slice().sort((a, b) => a.costPerLead - b.costPerLead)[0] || null;
    const worst = withLeads.slice().sort((a, b) => b.costPerLead - a.costPerLead)[0] || null;

    // ---------- Deterministic diagnostics (each a fixed threshold on real data) ----------
    const diagnostics: Diag[] = [];
    const fatigued = live.filter((c) => c.frequency > 3.5);
    if (fatigued.length)
      diagnostics.push({ key: "fatigue", label: "Ad fatigue", status: fatigued.some((c) => c.frequency > 5) ? "crit" : "warn",
        evidence: fatigued.map((c) => `${c.campaign_name} (freq ${c.frequency.toFixed(1)})`).join("; "),
        fix: "Change the picture or video, or show it to new people — they’re seeing it too often.", campaigns: fatigued.map((c) => c.campaign_name) });

    const pricey = withLeads.filter((c) => avgCPL_live > 0 && c.costPerLead > avgCPL_live * 1.5);
    if (pricey.length)
      diagnostics.push({ key: "cpl", label: "High cost per lead", status: "crit",
        evidence: pricey.map((c) => `${c.campaign_name} ${inr(c.costPerLead)} vs live avg ${inr(avgCPL_live)}`).join("; "),
        fix: "Move budget to your cheaper campaigns, or narrow who these ads target.", campaigns: pricey.map((c) => c.campaign_name) });

    const learning = live.filter((c) => c.leads > 0 && c.leads < 50);
    if (learning.length)
      diagnostics.push({ key: "learning", label: "Learning phase", status: "warn",
        evidence: learning.map((c) => `${c.campaign_name} (${c.leads}/50 conversions)`).join("; "),
        fix: "Don’t change it for about 2 days — it’s still learning who to show it to.", campaigns: learning.map((c) => c.campaign_name) });

    // Pace against the days the campaign was actually live inside this window, not the
    // window itself — dividing by the full 30 or 90 days made anything launched partway
    // through look starved, and the advice attached to it is "raise the bid". Paused
    // campaigns are excluded for the same reason: they under-spend because they're off.
    const liveDays = (c: (typeof campaigns)[number]) => {
      const started = c.start_time ? c.start_time.slice(0, 10) : from;
      const begin = started > from ? started : from;
      if (begin > to) return 0;
      return Math.max(1, Math.round((new Date(to).getTime() - new Date(begin).getTime()) / 86_400_000) + 1);
    };
    const perDay = (c: (typeof campaigns)[number]) => (liveDays(c) > 0 ? c.spend / liveDays(c) : 0);
    const underPacing = live.filter(
      (c) => c.daily_budget > 0 && liveDays(c) > 0 && perDay(c) < c.daily_budget * 0.75,
    );
    if (underPacing.length)
      diagnostics.push({ key: "pacing", label: "Budget under-pacing", status: "warn",
        evidence: underPacing.map((c) => `${c.campaign_name} avg ${inr(perDay(c))}/day of ${inr(c.daily_budget)} over ${liveDays(c)} live day${liveDays(c) === 1 ? "" : "s"}`).join("; "),
        fix: "Raise the bid or widen the audience so it spends its full budget and reaches more people.", campaigns: underPacing.map((c) => c.campaign_name) });

    const lowCtr = live.filter((c) => c.ctr > 0 && c.ctr < 1.0);
    if (lowCtr.length)
      diagnostics.push({ key: "ctr", label: "Low click-through", status: "warn",
        evidence: lowCtr.map((c) => `${c.campaign_name} CTR ${c.ctr.toFixed(2)}%`).join("; "),
        fix: "Test a stronger picture or opening line so more people click.", campaigns: lowCtr.map((c) => c.campaign_name) });

    const cpmOut = live.filter((c) => avgCPM > 0 && c.cpm > avgCPM * 1.5);
    if (cpmOut.length)
      diagnostics.push({ key: "cpm", label: "High CPM", status: "warn",
        evidence: cpmOut.map((c) => `${c.campaign_name} CPM ${inr(c.cpm)} vs avg ${inr(avgCPM)}`).join("; "),
        fix: "Check whether two ads are chasing the same people, or try a slightly different audience.", campaigns: cpmOut.map((c) => c.campaign_name) });

    if (!diagnostics.length)
      diagnostics.push({ key: "ok", label: "All clear", status: "good", evidence: `No fatigue, cost-per-lead, pacing, click-through or CPM issues among the ${live.length} campaign${live.length === 1 ? "" : "s"} still running.`, fix: "", campaigns: [] });

    // ---------- One campaign, for the panel beside the live list ----------
    // Reuses the diagnostics already computed above rather than a second set of
    // thresholds, so the flags on a campaign always agree with the flags on the
    // account. Only campaigns that are still running can be selected.
    if (campaignFilter) {
      const c = live.find((x) => x.campaign_name === campaignFilter);
      if (!c) {
        const payload = { window: { from, to }, generatedAt: new Date().toISOString(), campaign: campaignFilter,
          notRunning: true, diagnostics: [], aiUsed: false, cached: false,
          summary: { verdict: `“${campaignFilter}” isn’t running right now, so there’s nothing to change on it today.`, recommendations: [] } };
        CACHE.set(key, { at: Date.now(), payload });
        return NextResponse.json(payload);
      }
      const mine = diagnostics.filter((d) => d.campaigns.includes(c.campaign_name));
      const vsAvg = avgCPL_live > 0 && c.costPerLead > 0 ? Math.round(((c.costPerLead - avgCPL_live) / avgCPL_live) * 100) : null;
      const stats = {
        spend: Math.round(c.spend), leads: c.leads, cpl: Math.round(c.costPerLead),
        vsAvgPct: vsAvg, liveAvgCPL: Math.round(avgCPL_live),
        frequency: +c.frequency.toFixed(1), ctr: +c.ctr.toFixed(2), cpm: Math.round(c.cpm),
      };

      let fsum: { verdict: string; recommendations: { title: string; detail: string }[] } | null = null;
      let fAi = false;
      if (hasAI()) {
        fsum = await askPerplexityJSON<{ verdict: string; recommendations: { title: string; detail: string }[] }>(
          `You are explaining ONE Meta ads campaign to someone who has never run ads. Use ONLY the facts given — never invent a number. Everyday words, no jargon without a plain explanation. Return JSON with:
- "verdict": 1–2 plain sentences on how this ONE campaign is doing and whether it is good or bad value compared with the other running campaigns.
- "recommendations": 2 or 3 items, each {"title": the action in max 8 plain words, "detail": 1–2 sentences saying why (what the number means) and what to do}. Every item must be about THIS campaign only.`,
          `Campaign: ${c.campaign_name}\nFacts: ${JSON.stringify(stats)}\nProblems flagged: ${JSON.stringify(mine.map((d) => ({ label: d.label, evidence: d.evidence })))}`,
          { model: "sonar", timeoutMs: 20_000 },
        ).catch(() => null);
        if (fsum?.verdict && Array.isArray(fsum.recommendations) && fsum.recommendations.filter((r) => r?.title && r?.detail).length >= 2) {
          fsum.recommendations = fsum.recommendations.filter((r) => r?.title && r?.detail).slice(0, 3);
          fAi = true;
        } else fsum = null;
      }
      if (!fsum) {
        const recs = mine.slice(0, 3).map((d) => ({ title: d.label, detail: `${d.fix} (${d.evidence})` }));
        if (!recs.length) recs.push({ title: "Nothing to fix here", detail: `This campaign isn’t tripping any of the checks — it costs ${inr(c.costPerLead)} per lead against a live average of ${inr(avgCPL_live)}.` });
        fsum = {
          verdict: `${c.campaign_name} spent ${inr(c.spend)} and brought in ${num(c.leads)} leads — about ${inr(c.costPerLead)} each, against a ${inr(avgCPL_live)} average across everything still running.`,
          recommendations: recs,
        };
      }

      const payload = { window: { from, to }, generatedAt: new Date().toISOString(), campaign: c.campaign_name,
        stats, diagnostics: mine, summary: fsum, aiUsed: fAi, cached: false };
      CACHE.set(key, { at: Date.now(), payload });
      return NextResponse.json(payload);
    }

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
    type Rec = { title: string; detail: string };
    let summary: { verdict: string; recommendations: Rec[] } | null = null;
    let aiUsed = false;
    if (hasAI()) {
      const facts = {
        spend: totals.spend, campaigns: totals.campaigns, leads, avgCPL: totals.avgCPL,
        stillRunning: live.length, alreadyStopped: stoppedCount,
        spendOfRunningOnes: Math.round(liveSpend), leadsFromRunningOnes: liveLeads,
        avgCPLOfRunningOnes: Math.round(avgCPL_live),
        best: best && { name: best.campaign_name, cpl: Math.round(best.costPerLead) },
        worst: worst && { name: worst.campaign_name, cpl: Math.round(worst.costPerLead) },
        diagnostics: diagnostics.map((d) => ({ label: d.label, status: d.status, evidence: d.evidence })),
      };
      summary = await askPerplexityJSON<{ verdict: string; recommendations: Rec[] }>(
        `You are explaining Meta (Facebook/Instagram) ads to someone who has NEVER run ads and doesn't know any jargon. Use ONLY the facts given — never invent numbers. Write for a total beginner: no acronyms without a plain explanation, everyday words, friendly and clear. Return a JSON object with:
- "verdict": 1–2 plain sentences: how much was spent, how many leads (people who shared contact details) that got, roughly the cost per lead in rupees, and the single biggest thing to fix — explained simply.
- "recommendations": exactly 3 items, each an object with "title" (the action in max 8 plain words, naming the real campaign). EVERY recommendation must be about a campaign that is still running — the facts only list those. Never suggest changing, pausing or rebuilding something already switched off. and "detail" (1–2 sentences explaining WHY in beginner words — what the number means — and WHAT to do). No bare metrics like "CPL" or "frequency 3.6" without explaining them.`,
        `Facts: ${JSON.stringify(facts)}`,
        { model: "sonar", timeoutMs: 20_000 },
      ).catch(() => null);
      if (summary?.verdict && Array.isArray(summary.recommendations) && summary.recommendations.filter((r) => r?.title && r?.detail).length >= 2) {
        summary.recommendations = summary.recommendations.filter((r) => r?.title && r?.detail).slice(0, 3);
        aiUsed = true;
      } else summary = null;
    }
    if (!summary || !summary.verdict) {
      // Deterministic fallback — always correct, beginner-friendly, never blocks the demo.
      const topIssue = diagnostics.find((d) => d.status === "crit") || diagnostics[0];
      const recs: Rec[] = [];
      if (best && worst && best.campaign_name !== worst.campaign_name)
        recs.push({ title: `Move budget to your cheaper campaign`,
          detail: `“${worst.campaign_name}” pays ${inr(worst.costPerLead)} for each lead — very expensive. “${best.campaign_name}” gets a lead for just ${inr(best.costPerLead)}. Shifting spend there means the same money brings far more leads.` });
      if (fatigued[0]) recs.push({ title: `Refresh the creative on “${fatigued[0].campaign_name}”`,
        detail: `People have already seen this ad about ${Math.round(fatigued[0].frequency)} times and are starting to ignore it, so it's slowly wasting money. Swap in a new picture or video, or show it to new people.` });
      if (learning[0]) recs.push({ title: `Leave “${learning[0].campaign_name}” alone for ~2 days`,
        detail: `It's still new and Facebook is figuring out who to show it to. Editing it now makes it start over and delays your results.` });
      while (recs.length < 3) recs.push({ title: `Start with the red flags below`,
        detail: `The coloured flags under this summary are ranked by cost. The red ones are losing you the most money — fix those first.` });
      summary = {
        verdict: `You spent ${inr(spend)} across ${totals.campaigns} ad campaigns and got ${num(leads)} leads — that's about ${inr(avgCPL)} to get one person's contact details.${stoppedCount > 0 ? ` ${stoppedCount} of those ${stoppedCount === 1 ? "has" : "have"} since been switched off, so the advice below covers only the ${live.length} still running.` : ""} The main thing to fix: ${PLAIN_ISSUE[topIssue.key] || topIssue.label.toLowerCase()}.`,
        recommendations: recs.slice(0, 3),
      };
    }

    const payload = { window: { from, to }, generatedAt: new Date().toISOString(), totals,
      liveCount: live.length, stoppedCount,
      best: best && { name: best.campaign_name, cpl: Math.round(best.costPerLead) },
      worst: worst && { name: worst.campaign_name, cpl: Math.round(worst.costPerLead) },
      diagnostics, table, summary, aiUsed, cached: false };
    CACHE.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Ads analyst failed"), { status: 502 });
  }
}
