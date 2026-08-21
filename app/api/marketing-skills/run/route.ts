import { NextResponse } from "next/server";
import { runSkill } from "@/lib/marketing-skills";
import { guardRate, requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";

// POST /api/marketing-skills/run { slug, task } → { output, citations, model }
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
    const b = (await req.json().catch(() => ({}))) as { slug?: string; task?: string; engine?: string };
    const slug = (b.slug || "").trim();
    const task = (b.task || "").trim();
    const engine = b.engine === "claude" ? "claude" : "sonar"; // default Sonar; only "claude" opts into Claude-via-Perplexity
    if (!slug || !task) return NextResponse.json({ error: "slug and task are required" }, { status: 400 });
    if (task.length > 4000) return NextResponse.json({ error: "task too long (max 4000 chars)" }, { status: 400 });
    const res = await runSkill(slug, task, engine);
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
    if (/quota|insufficient|\b402\b|\b429\b/i.test(msg)) {
      return NextResponse.json(
        { error: "Perplexity is out of quota — top up your Perplexity API plan at perplexity.ai/settings/api to run playbooks." },
        { status: 402 },
      );
    }
    return NextResponse.json(safeError(err, "Skill run failed"), { status: 502 });
  }
}
