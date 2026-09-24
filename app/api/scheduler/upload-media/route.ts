import { createHash } from "crypto";
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

// Same bytes, same file — don't store it twice.
//
// The same 44 MB video sat in the bucket three times (133 MB) because every
// publish attempt re-uploaded it. We now key each upload by the SHA-256 of its
// contents and hand back the copy we already hold.
//
// The index lives in discover_cache (source "media_hash"), the project's
// key-value table, so this needs no migration. It is only ever a shortcut: if the
// row points at a file that has since been deleted, we upload again and correct it.
const HASH_SOURCE = "media_hash";
const hashKey = (sha: string) => `media-sha:${sha}`;

type HashRow = { url: string; path: string; size: number; mime: string };

async function findByHash(db: NonNullable<ReturnType<typeof getSupabase>>, sha: string): Promise<HashRow | null> {
  const { data } = await db.from("discover_cache").select("payload").eq("cache_key", hashKey(sha)).maybeSingle();
  const row = data?.payload as HashRow | undefined;
  if (!row?.path || !row?.url) return null;
  // Confirm the file is still there — retention deletes files, and a stale row
  // would hand back a dead link.
  const slash = row.path.lastIndexOf("/");
  const { data: listed } = await db.storage.from(BUCKET).list(slash < 0 ? "" : row.path.slice(0, slash), {
    limit: 1, search: slash < 0 ? row.path : row.path.slice(slash + 1),
  });
  return listed && listed.length ? row : null;
}

function safeFilename(name: string): string {
  // strip path separators + weird chars, keep ascii letters/digits/dot/dash/underscore
  const base = (name.split(/[\\/]/).pop() || "file").replace(/[^A-Za-z0-9._-]/g, "_");
  // Trim the NAME, never the extension. A real file — "NMC Seat Matrix for
  // Undergraduate (MBBS) Courses excluding INIs….pdf" — is longer than 80
  // characters, and chopping the tail took the ".pdf" with it. Everything
  // downstream reads the type off that extension: the composer previewed the
  // document as a photo (and showed nothing), and n8n would have sent it with
  // sendImage instead of sendFile. Found 24 Sep, in exactly that way.
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 11 ? base.slice(dot) : "";
  const stem = ext ? base.slice(0, dot) : base;
  return stem.slice(0, 80 - ext.length) + ext;
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
    const sha = createHash("sha256").update(buf).digest("hex");

    // Already have these exact bytes? Hand back the copy we hold.
    const existing = await findByHash(db, sha).catch(() => null);
    if (existing) {
      return NextResponse.json({
        ok: true, url: existing.url, filename: file.name,
        size: existing.size, mime: existing.mime, deduped: true,
      });
    }

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) return NextResponse.json(safeError(new Error(upErr.message), "Upload failed"), { status: 502 });

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);

    // Remember it, so the next identical upload short-circuits. Never let a
    // bookkeeping failure fail an upload that already worked.
    const payload: HashRow = { url: pub.publicUrl, path, size: file.size, mime: file.type };
    await db.from("discover_cache").upsert(
      { cache_key: hashKey(sha), source: HASH_SOURCE, last_fetched: new Date().toISOString(), payload },
      { onConflict: "cache_key" },
    ).then(() => {}, () => {});

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
