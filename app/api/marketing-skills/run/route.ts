import { NextResponse } from "next/server";
import { runSkill, TONES, type Tone } from "@/lib/marketing-skills";
import { guardRate, requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";

// POST /api/marketing-skills/run { slug, task, customPrompt? } → { output, citations, model, kind }
// customPrompt REPLACES the playbook's framework — see runSkill.
// Runs a marketing-skill framework through Perplexity, tailored to GooCampus.
// Rate-limited — it's a paid Perplexity call.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const limited = guardRate(req, "marketing-skill", 20, 300_000);
  if (limited) return limited;
  try {
    const b = (await req.json().catch(() => ({}))) as { slug?: string; task?: string; engine?: string; customPrompt?: string; tone?: string };
    const slug = (b.slug || "").trim();
    const task = (b.task || "").trim();
    const engine = b.engine === "claude" ? "claude" : "sonar"; // default Sonar; only "claude" opts into Claude-via-Perplexity
    if (!slug || !task) return NextResponse.json({ error: "slug and task are required" }, { status: 400 });
    if (task.length > 4000) return NextResponse.json({ error: "task too long (max 4000 chars)" }, { status: 400 });
    const custom = (b.customPrompt || "").trim();
    if (custom.length > 8000) return NextResponse.json({ error: "custom prompt too long (max 8000 chars)" }, { status: 400 });
    const tone = TONES.includes(b.tone as Tone) ? (b.tone as Tone) : null;
    const res = await runSkill(slug, task, engine, custom || null, tone);
    return NextResponse.json(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Distinguish the two common Perplexity failures so the reason is obvious.
    if (/invalid_api_key|invalid api key/i.test(msg)) {
      return NextResponse.json(
        { error: "Perplexity rejected the API key as invalid — recheck PERPLEXITY_API_KEY in .env.local (paste the full key, no quotes, no spaces, no line break)." },
        { status: 401 },
      );
    }
    // Rate-limited and out-of-credit are NOT the same thing, and lumping them together
    // told people to top up an account that had money in it. Running a few playbooks at
    // once trips Perplexity's rate limit — each framework is ~12k characters, so this is
    // easy to hit by clicking around, and it clears on its own within seconds.
    if (/\b429\b|rate.?limit|too many requests/i.test(msg)) {
      return NextResponse.json(
        { error: "Too many playbooks at once — Perplexity rate-limited this one. Wait a few seconds and run it again; there is nothing wrong with your account." },
        { status: 429 },
      );
    }
    if (/quota|insufficient|credit|\b402\b/i.test(msg)) {
      return NextResponse.json(
        { error: "Perplexity is out of credit — top up your Perplexity API plan at perplexity.ai/settings/api to run playbooks." },
        { status: 402 },
      );
    }
    return NextResponse.json(safeError(err, "Skill run failed"), { status: 502 });
  }
}
