import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { askPerplexityJSON, hasAI } from "@/lib/ai";

type Post = {
  id: string;
  type: string;
  caption: string;
  timestamp: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  totalInteractions: number;
  views?: number;
  avgWatchMs?: number;
  permalink: string;
};

type Insight = {
  generatedAt: string;
  latencyMs: number;
  range: { from: string; to: string };
  account: string;
  stats: {
    postsAnalyzed: number;
    byType: Record<string, { count: number; totalReach: number; totalEng: number; avgReach: number; avgEng: number; engRatePct: number }>;
    topPosts: Post[];
    topHashtags: { tag: string; posts: number; avgReach: number; erPct: number }[];
    bestWeekday: { day: string; avgReach: number } | null;
    bestHour: { hour: number; avgReach: number } | null;
  };
  ai: {
    winners: string[];
    patterns: string[];
    captionStyle: string[];
    recommendations: string[];
    nextWeekPlan: { day: string; time: string; format: string; hook: string }[];
    headline: string;
  };
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function extractHashtags(text: string | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  return Array.from(new Set(matches.map((t) => t.toLowerCase())));
}

export async function POST(req: Request) {
  const __denied = await requireSection("ai");
  if (__denied) return __denied;

  const body = await req.json();
  const { accountId = "goocampus", range } = body as { accountId: string; range: { from: string; to: string } };

  const origin = new URL(req.url).origin;
  const cookie = req.headers.get("cookie") || "";

  const t0 = Date.now();

  // Fetch fresh data in parallel
  const [postsRes] = await Promise.all([
    fetch(`${origin}/api/posts?accountId=${accountId}&from=${range.from}&to=${range.to}&limit=100`, { headers: { cookie }, cache: "no-store" }),
  ]);
  const postsJson = postsRes.ok ? await postsRes.json() : { posts: [] };
  const posts: Post[] = (postsJson.posts || []) as Post[];

  if (posts.length === 0) {
    return NextResponse.json({ error: "No posts found in selected range." }, { status: 404 });
  }

  // --- Aggregate stats locally ---
  const byType: Insight["stats"]["byType"] = {};
  for (const p of posts) {
    const t = p.type || "UNKNOWN";
    if (!byType[t]) byType[t] = { count: 0, totalReach: 0, totalEng: 0, avgReach: 0, avgEng: 0, engRatePct: 0 };
    byType[t].count += 1;
    byType[t].totalReach += p.reach || 0;
    byType[t].totalEng += (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
  }
  for (const k of Object.keys(byType)) {
    const b = byType[k];
    b.avgReach = Math.round(b.totalReach / b.count);
    b.avgEng = Math.round(b.totalEng / b.count);
    b.engRatePct = b.totalReach > 0 ? (b.totalEng / b.totalReach) * 100 : 0;
  }

  // Top posts by reach
  const topPosts = [...posts].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 5);

  // Top hashtags
  const tagMap = new Map<string, { posts: number; totalReach: number; totalEng: number }>();
  for (const p of posts) {
    for (const tag of extractHashtags(p.caption)) {
      const cur = tagMap.get(tag) || { posts: 0, totalReach: 0, totalEng: 0 };
      cur.posts += 1;
      cur.totalReach += p.reach || 0;
      cur.totalEng += (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
      tagMap.set(tag, cur);
    }
  }
  const topHashtags = Array.from(tagMap.entries())
    .map(([tag, s]) => ({
      tag,
      posts: s.posts,
      avgReach: Math.round(s.totalReach / s.posts),
      erPct: s.totalReach > 0 ? (s.totalEng / s.totalReach) * 100 : 0,
    }))
    .sort((a, b) => b.erPct - a.erPct)
    .slice(0, 10);

  // Best weekday + best hour by avg reach
  const byWeekday = new Map<number, { reach: number; count: number }>();
  const byHour = new Map<number, { reach: number; count: number }>();
  for (const p of posts) {
    const d = new Date(p.timestamp);
    const wd = d.getDay();
    const hr = d.getHours();
    const w = byWeekday.get(wd) || { reach: 0, count: 0 };
    w.reach += p.reach || 0; w.count += 1; byWeekday.set(wd, w);
    const h = byHour.get(hr) || { reach: 0, count: 0 };
    h.reach += p.reach || 0; h.count += 1; byHour.set(hr, h);
  }
  let bestWeekday: Insight["stats"]["bestWeekday"] = null;
  let bestWdReach = 0;
  for (const [k, v] of byWeekday) {
    const avg = v.reach / v.count;
    if (avg > bestWdReach) { bestWdReach = avg; bestWeekday = { day: WEEKDAYS[k], avgReach: Math.round(avg) }; }
  }
  let bestHour: Insight["stats"]["bestHour"] = null;
  let bestHrReach = 0;
  for (const [k, v] of byHour) {
    const avg = v.reach / v.count;
    if (avg > bestHrReach) { bestHrReach = avg; bestHour = { hour: k, avgReach: Math.round(avg) }; }
  }

  // --- Call Perplexity for the narrative + recommendations ---
  let ai: Insight["ai"] = {
    winners: [], patterns: [], captionStyle: [], recommendations: [], nextWeekPlan: [], headline: "(PERPLEXITY_API_KEY not set)",
  };
  if (hasAI()) {
    const sys = `You are an Instagram growth analyst for GooCampus, an Indian medical-education brand. You analyze raw post data and return STRICT JSON in this exact shape (no markdown, no prose around it):

{
  "headline": "One sentence summarizing the week.",
  "winners": ["3-5 bullets naming the specific posts/types that worked. Cite numbers."],
  "patterns": ["3-5 bullets about what content patterns emerged. Hooks, themes, formats."],
  "captionStyle": ["2-4 bullets about caption length, tone, CTA, emoji use, hashtag style that's working."],
  "recommendations": ["5 concrete prioritized actions for next week. Each starts with a verb."],
  "nextWeekPlan": [
    {"day": "Mon", "time": "09:00", "format": "Reel | Carousel | Single", "hook": "Specific hook idea tied to a winning theme"}
    // 5 entries, one per weekday Mon-Fri
  ]
}

Be direct. Use the actual numbers. No fluff. No emojis except where they appear in the data.`;

    const userMsg = JSON.stringify({
      window: range,
      account: accountId,
      byType,
      topPosts: topPosts.map(p => ({
        type: p.type,
        timestamp: p.timestamp,
        reach: p.reach,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        saves: p.saves,
        captionFirst200: (p.caption || "").slice(0, 200),
      })),
      topHashtags,
      bestWeekday,
      bestHour,
    });

    try {
      type AiJson = { headline?: string; winners?: string[]; patterns?: string[]; captionStyle?: string[]; recommendations?: string[]; nextWeekPlan?: Insight["ai"]["nextWeekPlan"] };
      const parsed = (await askPerplexityJSON<AiJson>(sys, userMsg, { maxTokens: 1800 })) || {};
      ai = {
        headline: parsed.headline || "",
        winners: parsed.winners || [],
        patterns: parsed.patterns || [],
        captionStyle: parsed.captionStyle || [],
        recommendations: parsed.recommendations || [],
        nextWeekPlan: parsed.nextWeekPlan || [],
      };
    } catch (err) {
      ai.headline = `AI error: ${(err as Error).message}`;
    }
  }

  const out: Insight = {
    generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - t0,
    range,
    account: accountId,
    stats: {
      postsAnalyzed: posts.length,
      byType,
      topPosts,
      topHashtags,
      bestWeekday,
      bestHour,
    },
    ai,
  };
  return NextResponse.json(out);
}
