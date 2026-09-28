import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { cachedShared } from "@/lib/api-cache";
import { hasAI, askPerplexity } from "@/lib/ai";
import { safeError } from "@/lib/errors";

// The read on a competitor — or on all of them against us.
//
//   POST /api/benchmark/profile-ai
//     { mode: "profile" | "compare", us?: Brand, brands: Brand[], force?: boolean }
//
// Cached for a day per question, because this is a paid model call on a page that
// gets reopened, and the underlying numbers move slowly. The cache key is built
// from the brands and their rounded figures, so it re-asks when the picture
// actually changes rather than on every render.
export const dynamic = "force-dynamic";

const TTL_MS = 24 * 60 * 60 * 1000;

type Brand = {
  name: string;
  handle: string;
  followers: number;
  postsPer30d: number;
  avgLikes: number;
  avgComments: number;
  engagementRatePct: number;
  youtube?: { subscribers: number; views: number; videos: number } | null;
  topPostCaptions?: string[];
  sentiment?: { positive: number; negative: number; neutral: number } | null;
};

// The house rule, same as the other AI panels: they can already see the numbers.
const SYSTEM = `You are the head of growth for GooCampus, an Indian medical-education company (NEET counselling, MBBS/PG abroad, licensing exams). You are looking at competitor data from Instagram, YouTube and what people say about them online.

CRITICAL: the reader ALREADY sees every number on screen. Do NOT restate metrics, and do not write filler like "they have more followers than you". That has zero value. Your ENTIRE job is what to DO about it: the specific play to run, the exact steps, and why it works. Quote a number only as the trigger for an action.

Be concrete about CONTENT: what format, what hook, what topic, what cadence. If a competitor's engagement rate beats theirs on fewer posts, say what that implies about the content and what to copy or avoid. If people are complaining about a competitor online, say how to position against it.

No preamble, no summary of what you were given. Short paragraphs or tight bullets. Under 300 words.`;

// Cutting a caption to length can slice an emoji in half, and a lone surrogate
// makes the JSON body invalid UTF-8 — Perplexity answers 400 invalid request body.
// Instagram captions are full of emoji, so drop the stray half after slicing.
const clip = (s: string, n: number) =>
  s.slice(0, n).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");

const line = (b: Brand) =>
  `${b.name} (@${b.handle}): ${b.followers} followers, ${b.postsPer30d} posts/30d, `
  + `${b.avgLikes} avg likes, ${b.avgComments} avg comments, ${b.engagementRatePct.toFixed(2)}% engagement rate`
  + (b.youtube ? `; YouTube ${b.youtube.subscribers} subs, ${b.youtube.views} total views, ${b.youtube.videos} videos` : "")
  + (b.sentiment ? `; web mentions ${b.sentiment.positive} positive / ${b.sentiment.negative} negative / ${b.sentiment.neutral} neutral` : "")
  + (b.topPostCaptions?.length ? `\n  their recent posts: ${b.topPostCaptions.slice(0, 5).map((c) => `"${clip(c, 110)}"`).join(" | ")}` : "");

export async function POST(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  // A paid model call — tighter than the data routes.
  const limited = guardRate(req, "profile-ai", 10, 300_000);
  if (limited) return limited;

  if (!hasAI()) return NextResponse.json({ configured: false, text: "" });

  let body: { mode?: string; us?: Brand; brands?: Brand[]; force?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const brands = (body.brands || []).filter((b) => b && b.handle);
  if (!brands.length) return NextResponse.json({ error: "brands required" }, { status: 400 });
  const compare = body.mode === "compare";

  const user = compare
    ? `Us — ${body.us ? line(body.us) : "our own numbers are not available"}\n\n`
      + `Competitors:\n${brands.map((b) => `- ${line(b)}`).join("\n")}\n\n`
      + `Where do we actually stand, and what are the two or three moves that would close the gap fastest? Be specific about content and cadence.`
    : `Competitor: ${line(brands[0])}\n\n`
      + (body.us ? `For context, us: ${line(body.us)}\n\n` : "")
      + `What are they doing that works, and what should we copy, avoid, or do differently?`;

  // Rounded figures in the key: a follower count ticking up by three should not
  // buy a new model call.
  const sig = brands.map((b) => `${b.handle}:${Math.round(b.followers / 100)}:${b.postsPer30d}:${b.engagementRatePct.toFixed(1)}`).join(",");

  try {
    const { data } = await cachedShared<{ text: string; citations: string[] }>(
      `compai:${compare ? "cmp" : "one"}:${sig}`,
      TTL_MS,
      async () => {
        const { text, citations } = await askPerplexity(SYSTEM, user, { maxTokens: 900, feature: "competitor-ai" });
        return { text, citations: citations || [] };
      },
      { force: body.force === true },
    );
    return NextResponse.json({ configured: true, ...data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't get the read"), { status: 502 });
  }
}
