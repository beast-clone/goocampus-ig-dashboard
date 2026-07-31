import { askPerplexityJSON } from "@/lib/ai";

// Content pipeline (Path A — "quick post" from Content Radar).
// A Radar item is already a specific, real news story, so we skip deep research:
// verify the core claim with live sources, then write ready-to-post drafts for a
// few platforms. Path B (bare topic → full research) will extend this later.

export type GenInput = { title: string; source?: string | null; url?: string | null; interest?: string | null };
export type GenDraft = { platform: string; label: string; content: string };
export type GenResult = { factcheck: string; drafts: GenDraft[]; citations: string[]; model: string };

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram caption",
  linkedin: "LinkedIn post",
  reel: "Reel / Shorts script",
};

const SYSTEM = `You are the senior content writer for GooCampus, which guides Indian medical students and doctors on NEET, MBBS/MD abroad, medical PG abroad, and international licensing (PLAB, AMC, USMLE, Gulf/DHA, etc.). Voice: warm, credible, specific, never hyped. Never invent statistics or dates — if unsure, keep it general. Write for real aspirants, not marketers.`;

export async function generateQuickPost(input: GenInput): Promise<GenResult> {
  const model = "sonar"; // sonar has live web search → it can verify the headline
  const user = `A news item was flagged in our Content Radar. First verify its core claim against current sources, then write ready-to-post content for our audience.

HEADLINE: ${input.title}
SOURCE: ${input.source || "—"}
LINK: ${input.url || "—"}
TOPIC: ${input.interest || "—"}

Return ONLY JSON in exactly this shape:
{
  "factcheck": "1-3 sentences: is the claim accurate right now? note what you verified (dates/authority).",
  "posts": [
    { "platform": "instagram", "content": "full Instagram caption: strong first-line hook, 3-5 short lines, one clear CTA, then 4-6 relevant hashtags" },
    { "platform": "linkedin", "content": "concise LinkedIn post (120-180 words): the insight + why it matters for IMGs, professional tone, no hashtags spam" },
    { "platform": "reel", "content": "30-45s Reel/Shorts script: [HOOK] line, 3 quick beats, [CTA], with (on-screen text) cues" }
  ]
}`;

  type Raw = { factcheck?: string; posts?: { platform: string; content: string }[] };
  const raw = await askPerplexityJSON<Raw>(SYSTEM, user, { model, maxTokens: 1600, temperature: 0.4, timeoutMs: 45_000 });
  if (!raw) throw new Error("Content generation returned no parseable output");

  const drafts: GenDraft[] = (raw.posts || [])
    .map((p) => ({ platform: p.platform, label: PLATFORM_LABEL[p.platform] || p.platform, content: (p.content || "").trim() }))
    .filter((d) => d.content);
  if (drafts.length === 0) throw new Error("No drafts were produced");

  return { factcheck: (raw.factcheck || "").trim(), drafts, citations: [], model };
}
