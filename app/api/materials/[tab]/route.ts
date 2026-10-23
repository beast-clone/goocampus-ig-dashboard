import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { canSeeTab } from "@/lib/permissions";
import { mtab, mTabSwitch, type MTab } from "@/lib/materials";

// Marketing Materials tabs (lib/materials.ts): list, add, edit, remove, bring back.
// Each tab needs its own switch on Team & access (Expenses, Paid Promotions and
// Subscriptions start off for non-admins). Removing sets deleted_at, so nothing is
// lost; PATCH { id, restore: true } brings a row back.
//
// GET → { rows } · POST { values } → { row } · PATCH { id, values | restore } → { row } · DELETE ?id=
async function gate(tabKey: string): Promise<{ t: MTab } | NextResponse> {
  const t = mtab(tabKey);
  if (!t) return NextResponse.json({ error: "Unknown tab" }, { status: 404 });
  const me = await rosterById(getSessionUserId());
  if (!canSeeTab(me, mTabSwitch(t.key))) return NextResponse.json({ error: `Your access doesn't include ${t.label} — ask an admin to switch it on in Team & access.` }, { status: 403 });
  return { t };
}

// Only the tab's own columns, each coerced to its type.
function clean(t: MTab, values: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of t.fields) {
    if (!values || !(f.key in values)) continue;
    const v = values[f.key];
    if (f.type === "money") out[f.key] = v === "" || v == null ? null : Number(v);
    else if (f.type === "bool") out[f.key] = !!v;
    else if (f.type === "multi") out[f.key] = Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [];
    else if (f.type === "files") out[f.key] = Array.isArray(v) ? v.filter((x) => x && typeof x === "object" && typeof (x as { url?: unknown }).url === "string") : [];
    else if (f.key === "title") out[f.key] = String(v ?? "").trim();
    else out[f.key] = v === "" || v == null ? null : String(v);
  }
  return out;
}

export async function GET(_req: Request, { params }: { params: { tab: string } }) {
  const g = await gate(params.tab); if (g instanceof NextResponse) return g;
  const sb = getSupabase(); if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  try {
    const { data, error } = await sb.from(g.t.table).select("*").is("deleted_at", null)
      .order(g.t.sort.col, { ascending: g.t.sort.asc, nullsFirst: false }).limit(5000);
    if (error) throw error;
    return NextResponse.json({ rows: data || [] });
  } catch (err) { return NextResponse.json(safeError(err, "Couldn't load"), { status: 502 }); }
}

export async function POST(req: Request, { params }: { params: { tab: string } }) {
  const g = await gate(params.tab); if (g instanceof NextResponse) return g;
  const sb = getSupabase(); if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  try {
    const { values } = (await req.json()) as { values?: Record<string, unknown> };
    const row = clean(g.t, values);
    if (!row.title) return NextResponse.json({ error: "Give it a name first." }, { status: 400 });
    const { data, error } = await sb.from(g.t.table).insert({ ...row, created_by: getSessionUserId() || null }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ row: data });
  } catch (err) { return NextResponse.json(safeError(err, "Couldn't save"), { status: 502 }); }
}

export async function PATCH(req: Request, { params }: { params: { tab: string } }) {
  const g = await gate(params.tab); if (g instanceof NextResponse) return g;
  const sb = getSupabase(); if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  try {
    const { id, values, restore } = (await req.json()) as { id?: string; values?: Record<string, unknown>; restore?: boolean };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const patch = restore ? { deleted_at: null } : clean(g.t, values);
    if ("title" in patch && !patch.title) return NextResponse.json({ error: "The name can't be empty." }, { status: 400 });
    const { data, error } = await sb.from(g.t.table).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ row: data });
  } catch (err) { return NextResponse.json(safeError(err, "Couldn't save"), { status: 502 }); }
}

export async function DELETE(req: Request, { params }: { params: { tab: string } }) {
  const g = await gate(params.tab); if (g instanceof NextResponse) return g;
  const sb = getSupabase(); if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { error } = await sb.from(g.t.table).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) { return NextResponse.json(safeError(err, "Couldn't remove"), { status: 502 }); }
}
