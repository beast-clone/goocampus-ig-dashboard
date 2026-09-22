import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { askPerplexityJSON, hasAI } from "@/lib/ai";
import { getTopic, saveTopic } from "@/lib/seo-topics";

// POST /api/seo/topics/suggest { id, platform } → AI keyword suggestions for a custom
// topic, saved on the topic so the next person sees them free. Perplexity, tracked as
// "seo-keywords".
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const limited = guardRate(req, "seo-topic-suggest", 20, 300_000);
  if (limited) return limited;
  try {
    if (!hasAI()) return NextResponse.json({ error: "AI isn't configured (PERPLEXITY_API_KEY)." }, { status: 503 });
    const b = (await req.json().catch(() => ({}))) as { id?: string; platform?: string };
    const platform = b.platform === "youtube" ? "youtube" : "instagram";
    const topic = b.id ? await getTopic(b.id) : null;
    if (!topic) return NextResponse.json({ error: "Topic not found." }, { status: 404 });

    const system = "You are an SEO specialist for GooCampus, which guides Indian doctors (MBBS graduates) on NEET PG, FMGE, and careers/PG abroad. Audience: Indian doctors and final-year medical students. Be specific; never invent statistics.";
    const user = platform === "youtube"
      ? `Topic: "${topic.name}" (related words: ${topic.words.join(", ")}). Return JSON {"keywords": up to 12 YouTube search phrases Indian doctors type about this topic, "hashtags": up to 6 hashtags}.`
      : `Topic: "${topic.name}" (related words: ${topic.words.join(", ")}). Return JSON {"keywords": up to 8 Instagram search keywords Indian doctors use about this topic, "hashtags": 15 hashtags mixing big and niche doctor hashtags for it}.`;
    const out = await askPerplexityJSON<{ keywords?: string[]; hashtags?: string[] }>(system, user, { maxTokens: 600, temperature: 0.4, feature: "seo-keywords" });
    if (!out) return NextResponse.json({ error: "The AI reply couldn't be read — try again." }, { status: 502 });

    const seen = new Set<string>();
    const list = [...(out.keywords || []).map((x) => String(x).trim()), ...(out.hashtags || []).map((x) => `#${String(x).trim().replace(/^#+/, "").replace(/\s+/g, "")}`)]
      .filter((x) => x && x !== "#" && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 25);
    const saved = { ...topic, suggestions: { ...topic.suggestions, [platform]: list } };
    await saveTopic(saved);
    return NextResponse.json({ topic: saved });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't suggest keywords"), { status: 502 });
  }
}
