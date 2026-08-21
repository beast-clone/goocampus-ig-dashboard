import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { generateQuickPost, generateFromTopic } from "@/lib/content-pipeline";
import { hasAI } from "@/lib/ai";
import { safeError } from "@/lib/errors";

// POST /api/content/make
// "Make content" from a Content Radar item (Path A). Creates a content_drafts row in
// 'generating' state, returns its id immediately, then generates the drafts in the
// background (long-lived server) and flips the row to 'ready' (or 'failed'). The
// Content Studio tab polls for the result.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    if (!hasAI()) return NextResponse.json({ error: "PERPLEXITY_API_KEY not configured" }, { status: 503 });
    const body = (await req.json()) as { title?: string; source?: string; url?: string; interest?: string; kind?: string };
    const title = (body.title || "").trim();
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    // kind "topic" → the team typed a bare topic (Path B, deep research).
    // Anything else → a Content Radar item with a known headline (Path A, quick).
    const isTopic = body.kind === "topic";

    const { data, error } = await sb.from("content_drafts").insert({
      kind: body.kind || "radar",
      title,
      source: isTopic ? null : (body.source || null),
      source_url: isTopic ? null : (body.url || null),
      interest: body.interest || null,
      status: "generating",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const id = data.id as string;

    // Fire-and-forget: generate, then write the result back. Never blocks the response.
    const work = isTopic
      ? generateFromTopic(title)
      : generateQuickPost({ title, source: body.source, url: body.url, interest: body.interest });
    work
      .then((r) => sb.from("content_drafts").update({
        status: "ready", factcheck: r.factcheck, drafts: r.drafts, citations: r.citations, model: r.model,
      }).eq("id", id))
      .catch((e) => sb.from("content_drafts").update({
        status: "failed", error: e instanceof Error ? e.message : String(e),
      }).eq("id", id));

    return NextResponse.json({ id, status: "generating" });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to start content generation"), { status: 502 });
  }
}
