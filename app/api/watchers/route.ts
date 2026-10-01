import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// The watched links (docs/WATCHERS_SPEC.md).
//   GET     /api/watchers                       → { watchers }
//   POST    /api/watchers   { url, name?, category?, autoCategory?, emails?, telegram?, telegramChats? }
//   PATCH   /api/watchers   { id, ...same fields, active? }
//   DELETE  /api/watchers?id=…                  (its found notices go with it)
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Body = { id?: string; url?: string; name?: string; category?: string; autoCategory?: boolean; emails?: string[]; telegram?: boolean; telegramChats?: string[]; active?: boolean };

function fields(b: Body): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {};
  if ("url" in b) {
    const v = (b.url || "").trim();
    try { const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); if (!u.hostname.includes(".")) throw 0; patch.url = u.href; }
    catch { return { patch, error: "That doesn't look like a web address." }; }
  }
  if ("name" in b) patch.name = b.name?.trim() || null;
  if ("category" in b) patch.category = b.category?.trim() || null;
  if ("autoCategory" in b) patch.auto_category = !!b.autoCategory;
  if ("emails" in b) {
    const list = [...new Set((b.emails || []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const bad = list.find((e) => !EMAIL.test(e));
    if (bad) return { patch, error: `"${bad}" isn't an email address.` };
    patch.emails = list;
  }
  if ("telegram" in b) patch.telegram = !!b.telegram;
  if ("telegramChats" in b) patch.telegram_chats = [...new Set((b.telegramChats || []).map(String))];
  if ("active" in b) patch.active = !!b.active;
  return { patch };
}

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ watchers: [] });
  try {
    const { data, error } = await sb.from("mh_watchers").select("*").order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ watchers: data || [] });
  } catch (err) { return NextResponse.json(safeError(err, "Couldn't load watchers"), { status: 502 }); }
}

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Body;
  if (!b.url?.trim()) return NextResponse.json({ error: "Add the link to watch." }, { status: 400 });
  const { patch, error: bad } = fields(b);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  try {
    const { data, error } = await sb.from("mh_watchers").insert({ ...patch, created_by: getSessionUserId() }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "That link is already being watched." : error.message);
    return NextResponse.json({ watcher: data });
  } catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Body;
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { patch, error: bad } = fields(b);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  try {
    const { data, error } = await sb.from("mh_watchers").update(patch).eq("id", b.id).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "That link is already being watched." : error.message);
    return NextResponse.json({ watcher: data });
  } catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  const id = new URL(req.url).searchParams.get("id");
  if (!sb || !id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await sb.from("mh_watchers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
