import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { ALLOWED_LABEL, ALLOWED_MIME, BUCKET, MAX_BYTES, SHA256, findByHash, newPath, tooBig } from "@/lib/scheduler-media";

// Step 1 of a Scheduler upload: check it, then hand back a one-time upload URL so the
// browser sends the file STRAIGHT to storage (step 2 is upload-media/complete).
// If we already hold these exact bytes, hand back that copy and skip the upload.
//
// POST { filename, mime, size, sha? } → { path, signedUrl } | { ok, url, deduped }
export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    const b = (await req.json()) as { filename?: string; mime?: string; size?: number; sha?: string };
    if (!b.filename) return NextResponse.json({ error: "filename required" }, { status: 400 });
    if (typeof b.size !== "number" || b.size <= 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
    if (b.size > MAX_BYTES) return NextResponse.json({ error: tooBig(b.size) }, { status: 413 });
    if (!ALLOWED_MIME.has((b.mime || "").toLowerCase())) return NextResponse.json({ error: `Unsupported type ${b.mime || "(unknown)"}. Allowed: ${ALLOWED_LABEL}` }, { status: 415 });

    const db = getSupabase();
    if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const sha = (b.sha || "").toLowerCase();
    if (SHA256.test(sha)) {
      const existing = await findByHash(db, sha).catch(() => null);
      if (existing) return NextResponse.json({ ok: true, url: existing.url, filename: b.filename, size: existing.size, mime: existing.mime, deduped: true });
    }

    const path = newPath(b.filename);
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`sign: ${error?.message || "no url"}`);
    return NextResponse.json({ path, signedUrl: data.signedUrl });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't start the upload"), { status: 502 });
  }
}
