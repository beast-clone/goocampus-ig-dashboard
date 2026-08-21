import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";

// User-defined custom columns for the Master sheet. Definitions live in mh_columns;
// per-row values live in mh_posts.custom (jsonb), keyed by the column's `key`.
// Adding a column is open to any signed-in teammate (additive); deleting one is
// destructive for everyone, so it's restricted to the column's creator or an admin.
export const dynamic = "force-dynamic";

const TYPES = new Set(["text", "number", "select", "date", "checkbox"]);
const SELECT = "id, key, label, type, options, position, created_by";
const slug = (s: string) => "c_" + s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) + "_" + Math.random().toString(36).slice(2, 6);

async function currentUser(): Promise<{ id: string; isAdmin: boolean } | null> {
  const id = getSessionUserId();
  if (!id) return null;
  try { const p = await rosterById(id); return { id, isAdmin: !!p?.isAdmin }; }
  catch { return { id, isAdmin: false }; }
}
// A column can be deleted by its creator or an admin (ownerless legacy columns are open).
const canDeleteColumn = (createdBy: string | null, me: { id: string; isAdmin: boolean } | null) =>
  !!me?.isAdmin || !createdBy || (!!me && createdBy === me.id);

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ columns: [], me: null });
    const me = await currentUser();
    const { data, error } = await sb.from("mh_columns").select(SELECT).order("position", { ascending: true }).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const columns = ((data as { created_by: string | null }[]) || []).map((c) => ({ ...c, canDelete: canDeleteColumn(c.created_by, me) }));
    return NextResponse.json({ columns, me: me?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// POST — add a column. Body: { label, type, options? }. Open to any signed-in teammate.
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

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
    return NextResponse.json({ column: { ...data, canDelete: true } });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// DELETE — remove a column (creator or admin only). ?id=
export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const me = await currentUser();
    const cur = await sb.from("mh_columns").select("created_by").eq("id", id).single();
    if (cur.error) throw new Error(cur.error.message);
    if (!canDeleteColumn(cur.data?.created_by ?? null, me)) {
      return NextResponse.json({ error: "Only the column's creator or an admin can delete it." }, { status: 403 });
    }
    const { error } = await sb.from("mh_columns").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
