"use client";
import type { AttachKind } from "@/lib/attach-rules";

// Upload one file to a task, browser → storage directly (see attach/sign and
// attach/complete). Every task upload box uses this, so the ~6 MB hosting limit on
// a request no longer decides what can be attached.
/** Files picked together, in number order: 300, 301 … 309, 310 — not 300, 310, 301.
 *  Uploads then go one by one in this order, and lists show first uploaded first. */
export function inNumberOrder(files: FileList | File[]): File[] {
  return Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

export type UploadResult = { ok: true; attachment: Record<string, unknown>; sentBack?: boolean } | { ok: false; error: string };

export async function uploadTaskFile(postId: string, file: File, kind: AttachKind = "creative", uploadedBy?: string, onProgress?: (pct: number) => void): Promise<UploadResult> {
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

  // XHR, not fetch, for the PUT: fetch can't report upload progress, and the tiles
  // show a progress ring while a file goes up (22 Oct).
  const putOk = await new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("content-type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
  if (!putOk) return { ok: false, error: "The file didn't upload — check the connection and try again." };

  const done = await fetch("/api/marketing-hub/attach/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, path, filename: file.name, kind, uploadedBy }),
  }).catch(() => null);
  if (!done || !done.ok) return fail(done, "Upload failed — try again.");
  const j = (await done.json()) as { attachment: Record<string, unknown>; sentBack?: boolean };
  return { ok: true, attachment: j.attachment, sentBack: !!j.sentBack };
}

// Some systems hand over a file with no type (often a PDF dragged from certain apps).
function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime",
    csv: "text/csv", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" } as Record<string, string>)[ext] || "";
}

// Said once, wherever a creative change sends an approved post back (lib/re-review.ts).
export function sentBackNotice() {
  void import("@/app/(dashboard)/dashboard/preview/ConfirmDialog").then(({ alertDialog }) =>
    alertDialog("Sent back to Content Review", "This post was already approved, so changing its creative sends it back to Content Review and out of the Scheduler. Once it is approved again, schedule it again."));
}

/** Remove a task file; says so if that sent an approved post back to review. */
export async function removeTaskFile(id: string): Promise<Response> {
  const res = await fetch(`/api/marketing-hub/attach?id=${id}`, { method: "DELETE" });
  if (res.ok) {
    const j = await res.clone().json().catch(() => ({})) as { sentBack?: boolean };
    if (j.sentBack) sentBackNotice();
  }
  return res;
}
