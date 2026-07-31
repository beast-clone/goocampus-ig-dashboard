import { askPerplexity, parseLooseJson } from "@/lib/ai";

// Content pipeline.
//  - Path A ("quick post" from Content Radar): a Radar item is already a specific,
//    real news story, so we skip deep research — verify the core claim with live
//    sources (sonar), then write ready-to-post drafts.
//  - Path B ("research your own topic"): a bare topic → sonar-deep-research browses
//    many sources, we fact-check, then write the same drafts and keep the source
//    URLs it searched so the team can see where every claim came from.

export type GenInput = { title: string; source?: string | null; url?: string | null; interest?: string | null };
export type GenDraft = { platform: string; label: string; content: string };
export type GenResult = { factcheck: string; drafts: GenDraft[]; citations: string[]; model: string };

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram post",
  carousel: "Instagram carousel",
  linkedin: "LinkedIn post",
  reel: "Reel / Shorts script",
};

const SYSTEM = `You are the senior content writer for GooCampus, which guides Indian medical students and doctors on NEET, MBBS/MD abroad, medical PG abroad, and international licensing (PLAB, AMC, USMLE, Gulf/DHA, etc.). Voice: warm, credible, specific, never hyped. Never invent statistics or dates — if unsure, keep it general. Write for real aspirants, not marketers.`;

// The four drafts every path produces, described once so Path A and Path B stay identical.
const POSTS_SPEC = `  "posts": [
    { "platform": "instagram", "content": "single-image Instagram post caption: strong first-line hook, 3-5 short lines, one clear CTA, then 4-6 relevant hashtags" },
    { "platform": "carousel", "content": "Instagram carousel: 5-7 slides. Format each as 'Slide 1: <cover hook>', 'Slide 2: ...' etc — one idea per slide, punchy on-slide text, last slide a CTA. Then a short caption line and 4-6 hashtags." },
    { "platform": "linkedin", "content": "concise LinkedIn post (120-180 words): the insight + why it matters for IMGs, professional tone, no hashtags spam" },
    { "platform": "reel", "content": "30-45s Reel/Shorts script: [HOOK] line, 3 quick beats, [CTA], with (on-screen text) cues" }
  ]`;

type Raw = { factcheck?: string; posts?: { platform: string; content: string }[] };

function toResult(raw: Raw | null, citations: string[], model: string): GenResult {
  if (!raw) throw new Error("Content generation returned no parseable output");
  const drafts: GenDraft[] = (raw.posts || [])
    .map((p) => ({ platform: p.platform, label: PLATFORM_LABEL[p.platform] || p.platform, content: (p.content || "").trim() }))
    .filter((d) => d.content);
  if (drafts.length === 0) throw new Error("No drafts were produced");
  return { factcheck: (raw.factcheck || "").trim(), drafts, citations, model };
}

// Path A — verify a known headline, then write. Fast + cheap (single live-search pass).
export async function generateQuickPost(input: GenInput): Promise<GenResult> {
  const model = "sonar";
  const user = `A news item was flagged in our Content Radar. First verify its core claim against current sources, then write ready-to-post content for our audience.

HEADLINE: ${input.title}
SOURCE: ${input.source || "—"}
LINK: ${input.url || "—"}
TOPIC: ${input.interest || "—"}

Return ONLY JSON in exactly this shape:
{
  "factcheck": "1-3 sentences: is the claim accurate right now? note what you verified (dates/authority).",
${POSTS_SPEC}
}`;

  const { text, citations } = await askPerplexity(SYSTEM, `${user}\n\nIMPORTANT: reply with ONLY valid JSON — no markdown, no code fences, no prose.`,
    { model, maxTokens: 2400, temperature: 0.4, timeoutMs: 60_000 });
  return toResult(parseLooseJson<Raw>(text), citations, model);
}

// Path B — the team types a bare topic. Deep-research browses many sources, we
// fact-check what it found, then write the drafts. Slower + pricier, but grounded
// in real sources whose URLs we return so the team can verify.
export async function generateFromTopic(topic: string): Promise<GenResult> {
  const model = "sonar-deep-research";
  const user = `Our team wants content on this topic. Research it thoroughly across current, credible sources, establish what is actually true right now, then write ready-to-post content for our audience.

TOPIC: ${topic}

Return ONLY JSON in exactly this shape:
{
  "factcheck": "2-4 sentences summarising what you verified: the key facts, dates, and authorities, and anything uncertain or contested. Do not invent numbers.",
${POSTS_SPEC}
}`;

  // Deep research is slow (it reads many pages) — give it a wide timeout. The make
  // route runs this fire-and-forget on a long-lived server, so a long wait is safe.
  const { text, citations } = await askPerplexity(SYSTEM, `${user}\n\nIMPORTANT: the final message must be ONLY valid JSON — no markdown, no code fences, no prose before or after.`,
    { model, maxTokens: 3200, temperature: 0.4, timeoutMs: 180_000 });
  return toResult(parseLooseJson<Raw>(text), citations, model);
}
