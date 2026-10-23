"use client";
import { useEffect, useState } from "react";
import { IconX, IconExternalLink, IconChevronLeft, IconChevronRight, IconDownload } from "@tabler/icons-react";

// One side panel for everything a task points at (Praveen, 23 Oct): a link in the
// brief, a reference link or file, a creative, an attachment. Click it and it opens
// on the right of the screen, next to the task, instead of in a new tab — Instagram
// posts and reels, YouTube, Drive and Canva through their own embeds; images, videos
// and PDFs directly. Anything that can't be shown inside the dashboard (a site that
// blocks it, a .zip) gets an "Open in a new tab" / Download button instead.
//
// Mounted once (RefPreviewHost, in the preview layout). Opened from anywhere with
// openRefPreview(); links inside an element marked data-ref-preview open here too.

export type RefItem = { url: string; title?: string; from?: string };
type State = { items: RefItem[]; index: number } | null;

let setOpenState: ((s: State) => void) | null = null;
/** Whether the side panel is on this page (so callers can leave links to it). */
export const refPreviewAvailable = () => !!setOpenState;

/** Open one link/file, or a set (with ‹ › between them) at `index`. */
export function openRefPreview(items: RefItem | RefItem[], index = 0): boolean {
  if (!setOpenState) return false;   // no host on this page — the caller opens a tab
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return false;
  setOpenState({ items: list, index: Math.min(Math.max(0, index), list.length - 1) });
  return true;
}

type View =
  | { kind: "frame"; src: string; narrow?: boolean }
  | { kind: "image" | "video" | "pdf"; src: string }
  | { kind: "download" }
  | { kind: "outside" };

const ext = (u: string) => (u.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();

export function viewFor(raw: string): View {
  let u: URL;
  try { u = new URL(raw); } catch { return { kind: "outside" }; }
  const host = u.hostname.replace(/^www\./, "");
  const e = ext(u.pathname);
  if (["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(e)) return { kind: "image", src: raw };
  if (["mp4", "mov", "webm", "m4v"].includes(e)) return { kind: "video", src: raw };
  if (e === "pdf") return { kind: "pdf", src: raw };
  if (["zip", "rar", "7z", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "psd", "ai"].includes(e)) return { kind: "download" };
  if (host === "instagram.com") {
    const m = u.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/);
    if (m) return { kind: "frame", narrow: true, src: `https://www.instagram.com/${m[1] === "p" ? "p" : "reel"}/${m[2]}/embed/${m[1] === "p" ? "captioned/" : ""}` };
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    const id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") || u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/)?.[2];
    if (id) return { kind: "frame", src: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "drive.google.com") {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get("id");
    if (id) return { kind: "frame", src: `https://drive.google.com/file/d/${id}/preview` };
  }
  if (host === "docs.google.com") {
    const m = u.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([\w-]+)/);
    if (m) return { kind: "frame", src: `https://docs.google.com/${m[1]}/d/${m[2]}/preview` };
  }
  if (host === "canva.com") {
    const id = u.pathname.match(/\/design\/([\w-]+)/)?.[1];
    if (id) return { kind: "frame", src: `https://www.canva.com/design/${id}/view?embed` };
  }
  return { kind: "outside" };
}

const nameOf = (r: RefItem) => r.title || (() => { try { const u = new URL(r.url); return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, ""); } catch { return r.url; } })();

export function RefPreviewHost() {
  const [st, setSt] = useState<State>(null);
  useEffect(() => { setOpenState = setSt; return () => { setOpenState = null; }; }, []);

  // Links inside a task window (marked data-ref-preview) open here, not in a new tab.
  // Ctrl/Cmd-click still opens a tab, as everywhere else.
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !a.closest("[data-ref-preview]") || a.closest("[data-ref-preview-skip]")) return;
      if (!/^https?:/i.test(a.href) || a.origin === window.location.origin) return;
      ev.preventDefault();
      ev.stopPropagation();   // the brief editor opens links itself on click; this replaces that
      setSt({ items: [{ url: a.href, title: a.dataset.refTitle || undefined, from: a.closest<HTMLElement>("[data-ref-from]")?.dataset.refFrom }], index: 0 });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!st) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setSt(null); }
      else if (e.key === "ArrowRight" && st.items.length > 1) setSt({ ...st, index: (st.index + 1) % st.items.length });
      else if (e.key === "ArrowLeft" && st.items.length > 1) setSt({ ...st, index: (st.index - 1 + st.items.length) % st.items.length });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [st]);

  if (!st) return null;
  const cur = st.items[st.index];
  const v = viewFor(cur.url);
  const many = st.items.length > 1;
  const go = (d: number) => setSt({ ...st, index: (st.index + d + st.items.length) % st.items.length });

  return (
    <aside className="rfp" role="dialog" aria-label="Preview">
      <style>{CSS}</style>
      <div className="rfp-bar">
        <div className="rfp-t">
          <div className="rfp-name" title={nameOf(cur)}>{nameOf(cur)}</div>
          {(cur.from || many) && <div className="rfp-from">{cur.from}{cur.from && many ? " · " : ""}{many ? `${st.index + 1} of ${st.items.length}` : ""}</div>}
        </div>
        {many && <>
          <button type="button" className="rfp-btn ic" onClick={() => go(-1)} aria-label="Previous"><IconChevronLeft size={15} stroke={2} /></button>
          <button type="button" className="rfp-btn ic" onClick={() => go(1)} aria-label="Next"><IconChevronRight size={15} stroke={2} /></button>
        </>}
        <a className="rfp-btn" href={cur.url} target="_blank" rel="noreferrer">Open <IconExternalLink size={13} stroke={2} /></a>
        <button type="button" className="rfp-btn ic" onClick={() => setSt(null)} aria-label="Close"><IconX size={15} stroke={2} /></button>
      </div>
      <div className="rfp-body" key={cur.url}>
        {v.kind === "frame" && <iframe className={v.narrow ? "narrow" : ""} src={v.src} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" title={nameOf(cur)} />}
        {v.kind === "pdf" && <iframe src={v.src} title={nameOf(cur)} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {v.kind === "image" && <img src={v.src} alt={nameOf(cur)} />}
        {v.kind === "video" && <video src={v.src} controls autoPlay playsInline />}
        {v.kind === "download" && (
          <div className="rfp-msg">This file can&apos;t be previewed here.
            <a className="rfp-btn pri" href={cur.url} target="_blank" rel="noreferrer" download><IconDownload size={14} stroke={2} />Download</a>
          </div>
        )}
        {v.kind === "outside" && (
          <div className="rfp-msg">This website can&apos;t be shown inside the dashboard.
            <a className="rfp-btn pri" href={cur.url} target="_blank" rel="noreferrer">Open in a new tab <IconExternalLink size={13} stroke={2} /></a>
          </div>
        )}
      </div>
    </aside>
  );
}

// Fixed to the right edge, above the task window (z above its overlay), so the task —
// brief included — stays readable on the left.
const CSS = `
.rfp{position:fixed;top:0;right:0;bottom:0;width:min(480px,100vw);z-index:120;display:flex;flex-direction:column;background:#F7F8FC;border-left:1px solid #E5E8F0;box-shadow:-12px 0 32px rgba(35,45,66,.12)}
.rfp-bar{display:flex;align-items:center;gap:6px;padding:12px 14px;background:#fff;border-bottom:1px solid #EEF0F4}
.rfp-t{flex:1;min-width:0}
.rfp-name{font-size:13.5px;font-weight:500;color:#232D42;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rfp-from{font-size:11.5px;color:#8A92A6;margin-top:1px}
.rfp-btn{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border-radius:8px;border:1px solid #E5E8F0;background:#fff;color:#4A5468;font-size:12.5px;font-weight:500;text-decoration:none;cursor:pointer;white-space:nowrap}
.rfp-btn.ic{width:30px;padding:0;justify-content:center}
.rfp-btn:hover{border-color:#3A57E8;color:#3A57E8}
.rfp-btn.pri{background:#3A57E8;border-color:#3A57E8;color:#fff;margin-top:14px}
.rfp-btn.pri:hover{color:#fff;background:#2138B0}
.rfp-body{flex:1;min-height:0;overflow:auto;padding:14px;display:flex;justify-content:center;align-items:flex-start}
.rfp-body iframe{width:100%;height:100%;min-height:560px;border:1px solid #EEF0F4;border-radius:12px;background:#fff}
.rfp-body iframe.narrow{max-width:420px}
.rfp-body img,.rfp-body video{max-width:100%;max-height:100%;border-radius:12px;background:#0b1020}
.rfp-msg{margin:auto;display:flex;flex-direction:column;align-items:center;text-align:center;color:#8A92A6;font-size:13.5px;max-width:300px;line-height:1.6}
html[data-theme="dark"] .rfp{background:#151824;border-left-color:#2C3246}
html[data-theme="dark"] .rfp-bar{background:#1F2332;border-bottom-color:#2C3246}
html[data-theme="dark"] .rfp-name{color:#E8EBF3}
html[data-theme="dark"] .rfp-btn{background:#1F2332;border-color:#2C3246;color:#C2C8D6}
html[data-theme="dark"] .rfp-body iframe{border-color:#2C3246}
`;
