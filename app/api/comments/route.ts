import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSessionUserId } from "@/lib/auth";
import { listComments, saveComment, setCommentResolved } from "@/lib/comments";
import { requireSection } from "@/lib/api-guard";

// Log a dashboard comment server-side (for the daily digest email). Any signed-in
// user can post; the widget keeps its own localStorage copy for the pins.
//   POST /api/comments  { id, path, text, author, ts }
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!getSessionUserId()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const b = (await req.json()) as { id?: string; path?: string; text?: string; author?: string; ts?: number; ctx?: Record<string, unknown> };
    const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
    const ctx = b.ctx && typeof b.ctx === "object"
      ? { target: s(b.ctx.target, 200), section: s(b.ctx.section, 160), url: s(b.ctx.url, 400), viewport: s(b.ctx.viewport, 40) }
      : undefined;
    const text = (b.text || "").trim();
    if (!text) return NextResponse.json({ error: "empty comment" }, { status: 400 });
    await saveComment({
      id: b.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: (b.path || "/").slice(0, 300),
      text: text.slice(0, 4000),
      author: (b.author || "Someone").slice(0, 80),
      ts: typeof b.ts === "number" ? b.ts : Date.now(),
      ...(ctx ? { ctx } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not log the comment"), { status: 502 });
  }
}

// GET /api/comments → { comments } — every dashboard comment, newest first.
// Admin only (the System section), like Team and Integrations.
export async function GET() {
  const denied = await requireSection("system");
  if (denied) return denied;
  try {
    return NextResponse.json({ comments: await listComments() });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load comments"), { status: 502 });
  }
}

// PATCH /api/comments { id, resolved, note? } — admin marks a comment resolved (with an
// optional "what was done" note) or reopens it.
export async function PATCH(req: Request) {
  const denied = await requireSection("system");
  if (denied) return denied;
  try {
    const b = (await req.json().catch(() => ({}))) as { id?: string; resolved?: boolean; note?: string };
    if (!b.id || typeof b.resolved !== "boolean") return NextResponse.json({ error: "id and resolved required" }, { status: 400 });
    const note = typeof b.note === "string" ? b.note.slice(0, 1000) : undefined;
    const ok = await setCommentResolved(b.id, b.resolved, getSessionUserId() || "admin", note);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Comment not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not update the comment"), { status: 502 });
  }
}
