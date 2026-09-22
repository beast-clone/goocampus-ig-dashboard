import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { askPerplexityJSON, hasAI } from "@/lib/ai";
import { getSocialKeywords } from "@/lib/social-keywords";

// POST /api/seo/generate { platform: "instagram"|"youtube", text }
//   → { keywords[], hashtags[], tags[]?, titles[]? }
// Paste an Instagram caption / YouTube script; get SEO keywords to copy. Grounded in
// the REAL top keywords and hashtags from our + competitors' posts, so suggestions
// lean on what already works for doctor audiences. Perplexity (tracked as "seo-keywords").
export const dynamic = "force-dynamic";

type Out = { keywords?: string[]; hashtags?: string[]; tags?: string[]; titles?: string[] };
// Trim, normalise hashtags, and drop duplicates that differ only in case (#PLAB / #plab).
const clean = (xs: unknown, n: number, hash = false) => {
  const seen = new Set<string>();
  return (Array.isArray(xs) ? xs : []).map((x) => String(x).trim()).filter(Boolean)
    .map((x) => (hash ? `#${x.replace(/^#+/, "").replace(/\s+/g, "")}` : x))
    .filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, n);
};

export async function POST(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const limited = guardRate(req, "seo-generate", 20, 300_000);
  if (limited) return limited;
  try {
    if (!hasAI()) return NextResponse.json({ error: "AI isn't configured (PERPLEXITY_API_KEY)." }, { status: 503 });
    const b = (await req.json().catch(() => ({}))) as { platform?: string; text?: string };
    const platform = b.platform === "youtube" ? "youtube" : "instagram";
    const text = (b.text || "").trim();
    if (text.length < 20) return NextResponse.json({ error: "Paste at least a sentence or two." }, { status: 400 });
    if (text.length > 8000) return NextResponse.json({ error: "That's too long — paste up to 8,000 characters." }, { status: 400 });

    // Real signals to ground the model: what doctor-education accounts actually use.
    const data = await getSocialKeywords().catch(() => null);
    const rows = (data?.[platform] || []).slice(0, 40)
      .map((r) => `${r.keyword} (used by ${r.accounts} accounts, avg ${platform === "youtube" ? "views" : "likes+comments"} ${r.avgEngagement})`).join("; ");

    const system = "You are an SEO specialist for GooCampus, which guides Indian doctors (MBBS graduates) on NEET PG, FMGE, and careers/PG abroad via PLAB, AMC, USMLE, DHA and similar. Audience: Indian doctors and final-year medical students. Be specific and practical; never invent statistics.";
    const user = platform === "youtube"
      ? `Suggest YouTube SEO for this video script/description. Return JSON: {"keywords": up to 12 search phrases doctors would type, "tags": up to 15 YouTube tags, "titles": 3 title options under 70 characters, "hashtags": up to 5 hashtags}.\nKeywords that already perform on doctor-education YouTube: ${rows || "none available"}.\n\nSCRIPT:\n${text}`
      : `Suggest Instagram SEO for this post caption. Return JSON: {"keywords": up to 10 search keywords to weave into the caption (Instagram search reads captions), "hashtags": 15-20 hashtags mixing big and niche doctor hashtags}.\nHashtags/keywords that already perform on doctor-education Instagram: ${rows || "none available"}.\n\nCAPTION:\n${text}`;
    const out = await askPerplexityJSON<Out>(system, user, { maxTokens: 900, temperature: 0.4, feature: "seo-keywords" });
    if (!out) return NextResponse.json({ error: "The AI reply couldn't be read — try again." }, { status: 502 });
    return NextResponse.json({
      platform,
      keywords: clean(out.keywords, 12),
      hashtags: clean(out.hashtags, 20, true),
      ...(platform === "youtube" ? { tags: clean(out.tags, 15), titles: clean(out.titles, 3) } : {}),
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't generate keywords"), { status: 502 });
  }
}
