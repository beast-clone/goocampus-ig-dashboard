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

const PROMPTS: Record<string, string> = {
  ga: `You are a growth-marketing / conversion-rate-optimization consultant. Site: ${BIZ}\nAnalyse ONLY this Google Analytics data. Give SPECIFIC, PRIORITIZED, ACTIONABLE recommendations to increase quality traffic and conversions. Reference the actual numbers. Avoid generic filler. Group under: "Quick wins", "Traffic", "Conversion", "SEO/organic". Keep under ~330 words. End with one sentence naming the single highest-impact action.`,
  clarity: `You are a UX / conversion-rate-optimization expert. Site: ${BIZ}\nAnalyse ONLY this Microsoft Clarity behaviour data (last 3 days): scroll depth, engagement time, and frustration signals (rage/dead/quick-back clicks, excessive scroll, JS/script errors). Give SPECIFIC, PRIORITIZED fixes to reduce on-page friction and lift engagement + conversions. Reference the actual numbers. If the sample is tiny, say so briefly and focus on the clearest signals. Group under: "What the behaviour says", "Fix now", "Test next". Keep under ~280 words. End with the single highest-impact fix.`,
  bing: `You are an SEO consultant. Site: ${BIZ}\nAnalyse ONLY this Bing Webmaster search data. If clicks/impressions are ~0, be honest that the site isn't ranking in Bing yet — then give concrete, prioritized steps to earn organic search visibility (indexing/sitemap, on-page SEO, content matching what medical students search). Note Bing is a small share in India vs Google, so set expectations. Reference the numbers. Group under: "Reality check", "Do first", "Content/SEO". Keep under ~280 words. End with the single highest-impact action.`,
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
