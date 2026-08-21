import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";

// Shared, savable Master-sheet views. Rows live in mh_views (Supabase). Each view
// has an access level that controls who may edit its configuration:
//   personal      — only the creator (or an admin) can edit the config
//   collaborative — any signed-in teammate can edit the config
//   locked        — nobody can edit the config (only the owner/admin can unlock)
// config holds the filter state the view restores:
//   { filters: { owner, status, type, sbu, priority }, search, rangeDays }
export const dynamic = "force-dynamic";

type Access = "personal" | "collaborative" | "locked";
type ViewRow = {
  id: string;
  name: string;
  section: string;
  config: Record<string, unknown>;
  position: number;
  access: Access;
  description: string | null;
  created_by: string | null;
};

async function currentUser(): Promise<{ id: string; isAdmin: boolean } | null> {
  const id = getSessionUserId();
  if (!id) return null;
  try {
    const p = await rosterById(id);
    return { id, isAdmin: !!p?.isAdmin };
  } catch {
    return { id, isAdmin: false };
  }
}

// Whether `me` can edit this view's *configuration* (name, description, filters).
function canEditConfig(row: Pick<ViewRow, "access" | "created_by">, me: { id: string; isAdmin: boolean } | null): boolean {
  if (me?.isAdmin) return true;
  if (row.access === "locked") return false;
  if (row.access === "personal") return !row.created_by || (!!me && row.created_by === me.id);
  return true; // collaborative
}
// Whether `me` can manage the view lifecycle (change access, reassign, delete).
function isOwnerOrAdmin(row: Pick<ViewRow, "created_by">, me: { id: string; isAdmin: boolean } | null): boolean {
  return !!me?.isAdmin || !row.created_by || (!!me && row.created_by === me.id);
}

const SELECT = "id, name, section, config, position, access, description, created_by";

// GET — list every saved view, with a per-viewer canEdit flag + the current user id.
export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ views: [], me: null });
    const me = await currentUser();
    const { data, error } = await sb
      .from("mh_views")
      .select(SELECT)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const views = ((data as ViewRow[]) || []).map((v) => ({
      ...v,
      canEdit: canEditConfig(v, me),
      canManage: isOwnerOrAdmin(v, me),
    }));
    return NextResponse.json({ views, me: me?.id ?? null });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// POST — create a view. Body: { name, config, section?, access?, description? }
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const body = (await req.json()) as { name?: string; config?: Record<string, unknown>; section?: string; access?: Access; description?: string };
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const me = await currentUser();
    const { data, error } = await sb
      .from("mh_views")
      .insert({
        name: body.name.trim(),
        section: body.section?.trim() || "My views",
        config: body.config || {},
        access: (["personal", "collaborative", "locked"].includes(body.access as string) ? body.access : "personal"),
        description: body.description?.trim() || null,
        created_by: me?.id ?? null,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ view: data });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// PATCH — update a view. Body: { id, name?, config?, description?, access?, createdBy? }
// Config/name/description edits need canEditConfig; access/reassign need owner-or-admin.
export async function PATCH(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const body = (await req.json()) as { id?: string; name?: string; config?: Record<string, unknown>; description?: string; access?: Access; createdBy?: string | null };
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const me = await currentUser();

    const { data: row, error: loadErr } = await sb.from("mh_views").select("access, created_by").eq("id", body.id).single();
    if (loadErr) throw new Error(loadErr.message);
    const current = row as Pick<ViewRow, "access" | "created_by">;

    const changingMeta = body.access !== undefined || body.createdBy !== undefined;
    const changingConfig = body.name !== undefined || body.description !== undefined || body.config !== undefined;
    if (changingMeta && !isOwnerOrAdmin(current, me)) {
      return NextResponse.json({ error: "Only the view owner or an admin can change access or reassign." }, { status: 403 });
    }
    if (changingConfig && !canEditConfig(current, me)) {
      return NextResponse.json({ error: current.access === "locked" ? "This view is locked." : "You can't edit this view." }, { status: 403 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.description === "string") patch.description = body.description.trim() || null;
    if (body.config) patch.config = body.config;
    if (body.access && ["personal", "collaborative", "locked"].includes(body.access)) patch.access = body.access;
    if (body.createdBy !== undefined) patch.created_by = body.createdBy || null;

    const { data, error } = await sb.from("mh_views").update(patch).eq("id", body.id).select(SELECT).single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ view: data });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// DELETE — remove a view (owner or admin). ?id=<uuid>
export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const me = await currentUser();
    const { data: row, error: loadErr } = await sb.from("mh_views").select("created_by").eq("id", id).single();
    if (loadErr) throw new Error(loadErr.message);
    if (!isOwnerOrAdmin(row as Pick<ViewRow, "created_by">, me)) {
      return NextResponse.json({ error: "Only the view owner or an admin can delete this view." }, { status: 403 });
    }
    const { error } = await sb.from("mh_views").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
