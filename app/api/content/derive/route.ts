import { NextResponse } from "next/server";
import { deriveFromContent } from "@/lib/content-derive";
import { guardRate } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";

// POST /api/content/derive { source, formats:[] } → { drafts:[] }
// The V2 "choose your output" step — turns generated content into only the picked
// formats (carousel, reel, blog, LinkedIn, caption, poster). Rate-limited (paid).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = guardRate(req, "content-derive", 20, 300_000);
  if (limited) return limited;
  try {
    const b = (await req.json().catch(() => ({}))) as { source?: string; formats?: string[]; custom?: string };
    const source = (b.source || "").trim();
    const formats = Array.isArray(b.formats) ? b.formats.filter((f) => typeof f === "string") : [];
    const custom = typeof b.custom === "string" ? b.custom.slice(0, 1500) : undefined;
    if (!source) return NextResponse.json({ error: "source content is required" }, { status: 400 });
    if (!formats.length) return NextResponse.json({ error: "pick at least one format" }, { status: 400 });
    const { drafts, tokens } = await deriveFromContent(source, formats, custom);
    return NextResponse.json({ drafts, tokens });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/invalid_api_key/i.test(msg)) return NextResponse.json({ error: "Perplexity key is invalid — check .env.local." }, { status: 401 });
    if (/quota|insufficient/i.test(msg)) return NextResponse.json({ error: "Perplexity is out of quota — top up your plan." }, { status: 402 });
    return NextResponse.json(safeError(err, "Generation failed"), { status: 502 });
  }
}
