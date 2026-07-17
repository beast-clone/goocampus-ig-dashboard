import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// Rows of a generic table. Values live in mh_records.data (jsonb keyed by field.key).
export const dynamic = "force-dynamic";

// GET ?tableId= — list rows.
export async function GET(req: Request) {
  try {
    const tableId = new URL(req.url).searchParams.get("tableId");
    if (!tableId) return NextResponse.json({ error: "tableId required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ records: [] });
    const { data, error } = await sb.from("mh_records").select("id, data, position").eq("table_id", tableId).order("position", { ascending: true }).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ records: data || [] });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// POST — add an (empty) row. Body: { tableId, data? }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { tableId?: string; data?: Record<string, unknown> };
    if (!body.tableId) return NextResponse.json({ error: "tableId required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb.from("mh_records").insert({ table_id: body.tableId, data: body.data || {} }).select("id, data, position").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ record: data });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// PATCH — set one cell. Body: { id, key, value } (merges into data).
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; key?: string; value?: unknown };
    if (!body.id || !body.key) return NextResponse.json({ error: "id and key required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const cur = await sb.from("mh_records").select("data").eq("id", body.id).single();
    if (cur.error) throw new Error(cur.error.message);
    const rec = { ...((cur.data?.data as Record<string, unknown>) || {}) };
    if (body.value === "" || body.value === null || body.value === undefined) delete rec[body.key];
    else rec[body.key] = body.value;
    const { error } = await sb.from("mh_records").update({ data: rec, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, data: rec });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// DELETE ?id= — remove a row.
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("mh_records").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
