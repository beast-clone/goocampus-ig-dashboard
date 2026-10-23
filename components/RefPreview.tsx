"use client";
import { useEffect, useLayoutEffect, useState } from "react";
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
// Opened from inside a task box marked data-ref-dock, it sits inside that box (its
// right side) rather than over the whole screen (Praveen, 23 Oct).

export type RefItem = { url: string; title?: string; from?: string };
type State = { items: RefItem[]; index: number; dock?: HTMLElement | null } | null;

let setOpenState: ((s: State) => void) | null = null;
// The element last pressed — its task box is where the panel docks.
let lastDown: Element | null = null;
const dockOf = (el: Element | null) => el?.closest<HTMLElement>("[data-ref-dock]") ?? null;
/** Whether the side panel is on this page (so callers can leave links to it). */
export const refPreviewAvailable = () => !!setOpenState;

/** Open one link/file, or a set (with ‹ › between them) at `index`. */
export function openRefPreview(items: RefItem | RefItem[], index = 0): boolean {
  if (!setOpenState) return false;   // no host on this page — the caller opens a tab
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return false;
  setOpenState({ items: list, index: Math.min(Math.max(0, index), list.length - 1), dock: dockOf(lastDown) });
  return true;
}

type View =
  | { kind: "frame"; src: string; narrow?: boolean }
  | { kind: "image" | "video" | "pdf"; src: string }
  | { kind: "download" }
  | { kind: "outside" };

const ext = (u: string) => (u.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();

// Hosts the dashboard's security rules (CSP img-src / media-src / frame-src) let it
// show directly. A file anywhere else would render as a blocked, blank box.
const MEDIA_HOSTS = /(^|\.)(supabase\.co|cdninstagram\.com|fbcdn\.net|googleusercontent\.com|ytimg\.com|licdn\.com|imgur\.com)$/i;

export function viewFor(raw: string): View {
  let u: URL;
  try { u = new URL(raw); } catch { return { kind: "outside" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { kind: "outside" };   // never javascript:/data: in a frame
  const host = u.hostname.replace(/^www\./, "");
  const e = ext(u.pathname);
  const ours = MEDIA_HOSTS.test(u.hostname);
  if (ours && ["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(e)) return { kind: "image", src: raw };
  if (ours && ["mp4", "mov", "webm", "m4v"].includes(e)) return { kind: "video", src: raw };
  if (e === "pdf" && /(^|\.)supabase\.co$/i.test(u.hostname)) return { kind: "pdf", src: raw };
  if (["zip", "rar", "7z", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "psd", "ai"].includes(e)) return { kind: "download" };
  if (host === "instagram.com") {
    // Also links that carry the account name: instagram.com/<user>/reel/<id>/
    const m = u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
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
    // A link-shared design needs its share token: /design/<id>/<token>/view
    const m = u.pathname.match(/\/design\/([\w-]+)(?:\/([\w-]+))?/);
    if (m) return { kind: "frame", src: `https://www.canva.com/design/${m[1]}/${m[2] && !/^(view|edit|watch)$/.test(m[2]) ? `${m[2]}/` : ""}view?embed` };
  }
  return { kind: "outside" };
}

const nameOf = (r: RefItem) => r.title || (() => { try { const u = new URL(r.url); return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, ""); } catch { return r.url; } })();

export function RefPreviewHost() {
  const [st, setSt] = useState<State>(null);
  const [failed, setFailed] = useState<string | null>(null);   // a file that wouldn't load
  const [box, setBox] = useState<React.CSSProperties | null>(null);   // docked position
  useEffect(() => { setOpenState = setSt; return () => { setOpenState = null; }; }, []);
  useEffect(() => {
    const onDown = (e: PointerEvent) => { lastDown = e.target as Element; };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  // Docked: follow the task box as the page scrolls or resizes, kept on screen. The
  // panel closes if the box goes away (another task opened, window closed).
  const dock = st?.dock ?? null;
  useLayoutEffect(() => {
    if (!dock) { setBox(null); return; }
    let raf = 0;
    const place = () => {
      if (!dock.isConnected) { setSt(null); return; }
      const r = dock.getBoundingClientRect();
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
      const width = Math.min(r.width, Math.max(360, Math.min(520, r.width * 0.55)));
      setBox({ top, height: Math.max(bottom - top, 240), left: r.right - width, width });
    };
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    place();
    window.addEventListener("scroll", later, true);
    window.addEventListener("resize", later);
    const ro = new ResizeObserver(later); ro.observe(dock);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", later, true); window.removeEventListener("resize", later); ro.disconnect(); };
  }, [dock]);

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
      setSt({ items: [{ url: a.href, title: a.dataset.refTitle || undefined, from: a.closest<HTMLElement>("[data-ref-from]")?.dataset.refFrom }], index: 0, dock: dockOf(a) });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!st) return;
    const onKey = (e: KeyboardEvent) => {
      // A pop-up (confirm dialog etc.) open above the panel gets the key, not the panel.
      if (document.querySelector("[data-overlay]")) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (e.key === "Escape") { e.stopPropagation(); setSt(null); }
      else if (typing) return;   // arrows move the cursor while typing, not the preview
      else if (e.key === "ArrowRight" && st.items.length > 1) setSt({ ...st, index: (st.index + 1) % st.items.length });
      else if (e.key === "ArrowLeft" && st.items.length > 1) setSt({ ...st, index: (st.index - 1 + st.items.length) % st.items.length });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [st]);

  if (!st) return null;
  const cur = st.items[st.index];
  const v = failed === cur.url ? { kind: "outside" as const } : viewFor(cur.url);
  const many = st.items.length > 1;
  const go = (d: number) => setSt({ ...st, index: (st.index + d + st.items.length) % st.items.length });

  return (
    <aside className={`rfp${box ? " docked" : ""}`} style={box ?? undefined} role="dialog" aria-label="Preview">
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
        {v.kind === "image" && <img src={v.src} alt={nameOf(cur)} onError={() => setFailed(cur.url)} />}
        {v.kind === "video" && <video src={v.src} controls autoPlay playsInline onError={() => setFailed(cur.url)} />}
        {v.kind === "download" && (
          <div className="rfp-msg">This file can&apos;t be previewed here.
            <a className="rfp-btn pri" href={cur.url} target="_blank" rel="noreferrer" download><IconDownload size={14} stroke={2} />Download</a>
          </div>
        )}
        {v.kind === "outside" && (
          <div className="rfp-msg">{failed === cur.url ? "This file couldn't be shown here." : "This website can't be shown inside the dashboard."}
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
.rfp{position:fixed;top:0;right:0;bottom:0;width:min(480px,100vw);z-index:310;display:flex;flex-direction:column;background:#F7F8FC;border-left:1px solid #E5E8F0;box-shadow:-12px 0 32px rgba(35,45,66,.12)}
.rfp.docked{bottom:auto;right:auto;box-shadow:none;border:1px solid #E5E8F0;border-radius:12px;overflow:hidden}
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
