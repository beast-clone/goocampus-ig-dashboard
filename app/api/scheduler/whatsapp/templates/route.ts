import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// Saved message templates for Community Broadcast — the cut-off posts and the
// like that go out every round with a couple of words changed.
// Kept in discover_cache (source "whatsapp_template"), the project's key-value
// table, so this needs no migration.
//   GET    -> every template
//   POST   { name, body?, imageUrl? } -> save (a repeated name overwrites)
//   DELETE ?id=<template id>
export const dynamic = "force-dynamic";

const SOURCE = "whatsapp_template";
const KEY = (id: string) => `wa-template:${id}`;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "template";

type Template = { id: string; name: string; body: string; imageUrl: string | null; updatedAt: string; by: string | null };

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb.from("discover_cache").select("payload").eq("source", SOURCE).limit(200);
    if (error) throw new Error(error.message);
    const templates = (data || [])
      .map((r) => r.payload as Template)
      .filter((t) => t && t.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load templates"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json().catch(() => ({}))) as { name?: string; body?: string; imageUrl?: string };
    const name = (b.name || "").trim();
    const body = (b.body || "").trim();
    if (!name) return NextResponse.json({ error: "the template needs a name" }, { status: 400 });
    if (!body && !b.imageUrl) return NextResponse.json({ error: "nothing to save — write the message first" }, { status: 400 });

    const t: Template = {
      id: slug(name), name, body,
      imageUrl: (b.imageUrl || "").trim() || null,
      updatedAt: new Date().toISOString(), by: getSessionUserId() || null,
    };
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("discover_cache").upsert(
      { cache_key: KEY(t.id), source: SOURCE, last_fetched: t.updatedAt, payload: t },
      { onConflict: "cache_key" },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, template: t });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to save the template"), { status: 502 });
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
    return NextResponse.json(safeError(err, "Failed to delete the template"), { status: 502 });
  }
}
