// What a task file may be, shared by the upload routes (app/api/marketing-hub/attach*).
//
// Files land in a PUBLIC bucket and get a permanent unauthenticated URL, so whatever
// is accepted is served to anyone with the link, from an origin that looks like our
// infrastructure. Without a list, text/html or an SVG could be uploaded and would
// render — a credible phishing page, and script execution on the Supabase origin.

export const BUCKET = "scheduler-media";
export type AttachKind = "creative" | "reference" | "attachment";

export const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime",
  "application/pdf",
]);
export const ALLOWED_LABEL = "jpg, png, gif, webp, mp4, mov or pdf";
// Attachments are working files, not media (Manya, 10 Oct), so they also take Office
// files and CSV — all of which download rather than render, so the reasoning holds.
export const ATTACHMENT_EXTRA = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "text/csv",
]);
export const ATTACHMENT_LABEL = "an image, video, pdf, Word, Excel, PowerPoint or CSV file";

// Files go browser → storage directly (attach/sign + attach/complete), so the hosting
// limit on a request body (~6 MB on Netlify) no longer applies; this is our own cap.
export const MAX_MB = 50;

export const asKind = (v: unknown): AttachKind => (v === "reference" || v === "attachment" ? v : "creative");

export function mimeAllowed(mime: string, kind: AttachKind): boolean {
  const m = (mime || "").toLowerCase();
  return ALLOWED_MIME.has(m) || (kind === "attachment" && ATTACHMENT_EXTRA.has(m));
}
export const mimeRefusal = (kind: AttachKind) =>
  `That file type isn't allowed — use ${kind === "attachment" ? ATTACHMENT_LABEL : ALLOWED_LABEL}.`;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
