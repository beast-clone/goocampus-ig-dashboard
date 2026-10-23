import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { BUCKET, MAX_MB, mimeAllowed, mimeRefusal, safeName } from "@/lib/attach-rules";
import { mtab } from "@/lib/materials";

// One-time upload URL for a Marketing Materials file (receipt, photo, brochure): the
// browser sends the file straight to storage, as task files do (attach/sign). The
// same file types as a task's Attachments.
// POST /api/materials/<tab>/sign { filename, mime, size } → { path, signedUrl, publicUrl }
export async function POST(req: Request, { params }: { params: { tab: string } }) {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    if (!getSessionUserId()) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const b = (await req.json()) as { filename?: string; mime?: string; size?: number };
    const t = mtab(params.tab);
    if (!t) return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
    if (!b.filename) return NextResponse.json({ error: "filename required" }, { status: 400 });
    if (!mimeAllowed(b.mime || "", "attachment")) return NextResponse.json({ error: mimeRefusal("attachment") }, { status: 415 });
    if (typeof b.size !== "number" || b.size <= 0) return NextResponse.json({ error: "size required" }, { status: 400 });
    if (b.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `That file is ${(b.size / 1048576).toFixed(0)} MB — the limit is ${MAX_MB} MB.` }, { status: 413 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const path = `materials/${t.key}/new/${Date.now()}-${safeName(b.filename)}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`sign: ${error?.message || "no url"}`);
    return NextResponse.json({ path, signedUrl: data.signedUrl, publicUrl: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't start the upload"), { status: 502 });
  }
}
