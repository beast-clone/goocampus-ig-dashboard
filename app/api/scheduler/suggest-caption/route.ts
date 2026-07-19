import { NextResponse } from "next/server";
import { askPerplexityJSON, hasAI } from "@/lib/ai";
import { resolveAccountForPage, predictForCaption, type Prediction } from "@/lib/scheduler-helpers";
import { fetchRecentMedia } from "@/lib/instagram";
import { safeError } from "@/lib/errors";

// Generate 3 caption variants from a Content brief + a light tone sample of the
// brand's recent captions. Each variant is scored through the existing predictor
// so the user can compare expected reach side-by-side.
//
//   POST body: { publishToPage, contentBrief, currentCaption? }
//   Response:  { variants: [{ kind, caption, hashtags, prediction }] }

type VariantKind = "tone" | "seo" | "punchy";
type Variant = { kind: VariantKind; caption: string; hashtags: string[]; prediction: Prediction | null };

type CacheEntry = { fetchedAt: number; payload: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000; // 10 min — repeat clicks within the window don't burn OpenAI credits

function keyFor(brand: string, brief: string): string {
  // Trim + collapse whitespace + slice first 200 chars so trivial edits don't miss cache
  const norm = brief.trim().replace(/\s+/g, " ").slice(0, 200).toLowerCase();
  return `${brand}::${norm}`;
}

function extractHashtags(text: string): string[] {
  if (!text) return [];
  return (text.match(/#([\p{L}\p{N}_]+)/gu) || []).map((t) => t.slice(1));
}

export async function POST(req: Request) {
  let body: { publishToPage?: string; contentBrief?: string; currentCaption?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const publishToPage = body.publishToPage;
  const contentBrief = (body.contentBrief || "").trim();
  const currentCaption = (body.currentCaption || "").trim();

  if (!publishToPage) return NextResponse.json({ error: "publishToPage required" }, { status: 400 });
  if (!contentBrief) return NextResponse.json({ error: "contentBrief required" }, { status: 400 });
  if (contentBrief.length > 2000) return NextResponse.json({ error: "contentBrief too long (max 2000 chars)" }, { status: 400 });

  const cacheKey = keyFor(publishToPage, contentBrief);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return NextResponse.json({ ...cached.payload as object, cached: true });
  }

  const acc = resolveAccountForPage(publishToPage);
  if (!acc) return NextResponse.json({ error: "Unknown brand / account" }, { status: 400 });

  if (!hasAI()) return NextResponse.json({ error: "PERPLEXITY_API_KEY not configured" }, { status: 500 });

  try {
    // Pull 5 recent captions from THIS brand as a small tone sample — plenty to teach
    // sentence rhythm/hashtag placement without letting the model paint every post the
    // same colour. Kept short so it doesn't dominate the prompt or eat tokens.
    const media = await fetchRecentMedia(acc, 8);
    const toneSamples = media
      .map((m) => (m.caption || "").trim())
      .filter((c) => c.length > 40 && c.length < 800)
      .slice(0, 5);

    const prompt = buildPrompt(acc.handle, contentBrief, currentCaption, toneSamples);
    const parsed = await askPerplexityJSON<{ variants?: Array<{ kind?: string; caption?: string; hashtags?: string[] }> }>(
      "You are an Instagram caption writer for a lead-gen brand. Respond ONLY with valid JSON matching the schema described. Never wrap the JSON in markdown fences.",
      prompt,
      { temperature: 0.7 },
    );
    if (!parsed?.variants || !Array.isArray(parsed.variants) || parsed.variants.length === 0) {
      throw new Error("Caption model returned no variants");
    }

    // Normalize + score each variant through the existing predictor
    const kinds: VariantKind[] = ["tone", "seo", "punchy"];
    const variants: Variant[] = [];
    for (let i = 0; i < Math.min(3, parsed.variants.length); i++) {
      const v = parsed.variants[i];
      const captionText = (v.caption || "").trim();
      if (!captionText) continue;
      // Prefer the hashtags OpenAI returned; if it embedded them in the caption, extract those too
      const inlineTags = extractHashtags(captionText);
      const explicitTags = Array.isArray(v.hashtags) ? v.hashtags.map((t) => t.replace(/^#/, "")) : [];
      const hashtags = Array.from(new Set([...explicitTags, ...inlineTags])).slice(0, 12);

      // Predict against the same account — combine caption + hashtags so the predictor
      // sees the full thing the user would actually publish
      const fullText = hashtags.length > 0 && inlineTags.length === 0
        ? `${captionText}\n\n${hashtags.map((h) => "#" + h).join(" ")}`
        : captionText;
      const prediction = await predictForCaption(publishToPage, fullText);

      const kind = (kinds.includes((v.kind || "") as VariantKind) ? v.kind : kinds[i]) as VariantKind;
      variants.push({ kind, caption: captionText, hashtags, prediction });
    }

    const payload = { variants };
    cache.set(cacheKey, { fetchedAt: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Caption suggestion failed"), { status: 502 });
  }
}

function buildPrompt(handle: string, brief: string, currentDraft: string, tone: string[]): string {
  const toneSection = tone.length > 0
    ? `Here are ${tone.length} recent captions from ${handle} — use these ONLY to pick up tone, structure, and hashtag habits. DO NOT copy their topic:\n\n${tone.map((t, i) => `--- Past caption ${i + 1} ---\n${t}`).join("\n\n")}\n\n`
    : "";

  const draftSection = currentDraft
    ? `The user has already drafted this (their starting point, feel free to keep good bits):\n"""\n${currentDraft}\n"""\n\n`
    : "";

  return `${toneSection}${draftSection}Write 3 caption variants for the Instagram account ${handle} about this post topic:

"""
${brief}
"""

Return JSON with this exact schema:
{
  "variants": [
    { "kind": "tone", "caption": "...", "hashtags": ["tag1", "tag2", ...] },
    { "kind": "seo", "caption": "...", "hashtags": ["tag1", "tag2", ...] },
    { "kind": "punchy", "caption": "...", "hashtags": ["tag1", "tag2", ...] }
  ]
}

Rules for each variant:
- "tone" — match ${handle}'s existing voice/length/paragraph rhythm exactly. Same feel as the sample captions above.
- "seo" — same topic, but optimize wording for Instagram search + AI Overviews. Include primary keywords ${handle}'s audience searches for.
- "punchy" — shorter and more direct. Hook in first line. Strong CTA at end. Max 300 chars.

For every variant:
- The topic MUST be what the brief describes — do not drift into unrelated GooCampus themes.
- End with a comment-based CTA if the account uses those (check the tone sample).
- Suggest 4-8 relevant hashtags in the "hashtags" field (without the # sign). Prefer ones the brand already uses if they fit.
- Do NOT embed \\n\\n in JSON strings unless you actually want a paragraph break; keep them intentional.

Respond ONLY with the JSON, no prose before or after.`;
}
