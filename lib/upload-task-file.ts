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

/** Upload one Marketing Materials file (receipt, photo, brochure) straight to storage. */
export async function uploadMaterialFile(tab: string, file: File): Promise<{ ok: true; file: { url: string; name: string; mime: string; size: number } } | { ok: false; error: string }> {
  const mime = file.type || guessMime(file.name);
  const sign = await fetch(`/api/materials/${tab}/sign`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, mime, size: file.size }),
  }).catch(() => null);
  if (!sign || !sign.ok) { const j = sign ? await sign.json().catch(() => ({})) : {}; return { ok: false, error: (j as { error?: string }).error || "Couldn't start the upload — try again." }; }
  const { signedUrl, publicUrl } = (await sign.json()) as { signedUrl: string; publicUrl: string };
  const put = await fetch(signedUrl, { method: "PUT", headers: { "content-type": mime, "x-upsert": "false" }, body: file }).catch(() => null);
  if (!put || !put.ok) return { ok: false, error: "The file didn't upload — check the connection and try again." };
  return { ok: true, file: { url: publicUrl, name: file.name, mime, size: file.size } };
}

/** Upload one Scheduler media file straight to storage (upload-media/sign + complete).
 *  Going through the server capped files at Netlify's ~6 MB and returned its
 *  plain-text error page, shown as "Unexpected token 'e' … not valid JSON" (27 Oct). */
export async function uploadSchedulerMedia(file: File, onProgress?: (pct: number) => void): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const errorOf = async (r: Response | null, fallback: string) => {
    if (!r) return fallback;
    const text = await r.text().catch(() => "");
    try { return (JSON.parse(text) as { error?: string }).error || fallback; } catch { return fallback; }
  };
  const mime = file.type || guessMime(file.name);
  // Fingerprint the bytes so a file we already hold isn't stored again. Skipped for
  // very large files, where reading the whole thing into memory isn't worth it.
  let sha = "";
  if (file.size <= 150 * 1024 * 1024 && typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      sha = Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, "0")).join("");
    } catch { /* no fingerprint — just upload */ }
  }
  const sign = await fetch("/api/scheduler/upload-media/sign", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, mime, size: file.size, sha }),
  }).catch(() => null);
  if (!sign || !sign.ok) return { ok: false, error: await errorOf(sign, "Couldn't start the upload — try again.") };
  const s = (await sign.json()) as { url?: string; path?: string; signedUrl?: string };
  if (s.url) return { ok: true, url: s.url }; // already held — same bytes, same file
  if (!s.path || !s.signedUrl) return { ok: false, error: "Couldn't start the upload — try again." };

  const putOk = await new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", s.signedUrl as string);
    xhr.setRequestHeader("content-type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
  if (!putOk) return { ok: false, error: "The file didn't upload — check the connection and try again." };

  const done = await fetch("/api/scheduler/upload-media/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: s.path, filename: file.name, sha }),
  }).catch(() => null);
  if (!done || !done.ok) return { ok: false, error: await errorOf(done, "Upload failed — try again.") };
  const d = (await done.json()) as { url: string };
  return { ok: true, url: d.url };
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

/** Save the order a task's creatives were dragged into (attachment ids, first slide first). */
export async function reorderTaskFiles(postId: string, ids: string[]): Promise<Response> {
  return fetch("/api/marketing-hub/attach/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, ids }) });
}

/** Remove a task file; says so if that sent an approved post back to review. */
export async function removeTaskFile(id: string, reason?: string): Promise<Response> {
  const res = await fetch(`/api/marketing-hub/attach?id=${id}${reason ? `&reason=${encodeURIComponent(reason.slice(0, 300))}` : ""}`, { method: "DELETE" });
  if (res.ok) {
    const j = await res.clone().json().catch(() => ({})) as { sentBack?: boolean };
    if (j.sentBack) sentBackNotice();
  }
  return res;
}
