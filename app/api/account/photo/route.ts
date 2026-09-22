import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { invalidateRosterCache, rosterById } from "@/lib/team-db";

// POST   /api/account/photo { image: "data:image/jpeg;base64,…", userId? } → set a profile picture
// DELETE /api/account/photo { userId? }                                 → back to initials
// Anyone can change their OWN photo; admins can change anyone's (userId). The page
// resizes to a 256×256 JPEG before sending, so the payload is small. Stored in the
// public scheduler-media bucket under avatars/; the URL goes on ind_users.photo_url.
export const dynamic = "force-dynamic";
const BUCKET = "scheduler-media";

async function target(req: Request, userId: unknown) {
  const uid = getSessionUserId();
  if (!uid) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const want = typeof userId === "string" && userId ? userId : uid;
  if (want !== uid && !(await rosterById(uid))?.isAdmin) return { error: NextResponse.json({ error: "Only admins can change someone else's photo." }, { status: 403 }) };
  if (!(await rosterById(want))) return { error: NextResponse.json({ error: "Unknown user." }, { status: 404 }) };
  return { id: want };
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { image?: unknown; userId?: unknown };
  const t = await target(req, b.userId);
  if ("error" in t) return t.error;
  const m = typeof b.image === "string" ? b.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) return NextResponse.json({ error: "Send a JPEG, PNG or WebP image." }, { status: 400 });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 1_000_000) return NextResponse.json({ error: "Image too large (max 1 MB after resizing)." }, { status: 400 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const path = `avatars/${t.id}-${Date.now()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: `image/${m[1]}`, upsert: true });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await sb.from("ind_users").update({ photo_url: url }).eq("id", t.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateRosterCache();
  return NextResponse.json({ ok: true, photoUrl: url });
}

export async function DELETE(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { userId?: unknown };
  const t = await target(req, b.userId);
  if ("error" in t) return t.error;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { error } = await sb.from("ind_users").update({ photo_url: null }).eq("id", t.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateRosterCache();
  return NextResponse.json({ ok: true });
}
