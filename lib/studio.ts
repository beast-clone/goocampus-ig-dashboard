import { askPerplexity, askClaudeViaPerplexity } from "@/lib/ai";
import { getSkillDoc, listSkills } from "@/lib/marketing-skills";

// Content Studio — one radar item becoming one task on the board.
//
// Two engines, doing the two things each is actually good at, both billed to the same
// PERPLEXITY_API_KEY: Perplexity reads the live web and says what is true; Claude writes.
// That split is the whole design. The old Studio had Perplexity doing both, and its
// drafts were serviceable but generic — while the one genuinely valuable thing it
// produced, the fact-check, was buried at the bottom of a modal where it could not stop
// anyone publishing the wrong thing.
//
// Agreed with Praveen L on 27 Sep 2026: "We'll use perplexity only for fact check. And
// Claude, once the perplexity gives the content, we can push it to Claude."

// Shared with lib/marketing-skills — the same business context whichever engine runs.
const GC_CONTEXT =
  "GooCampus guides Indian medical students and doctors on NEET (UG/PG), MBBS/MD abroad, medical PG abroad, and international licensing (PLAB UK, AMC Australia, USMLE, Gulf/DHA). Audience: Indian medical aspirants and IMG doctors. Voice: warm, credible, specific, never hyped. Never invent statistics or dates.";

export type FactCheck = {
  /** ok = the headline holds up · careful = it overstates · wrong = do not post this. */
  verdict: "ok" | "careful" | "wrong";
  summary: string;
  /** The claims that survived checking. These go into the writing prompt verbatim. */
  facts: string[];
  citations: string[];
};

/**
 * What is actually true about this story, before anybody writes a word.
 *
 * Deliberately the FIRST step rather than a review at the end: on a real item this
 * caught a headline announcing that the NEET PG answer key was "live" when NBEMS had not
 * released it. Checked afterwards, that is a correction; checked first, it is the post.
 */
export async function factCheck(title: string, url?: string | null): Promise<FactCheck> {
  const system = [
    "You verify news claims for a marketing team before they post about them.",
    `Business context — ${GC_CONTEXT}`,
    "Read the live web. Decide whether the headline is accurate, overstated, or plainly wrong.",
    "Return STRICT JSON only, no prose and no code fence:",
    '{"verdict":"ok|careful|wrong","summary":"one or two sentences a person can act on","facts":["verified claim", "..."]}',
    "facts must contain only claims you actually verified — 3 to 6 of them, each a complete sentence.",
    "If a date or number could not be confirmed, say so in summary rather than guessing it.",
  ].join("\n");

  const user = [
    `HEADLINE: ${title}`,
    url ? `SOURCE: ${url}` : "",
    "",
    "Is this accurate as written, right now? What is actually confirmed?",
  ].filter(Boolean).join("\n");

  const { text, citations } = await askPerplexity(system, user, {
    model: "sonar-pro", maxTokens: 900, temperature: 0.1, timeoutMs: 40_000, feature: "studio-factcheck",
    detail: {
      slug: "factcheck", label: "Fact-check", taskText: title, usedCustom: false,
    },
  });

  const parsed = looseJson(text);
  // Sonar staples "[1][2][3]" onto every claim. Those markers point at a numbered list
  // that does not travel with the text, so downstream they are noise at best — and left
  // in, they end up inside the prompt and then inside a published caption.
  const clean = (t: string) => t.replace(/\s*\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
  return {
    verdict: parsed?.verdict === "wrong" ? "wrong" : parsed?.verdict === "ok" ? "ok" : "careful",
    // A fact-check that fails to parse must not silently become "all clear" — the
    // fallback is the cautious verdict above plus whatever the model did say.
    summary: clean(parsed?.summary || text || "").slice(0, 600),
    facts: Array.isArray(parsed?.facts)
      ? parsed.facts.filter((f) => typeof f === "string").map(clean).filter(Boolean).slice(0, 6)
      : [],
    citations: citations.slice(0, 15),
  };
}

function looseJson(text: string): { verdict?: string; summary?: string; facts?: string[] } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export type Brief = {
  title: string;
  url?: string | null;
  source?: string | null;
  format: string;      // a Content Calendar type, e.g. "Carousel"
  brand: string;       // an SBU
  /** A playbook slug, or "" for no house recipe. */
  playbook?: string | null;
  facts?: string[];
  factSummary?: string | null;
  citations?: string[];
  /** Anything the writer wants to add in their own words. */
  extra?: string | null;
};

// What each format actually is, so the prompt asks for the right shape rather than
// "write a post" and hoping. Keyed to the Content Calendar's own type names.
const FORMAT_BRIEF: Record<string, string> = {
  "Post": "a single Instagram image post: one caption of 60-120 words, and one line of on-image text",
  "Carousel": "an Instagram carousel of 6 slides: slide 1 is the hook, slides 2-5 carry the argument, slide 6 is what to do now. Give each slide's on-image text AND the caption underneath",
  "Reel - Original": "a 30-45 second reel script: a hook line, 3-4 beats with on-screen text, and a close. Written to be spoken",
  "Reel - Cut": "a 20-30 second reel script cut from existing footage: hook, 3 beats of on-screen text, close",
  "Reel Thumbnail": "the on-image text for a reel cover: 3-6 words that make someone stop",
  "YouTube Long-Form": "a YouTube script outline: title, hook (first 15 seconds, written out), 4-6 sections with what each covers, and the close",
  "YouTube Shorts": "a 45-second vertical script: hook, 3 beats, close",
  "YouTube Thumbnail": "thumbnail text options: 4 alternatives of 3-5 words each",
  "Meta Ads": "ad copy: 3 primary-text options (max 125 characters), 3 headlines (max 40), one description",
  "Meta Ads - Video": "a 15-second video ad script plus 3 headline options (max 40 characters)",
  "Story (Image)": "3 Instagram story frames: the on-image text for each, and what the sticker or CTA is",
  "Story (Video)": "a 15-second story script: what is said, what is on screen",
  "Atomic Essay": "a 250-300 word essay: one idea, argued plainly, ending on a single takeaway",
};

/**
 * The prompt Claude receives. Built here rather than in the page so the same words go
 * out whether Claude is called directly or the prompt is copied into the Claude app —
 * otherwise the two paths quietly drift and the copied one gets worse.
 */
export function buildPrompt(b: Brief): string {
  const shape = FORMAT_BRIEF[b.format] || `a ${b.format}`;
  const playbook = b.playbook ? getSkillDoc(b.playbook) : null;
  const playbookName = b.playbook ? listSkills().find((s) => s.slug === b.playbook)?.name : null;

  const parts: string[] = [];
  parts.push(`Write ${shape} for ${b.brand}.`);
  parts.push("");
  parts.push("TOPIC");
  parts.push(b.title);
  if (b.source || b.url) parts.push(`(from ${b.source || ""}${b.url ? ` — ${b.url}` : ""})`);

  if (b.factSummary || (b.facts && b.facts.length)) {
    parts.push("");
    parts.push("WHAT IS ACTUALLY TRUE — verified, do not contradict any of this");
    if (b.factSummary) parts.push(b.factSummary);
    for (const f of b.facts || []) parts.push(`- ${f}`);
  }

  parts.push("");
  parts.push("WHO IT IS FOR");
  parts.push(GC_CONTEXT);

  if (b.extra?.trim()) {
    parts.push("");
    parts.push("ALSO");
    parts.push(b.extra.trim());
  }

  if (playbook) {
    // The house recipe goes in last and in full. This is the only reason the Playbooks
    // tab and the Create tab should know about each other: picking an angle has to
    // actually change what gets written, or it is decoration.
    parts.push("");
    parts.push(`HOUSE PLAYBOOK — "${playbookName}". Follow it.`);
    parts.push(playbook.length > 6000 ? `${playbook.slice(0, 6000)}\n…` : playbook);
  }

  parts.push("");
  parts.push("RULES");
  parts.push("- Write the finished copy. No preamble, no options, no explaining what you did.");
  parts.push("- No emojis, no decorative symbols, no inline citation markers.");
  parts.push("- Never state a date, number or deadline that is not in the verified list above.");

  if (b.citations?.length) {
    parts.push("");
    parts.push("SOURCES");
    for (const c of b.citations.slice(0, 6)) parts.push(c);
  }

  return parts.join("\n");
}

/** Claude writes it, here, using exactly the prompt above. */
export async function writeDraft(b: Brief): Promise<{ text: string; model: string }> {
  const system = [
    "You are a senior content writer for an education consultancy. You produce finished, publishable copy.",
    "Never ask questions. Never explain your reasoning. Return only the copy itself.",
  ].join("\n");
  const { text } = await askClaudeViaPerplexity(system, buildPrompt(b), {
    maxTokens: 2200, temperature: 0.6, timeoutMs: 90_000, feature: "studio-write",
    detail: {
      slug: b.playbook || "write",
      // The format and brand are the useful label here — "Carousel · India NEET PG
      // Consulting" says more in a report row than the word "write".
      label: `${b.format} · ${b.brand}`,
      taskText: b.title,
      usedCustom: !!b.extra?.trim(),
      customPrompt: b.extra?.trim() || undefined,
    },
  });
  return { text: text.trim(), model: "claude-sonnet-4-5" };
}
