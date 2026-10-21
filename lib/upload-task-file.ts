"use client";
import type { AttachKind } from "@/lib/attach-rules";

// Upload one file to a task, browser → storage directly (see attach/sign and
// attach/complete). Every task upload box uses this, so the ~6 MB hosting limit on
// a request no longer decides what can be attached.
export type UploadResult = { ok: true; attachment: Record<string, unknown> } | { ok: false; error: string };

export async function uploadTaskFile(postId: string, file: File, kind: AttachKind = "creative", uploadedBy?: string): Promise<UploadResult> {
  const fail = async (r: Response | null, fallback: string): Promise<UploadResult> => {
    const j = r ? await r.json().catch(() => ({})) : {};
    return { ok: false, error: (j as { error?: string }).error || fallback };
  };
  const mime = file.type || guessMime(file.name);
  const sign = await fetch("/api/marketing-hub/attach/sign", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, filename: file.name, mime, size: file.size, kind }),
  }).catch(() => null);
  if (!sign || !sign.ok) return fail(sign, "Couldn't start the upload — try again.");
  const { path, signedUrl } = (await sign.json()) as { path: string; signedUrl: string };

  const put = await fetch(signedUrl, {
    method: "PUT", body: file,
    headers: { "content-type": mime, "x-upsert": "false", "cache-control": "max-age=3600" },
  }).catch(() => null);
  if (!put || !put.ok) return { ok: false, error: "The file didn't upload — check the connection and try again." };

  const done = await fetch("/api/marketing-hub/attach/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, path, filename: file.name, kind, uploadedBy }),
  }).catch(() => null);
  if (!done || !done.ok) return fail(done, "Upload failed — try again.");
  return { ok: true, attachment: ((await done.json()) as { attachment: Record<string, unknown> }).attachment };
}

// Some systems hand over a file with no type (often a PDF dragged from certain apps).
function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime",
    csv: "text/csv", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" } as Record<string, string>)[ext] || "";
}
