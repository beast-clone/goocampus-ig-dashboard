import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { chatKind, normalizeChatId } from "@/lib/whatsapp";

// Saved recipients for the Community Broadcast picker.
//
// The live WhatsApp contact/group list isn't available yet — WAHA's /api/contacts/all
// needs the session re-paired with its store enabled. Until then people save the
// chats they send to, and the picker reads THIS. When the synced list arrives it
// becomes a second source behind the same picker; nothing above here changes.
//
// Stored in discover_cache (source "whatsapp_recipient"), the project's key-value
// table, so this needs no migration of its own.
//   GET    -> the saved list
//   POST   { id, label?, kind? } -> save one
//   DELETE ?id=<chatId>          -> forget one
export const dynamic = "force-dynamic";

const SOURCE = "whatsapp_recipient";
const KEY = (chatId: string) => `wa-recipient:${chatId}`;

type Saved = { id: string; label: string; kind: ReturnType<typeof chatKind> };

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb.from("discover_cache").select("payload").eq("source", SOURCE).limit(500);
    if (error) throw new Error(error.message);
    const recipients = (data || [])
      .map((r) => r.payload as Saved)
      .filter((r) => r && r.id)
      .sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));
    // `synced: false` tells the UI the live WhatsApp list isn't wired up yet.
    return NextResponse.json({ recipients, synced: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load saved recipients"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json().catch(() => ({}))) as { id?: string; label?: string };
    const id = normalizeChatId(b.id || "");
    if (!id) return NextResponse.json({ error: "that doesn't look like a number, group id or channel id" }, { status: 400 });
    const payload: Saved = { id, label: (b.label || "").trim() || id, kind: chatKind(id) };

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("discover_cache").upsert(
      { cache_key: KEY(id), source: SOURCE, last_fetched: new Date().toISOString(), payload },
      { onConflict: "cache_key" },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, recipient: payload });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to save the recipient"), { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("discover_cache").delete().eq("cache_key", KEY(id)).eq("source", SOURCE);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to remove the recipient"), { status: 502 });
  }
}
