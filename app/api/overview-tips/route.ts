import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { askPerplexity, hasAI } from "@/lib/ai";
import { safeError } from "@/lib/errors";

// Overview AI-Tips strip.
//
// Small, cheap synthesis of the account's last-N-days performance into three
// actionable recommendations — one per KPI dimension (Followers, Reach,
// Engagement). Uses gpt-4o-mini for cost control (~$0.01–0.02 per generation).
// Cached 12h per {account, range} so page loads don't repeatedly bill.

type PostLite = {
  type: string;
  timestamp: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  totalInteractions: number;
};

type Insights = {
  totals: { followers: number; reach: number; engagement: number; profileVisits: number; newFollowers: number };
  deltas: { followers: number; reach: number; engagement: number; profileVisits: number };
  series: { date: string; followers: number; reach: number; engagement: number; newFollowers: number }[];
};

export type OverviewTip = {
  metric: "followers" | "reach" | "engagement" | "profileVisits";
  headline: string;
  detail: string;
  action: string;
  tone: "grow" | "hold" | "fix";
};

type Cached = { at: number; payload: { tips: OverviewTip[]; generatedAt: string; latencyMs: number } };
const CACHE = new Map<string, Cached>();
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const force = url.searchParams.get("force") === "1";
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const cacheKey = `${accountId}|${from}|${to}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (!force && cached && now - cached.at < TTL_MS) {
    return NextResponse.json({ ...cached.payload, cached: true, cachedAt: new Date(cached.at).toISOString() });
  }

  try {
    const origin = url.origin;
    const cookie = req.headers.get("cookie") || "";

    // Fetch KPI deltas + last N posts in parallel.
    const [insightsRes, postsRes] = await Promise.all([
      fetch(`${origin}/api/insights?accountId=${accountId}&from=${from}&to=${to}`, { headers: { cookie }, cache: "no-store" }),
      fetch(`${origin}/api/posts?accountId=${accountId}&from=${from}&to=${to}&limit=60&insights=false`, { headers: { cookie }, cache: "no-store" }),
    ]);
    if (!insightsRes.ok) throw new Error(`insights ${insightsRes.status}`);
    if (!postsRes.ok) throw new Error(`posts ${postsRes.status}`);
    const insights = await insightsRes.json() as Insights;
    const postsBody = await postsRes.json() as { posts: PostLite[] };
    const posts = postsBody.posts || [];

    // Local aggregations for the prompt.
    const now2 = new Date(to);
    const oneWeekAgo = new Date(now2.getTime() - 7 * 86_400_000);
    const twoWeeksAgo = new Date(now2.getTime() - 14 * 86_400_000);
    const week1 = posts.filter((p) => new Date(p.timestamp) >= oneWeekAgo).length;
    const week2 = posts.filter((p) => {
      const ts = new Date(p.timestamp);
      return ts >= twoWeeksAgo && ts < oneWeekAgo;
    }).length;
    const cadenceDelta = week2 === 0 ? week1 : Math.round(((week1 - week2) / week2) * 100);

    const typeAgg: Record<string, { count: number; reachSum: number; engSum: number }> = {};
    for (const p of posts) {
      const t = p.type || "POST";
      typeAgg[t] ??= { count: 0, reachSum: 0, engSum: 0 };
      typeAgg[t].count += 1;
      typeAgg[t].reachSum += p.reach || 0;
      typeAgg[t].engSum += p.totalInteractions || (p.likes + p.comments + p.shares + p.saves);
    }
    const byType = Object.entries(typeAgg).map(([type, v]) => ({
      type,
      count: v.count,
      avgReach: Math.round(v.reachSum / v.count),
      avgEng: Math.round(v.engSum / v.count),
    })).sort((a, b) => b.avgReach - a.avgReach);

    const context = {
      totals: insights.totals,
      deltas: insights.deltas,
      postsInRange: posts.length,
      postsLast7d: week1,
      postsPrev7d: week2,
      cadenceDeltaPct: cadenceDelta,
      byType,
    };

    // Ask gpt-4o-mini for 3 tips. System prompt keeps the model on-brand and
    // asks for concrete, data-cited actions (not generic marketing advice).
    if (!hasAI()) throw new Error("PERPLEXITY_API_KEY not set");
    const systemPrompt = [
      "You are the growth advisor for GooCampus, a medical-education Instagram (IMG doctors — Australia AMC, UAE DHA, NEET PG, MBBS abroad).",
      "Given the last N-day KPIs, deltas, and posting patterns, output FOUR recommendations — one for each of Followers, Reach, Engagement, ProfileVisits.",
      "Each recommendation must:",
      "  - be short: headline ≤ 60 chars, detail ≤ 90 chars, action ≤ 90 chars",
      "  - detail: one plain-English line naming what the metric IS ('unique people who saw your content', not 'reach') — the reader already sees the number",
      "  - action: one concrete imperative move (the HOW to improve it), citing a real number when relevant — never 'you have X, get more'",
      "Tone: direct, no fluff, no emoji, no 'you should'. Do NOT web-search; use only the numbers given.",
      "Return ONLY raw JSON (no code fences): { tips: [{metric, headline, detail, action, tone}] }.",
      "metric ∈ {followers, reach, engagement, profileVisits}. tone: 'grow' if delta positive, 'hold' if flat, 'fix' if negative.",
    ].join("\n");
    const t0 = Date.now();
    const { text: raw } = await askPerplexity(systemPrompt, JSON.stringify(context), { maxTokens: 800 });
    const latencyMs = Date.now() - t0;

    let parsed: { tips?: OverviewTip[] } = {};
    try {
      let j = raw.trim();
      const fence = j.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) j = fence[1].trim();
      const a = j.indexOf("{"), b = j.lastIndexOf("}"); if (a >= 0 && b > a) j = j.slice(a, b + 1);
      parsed = JSON.parse(j);
    } catch { parsed = {}; }
    const tips = (parsed.tips || []).slice(0, 4);
    if (tips.length === 0) throw new Error("Model returned no tips");

    const payload = { tips, generatedAt: new Date().toISOString(), latencyMs };
    CACHE.set(cacheKey, { at: now, payload });
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Tips generation failed"), { status: 502 });
  }
}
