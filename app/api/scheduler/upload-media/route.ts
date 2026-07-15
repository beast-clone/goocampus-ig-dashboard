import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// Direct file upload from the Scheduler UI -> Supabase Storage -> returns a public URL
// that we drop into the Media URL field. The bucket name is "scheduler-media".
// Bucket must exist + be public (create once in Supabase dashboard, or we auto-create on first call).

const BUCKET = "post-media";        // unified pipeline bucket (created Phase 1; public, video-ready)
const MAX_MB = 300;                 // matches the post-media bucket limit — reels/videos allowed
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
]);

function safeFilename(name: string): string {
  // strip path separators + weird chars, keep ascii letters/digits/dot/dash/underscore
  const base = name.split(/[\\/]/).pop() || "file";
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}

export async function POST(req: Request) {
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing 'file' part" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 });
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: `Unsupported type ${file.type}. Allowed: jpg/png/webp/gif/mp4/mov/webm` }, { status: 415 });

  // Make sure the bucket exists (idempotent — silently ignores "already exists")
  try {
    await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES });
  } catch { /* bucket likely already exists — proceed */ }

  // Path: YYYY/MM/<timestamp>-<originalname>
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const stamp = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${yyyy}/${mm}/${stamp}-${safeFilename(file.name)}`;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) return NextResponse.json(safeError(new Error(upErr.message), "Upload failed"), { status: 502 });

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({
      ok: true,
      url: pub.publicUrl,
      filename: file.name,
      size: file.size,
      mime: file.type,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Upload failed"), { status: 502 });
  }
}

// Reject non-POST requests cleanly
export async function GET() {
  return NextResponse.json({ error: "POST a file as multipart/form-data with field 'file'" }, { status: 405 });
}
