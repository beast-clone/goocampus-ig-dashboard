import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// Saved WhatsApp templates — what came out of Template check and is worth keeping.
//
//   GET    /api/broadcast/templates
//   POST   /api/broadcast/templates   { name, category, header, body, footer, score, likely, status }
//   DELETE /api/broadcast/templates?id=…
//
// Saving by name updates in place, because Meta treats the name as the identity: a
// template cannot be renamed after approval, so two rows sharing one would be
// ambiguous here too.
export const dynamic = "force-dynamic";

const MISSING = new Set(["PGRST205", "42P01"]);
const notThereYet = {
  available: false, items: [],
  reason: "sql/035_wa_templates.sql hasn't been run yet — saving is off until it is.",
};

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json(notThereYet);
  const { data, error } = await sb.from("mh_wa_templates")
    .select("id, name, category, header, body, footer, score, likely, status, created_by, updated_at")
    .order("updated_at", { ascending: false }).limit(100);
  if (error) {
    if (MISSING.has(error.code)) return NextResponse.json(notThereYet);
    return NextResponse.json(safeError(error, "Couldn't load saved templates"), { status: 502 });
  }
  return NextResponse.json({ available: true, items: data || [] });
}

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json(notThereYet, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as {
    name?: string; category?: string; header?: string; body?: string; footer?: string;
    score?: number; likely?: string; status?: string;
  };
  if (!b.name?.trim()) return NextResponse.json({ error: "Give it a name first — that is how you find it again." }, { status: 400 });
  if (!b.body?.trim()) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const { error } = await sb.from("mh_wa_templates").upsert({
    // Meta only accepts lowercase names, and the unique constraint is on this column.
    name: b.name.trim().toLowerCase(),
    category: b.category || "MARKETING",
    header: b.header?.trim() || null,
    body: b.body,
    footer: b.footer?.trim() || null,
    score: typeof b.score === "number" ? b.score : null,
    likely: b.likely || null,
    status: b.status || "draft",
    created_by: getSessionUserId(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "name" });

  if (error) {
    if (MISSING.has(error.code)) return NextResponse.json(notThereYet, { status: 503 });
    return NextResponse.json(safeError(error, "Couldn't save it"), { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  const id = new URL(req.url).searchParams.get("id");
  if (!sb || !id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await sb.from("mh_wa_templates").delete().eq("id", id);
  if (error) return NextResponse.json(safeError(error, "Couldn't remove it"), { status: 502 });
  return NextResponse.json({ ok: true });
}
