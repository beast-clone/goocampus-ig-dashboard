import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { askPerplexityJSON } from "@/lib/ai";
import { safeError } from "@/lib/errors";

// Format Advisor.
//
// Given the account + a selected range, aggregates Reels / Carousels / Static
// performance for that range AND for a 30-day baseline, then asks gpt-4o-mini
// to write a 3–4 sentence marketing-lead-style recommendation. The prompt is
// deliberately constrained so the model never says "cut X" or "only do Y" —
// it always speaks to the MIX and hedges when the sample is thin.
//
// Cached 12h per {accountId, from, to} to avoid billing on every chip click.

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

type FormatRow = { type: string; count: number; avgReach: number; avgEng: number; erPct: number };

export type FormatAdvice = {
  paragraphs: string[];    // 2-3 short paragraphs of advisor voice
  suggestedMix: { type: string; pct: number; why: string }[]; // recommended split
  disclaimer?: string;     // "3 posts is too few..." when sample thin
};

type Cached = { at: number; payload: { advice: FormatAdvice; rangePerf: FormatRow[]; baselinePerf: FormatRow[]; generatedAt: string; latencyMs: number } };
const CACHE = new Map<string, Cached>();
const TTL_MS = 12 * 60 * 60 * 1000;

function aggregate(posts: PostLite[]): FormatRow[] {
  const bag: Record<string, { count: number; reachSum: number; engSum: number }> = {};
  for (const p of posts) {
    bag[p.type] ??= { count: 0, reachSum: 0, engSum: 0 };
    bag[p.type].count += 1;
    bag[p.type].reachSum += p.reach || 0;
    bag[p.type].engSum += p.totalInteractions || (p.likes + p.comments + p.shares + p.saves);
  }
  return Object.entries(bag)
    .filter(([, v]) => v.count > 0)
    .map(([type, v]) => ({
      type,
      count: v.count,
      avgReach: Math.round(v.reachSum / v.count),
      avgEng: Math.round(v.engSum / v.count),
      erPct: v.reachSum > 0 ? Math.round((v.engSum / v.reachSum) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.avgReach - a.avgReach);
}

function humanFormatName(t: string): string {
  if (t === "REEL") return "Reels";
  if (t === "CAROUSEL_ALBUM") return "Carousels";
  if (t === "IMAGE") return "Static posts";
  if (t === "VIDEO") return "Long videos";
  return t;
}

export async function GET(req: Request) {
  const __denied = await requireSection("content");
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

    // Range posts + 30-day baseline — sent together so the advisor can compare
    // "right now" against "the trend that's held for a month".
    const baselineTo = to;
    const baselineFrom = new Date(new Date(to).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [rangeRes, baseRes] = await Promise.all([
      fetch(`${origin}/api/posts?accountId=${accountId}&from=${from}&to=${to}&limit=500&insights=true`, { headers: { cookie }, cache: "no-store" }),
      fetch(`${origin}/api/posts?accountId=${accountId}&from=${baselineFrom}&to=${baselineTo}&limit=500&insights=true`, { headers: { cookie }, cache: "no-store" }),
    ]);
    if (!rangeRes.ok) throw new Error(`range ${rangeRes.status}`);
    if (!baseRes.ok) throw new Error(`baseline ${baseRes.status}`);
    const rangePosts = ((await rangeRes.json()) as { posts: PostLite[] }).posts || [];
    const basePosts  = ((await baseRes.json())  as { posts: PostLite[] }).posts || [];

    const rangePerf = aggregate(rangePosts);
    const baselinePerf = aggregate(basePosts);
    const rangeDays = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));

    const context = {
      accountHandle: "@goocampus",
      accountNiche: "Indian medical education — audience is IMG doctors preparing for AMC (Australia), DHA (UAE), NEET PG, MRCS/PLAB (UK), MBBS abroad.",
      rangeLabel: rangeDays <= 7 ? "last 7 days"
                : rangeDays <= 31 ? "last 30 days"
                : rangeDays <= 92 ? "last 90 days"
                : "last year",
      rangeDays,
      rangePerf: rangePerf.map((r) => ({ format: humanFormatName(r.type), ...r })),
      baseline30dPerf: baselinePerf.map((r) => ({ format: humanFormatName(r.type), ...r })),
      totalRangePosts: rangePosts.length,
    };

    const t0 = Date.now();
    const sys = [
            "You are the marketing lead advising the GooCampus social team on Instagram content mix.",
            "You get REAL performance stats for Reels / Carousels / Static posts across (a) the selected range and (b) a 30-day baseline for comparison.",
            "Your job is to write a 2–3 short paragraph recommendation on the CONTENT MIX for the NEXT WEEK or NEXT MONTH.",
            "",
            "STRICT RULES — the reader is a fresh marketing hire, not an analytics expert:",
            "  1. NEVER say 'cut X entirely' or 'only do Y' or 'stop making Z'. Every format keeps SOME share.",
            "  2. ALWAYS speak to the MIX. Propose percentages that add to 100 (e.g. 50/30/20).",
            "  3. When the selected range is short (7d) and short-term winner disagrees with the 30-day baseline, EXPLICITLY call that out and treat the short-term as a TEST, not a strategy switch.",
            "  4. When total posts in the range are < 15, add a disclaimer that the sample is thin — don't sound confident.",
            "  5. Voice: first-person marketing-lead advisor. Suggestive. Use phrases like 'In my opinion...', 'Given...', 'I'd lean into...', 'It's worth testing...', 'Since [reason], I'd keep [format] at [%]...'. Never bark orders.",
            "  6. Reference REAL numbers from the data as evidence (average reach, post count, engagement rate). Don't make numbers up.",
            "  7. Each paragraph ≤ 55 words. Total output ≤ 160 words.",
            "  8. Consider the medical-education audience: Carousels win for teaching/saves, Reels win for reach/new followers, Static works for announcements. Don't recommend against a format's natural strength.",
            "",
            "Return JSON: { paragraphs: string[] (2-3 short paras, plain text no markdown), suggestedMix: [{type: 'Reels'|'Carousels'|'Static', pct: number, why: string (≤ 20 words)}], disclaimer?: string (only when sample is thin) }.",
            "The suggestedMix percentages must add up to exactly 100.",
    ].join("\n");
    const parsed = (await askPerplexityJSON<Partial<FormatAdvice>>(sys, JSON.stringify(context), { temperature: 0.55 })) || {};
    const latencyMs = Date.now() - t0;
    if (!parsed.paragraphs || parsed.paragraphs.length === 0) {
      throw new Error("Advisor returned no paragraphs");
    }

    const advice: FormatAdvice = {
      paragraphs: parsed.paragraphs.slice(0, 3),
      suggestedMix: (parsed.suggestedMix || []).slice(0, 4),
      disclaimer: parsed.disclaimer,
    };

    const payload = {
      advice,
      rangePerf,
      baselinePerf,
      generatedAt: new Date().toISOString(),
      latencyMs,
    };
    CACHE.set(cacheKey, { at: now, payload });
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Advisor generation failed"), { status: 502 });
  }
}
