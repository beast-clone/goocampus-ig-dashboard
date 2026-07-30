import { NextResponse } from "next/server";
import { hasAI, askPerplexity } from "@/lib/ai";
import { buildGA4Traffic, hasGA4Auth } from "@/lib/ga4";
import { cached } from "@/lib/api-cache";

// GET /api/ai-insights/overview?accountId=&from=&to=
//
// Central, cross-channel AI read: pulls the selected account's Instagram + Meta
// ads (via the internal APIs, forwarding the session cookie) plus the
// goocampusevents.com website (GA4, direct), and asks Perplexity for one
// prioritized action plan that connects the channels. Cached 30 min.

const SYSTEM = `You are the CMO / head of growth for GooCampus, an Indian medical-education company (licensing exams, MBBS/PG abroad, counselling). You are given a cross-channel snapshot: Instagram organic, Meta paid ads, and the goocampusevents.com website (Google Analytics). Goal: lead generation — WhatsApp community joins and 1:1 counselling bookings.

CRITICAL: The reader ALREADY sees these numbers on their dashboard. Do NOT restate metrics or write filler like "you have X, but you need more" — that has zero value. Your ENTIRE job is HOW to grow: specific tactics, the exact steps to execute each, which lever to pull on which channel, and the strategy + fundamentals behind it. Cite a number only as the trigger for an action. CONNECT the channels — the strongest moves use one channel's data to fix another (e.g. "the ad creative converts on the click but the landing page bounces at 73% → before adding budget, do A → B → C on /nz-pathway"). Every bullet is a concrete action to execute; go deep on the few highest-leverage moves, not a long shallow list.

Group under: "The one move that matters most", "Instagram", "Paid ads", "Website / landing pages", "Do this week (checklist)". Under ~420 words. End with the single highest-leverage move and why it goes first.`;

async function getJson(origin: string, cookie: string, path: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${origin}${path}`, { headers: { cookie }, cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

type Post = { type?: string; caption?: string; reach?: number; likes?: number; comments?: number; shares?: number; saves?: number };

function buildSummary(o: {
  accountId: string; from: string; to: string;
  ig: Record<string, unknown> | null; posts: Post[]; ads: Record<string, unknown> | null;
  ga: Awaited<ReturnType<typeof buildGA4Traffic>> | null;
}): string {
  const lines: string[] = [`Account: ${o.accountId}. Window: ${o.from} to ${o.to}. Website analysed = goocampusevents.com.`];

  const t = (o.ig?.totals || {}) as Record<string, number>;
  if (o.ig) lines.push(`\n[Instagram] Followers ${t.followers ?? "?"}, Reach ${t.reach ?? "?"}, Engagement ${t.engagement ?? "?"}, New followers ${t.newFollowers ?? "?"}.`);

  if (o.posts.length) {
    const byType: Record<string, { n: number; reach: number }> = {};
    for (const p of o.posts) { const k = p.type || "UNKNOWN"; (byType[k] ||= { n: 0, reach: 0 }); byType[k].n++; byType[k].reach += p.reach || 0; }
    const mix = Object.entries(byType).map(([k, v]) => `${k} x${v.n} (avg reach ${Math.round(v.reach / v.n)})`).join(", ");
    const top = [...o.posts].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 3)
      .map((p) => `"${(p.caption || "").replace(/\s+/g, " ").slice(0, 70)}" (reach ${p.reach || 0}, ${(p.likes || 0) + (p.comments || 0) + (p.saves || 0)} eng)`).join(" | ");
    lines.push(`Post mix: ${mix}. Top posts: ${top}.`);
  }

  const a = (o.ads?.totals || {}) as Record<string, number>;
  if (o.ads && Object.keys(a).length) lines.push(`\n[Meta ads] Spend ${a.spend ?? "?"}, Impressions ${a.impressions ?? "?"}, Reach ${a.reach ?? "?"}, Clicks ${a.clicks ?? "?"}, Leads ${a.leads ?? "?"}, CTR ${a.ctr ?? "?"}, CPM ${a.cpm ?? "?"}.`);
  else lines.push(`\n[Meta ads] no data available for this account/window.`);

  if (o.ga) {
    lines.push(
      `\n[Website — GA4, goocampusevents.com] Users ${o.ga.summary.users}, Sessions ${o.ga.summary.sessions}, Bounce ${o.ga.summary.bounceRate}%, Pages/session ${o.ga.summary.viewsPerSession}, Key events (conversions) ${o.ga.summary.keyEvents}.`,
      `Channels: ${o.ga.channels.slice(0, 4).map((c) => `${c.channel} ${c.pct}%`).join(", ")}. Top pages: ${o.ga.topPages.slice(0, 5).map((p) => `${p.path} (${p.views})`).join(", ")}.`,
    );
  }
  return lines.join("\n");
}

export async function GET(req: Request) {
  if (!hasAI()) return NextResponse.json({ error: "Perplexity not configured — set PERPLEXITY_API_KEY." }, { status: 503 });
  const url = new URL(req.url);
  const origin = url.origin;
  const cookie = req.headers.get("cookie") || "";
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  // "Regenerate" sends force=1 → bypass the 30-min cache and re-run the model.
  const force = url.searchParams.get("force") === "1";

  try {
    const compute = async () => {
      const [ig, postsJson, ads, ga] = await Promise.all([
        getJson(origin, cookie, `/api/insights?accountId=${accountId}&from=${from}&to=${to}`),
        getJson(origin, cookie, `/api/posts?accountId=${accountId}&from=${from}&to=${to}&limit=30`),
        getJson(origin, cookie, `/api/ads?accountId=${accountId}&from=${from}&to=${to}`),
        hasGA4Auth() ? buildGA4Traffic(from, to).catch(() => null) : Promise.resolve(null),
      ]);
      const summary = buildSummary({ accountId, from, to, ig, posts: (postsJson?.posts as Post[]) || [], ads, ga });
      const { text, citations } = await askPerplexity(SYSTEM, summary, { maxTokens: 1500 });
      return { text, citations, window: { from, to }, account: accountId };
    };
    const data = force ? await compute() : await cached(`ai:overview:${accountId}:${from}:${to}`, 30 * 60_000, compute);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI overview failed" }, { status: 502 });
  }
}
