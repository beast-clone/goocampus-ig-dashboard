import { askPerplexity, parseLooseJson } from "@/lib/ai";

// "Choose your output" — the V2 pipeline step. Takes an already-generated piece
// (a pillar explainer, a strategy, any playbook result) and turns it into ONLY the
// formats the user picked — carousel, reel, blog, LinkedIn, caption, poster — using
// only facts already present in the source (no new claims). Runs on Perplexity.

const SYSTEM = "You are the senior content writer for GooCampus (Indian medical education: NEET, MBBS/MD abroad, medical PG abroad, licensing PLAB/AMC/USMLE/DHA; audience: Indian medical students and IMG doctors). Voice: warm, credible, specific, professional. Never invent statistics or dates. Never use emojis. Write ready-to-use copy.";

export const DERIVE_FORMATS: Record<string, { label: string; spec: string; dest: string }> = {
  carousel:  { label: "Instagram carousel", dest: "Send to Scheduler", spec: "An Instagram carousel of 6-8 slides. EVERY slide must have a short bold heading AND 1-3 supporting bullet points beneath it — never a bare heading on its own. Format each as 'Slide 1: <heading>' on its own line, then '- <point>' bullet lines under it. Make the final slide a clear CTA. After the slides, add a short caption line and 4-6 relevant hashtags." },
  reel:      { label: "Reel / Shorts script", dest: "Send to Scheduler", spec: "A 30-45 second Reel/Shorts script: a [HOOK] line, 3 quick beats, a [CTA], with (on-screen text) cues in brackets." },
  linkedin:  { label: "LinkedIn post", dest: "Send to Scheduler", spec: "A concise LinkedIn post (120-180 words): the insight and why it matters for IMG doctors, professional tone, no hashtag spam." },
  instagram: { label: "Instagram caption", dest: "Send to Scheduler", spec: "A single-image Instagram post caption: a strong first-line hook, 3-5 short lines, one clear CTA, then 4-6 relevant hashtags." },
  blog:      { label: "Blog article", dest: "Save to blog drafts", spec: "An SEO blog article (600-900 words): an H1 title line, a one-line meta description, then a sectioned body using ## H2 headings, a short intro and a conclusion with a CTA. Accurate and genuinely useful." },
  poster:    { label: "Poster brief", dest: "Send to a designer", spec: "A poster/graphic brief for a designer: a headline, a subhead, 3-4 key points or stats to feature, a CTA, and a short visual direction (layout, imagery, tone)." },
};

export type DeriveDraft = { format: string; label: string; dest: string; content: string };

export async function deriveFromContent(source: string, formats: string[], custom?: string): Promise<{ drafts: DeriveDraft[]; tokens: number }> {
  const picked = formats.filter((f) => DERIVE_FORMATS[f]);
  if (!picked.length || !source.trim()) return { drafts: [], tokens: 0 };
  const specList = picked.map((f, i) => `${i + 1}. "${f}" — ${DERIVE_FORMATS[f].spec}`).join("\n");
  // Optional user steer — governs structure/style/format of every piece. If it holds a
  // reference URL, sonar-pro can read it and match its shape. Facts still come from SOURCE.
  const customText = (custom || "").trim();
  const customBlock = customText
    ? `\n\nUSER'S CUSTOM INSTRUCTIONS (highest priority — follow these exactly for the structure, style, and format of every piece): ${customText}\nIf a reference link is included above, analyze that page and match its structure and tone. Any facts, numbers, or dates must still come only from the SOURCE.`
    : "";
  const user = `From the SOURCE content below, create the requested formats. Use ONLY facts already present in the source — do not add any new claim, number, or date.

SOURCE:
${source.slice(0, 6000)}

Create these formats:
${specList}${customBlock}

Return ONLY JSON in this exact shape: { "drafts": [ { "format": "<the key, e.g. carousel>", "content": "<the finished content>" } ] }`;

  const { text, usage } = await askPerplexity(SYSTEM, `${user}\n\nIMPORTANT: reply with ONLY valid JSON — no markdown, no code fences, no prose.`,
    { model: "sonar-pro", maxTokens: 3400, temperature: 0.4, timeoutMs: 90_000 });

  const raw = parseLooseJson<{ drafts?: { format: string; content: string }[] }>(text);
  const drafts = (raw?.drafts || [])
    .map((d) => ({ format: d.format, label: DERIVE_FORMATS[d.format]?.label || d.format, dest: DERIVE_FORMATS[d.format]?.dest || "", content: (d.content || "").trim() }))
    .filter((d) => d.content);
  return { drafts, tokens: usage.total };
}
