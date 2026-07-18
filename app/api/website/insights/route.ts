import { NextResponse } from "next/server";
import { hasAI, askPerplexity } from "@/lib/ai";
import { buildGA4Traffic, hasGA4Auth } from "@/lib/ga4";
import { buildClarity, hasClarityAuth } from "@/lib/clarity";
import { buildBing, hasBingAuth } from "@/lib/bing";
import { cached } from "@/lib/api-cache";

// GET /api/website/insights?source=ga|clarity|bing&from=&to=
//
// Per-tool AI analysis for goocampusevents.com. Each source is analysed on its
// OWN — GA insights on the GA tab, Clarity on the Clarity tab, Bing on the Bing
// tab — so the reader gets focused advice for the tool they're looking at, not a
// mash-up. (The cross-channel view lives on the central AI Insights tab.)

const BIZ = "goocampusevents.com — GooCampus, an Indian medical-education company. The landing pages exist to capture leads: WhatsApp community joins and 1:1 counselling bookings. Most traffic comes from paid Meta (Instagram/Facebook) ads, not organic search.";

// The reader already SEES the numbers on their dashboard. The AI's whole value is
// telling them HOW to grow — tactics, methods, steps, strategy — not restating metrics.
const DIRECTIVE = `CRITICAL: The reader ALREADY sees every number on their dashboard. Do NOT describe or restate the metrics, and NEVER write filler like "you have X, but you need more" — that has zero value and wastes their time. Your ENTIRE job is to tell them HOW to grow it: specific tactics, the exact steps to execute each one, which tools/channels/formats to use, and the strategy + fundamentals behind it. Cite a number ONLY as the trigger for an action (e.g. "73% bounce → do A, then B, then C"). Every single bullet must be a concrete thing to DO, written so a marketer could execute it today without asking a follow-up question. Prefer depth on the 5-6 highest-leverage moves over a long shallow list.`;

const PROMPTS: Record<string, string> = {
  ga: `You are a senior growth-marketing / CRO strategist advising GooCampus. Site: ${BIZ}\n${DIRECTIVE}\nBased ONLY on this Google Analytics data, give a prioritized GROWTH PLAYBOOK to increase quality traffic and conversions — the methods, the how, the strategy. For each move name the exact tactic and the steps to run it (which page, which ad setting, which copy, which tool). Group under: "Do this week", "Get more (and better) traffic", "Turn traffic into leads", "Organic/SEO plays". Under ~340 words. End with the single highest-leverage move to start with, and why it's first.`,
  clarity: `You are a senior UX / CRO strategist advising GooCampus. Site: ${BIZ}\n${DIRECTIVE}\nBased ONLY on this Microsoft Clarity behaviour data (scroll depth, engagement time, and frustration signals — rage/dead/quick-back clicks, excessive scroll, JS/script errors), tell them EXACTLY what to change on the page and which tests to run to reduce friction and lift engagement + conversions — specific elements, layout, copy, and CTA moves with how to implement each. If the sample is tiny, spend one line on that then give the highest-confidence moves + how to get more usable signal fast. Group under: "Change on the page now", "Tests to run (and how)", "Get more usable data". Under ~290 words. End with the single highest-leverage change.`,
  bing: `You are a senior SEO strategist advising GooCampus. Site: ${BIZ}\n${DIRECTIVE}\nBased ONLY on this Bing data, give a concrete PLAN to earn organic search visibility — the exact ordered steps (get indexed via sitemap/IndexNow, on-page SEO fixes, content that matches what Indian medical students actually search), which tool to use for each, and how to do it. Weight the effort realistically (Bing is small vs Google in India). Group under: "Get indexed (do first)", "On-page SEO to fix", "Content to create (with example topics)". Under ~290 words. End with the single highest-leverage action.`,
};

function gaSummary(ga: Awaited<ReturnType<typeof buildGA4Traffic>> | null, from: string, to: string): string {
  if (!ga) return "Google Analytics data unavailable.";
  const pct = (list: { pct: number }[], key: string) => list.slice(0, 5).map((x) => `${(x as Record<string, unknown>)[key]} ${x.pct}%`).join(", ");
  return [
    `Site: goocampusevents.com. Google Analytics, ${from} to ${to}.`,
    `Users ${ga.summary.users} (new ${ga.summary.newUsers}), Sessions ${ga.summary.sessions} (engaged ${ga.summary.engagedSessions}), Pageviews ${ga.summary.pageViews}, Pages/session ${ga.summary.viewsPerSession}, Avg session ${ga.summary.avgSessionSec}s, Engagement rate ${ga.summary.engagementRate}%, Bounce ${ga.summary.bounceRate}%, Key events (conversions) ${ga.summary.keyEvents}.`,
    `Channels: ${pct(ga.channels, "channel")}. Source/medium: ${ga.sourceMedium.slice(0, 5).map((s) => `${s.name} ${s.pct}%`).join(", ")}.`,
    `Top pages: ${ga.topPages.slice(0, 6).map((p) => `${p.path} (${p.views})`).join(", ")}.`,
    `Top events: ${ga.events.slice(0, 8).map((e) => `${e.name} ${e.count}${e.keyEvents ? ` [${e.keyEvents} key]` : ""}`).join(", ")}.`,
    `Countries: ${pct(ga.countries, "country")}. Devices: ${pct(ga.devices, "device")}.`,
  ].join("\n");
}

function claritySummary(c: Awaited<ReturnType<typeof buildClarity>> | null): string {
  if (!c) return "Clarity data unavailable.";
  return [
    `Site: goocampusevents.com. Microsoft Clarity, last 3 days.`,
    `Sessions ${c.traffic.sessions} (bots ${c.traffic.botSessions}), Distinct users ${c.traffic.distinctUsers}, Pages/session ${c.traffic.pagesPerSession}, Scroll depth ${c.scrollDepth}%, Active time ${c.engagement.activeTimeSec}s of ${c.engagement.totalTimeSec}s.`,
    `Frustration signals (% of sessions): ${c.signals.map((s) => `${s.name} ${s.sessionsPct}% (${s.count})`).join(", ")}.`,
    `Devices: ${c.devices.slice(0, 4).map((d) => `${d.name} ${d.value}`).join(", ")}. Top pages: ${c.pages.slice(0, 4).map((p) => p.url).join(", ")}.`,
  ].join("\n");
}

function bingSummary(b: Awaited<ReturnType<typeof buildBing>> | null): string {
  if (!b) return "Bing Webmaster data unavailable.";
  return [
    `Site: goocampusevents.com. Bing Webmaster search performance.`,
    `Clicks ${b.summary.clicks}, Impressions ${b.summary.impressions}, CTR ${b.summary.ctr}%, Avg position ${b.summary.avgPosition || "n/a"}.`,
    b.queries.length ? `Top queries: ${b.queries.slice(0, 8).map((q) => `${q.query} (${q.impressions} impr)`).join(", ")}.` : `No query data (site not appearing in Bing search yet).`,
    b.pages.length ? `Top pages: ${b.pages.slice(0, 6).map((p) => p.url).join(", ")}.` : `No page data yet.`,
  ].join("\n");
}

export async function GET(req: Request) {
  if (!hasAI()) return NextResponse.json({ error: "Perplexity not configured — set PERPLEXITY_API_KEY." }, { status: 503 });
  const url = new URL(req.url);
  const source = (url.searchParams.get("source") || "ga").toLowerCase();
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  if (!PROMPTS[source]) return NextResponse.json({ error: "source must be ga | clarity | bing" }, { status: 400 });

  try {
    const data = await cached(`ai:website:${source}:${from}:${to}`, 30 * 60_000, async () => {
      let summary: string;
      if (source === "clarity") summary = claritySummary(hasClarityAuth() ? await buildClarity(3).catch(() => null) : null);
      else if (source === "bing") summary = bingSummary(hasBingAuth() ? await buildBing().catch(() => null) : null);
      else summary = gaSummary(hasGA4Auth() ? await buildGA4Traffic(from, to).catch(() => null) : null, from, to);

      const { text, citations } = await askPerplexity(PROMPTS[source], summary);
      return { text, citations, source, window: { from, to } };
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI insights failed" }, { status: 502 });
  }
}
