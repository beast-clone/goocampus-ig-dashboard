import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";

// User-defined custom columns for the Master sheet. Definitions live in mh_columns;
// per-row values live in mh_posts.custom (jsonb), keyed by the column's `key`.
export const dynamic = "force-dynamic";

const TYPES = new Set(["text", "number", "select", "date", "checkbox"]);
const SELECT = "id, key, label, type, options, position, created_by";
const slug = (s: string) => "c_" + s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) + "_" + Math.random().toString(36).slice(2, 6);

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ columns: [] });
    const { data, error } = await sb.from("mh_columns").select(SELECT).order("position", { ascending: true }).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ columns: data || [] });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// POST — add a column. Body: { label, type, options? }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { label?: string; type?: string; options?: string[] };
    if (!body.label || !body.label.trim()) return NextResponse.json({ error: "label is required" }, { status: 400 });
    const type = TYPES.has(body.type || "") ? body.type : "text";
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb.from("mh_columns").insert({
      key: slug(body.label),
      label: body.label.trim(),
      type,
      options: type === "select" ? (body.options || []).filter(Boolean) : [],
      created_by: getSessionUserId(),
    }).select(SELECT).single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ column: data });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// DELETE — remove a column (metadata only; row values are left as harmless jsonb). ?id=
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("mh_columns").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
