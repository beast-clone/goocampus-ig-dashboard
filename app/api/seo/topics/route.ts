import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { deleteTopic, getTopic, listTopics, saveTopic } from "@/lib/seo-topics";

// GET    /api/seo/topics                  → the team's custom keyword topics
// POST   /api/seo/topics { id?, name, words } → add (or edit, with id) a topic
// DELETE /api/seo/topics { id }           → remove one
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  try { return NextResponse.json({ topics: await listTopics() }); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 500 }); }
}

export async function POST(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { id?: string; name?: string; words?: string[] | string };
  const name = (b.name || "").trim().slice(0, 60);
  const words = [...new Set((Array.isArray(b.words) ? b.words : String(b.words || "").split(","))
    .map((w) => String(w).trim().toLowerCase().replace(/^#/, "")).filter((w) => w.length >= 2))].slice(0, 12);
  if (!name) return NextResponse.json({ error: "Give the topic a name." }, { status: 400 });
  if (!words.length) return NextResponse.json({ error: "Add at least one word that identifies it (2+ letters)." }, { status: 400 });
  try {
    const prev = b.id ? await getTopic(b.id) : null;
    const topic = prev
      ? { ...prev, name, words, suggestions: prev.words.join() === words.join() ? prev.suggestions : undefined }
      : { id: crypto.randomUUID().slice(0, 8), name, words, createdBy: getSessionUserId() || undefined, createdAt: new Date().toISOString() };
    await saveTopic(topic);
    return NextResponse.json({ topic });
  } catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { id?: string };
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try { await deleteTopic(b.id); return NextResponse.json({ ok: true }); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 500 }); }
}
