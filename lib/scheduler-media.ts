import { getSupabase } from "@/lib/supabase";

// Shared by the Scheduler upload routes (app/api/scheduler/upload-media*).
//
// Files go browser → storage directly (upload-media/sign + upload-media/complete),
// so Netlify's ~6 MB request limit no longer decides what can be posted — a reel or
// LinkedIn PDF over it used to come back as Netlify's plain-text "edge function…"
// page, which the composer showed as "Unexpected token 'e' … is not valid JSON"
// (27 Oct). The post-media bucket enforces this same type list and a 1 GB cap on its
// own (raised 28 Oct). 1 GB is Facebook's limit for a video posted by link; Instagram's
// is 300 MB, so a video between the two goes to Facebook only (enqueue route).

export const BUCKET = "post-media";
export const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 1024);
export const MAX_BYTES = MAX_MB * 1024 * 1024;

// webp / mov / webm dropped — we don't post those, and offering them invited
// uploads Meta then rejected. PDF is here for LinkedIn document carousels: a
// multi-image LinkedIn post reorders the slides, so the deck is exported as one
// PDF instead. LinkedIn ONLY — Meta cannot accept a PDF.
export const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif",
  "video/mp4",
  "application/pdf",
]);
export const ALLOWED_LABEL = "jpg/png/gif/mp4, or pdf for LinkedIn";

export const tooBig = (bytes: number) =>
  `That file is ${(bytes / 1024 / 1024).toFixed(0)} MB. Facebook takes videos up to 1 GB from here and Instagram up to 300 MB, so this one can't be posted.`;

// Same bytes, same file — don't store it twice.
//
// The same 44 MB video sat in the bucket three times (133 MB) because every
// publish attempt re-uploaded it. Each upload is keyed by the SHA-256 of its
// contents (worked out in the browser now) and the copy we already hold is handed
// back. The index lives in discover_cache (source "media_hash"), the project's
// key-value table. It is only a shortcut: a row pointing at a deleted file is ignored.
export const HASH_SOURCE = "media_hash";
export const hashKey = (sha: string) => `media-sha:${sha}`;
export const SHA256 = /^[0-9a-f]{64}$/;

export type HashRow = { url: string; path: string; size: number; mime: string };
type Db = NonNullable<ReturnType<typeof getSupabase>>;

export async function findByHash(db: Db, sha: string): Promise<HashRow | null> {
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

/** Remember an upload so the next identical one short-circuits. Never throws. */
export async function rememberHash(db: Db, sha: string, row: HashRow): Promise<void> {
  await db.from("discover_cache").upsert(
    { cache_key: hashKey(sha), source: HASH_SOURCE, last_fetched: new Date().toISOString(), payload: row },
    { onConflict: "cache_key" },
  ).then(() => {}, () => {});
}

export function safeFilename(name: string): string {
  // strip path separators + weird chars, keep ascii letters/digits/dot/dash/underscore
  const base = (name.split(/[\\/]/).pop() || "file").replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.{2,}/g, ".");
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

/** Path: YYYY/MM/<timestamp>-<random>-<name> */
export function newPath(filename: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${now.getTime()}-${Math.random().toString(36).slice(2, 8)}-${safeFilename(filename)}`;
}

/** Only a path newPath() could have issued. */
export const PATH_RE = /^\d{4}\/\d{2}\/\d+-[a-z0-9]+-[A-Za-z0-9._-]+$/;
