import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// Shared, savable Master-sheet views. Rows live in mh_views (Supabase); every
// teammate sees the same list. config holds the filter state the view restores:
//   { filters: { ownerKey, status, type, sbu, priority }, search, rangeDays, sort }
export const dynamic = "force-dynamic";

type ViewRow = {
  id: string;
  name: string;
  section: string;
  config: Record<string, unknown>;
  position: number;
  created_by: string | null;
};

// GET — list every saved view (ordered).
export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ views: [] });
    const { data, error } = await sb
      .from("mh_views")
      .select("id, name, section, config, position, created_by")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ views: (data as ViewRow[]) || [] });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// POST — create a new view. Body: { name, config, section?, createdBy? }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; config?: Record<string, unknown>; section?: string; createdBy?: string };
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb
      .from("mh_views")
      .insert({
        name: body.name.trim(),
        section: body.section?.trim() || "My views",
        config: body.config || {},
        created_by: body.createdBy || null,
      })
      .select("id, name, section, config, position, created_by")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ view: data });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// PATCH — update a view's name/config. Body: { id, name?, config? }
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; name?: string; config?: Record<string, unknown> };
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (body.config) patch.config = body.config;
    const { data, error } = await sb
      .from("mh_views")
      .update(patch)
      .eq("id", body.id)
      .select("id, name, section, config, position, created_by")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ view: data });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}

// DELETE — remove a view. ?id=<uuid>
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("mh_views").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
