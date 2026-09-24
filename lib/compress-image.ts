// Shrink an image in the browser before it is uploaded.
//
// A phone photo or an exported carousel slide is often 4–6 MB, and none of that
// detail survives Instagram's own re-encode — so we were paying for storage twice
// over with nothing to show for it. 1600px on the long edge covers every feed we
// post to (Instagram tops out around 1080px wide).
//
// Two jobs in one pass:
//   · resize + re-encode as JPEG, which is where the size goes
//   · turn a WebP into a JPEG, because WhatsApp shows a WebP as a *sticker*
//
// Runs on the client on purpose: the upload route is a serverless function, and
// image work there would mean a native dependency and a slower cold start.

export type CompressOpts = {
  /** Longest edge, in pixels. Default 1600. */
  maxEdge?: number;
  /** JPEG quality, 0–1. Default 0.85 — visually clean; 0.7 for a WhatsApp send. */
  quality?: number;
};

/** True for the types we can actually re-encode. GIFs would lose their animation. */
function canCompress(file: File): boolean {
  return /^image\/(jpeg|png|webp)$/i.test(file.type);
}

/**
 * Returns a smaller file, or the original when it can't help — a video, a PDF,
 * a GIF, an already-small image, or any browser that says no. Never throws.
 */
export async function compressImage(file: File, opts: CompressOpts = {}): Promise<File> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.85;
  const isWebp = /image\/webp/i.test(file.type);
  if (!canCompress(file)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // A PNG or WebP can be transparent; JPEG can't, and unpainted pixels come out black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;

    // Only take the new one if it actually saved something — except for a WebP,
    // which has to become a JPEG whatever its size.
    if (blob.size >= file.size && !isWebp) return file;
    const name = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;   // an odd colour profile, a huge image, an old browser — upload as-is
  }
}

/** How much a compression saved, for a one-line note in the UI. */
export function savedLabel(before: number, after: number): string | null {
  if (after >= before) return null;
  const pct = Math.round((1 - after / before) * 100);
  if (pct < 5) return null;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  return `compressed ${mb(before)} MB → ${mb(after)} MB (${pct}% smaller)`;
}
