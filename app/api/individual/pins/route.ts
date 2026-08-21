import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { getUserById } from "@/lib/users";

// Cross-functional pin board for the individual dashboard. Shared by the team.
// Middleware already requires a valid session; POST/DELETE are same-origin (CSRF-checked).

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ configured: false, pins: [] });
  const { data, error } = await sb
    .from("ind_pins")
    .select("id, author_id, author_initials, text, created_at")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ configured: false, pins: [], error: error.message });
  const pins = (data ?? []).map((r) => ({
    id: r.id,
    text: r.text,
    initials: r.author_initials || getUserById(r.author_id)?.initials || "??",
    author: getUserById(r.author_id)?.name ?? r.author_id,
    createdAt: r.created_at,
  }));
  return NextResponse.json({ configured: true, pins });
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  const uid = getSessionUserId();
  const me = getUserById(uid);
  let text = "";
  try {
    const b = await req.json();
    text = typeof b?.text === "string" ? b.text.trim() : "";
  } catch {}
  if (!text) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  if (text.length > 500) text = text.slice(0, 500);
  const { data, error } = await sb
    .from("ind_pins")
    .insert({ author_id: uid, author_initials: me?.initials ?? null, text })
    .select("id, author_initials, text, created_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    pin: { id: data.id, text: data.text, initials: data.author_initials || me?.initials || "??", author: me?.name ?? uid, createdAt: data.created_at },
  });
}

export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "no id" }, { status: 400 });
  const { error } = await sb.from("ind_pins").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
