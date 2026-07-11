import { NextResponse } from "next/server";
import OpenAI from "openai";
import { safeError } from "@/lib/errors";

// AI Report generator.
//
// Given { accountId, period, endDate }, fetches insights + posts + audience for
// the appropriate window and asks GPT-4o-mini to synthesize a structured JSON
// report that the /dashboard/ai-reports page renders inline. Covers weekly,
// monthly and quarterly cadences.
//
// Cached 12h per {accountId, period, endDate} — the underlying data doesn't
// meaningfully change within a day, and reports are read-heavy.

export type ReportPeriod = "weekly" | "monthly" | "quarterly";

type Insights = {
  totals: { followers: number; reach: number; engagement: number; profileVisits: number; newFollowers: number };
  deltas: { followers: number; reach: number; engagement: number; profileVisits: number };
  series: { date: string; followers: number; reach: number; engagement: number; newFollowers: number }[];
};

type Post = {
  id: string;
  caption: string;
  mediaUrl: string;
  permalink: string;
  type: string;
  timestamp: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  totalInteractions: number;
};

type Audience = {
  age?: { label: string; value: number }[];
  gender?: { label: string; value: number }[];
  cities?: { label: string; value: number }[];
  countries?: { label: string; value: number }[];
  onlineGrid?: (number | null)[][];
};

export type ReportPayload = {
  meta: {
    period: ReportPeriod;
    label: string;
    account: string;
    dateRange: { from: string; to: string };
    generatedAt: string;
    latencyMs: number;
  };
  executiveSummary: string;
  highlights: { label: string; value: string; delta?: string; insight: string }[];
  contentMix: {
    totalPosts: number;
    byFormat: { format: string; count: number; avgReach: number; avgEng: number; erPct: number }[];
    insight: string;
  };
  topPosts: {
    rank: number;
    title: string;
    permalink: string;
    mediaUrl: string;
    type: string;
    timestamp: string;
    reach: number;
    likes: number;
    comments: number;
    engagementRate: number;
    whyItWorked: string;
  }[];
  followerGrowth: {
    gained: number;
    dailyAvg: number;
    bestDay: { date: string; gain: number } | null;
    worstDay: { date: string; gain: number } | null;
    insight: string;
  };
  reachOverview: { total: number; deltaPct: number; insight: string };
  engagementOverview: { total: number; deltaPct: number; engagementRatePct: number; insight: string };
  audienceInsights: {
    topCountries: { label: string; value: number }[];
    topCities: { label: string; value: number }[];
    ageBreakdown: { label: string; value: number }[];
    genderBreakdown: { label: string; value: number }[];
    insight: string;
  };
  bestTimes: { day: string; hour: number; followersOnline: number }[];
  recommendations: { title: string; why: string; action: string }[];
  postMetricsTable: {
    date: string;
    type: string;
    caption: string;
    reach: number;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    erPct: number;
  }[];
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Cached = { at: number; payload: ReportPayload };
const CACHE = new Map<string, Cached>();
const TTL_MS = 12 * 60 * 60 * 1000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDateRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${f.toLocaleDateString("en-IN", opts)} – ${t.toLocaleDateString("en-IN", opts)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const period = (url.searchParams.get("period") || "weekly") as ReportPeriod;
  const endDate = url.searchParams.get("endDate") || ymd(new Date());
  const force = url.searchParams.get("force") === "1";

  if (!["weekly", "monthly", "quarterly"].includes(period)) {
    return NextResponse.json({ error: "period must be weekly / monthly / quarterly" }, { status: 400 });
  }

  const to = new Date(endDate);
  const days = period === "weekly" ? 7 : period === "monthly" ? 30 : 90;
  const from = new Date(to.getTime() - days * 86_400_000);
  const fromStr = ymd(from);
  const toStr = ymd(to);

  const cacheKey = `${accountId}|${period}|${toStr}`;
  const cached = CACHE.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ ...cached.payload, cached: true });
  }

  try {
    const origin = url.origin;
    const cookie = req.headers.get("cookie") || "";
    const commonHeaders = { cookie };

    const [insightsRes, postsRes, audienceRes] = await Promise.all([
      fetch(`${origin}/api/insights?accountId=${accountId}&from=${fromStr}&to=${toStr}`, { headers: commonHeaders, cache: "no-store" }),
      fetch(`${origin}/api/posts?accountId=${accountId}&from=${fromStr}&to=${toStr}&limit=500&insights=true`, { headers: commonHeaders, cache: "no-store" }),
      fetch(`${origin}/api/audience?accountId=${accountId}`, { headers: commonHeaders, cache: "no-store" }),
    ]);
    if (!insightsRes.ok) throw new Error(`insights ${insightsRes.status}`);
    if (!postsRes.ok) throw new Error(`posts ${postsRes.status}`);

    const insights = (await insightsRes.json()) as Insights;
    const postsJson = (await postsRes.json()) as { posts: Post[] };
    const posts = postsJson.posts || [];
    const audience = audienceRes.ok ? ((await audienceRes.json()) as Audience) : {};

    const totalPosts = posts.length;
    const formatBag: Record<string, { count: number; reachSum: number; engSum: number }> = {};
    for (const p of posts) {
      const t = p.type || "IMAGE";
      formatBag[t] ??= { count: 0, reachSum: 0, engSum: 0 };
      formatBag[t].count += 1;
      formatBag[t].reachSum += p.reach || 0;
      formatBag[t].engSum += p.totalInteractions || (p.likes + p.comments + p.shares + p.saves);
    }
    const byFormat = Object.entries(formatBag).map(([type, v]) => ({
      format: type === "REEL" ? "Reels" : type === "CAROUSEL_ALBUM" ? "Carousels" : type === "IMAGE" ? "Static" : type,
      count: v.count,
      avgReach: Math.round(v.reachSum / v.count),
      avgEng: Math.round(v.engSum / v.count),
      erPct: v.reachSum > 0 ? Math.round((v.engSum / v.reachSum) * 1000) / 10 : 0,
    })).sort((a, b) => b.avgReach - a.avgReach);

    const topPosts = [...posts]
      .sort((a, b) => (b.reach || 0) - (a.reach || 0))
      .slice(0, 5)
      .map((p, i) => ({
        rank: i + 1,
        title: p.caption ? p.caption.split("\n")[0].slice(0, 100) : "(no caption)",
        permalink: p.permalink,
        mediaUrl: p.mediaUrl,
        type: p.type,
        timestamp: p.timestamp,
        reach: p.reach || 0,
        likes: p.likes || 0,
        comments: p.comments || 0,
        engagementRate: p.reach > 0 ? Math.round((p.totalInteractions / p.reach) * 1000) / 10 : 0,
      }));

    const gainSeries = insights.series
      .filter((s) => s.newFollowers !== undefined)
      .map((s) => ({ date: s.date, gain: s.newFollowers }))
      .sort((a, b) => b.gain - a.gain);
    const bestDay = gainSeries[0] || null;
    const worstDay = gainSeries[gainSeries.length - 1] || null;

    const bestTimes: { day: string; hour: number; followersOnline: number }[] = [];
    if (audience.onlineGrid) {
      const flat: { day: number; hour: number; count: number }[] = [];
      for (let d = 0; d < audience.onlineGrid.length; d++) {
        for (let h = 0; h < 24; h++) {
          const v = audience.onlineGrid[d]?.[h] ?? 0;
          if (v > 0) flat.push({ day: d, hour: h, count: v });
        }
      }
      flat.sort((a, b) => b.count - a.count);
      for (const s of flat.slice(0, 5)) {
        bestTimes.push({ day: DAY_LABELS[s.day], hour: s.hour, followersOnline: s.count });
      }
    }

    const postMetricsTable = [...posts]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .map((p) => ({
        date: p.timestamp.slice(0, 10),
        type: p.type === "REEL" ? "Reel" : p.type === "CAROUSEL_ALBUM" ? "Carousel" : "Static",
        caption: (p.caption || "").split("\n")[0].slice(0, 90),
        reach: p.reach || 0,
        likes: p.likes || 0,
        comments: p.comments || 0,
        saves: p.saves || 0,
        shares: p.shares || 0,
        erPct: p.reach > 0 ? Math.round((p.totalInteractions / p.reach) * 1000) / 10 : 0,
      }));

    const context = {
      period,
      dateRange: fmtDateRange(fromStr, toStr),
      totals: insights.totals,
      deltas: insights.deltas,
      totalPosts,
      byFormat,
      topPosts: topPosts.map((p) => ({ rank: p.rank, format: p.type, caption: p.title, reach: p.reach, likes: p.likes, comments: p.comments, engagementRate: p.engagementRate })),
      followerBest: bestDay,
      followerWorst: worstDay,
      bestTimes,
      audience: {
        topCountries: (audience.countries || []).slice(0, 5),
        topCities: (audience.cities || []).slice(0, 5),
        age: audience.age || [],
        gender: audience.gender || [],
      },
    };

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const t0 = Date.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.45,
      messages: [
        {
          role: "system",
          content: [
            "You are the marketing lead writing a performance report for GooCampus (Indian medical-education Instagram — audience: IMG doctors preparing for AMC/AHPRA Australia, DHA UAE, PLAB UK, NEET PG, MBBS abroad).",
            "You get PRE-COMPUTED numbers. Your ONLY job is to write the prose that goes with them.",
            "",
            "STRICT RULES:",
            "  1. DO NOT invent numbers. Reference the ones you were given.",
            "  2. Voice: first-person marketing lead, direct, no fluff, no emoji.",
            "  3. Each insight cites at least one specific number as evidence.",
            "  4. Recommendations must be concrete actions ('post 3 Reels on AMC exam prep next week'), not platitudes.",
            "  5. Executive summary: 3-4 sentences, high-level, ends with the ONE thing to focus on next.",
            "  6. Length caps: executiveSummary ≤ 90 words, each insight ≤ 40 words, each whyItWorked ≤ 25 words, each recommendation.title ≤ 8 words, .why ≤ 30 words, .action ≤ 30 words.",
            "",
            "Return JSON matching:",
            "  {",
            "    executiveSummary: string,",
            "    highlights: [{ metric: 'Followers gained'|'Reach'|'Engagement'|'Profile visits', insight: string }] (exactly 4),",
            "    contentMixInsight: string,",
            "    topPostsWhy: [{ rank: number, whyItWorked: string }] (one per top post),",
            "    followerGrowthInsight: string,",
            "    reachInsight: string,",
            "    engagementInsight: string,",
            "    audienceInsight: string,",
            "    recommendations: [{ title, why, action }] (3-5 items)",
            "  }",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(context) },
      ],
    });
    const latencyMs = Date.now() - t0;

    const raw = completion.choices[0]?.message?.content || "{}";
    type AIPart = {
      executiveSummary?: string;
      highlights?: { metric: string; insight: string }[];
      contentMixInsight?: string;
      topPostsWhy?: { rank: number; whyItWorked: string }[];
      followerGrowthInsight?: string;
      reachInsight?: string;
      engagementInsight?: string;
      audienceInsight?: string;
      recommendations?: { title: string; why: string; action: string }[];
    };
    let ai: AIPart = {};
    try { ai = JSON.parse(raw) as AIPart; } catch { ai = {}; }

    const highlightsMap: Record<string, { value: string; delta?: string }> = {
      "Followers gained": { value: (insights.totals.newFollowers >= 0 ? "+" : "") + insights.totals.newFollowers.toLocaleString("en-IN") },
      "Reach":            { value: insights.totals.reach.toLocaleString("en-IN"),      delta: (insights.deltas.reach >= 0 ? "+" : "") + insights.deltas.reach.toFixed(1) + "%" },
      "Engagement":       { value: insights.totals.engagement.toLocaleString("en-IN"), delta: (insights.deltas.engagement >= 0 ? "+" : "") + insights.deltas.engagement.toFixed(1) + "%" },
      "Profile visits":   { value: insights.totals.profileVisits.toLocaleString("en-IN"), delta: (insights.deltas.profileVisits >= 0 ? "+" : "") + insights.deltas.profileVisits.toFixed(1) + "%" },
    };
    const highlights = ["Followers gained", "Reach", "Engagement", "Profile visits"].map((metric) => {
      const found = ai.highlights?.find((h) => h.metric === metric);
      const num = highlightsMap[metric];
      return { label: metric, value: num.value, delta: num.delta, insight: found?.insight || "" };
    });

    const topPostsWithWhy = topPosts.map((p) => ({
      ...p,
      whyItWorked: ai.topPostsWhy?.find((w) => w.rank === p.rank)?.whyItWorked || "",
    }));

    const engagementRatePct = insights.totals.reach > 0
      ? Math.round((insights.totals.engagement / insights.totals.reach) * 1000) / 10
      : 0;

    const periodLabel = period === "weekly" ? "Weekly report" : period === "monthly" ? "Monthly report" : "Quarterly report";
    const label = `${periodLabel} — ${fmtDateRange(fromStr, toStr)}`;

    const payload: ReportPayload = {
      meta: {
        period,
        label,
        account: accountId,
        dateRange: { from: fromStr, to: toStr },
        generatedAt: new Date().toISOString(),
        latencyMs,
      },
      executiveSummary: ai.executiveSummary || "",
      highlights,
      contentMix: { totalPosts, byFormat, insight: ai.contentMixInsight || "" },
      topPosts: topPostsWithWhy,
      followerGrowth: {
        gained: insights.totals.newFollowers,
        dailyAvg: days > 0 ? Math.round(insights.totals.newFollowers / days) : 0,
        bestDay,
        worstDay,
        insight: ai.followerGrowthInsight || "",
      },
      reachOverview: { total: insights.totals.reach, deltaPct: insights.deltas.reach, insight: ai.reachInsight || "" },
      engagementOverview: { total: insights.totals.engagement, deltaPct: insights.deltas.engagement, engagementRatePct, insight: ai.engagementInsight || "" },
      audienceInsights: {
        topCountries: (audience.countries || []).slice(0, 5),
        topCities: (audience.cities || []).slice(0, 5),
        ageBreakdown: audience.age || [],
        genderBreakdown: audience.gender || [],
        insight: ai.audienceInsight || "",
      },
      bestTimes,
      recommendations: ai.recommendations || [],
      postMetricsTable,
    };

    CACHE.set(cacheKey, { at: Date.now(), payload });
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Report generation failed"), { status: 502 });
  }
}
