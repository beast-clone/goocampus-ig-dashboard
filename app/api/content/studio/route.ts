import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { factCheck, writeDraft, buildPrompt, type Brief } from "@/lib/studio";

// POST /api/content/studio
//   { step: "check", title, url? }        → Perplexity says what is actually true
//   { step: "write", brief }              → Claude writes it
//   { step: "prompt", brief }             → the same prompt, to copy into the Claude app
//
// One route for the three steps because they are one flow over one item, and splitting
// them into three files would have meant three copies of the guard and the error shape.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Claude writing a carousel runs 20-40s. Netlify's synchronous ceiling is 26s, so this
// stays under it — a longer budget here would only produce a gateway timeout in prod.
export const maxDuration = 26;

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const b = (await req.json()) as { step?: string; title?: string; url?: string; brief?: Brief };

    if (b.step === "check") {
      if (!b.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
      return NextResponse.json(await factCheck(b.title.trim(), b.url || null));
    }

    if (b.step === "prompt") {
      if (!b.brief?.title) return NextResponse.json({ error: "brief is required" }, { status: 400 });
      return NextResponse.json({ prompt: buildPrompt(b.brief) });
    }

    if (b.step === "write") {
      if (!b.brief?.title) return NextResponse.json({ error: "brief is required" }, { status: 400 });
      if (!b.brief.format || !b.brief.brand) {
        return NextResponse.json({ error: "format and brand are required" }, { status: 400 });
      }
      return NextResponse.json(await writeDraft(b.brief));
    }

    return NextResponse.json({ error: "step must be check | write | prompt" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(safeError(err, "Content Studio couldn't finish that"), { status: 502 });
  }
}
