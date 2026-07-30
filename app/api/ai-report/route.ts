import { NextResponse } from "next/server";
import { askPerplexity, hasAI } from "@/lib/ai";
import { safeError } from "@/lib/errors";
import { saveReport } from "@/lib/report-store";

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
  // Daily trend for the reach/engagement line chart.
  trend: { date: string; reach: number; engagement: number; newFollowers: number }[];
  // Leads → sales pulled from the Sales Hub CRM for the same window. null if
  // the CRM couldn't be reached (keeps the rest of the report working).
  leadsSales: {
    totals: { leads: number; contracts: number; revenue: number; conversionPct: number; firstActivityAvgHrs: number | null };
    inflowByDay: { date: string; count: number }[];
    bySource: { name: string; count: number }[];
    byInterest: { name: string; count: number }[];
    byStatus: { name: string; count: number }[];
    counsellors: { name: string; assigned: number; contracts: number; revenue: number }[];
    revenueTrend: { month: string; revenue: number; contracts: number }[];
    insight: string;
  } | null;
};

// Subset of /api/leads-crm we consume.
type LeadsCrm = {
  totals: { leads: number; contracts: number; revenue: number; firstActivityAvgHrs: number | null };
  inflowByDay: { date: string; count: number }[];
  bySource: { name: string; count: number }[];
  byInterest: { name: string; count: number }[];
  byStatus: { name: string; count: number }[];
  counsellors: { name: string; assigned: number; contracts: number; revenue: number }[];
  revenueTrend: { month: string; revenue: number; contracts: number }[];
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

    // Meta caps /api/insights at 30 days, so a 90-day quarterly window would silently
    // truncate reach/followers to the last 30d. For windows > 30d read the reconstructed
    // history from Supabase snapshots (/api/insights-stored) — same shape, full range.
    const insightsUrl = days > 30
      ? `${origin}/api/insights-stored?accountId=${accountId}&from=${fromStr}&to=${toStr}`
      : `${origin}/api/insights?accountId=${accountId}&from=${fromStr}&to=${toStr}`;
    const [insightsRes, postsRes, audienceRes, leadsRes] = await Promise.all([
      fetch(insightsUrl, { headers: commonHeaders, cache: "no-store" }),
      fetch(`${origin}/api/posts?accountId=${accountId}&from=${fromStr}&to=${toStr}&limit=500&insights=true`, { headers: commonHeaders, cache: "no-store" }),
      fetch(`${origin}/api/audience?accountId=${accountId}`, { headers: commonHeaders, cache: "no-store" }),
      // Sales Hub CRM for the same window — fail-soft (org-wide, not per-account).
      fetch(`${origin}/api/leads-crm?from=${fromStr}&to=${toStr}`, { headers: commonHeaders, cache: "no-store" }).catch(() => null),
    ]);
    if (!insightsRes.ok) throw new Error(`insights ${insightsRes.status}`);
    if (!postsRes.ok) throw new Error(`posts ${postsRes.status}`);

    const insights = (await insightsRes.json()) as Insights;
    const postsJson = (await postsRes.json()) as { posts: Post[] };
    const posts = postsJson.posts || [];
    const audience = audienceRes.ok ? ((await audienceRes.json()) as Audience) : {};
    const crm: LeadsCrm | null = leadsRes && leadsRes.ok ? ((await leadsRes.json()) as LeadsCrm) : null;

    // Shape the leads → sales block (top-N trimmed) for both the AI context and payload.
    // DM-only: paid "Digital marketing activity" leads are excluded — this is the
    // organic/social report; paid marketing is counted separately.
    const PAID_LEAD_SOURCES = ["digital marketing activity"];
    const isPaid = (name: string) => PAID_LEAD_SOURCES.includes((name || "").trim().toLowerCase());
    const dmSources = (crm?.bySource || []).filter((s) => !isPaid(s.name));
    const paidSources = (crm?.bySource || []).filter((s) => isPaid(s.name));
    const dmLeads = dmSources.reduce((sum, s) => sum + (s.count || 0), 0);
    const paidLeads = paidSources.reduce((sum, s) => sum + (s.count || 0), 0);
    const leadsSales = crm
      ? {
          totals: {
            leads: dmLeads,
            contracts: crm.totals.contracts,
            revenue: crm.totals.revenue,
            conversionPct: dmLeads > 0 ? Math.round((crm.totals.contracts / dmLeads) * 1000) / 10 : 0,
            firstActivityAvgHrs: crm.totals.firstActivityAvgHrs,
          },
          paidLeads,
          paidBySource: paidSources,
          inflowByDay: crm.inflowByDay || [],
          bySource: dmSources.slice(0, 6),
          byInterest: (crm.byInterest || []).slice(0, 6),
          byStatus: (crm.byStatus || []).slice(0, 6),
          counsellors: (crm.counsellors || [])
            .filter((c) => c.name && c.name !== "Unassigned")
            .slice(0, 8),
          revenueTrend: crm.revenueTrend || [],
          insight: "",
        }
      : null;

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
        mediaUrl: p.mediaUrl,
        permalink: p.permalink,
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
      leadsSales: leadsSales
        ? {
            leads: leadsSales.totals.leads,
            contracts: leadsSales.totals.contracts,
            revenue: leadsSales.totals.revenue,
            conversionPct: leadsSales.totals.conversionPct,
            firstResponseHrs: leadsSales.totals.firstActivityAvgHrs,
            topSources: leadsSales.bySource,
            topCounsellors: leadsSales.counsellors.map((c) => ({ name: c.name, assigned: c.assigned, contracts: c.contracts, revenue: c.revenue })),
          }
        : null,
    };

    if (!hasAI()) throw new Error("PERPLEXITY_API_KEY not set");
    const systemPrompt = [
      "You are the marketing lead writing a performance report for GooCampus (Indian medical-education Instagram — audience: IMG doctors preparing for AMC/AHPRA Australia, DHA UAE, PLAB UK, NEET PG, MBBS abroad).",
      "You get PRE-COMPUTED numbers. Your ONLY job is to write the prose that goes with them.",
      "",
      "STRICT RULES:",
      "  1. DO NOT invent numbers. Reference the ones you were given. Do NOT web-search — use only the numbers provided.",
      "  2. Voice: first-person PLURAL team voice — always use \"we\"/\"our\", NEVER \"I\"/\"my\" (write \"we generated\", not \"I generated\"). Direct, no fluff, no emoji.",
      "  3. The metric cards ALREADY show the numbers — never just restate them. Each insight must ADD VALUE: say WHY the metric moved and what to DO about it (a lever, tactic, or next step). Cite a number only as the trigger for that action, not as the point.",
      "  4. Recommendations = concrete how-to actions naming the exact tactic/step/target ('post 3 Reels on AMC pass-rate stats targeting Australia-bound IMGs next week'), never platitudes or 'do more of X'.",
      "  5. Executive summary: 3-4 sentences, high-level. If leadsSales is present, tie social performance to leads and revenue (e.g. reach → leads → contracts). End with the ONE thing to focus on next.",
      "  6. leadsInsight: 2-3 sentences connecting the leads collected to sales — cite leads, conversionPct, revenue, and name the strongest counsellor or source. If leadsSales is null, return an empty string.",
      "  7. Length caps: executiveSummary ≤ 90 words, leadsInsight ≤ 55 words, each insight ≤ 40 words, each whyItWorked ≤ 25 words, each recommendation.title ≤ 8 words, .why ≤ 30 words, .action ≤ 30 words.",
      "",
      "Return ONLY a raw JSON object (no markdown, no code fences) matching:",
      "  {",
      "    executiveSummary: string,",
      "    highlights: [{ metric: 'Followers gained'|'Reach'|'Engagement'|'Profile visits', insight: string }] (exactly 4),",
      "    contentMixInsight: string,",
      "    topPostsWhy: [{ rank: number, whyItWorked: string }] (one per top post),",
      "    followerGrowthInsight: string,",
      "    reachInsight: string,",
      "    engagementInsight: string,",
      "    audienceInsight: string,",
      "    leadsInsight: string,",
      "    recommendations: [{ title, why, action }] (3-5 items)",
      "  }",
    ].join("\n");
    const t0 = Date.now();
    const { text: raw } = await askPerplexity(systemPrompt, JSON.stringify(context), { maxTokens: 1600 });
    const latencyMs = Date.now() - t0;
    type AIPart = {
      executiveSummary?: string;
      highlights?: { metric: string; insight: string }[];
      contentMixInsight?: string;
      topPostsWhy?: { rank: number; whyItWorked: string }[];
      followerGrowthInsight?: string;
      reachInsight?: string;
      engagementInsight?: string;
      audienceInsight?: string;
      leadsInsight?: string;
      recommendations?: { title: string; why: string; action: string }[];
    };
    let ai: AIPart = {};
    try {
      let jsonStr = raw.trim();
      const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) jsonStr = fence[1].trim();
      const a = jsonStr.indexOf("{"), b = jsonStr.lastIndexOf("}");
      if (a >= 0 && b > a) jsonStr = jsonStr.slice(a, b + 1);
      ai = JSON.parse(jsonStr) as AIPart;
    } catch { ai = {}; }

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
      trend: (insights.series || []).map((s) => ({
        date: s.date,
        reach: s.reach || 0,
        engagement: s.engagement || 0,
        newFollowers: s.newFollowers || 0,
      })),
      leadsSales: leadsSales ? { ...leadsSales, insight: ai.leadsInsight || "" } : null,
    };

    CACHE.set(cacheKey, { at: Date.now(), payload });
    // Archive it durably so it stays browsable in the Reports tab (per-period slot,
    // updated on re-generate). Best-effort — a store failure must not break the report.
    try { await saveReport("instagram", accountId, period, toStr, payload); } catch { /* archive is non-critical */ }
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Report generation failed"), { status: 502 });
  }
}
