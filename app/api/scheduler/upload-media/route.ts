import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// Direct file upload from the Scheduler UI -> Supabase Storage -> returns a public URL
// that we drop into the Media URL field. The bucket name is "scheduler-media".
// Bucket must exist + be public (create once in Supabase dashboard, or we auto-create on first call).

const BUCKET = "post-media";        // unified pipeline bucket (created Phase 1; public, video-ready)
// 50 MB, because that is what Supabase actually enforces — NOT the 300 MB the
// post-media bucket is configured for. The project-wide "global file size limit"
// caps every bucket regardless of the bucket's own setting, and it is at the 50 MB
// default. Probed 16 Sep: 49 MB uploads, 51 MB returns "The object exceeded the
// maximum allowed size" straight from Storage.
//
// Claiming 300 MB here meant the UI invited a file it could never accept and then
// showed Supabase's error instead of ours. If the global limit is raised in the
// Supabase dashboard (Storage → Settings; needs a paid plan), set UPLOAD_MAX_MB to
// match and this follows.
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 50);
const MAX_BYTES = MAX_MB * 1024 * 1024;
// webp / mov / webm dropped — we don't post those, and offering them invited
// uploads Meta then rejected. PDF is here for LinkedIn document carousels: a
// multi-image LinkedIn post reorders the slides, so the deck is exported as one
// PDF instead. LinkedIn ONLY — Meta cannot accept a PDF (enforced below).
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif",
  "video/mp4",
  "application/pdf",
]);
const ALLOWED_LABEL = "jpg/png/gif/mp4, or pdf for LinkedIn";

function safeFilename(name: string): string {
  // strip path separators + weird chars, keep ascii letters/digits/dot/dash/underscore
  const base = name.split(/[\\/]/).pop() || "file";
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

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
  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      error: `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_MB} MB — compress the video, or raise the global file size limit in Supabase (Storage → Settings) and set UPLOAD_MAX_MB to match.`,
    }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: `Unsupported type ${file.type}. Allowed: ${ALLOWED_LABEL}` }, { status: 415 });

  // Make sure the bucket exists (idempotent — silently ignores "already exists").
  // Storage enforces its OWN mime allow-list on top of ALLOWED_MIME, and a bucket
  // created without one rejects PDFs with a confusing 502 from Supabase rather
  // than our 415. Keep the two lists in step.
  try {
    await db.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,   // only applies the first time; an existing bucket keeps its own
      allowedMimeTypes: [...ALLOWED_MIME],
    });
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
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  return NextResponse.json({ error: "POST a file as multipart/form-data with field 'file'" }, { status: 405 });
}
