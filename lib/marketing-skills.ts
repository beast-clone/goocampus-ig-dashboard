import fs from "fs";
import path from "path";
import { askPerplexity, askClaudeViaPerplexity } from "@/lib/ai";

// Which model runs a playbook. "sonar" = Perplexity's own Sonar (cheap, fast, good
// research). "claude" = Claude Sonnet 4.5 resold through Perplexity (stronger writer,
// pricier) — both billed to the same PERPLEXITY_API_KEY / balance.
export type Engine = "sonar" | "claude";

// The marketing-skills library — 49 framework prompts (Corey Haines' open pack,
// see marketing-skills/NOTICE.md) imported under marketing-skills/. Each skill is
// a markdown framework we run through Perplexity, tailored to GooCampus, so the
// team gets an expert deliverable without needing the Claude API.

export type SkillMeta = {
  slug: string; name: string; category: string; version: string; description: string; chars: number;
};

const DIR = path.join(process.cwd(), "marketing-skills");

let _manifest: SkillMeta[] | null = null;
export function listSkills(): SkillMeta[] {
  if (_manifest) return _manifest;
  try {
    _manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")) as SkillMeta[];
  } catch {
    _manifest = [];
  }
  return _manifest;
}

export function isSkill(slug: string): boolean {
  return listSkills().some((s) => s.slug === slug);
}

// Load a skill's framework markdown. Slug is validated against the manifest first
// so a request can never read an arbitrary file (no path traversal).
export function getSkillDoc(slug: string): string | null {
  if (!/^[a-z0-9-]+$/.test(slug) || !isSkill(slug)) return null;
  try {
    return fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
}

const GC_CONTEXT =
  "GooCampus guides Indian medical students and doctors on NEET (UG/PG), MBBS/MD abroad, medical PG abroad, and international licensing (PLAB UK, AMC Australia, USMLE, Gulf/DHA). Audience: Indian medical aspirants and IMG doctors. Voice: warm, credible, specific, never hyped. Never invent statistics or dates.";

export type RunResult = { output: string; citations: string[]; model: string; tokens: number; cost?: number | null; engine: Engine };

// Run a skill's framework against the user's task, tailored to GooCampus. Engine
// picks the writer: "sonar" (Perplexity, default) or "claude" (Claude Sonnet 4.5 via
// Perplexity — stronger writing, same key/bill). Same framework + GooCampus context
// go in either way, so switching engines is a true like-for-like comparison.
export async function runSkill(slug: string, task: string, engine: Engine = "sonar"): Promise<RunResult> {
  const doc = getSkillDoc(slug);
  if (!doc) throw new Error("Unknown skill");
  const meta = listSkills().find((s) => s.slug === slug)!;

  const system = [
    "You are an elite marketing operator. Apply the FRAMEWORK provided by the user to produce a concrete, usable deliverable.",
    `Business context — ${GC_CONTEXT}`,
    "Rules: produce the actual deliverable directly. Do NOT ask the user questions, do NOT say you need more info, do NOT mention reading files or other skills — assume the GooCampus context above.",
    "Style: write like a senior professional — clean, confident, specific. NEVER use emojis or decorative symbols. Structure with simple markdown only: short '## ' section headings, '- ' bullet lists, and '**bold**' just for key labels. Do NOT stack symbols or write markdown noise, and do NOT put inline citation markers like [1][2] in the body. Deliver polished, ready-to-use copy.",
  ].join("\n");

  const user = `FRAMEWORK — "${meta.name}":\n\n${doc}\n\n---\n\nTASK:\n${task}\n\nApply the framework above to this task for GooCampus and return the finished deliverable.`;

  // Pillar Content is the deep explainer — give it a much larger budget so it can go long.
  const isPillar = slug === "pillar-content";
  const maxTokens = isPillar ? 4200 : 2800;
  const timeoutMs = isPillar ? 120_000 : 90_000;

  if (engine === "claude") {
    const { text, citations, usage } = await askClaudeViaPerplexity(system, user, {
      model: "anthropic/claude-sonnet-4-5", maxTokens, temperature: 0.4, timeoutMs,
    });
    return { output: (text || "").trim(), citations: citations || [], model: "claude-sonnet-4-5", tokens: usage.total, cost: usage.cost ?? null, engine };
  }

  const { text, citations, usage } = await askPerplexity(system, user, {
    model: "sonar-pro", maxTokens, temperature: 0.4, timeoutMs,
  });
  return { output: (text || "").trim(), citations: citations || [], model: "sonar-pro", tokens: usage.total, cost: usage.cost ?? null, engine };
}
