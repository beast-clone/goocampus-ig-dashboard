import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// GET /api/content            → recent content drafts (newest first, for Content Studio)
// GET /api/content?id=<uuid>  → one draft (used for polling a single item)
// DELETE /api/content?id=<uuid>
export const dynamic = "force-dynamic";

const COLS = "id, kind, title, source, source_url, interest, status, factcheck, drafts, citations, model, error, created_at";

export async function GET(req: Request) {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const { data, error } = await sb.from("content_drafts").select(COLS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return NextResponse.json({ draft: data });
    }
    const { data, error } = await sb.from("content_drafts").select(COLS).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ drafts: data || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load content"), { status: 502 });
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { error } = await sb.from("content_drafts").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to delete"), { status: 502 });
  }
}
