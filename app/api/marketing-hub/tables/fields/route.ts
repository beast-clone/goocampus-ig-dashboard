import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// Fields (columns) of a generic table.
export const dynamic = "force-dynamic";
const TYPES = new Set(["text", "number", "select", "date", "checkbox"]);
const slug = (s: string) => "f_" + s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) + "_" + Math.random().toString(36).slice(2, 5);

// POST — add a field. Body: { tableId, label, type, options? }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { tableId?: string; label?: string; type?: string; options?: string[] };
    if (!body.tableId || !body.label?.trim()) return NextResponse.json({ error: "tableId and label required" }, { status: 400 });
    const type = TYPES.has(body.type || "") ? body.type : "text";
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb.from("mh_fields").insert({
      table_id: body.tableId, key: slug(body.label), label: body.label.trim(), type,
      options: type === "select" ? (body.options || []).filter(Boolean) : [],
    }).select("id, table_id, key, label, type, options, position").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ field: data });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// DELETE — remove a field. ?id=
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("mh_fields").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
