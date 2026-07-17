import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";

// Generic user-created tables (dashboard-owned). GET returns every table with its
// fields. POST creates a table (with a starter "Name" text field). DELETE removes one.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ tables: [] });
    const [tRes, fRes] = await Promise.all([
      sb.from("mh_tables").select("id, name, icon, position").order("position", { ascending: true }).order("created_at", { ascending: true }),
      sb.from("mh_fields").select("id, table_id, key, label, type, options, position").order("position", { ascending: true }).order("created_at", { ascending: true }),
    ]);
    if (tRes.error) throw new Error(tRes.error.message);
    if (fRes.error) throw new Error(fRes.error.message);
    const fieldsByTable = new Map<string, unknown[]>();
    for (const f of (fRes.data || []) as { table_id: string }[]) {
      const arr = fieldsByTable.get(f.table_id) || [];
      arr.push(f); fieldsByTable.set(f.table_id, arr);
    }
    const tables = ((tRes.data as { id: string }[]) || []).map((t) => ({ ...t, fields: fieldsByTable.get(t.id) || [] }));
    return NextResponse.json({ tables });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// POST — create a table. Body: { name }. Seeds one "Name" text field.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string };
    if (!body.name || !body.name.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb.from("mh_tables").insert({ name: body.name.trim(), created_by: getSessionUserId() }).select("id, name, icon, position").single();
    if (error) throw new Error(error.message);
    await sb.from("mh_fields").insert({ table_id: data.id, key: "name", label: "Name", type: "text", position: 0 });
    return NextResponse.json({ table: { ...data, fields: [{ table_id: data.id, key: "name", label: "Name", type: "text", options: [], position: 0 }] } });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// DELETE — remove a table (fields + records cascade). ?id=
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("mh_tables").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
