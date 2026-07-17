import { NextResponse } from "next/server";
import { hasAI, askPerplexity } from "@/lib/ai";
import { buildGA4Traffic, hasGA4Auth } from "@/lib/ga4";
import { buildClarity, hasClarityAuth } from "@/lib/clarity";
import { buildBing, hasBingAuth } from "@/lib/bing";
import { cached } from "@/lib/api-cache";

// GET /api/website/insights?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Pulls the live GA4 + Clarity + Bing data for goocampusevents.com, hands a compact
// summary to Perplexity (Sonar), and returns prioritized, data-grounded marketing
// suggestions. Cached 30 min per window so repeat "Analyze" clicks don't re-charge.

const SYSTEM = `You are a senior growth-marketing and conversion-rate-optimization consultant for GooCampus, an Indian medical-education company. The site goocampusevents.com runs landing pages whose goal is lead capture: getting doctors/students to join WhatsApp communities and book 1:1 counselling ("key events" like join_click, begin_checkout). Most traffic today comes from paid Meta (Instagram/Facebook) ads, not organic search.

Analyse the analytics provided and give SPECIFIC, PRIORITIZED, ACTIONABLE recommendations to increase (a) quality traffic and (b) conversions. Reference the actual numbers you were given. Avoid generic filler. Prefer concrete moves (e.g. "bounce is 72% and pages/session 1.6 — the landing pages aren't holding people; test a stronger above-the-fold CTA on /nz-pathway"). Group as a short prioritized list under headings: "Quick wins", "Traffic", "Conversion", "SEO/organic". Keep it under ~350 words. End with one sentence naming the single highest-impact action.`;

function pct(list: { pct: number }[] | undefined, name: string, keyName: string) {
  return (list || []).slice(0, 5).map((x) => `${(x as Record<string, unknown>)[keyName]} ${x.pct}%`).join(", ");
}

function buildSummary(ga: Awaited<ReturnType<typeof buildGA4Traffic>> | null, clarity: Awaited<ReturnType<typeof buildClarity>> | null, bing: Awaited<ReturnType<typeof buildBing>> | null, from: string, to: string): string {
  const lines: string[] = [`Site: goocampusevents.com. Window: ${from} to ${to}.`];
  if (ga) {
    lines.push(
      `\n[Google Analytics]`,
      `Users ${ga.summary.users} (new ${ga.summary.newUsers}), Sessions ${ga.summary.sessions} (engaged ${ga.summary.engagedSessions}), Pageviews ${ga.summary.pageViews}, Pages/session ${ga.summary.viewsPerSession}, Avg session ${ga.summary.avgSessionSec}s, Engagement rate ${ga.summary.engagementRate}%, Bounce ${ga.summary.bounceRate}%, Key events (conversions) ${ga.summary.keyEvents}.`,
      `Channels: ${pct(ga.channels, "channel", "channel")}.`,
      `Source/medium: ${ga.sourceMedium.slice(0, 5).map((s) => `${s.name} ${s.pct}%`).join(", ")}.`,
      `Top pages: ${ga.topPages.slice(0, 6).map((p) => `${p.path} (${p.views} views)`).join(", ")}.`,
      `Top events: ${ga.events.slice(0, 8).map((e) => `${e.name} ${e.count}${e.keyEvents ? ` [${e.keyEvents} key]` : ""}`).join(", ")}.`,
      `Countries: ${pct(ga.countries, "country", "country")}. Devices: ${pct(ga.devices, "device", "device")}.`,
    );
  } else lines.push(`\n[Google Analytics] unavailable.`);
  if (clarity) {
    lines.push(
      `\n[Microsoft Clarity, last 3 days]`,
      `Sessions ${clarity.traffic.sessions} (bots ${clarity.traffic.botSessions}), Scroll depth ${clarity.scrollDepth}%, Active time ${clarity.engagement.activeTimeSec}s.`,
      `Frustration: ${clarity.signals.map((s) => `${s.name} ${s.sessionsPct}%`).join(", ")}.`,
    );
  }
  if (bing) lines.push(`\n[Bing Webmaster] Clicks ${bing.summary.clicks}, Impressions ${bing.summary.impressions} (site not yet ranking in Bing).`);
  return lines.join("\n");
}

export async function GET(req: Request) {
  if (!hasAI()) return NextResponse.json({ error: "Perplexity not configured — set PERPLEXITY_API_KEY." }, { status: 503 });
  const url = new URL(req.url);
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  try {
    const data = await cached(`ai:website:${from}:${to}`, 30 * 60_000, async () => {
      const [ga, clarity, bing] = await Promise.all([
        hasGA4Auth() ? buildGA4Traffic(from, to).catch(() => null) : Promise.resolve(null),
        hasClarityAuth() ? buildClarity(3).catch(() => null) : Promise.resolve(null),
        hasBingAuth() ? buildBing().catch(() => null) : Promise.resolve(null),
      ]);
      const summary = buildSummary(ga, clarity, bing, from, to);
      const { text, citations } = await askPerplexity(SYSTEM, summary);
      return { text, citations, window: { from, to } };
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI insights failed" }, { status: 502 });
  }
}
