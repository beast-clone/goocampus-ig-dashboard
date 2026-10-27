import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { ALLOWED_LABEL, ALLOWED_MIME, BUCKET, MAX_BYTES, PATH_RE, SHA256, rememberHash, tooBig } from "@/lib/scheduler-media";

// Step 2 of a Scheduler upload (step 1: upload-media/sign). The file is already in
// storage; check what actually arrived — its stored type and size, not what the
// browser claimed — then hand back its public URL for the composer.
//
// POST { path, filename, sha? } → { ok, url, filename, size, mime }
export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    const b = (await req.json()) as { path?: string; filename?: string; sha?: string };
    const path = String(b.path || "");
    if (!PATH_RE.test(path)) return NextResponse.json({ error: "bad path" }, { status: 400 });

    const db = getSupabase();
    if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const dir = path.slice(0, path.lastIndexOf("/"));
    const name = path.slice(path.lastIndexOf("/") + 1);
    const { data: listed, error: listErr } = await db.storage.from(BUCKET).list(dir, { search: name, limit: 5 });
    if (listErr) throw new Error(`check: ${listErr.message}`);
    const obj = (listed || []).find((o) => o.name === name);
    if (!obj) return NextResponse.json({ error: "The file didn't arrive — try again." }, { status: 400 });
    const meta = (obj.metadata || {}) as { mimetype?: string; size?: number };
    const mime = String(meta.mimetype || "").toLowerCase();
    const size = Number(meta.size || 0);
    // The bucket refuses other types and anything over its cap itself; this is a backstop.
    if (!ALLOWED_MIME.has(mime)) return NextResponse.json({ error: `Unsupported type ${mime || "(unknown)"}. Allowed: ${ALLOWED_LABEL}` }, { status: 415 });
    if (size > MAX_BYTES) return NextResponse.json({ error: tooBig(size) }, { status: 413 });

    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const sha = (b.sha || "").toLowerCase();
    if (SHA256.test(sha)) await rememberHash(db, sha, { url, path, size, mime });
    return NextResponse.json({ ok: true, url, filename: b.filename || name, size, mime });
  } catch (err) {
    return NextResponse.json(safeError(err, "Upload failed"), { status: 502 });
  }
}
