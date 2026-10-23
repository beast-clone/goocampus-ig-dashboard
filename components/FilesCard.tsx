"use client";
import { useEffect, useRef, useState } from "react";
import { IconUpload, IconLink, IconFileText } from "@tabler/icons-react";
import { PdfThumb } from "@/components/PdfThumb";
import type { PendingUpload } from "@/lib/use-upload-queue";
import { openRefPreview } from "@/components/RefPreview";

// One files card for every place a task takes files — My Day, the task window and the
// New task form (Praveen, 22 Oct: "do it like how we did it for My Day"). A header
// (icon · title · count · Upload), an optional drop zone, numbered tiles with files on
// their way up shown as progress rings, and a paste-a-link field. Presentational only:
// the caller owns uploading, removing and saving links.
//
// Ctrl/Cmd+V pastes files into the box the pointer was last over (Praveen, 23 Oct:
// "copy paste it on that references, it'll update") — a screenshot, a copied image.
// Not while typing in some other field: the paste is that field's.
let pasteTarget: HTMLElement | null = null;
const pastedName = (files: File[]) => {
  // A screenshot pastes as "image.png" every time; give it a name worth keeping.
  const d = new Date(), p2 = (x: number) => String(x).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  return files.map((f, i) => (/^image\.(png|jpe?g|gif|webp)$/i.test(f.name) ? new File([f], `pasted-${stamp}${files.length > 1 ? `-${i + 1}` : ""}.${f.name.split(".").pop()}`, { type: f.type }) : f));
};
export type FileTile = {
  key: string; name: string; url?: string; preview?: string;
  kind: "image" | "video" | "pdf" | "file";
  onOpen?: () => void;      // fallback when there's no preview panel on the page
  onRemove?: () => void;
};

const host = (u: string): string => {
  try {
    const h = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "");
    if (h.includes("drive.google") || h.includes("docs.google")) return "Google Drive";
    if (h.includes("canva")) return "Canva";
    if (h.includes("instagram")) return "Instagram";
    if (h.includes("youtube") || h.includes("youtu.be")) return "YouTube";
    if (h.includes("notion")) return "Notion";
    if (h.includes("figma")) return "Figma";
    return h;
  } catch { return "Link"; }
};
const linkHref = (s: string) => s.match(/https?:\/\/[^\s<>"')\]]+/i)?.[0];

export function FilesCard({
  icon, title, count, drop, accept, onFiles, busyText, tiles, numbered, pending = [], onDismiss,
  links, onAddLink, onRemoveLink, linkPlaceholder, singleLink, addLabel = "+ Add file", addSub = "drop or paste here", hint, onReorder,
}: {
  icon?: React.ReactNode; title: string; count?: string;
  /** Big drop zone under the header (Creatives). Otherwise a dashed Add tile ends the row. */
  drop?: boolean;
  accept: string; onFiles: (files: FileList | File[]) => void; busyText?: string;
  tiles: FileTile[]; numbered?: boolean;
  pending?: PendingUpload[]; onDismiss?: (key: string) => void;
  links?: string[]; onAddLink?: (href: string) => void; onRemoveLink?: (href: string) => void;
  linkPlaceholder?: string; singleLink?: boolean;
  addLabel?: string; addSub?: string; hint?: string;
  /** Turns on drag-to-reorder; gets the tile keys in their new order. */
  onReorder?: (keys: string[]) => void;
}) {
  const [url, setUrl] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const onFilesRef = useRef(onFiles); onFilesRef.current = onFiles;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = cardRef.current;
      if (!el || pasteTarget !== el || !el.isConnected) return;
      const files = Array.from(e.clipboardData?.files || []);
      if (!files.length) return;   // ordinary text paste — leave it alone
      const a = document.activeElement as HTMLElement | null;
      if (a && !el.contains(a) && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      e.preventDefault(); e.stopPropagation();
      onFilesRef.current(pastedName(files));
    };
    document.addEventListener("paste", onPaste, true);
    return () => { document.removeEventListener("paste", onPaste, true); if (pasteTarget === cardRef.current) pasteTarget = null; };
  }, []);
  const addUrl = () => {
    const raw = url.trim(); if (!raw || !onAddLink) return;
    setUrl("");
    onAddLink(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  };
  const picker = (cls: string, body: React.ReactNode) => (
    <label className={cls} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files); }}>
      {body}
      <input type="file" accept={accept} multiple hidden onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }} />
    </label>
  );
  const showTiles = tiles.length > 0 || pending.length > 0 || !drop;
  // Drag a tile onto another to move it there (Praveen, 23 Oct). The new order shows at
  // once and is kept until the saved list comes back.
  const tileKeys = tiles.map((t) => t.key).join("\u0000");
  const [order, setOrder] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  useEffect(() => { setOrder(null); }, [tileKeys]);
  const shown = order ? [...order.map((k) => tiles.find((t) => t.key === k)).filter((t): t is FileTile => !!t), ...tiles.filter((t) => !order.includes(t.key))] : tiles;
  const canDrag = !!onReorder && tiles.length > 1;
  const justDragged = useRef(false);   // the click that ends a drag doesn't open the file
  const dropOn = (from: string, target: string | null) => {
    setDrag(null); setOver(null);
    if (!target || from === target || !onReorder) return;
    const keys = shown.map((t) => t.key);
    const fi = keys.indexOf(from), ti = keys.indexOf(target);
    keys.splice(fi, 1);
    keys.splice(ti, 0, from);   // lands where the target was, pushing it along
    setOrder(keys);
    onReorder(keys);
  };
  // Pointer-based, not the browser's drag-and-drop, so it also works on touch screens.
  // A press only becomes a drag after the pointer moves a few pixels; a plain click
  // still opens the file.
  const startDrag = (e: React.PointerEvent, key: string) => {
    if (!canDrag || e.button !== 0 || (e.target as HTMLElement).closest(".gcf-x")) return;
    const x0 = e.clientX, y0 = e.clientY;
    let moving = false, target: string | null = null;
    const keyAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-tile-key]") as HTMLElement | null)?.dataset.tileKey ?? null;
    const move = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!moving) { moving = true; setDrag(key); }
      ev.preventDefault();
      target = keyAt(ev.clientX, ev.clientY);
      setOver(target);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moving) return;
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      dropOn(key, target);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  // A file or link opens in the side panel (components/RefPreview), next to the task,
  // with ‹ › through this card's other files. Ctrl/Cmd-click still opens a tab.
  const plain = (e: React.MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
  const openTile = (e: React.MouseEvent, t: FileTile) => {
    if (justDragged.current) { e.preventDefault(); return; }
    if (!plain(e)) return;
    const withUrl = shown.filter((x) => x.url);
    if (t.url && openRefPreview(withUrl.map((x) => ({ url: x.url!, title: x.name, from: title })), withUrl.indexOf(t))) { e.preventDefault(); return; }
    if (t.onOpen) { e.preventDefault(); t.onOpen(); }
  };
  const openLink = (e: React.MouseEvent, l: string) => {
    const href = linkHref(l);
    if (href && plain(e) && openRefPreview({ url: href, title: host(l), from: title })) e.preventDefault();
  };
  return (
    <div className="gcf" ref={cardRef} onMouseEnter={() => { pasteTarget = cardRef.current; }} onPointerDown={() => { pasteTarget = cardRef.current; }}>
      <style dangerouslySetInnerHTML={{ __html: GCF_CSS }} />
      <div className="gcf-h">
        <span className="gcf-ico">{icon || <IconUpload size={15} stroke={1.8} />}</span>
        <b>{title}</b>
        {count && <span className="gcf-cnt">{count}</span>}
        {picker("gcf-btn", <><IconUpload size={14} stroke={1.8} /> Upload</>)}
      </div>
      <div className="gcf-b">
        {drop && picker("gcf-drop", <>
          <span className="gcf-ci"><IconUpload size={17} stroke={1.7} /></span>
          <span><span className="gcf-dt">{busyText || <>Drop or paste files here, or <span className="gcf-browse">browse</span></>}</span>
            <span className="gcf-ds">{hint || "Images, videos or PDFs · up to 2 GB each (Instagram posts reels up to 300 MB)"}</span></span>
        </>)}
        {showTiles && (
          <div className="gcf-tiles">
            {shown.map((t, i) => {
              const inner = t.kind === "pdf" && t.url
                ? <PdfThumb url={t.url} width={96} fallback={<span className="gcf-doc"><IconFileText size={20} stroke={1.7} /></span>} />
                : t.kind === "file" || (t.kind === "pdf" && !t.url)
                  ? <span className="gcf-doc"><IconFileText size={20} stroke={1.7} /><i>{(t.name.split(".").pop() || "file").slice(0, 5)}</i></span>
                  : t.kind === "video" ? <span className="gcf-play">▶</span> : null;
              const style = t.kind === "image" && (t.preview || t.url) ? { backgroundImage: `url(${t.preview || t.url})` } : undefined;
              return (
                <div key={t.key} className={`gcf-tile${drag === t.key ? " drag" : ""}${over === t.key && drag !== t.key ? " over" : ""}`} title={canDrag ? `${t.name} — drag to change the order` : t.name}
                  data-tile-key={t.key} data-movable={canDrag || undefined}
                  onPointerDown={canDrag ? (e) => startDrag(e, t.key) : undefined}
                  onDragStart={canDrag ? (e) => e.preventDefault() : undefined}>
                  {t.url
                    ? <a className="gcf-im" draggable={false} href={t.url} target="_blank" rel="noreferrer" style={style} onClick={(e) => openTile(e, t)}>{inner}</a>
                    : <div className={`gcf-im${t.onOpen ? " clk" : ""}`} style={style} onClick={t.onOpen ? () => { if (!justDragged.current) t.onOpen!(); } : undefined}>{inner}</div>}
                  {numbered && <span className="gcf-n">{i + 1}</span>}
                  <div className="gcf-nm">{t.name}</div>
                  {t.onRemove && <button type="button" className="gcf-x" onClick={t.onRemove} title="Remove">✕</button>}
                </div>
              );
            })}
            {pending.map((p, i) => {
              const C = 2 * Math.PI * 15;
              return (
                <div key={p.key} className={`gcf-tile gcf-pend ${p.state}`} title={p.state === "err" ? `${p.name} — ${p.error}` : p.name}>
                  <div className="gcf-im" style={p.preview ? { backgroundImage: `url(${p.preview})` } : undefined}>
                    {!p.preview && <span className="gcf-doc"><IconFileText size={20} stroke={1.7} /></span>}
                    <span className="gcf-ring">
                      {p.state === "err" ? <span className="gcf-ring-x">!</span> : p.state === "done" ? <span className="gcf-ring-ok">✓</span> : (
                        <svg width="38" height="38" viewBox="0 0 38 38" aria-label={`${p.pct}% uploaded`}>
                          <circle cx="19" cy="19" r="15" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="3.5" />
                          <circle cx="19" cy="19" r="15" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C}
                            strokeDashoffset={C * (1 - Math.max(0.04, p.state === "waiting" ? 0 : p.pct / 100))} transform="rotate(-90 19 19)" />
                        </svg>
                      )}
                    </span>
                  </div>
                  {numbered && <span className="gcf-n">{tiles.length + i + 1}</span>}
                  <div className="gcf-nm">{p.state === "err" ? "Didn't upload" : p.state === "waiting" ? "Waiting…" : p.state === "done" ? p.name : `${p.pct}% · ${p.name}`}</div>
                  {p.state === "err" && onDismiss && <button type="button" className="gcf-x on" onClick={() => onDismiss(p.key)} title="Dismiss">✕</button>}
                </div>
              );
            })}
            {!drop && picker("gcf-add", <><span className="gcf-add-t">{busyText || addLabel}</span><span className="gcf-add-s">{addSub}</span></>)}
          </div>
        )}
        {links && links.map((l) => (
          <div key={l} className="gcf-lrow">
            <span className="gcf-host">{host(l)}</span>
            <a className="gcf-u" href={linkHref(l)} target="_blank" rel="noreferrer" title={l} onClick={(e) => openLink(e, l)}>{l}</a>
            <a className="gcf-act" href={linkHref(l)} target="_blank" rel="noreferrer" title="Open in a new tab" data-ref-preview-skip>Open ↗</a>
            {onRemoveLink && <button type="button" className="gcf-act red" onClick={() => onRemoveLink(l)}>Remove</button>}
          </div>
        ))}
        {onAddLink && !(singleLink && links && links.length) && (
          <div className="gcf-linkin">
            <IconLink size={15} stroke={1.8} className="gcf-linkic" />
            <input placeholder={linkPlaceholder || "Paste a link…"} value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} />
            <button type="button" className="gcf-addlink" onClick={addUrl} disabled={!url.trim()}>Add link</button>
          </div>
        )}
      </div>
    </div>
  );
}

// My Day's up-card look (compact sizes), scoped to .gcf so it renders the same on any
// page. Hope UI tokens; dark mode below.
const GCF_CSS = `
.gcf{--ink:#232D42;--ink-soft:#4A5468;--muted:#8A92A6;--line:#EEF0F4;--panel:#fff;--panel-2:#F7F8FC;--brand:#3A57E8;--brand-ink:#2138B0;--brand-soft:#E9ECFB;--drop:#F7F8FE;--drop-line:#C8D0F5;--im:#E3E6EE;
  border:1px solid var(--line);border-radius:12px;background:var(--panel);font-size:13px;color:var(--ink)}
html[data-theme="dark"] .gcf{--ink:#E8EBF3;--ink-soft:#C2C8D6;--muted:#959DB1;--line:#2C3246;--panel:#1F2332;--panel-2:#191D2A;--brand-ink:#93A3FF;--brand-soft:#2C3666;--drop:#191D2A;--drop-line:#3A4159;--im:#272C3E}
.gcf *{box-sizing:border-box}
.gcf-h{display:flex;align-items:center;gap:.6rem;padding:.6rem .85rem;border-bottom:1px solid var(--line)}
.gcf-ico{width:26px;height:26px;border-radius:8px;background:var(--brand-soft);color:var(--brand);display:grid;place-items:center;flex:0 0 auto}
.gcf-h b{font-size:13px;font-weight:500;color:var(--ink)}
.gcf-cnt{font-size:12px;color:var(--muted)}
.gcf-btn{margin-left:auto;display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;font-size:12.5px;font-weight:500;color:var(--ink-soft);border:1px solid var(--line);border-radius:8px;padding:.3rem .65rem;background:var(--panel)}
.gcf-btn:hover{border-color:var(--brand);color:var(--brand)}
.gcf-b{padding:.7rem .85rem .8rem;display:flex;flex-direction:column;gap:.6rem}
.gcf-drop{display:flex;align-items:center;gap:.65rem;border:1.5px dashed var(--drop-line);background:var(--drop);border-radius:12px;padding:.6rem .8rem;cursor:pointer}
.gcf-drop:hover{border-color:var(--brand)}
.gcf-ci{width:32px;height:32px;border-radius:50%;background:var(--panel);border:1px solid var(--drop-line);color:var(--brand);display:grid;place-items:center;flex:0 0 auto}
.gcf-dt{display:block;font-weight:500;font-size:13px;color:var(--ink)}
.gcf-browse{color:var(--brand)}
.gcf-ds{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.gcf-tiles{display:flex;gap:.7rem;flex-wrap:wrap}
.gcf-tile{position:relative;width:96px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel)}
.gcf-im{display:block;height:96px;background-size:cover;background-position:center;background-color:var(--im);position:relative;overflow:hidden}
.gcf-im.clk{cursor:zoom-in}
.gcf-doc{display:grid;place-items:center;align-content:center;gap:2px;height:100%;color:var(--muted)}
.gcf-doc i{font-style:normal;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
.gcf-play{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:20px;text-shadow:0 1px 6px rgba(0,0,0,.4)}
.gcf-nm{font-size:11.5px;padding:.4rem .5rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink-soft)}
.gcf-n{position:absolute;top:6px;left:6px;font-size:10.5px;background:rgba(35,45,66,.6);color:#fff;border-radius:5px;padding:0 5px;z-index:2}
.gcf-x{position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:6px;border:none;background:rgba(35,45,66,.6);color:#fff;font-size:11px;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .12s;z-index:2}
.gcf-tile:hover .gcf-x,.gcf-x.on{opacity:1}
.gcf-tile[data-movable]{cursor:grab;touch-action:none;user-select:none}
.gcf-tile.drag{opacity:.4}
.gcf-tile.over{border-color:var(--brand);outline:2px solid var(--brand);outline-offset:-1px}
.gcf-add{width:96px;height:126px;border:1.5px dashed var(--drop-line);background:var(--drop);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;text-align:center;padding:0 .4rem}
.gcf-add:hover{border-color:var(--brand)}
.gcf-add-t{font-size:12.5px;font-weight:500;color:var(--brand)}
.gcf-add-s{font-size:11px;color:var(--muted)}
.gcf-pend .gcf-im::after{content:"";position:absolute;inset:0;background:rgba(20,24,40,.38)}
.gcf-pend.done .gcf-im::after{background:rgba(20,24,40,.15)}
.gcf-pend.err{border-color:#F3C6CE}
.gcf-pend .gcf-nm{color:var(--muted)}
.gcf-ring{position:absolute;inset:0;display:grid;place-items:center;z-index:1}
.gcf-ring-ok,.gcf-ring-x{width:30px;height:30px;border-radius:99px;display:grid;place-items:center;font-size:15px;color:#fff;background:var(--brand)}
.gcf-ring-x{background:#C0392B}
.gcf-lrow{display:flex;align-items:center;gap:.6rem;border:1px solid var(--line);border-radius:10px;padding:.45rem .65rem;font-size:12.5px}
.gcf-host{font-size:11px;font-weight:500;color:var(--brand-ink);background:var(--brand-soft);border-radius:6px;padding:2px 7px;flex:0 0 auto}
.gcf-u{flex:1;min-width:0;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.gcf-u:hover{color:var(--brand-ink);text-decoration:underline}
.gcf-act{font-size:12px;font-weight:500;color:var(--ink-soft);background:none;border:none;cursor:pointer;text-decoration:none;padding:2px 4px}
.gcf-act:hover{color:var(--brand-ink)}
.gcf-act.red{color:#C0392B}
.gcf-linkin{display:flex;align-items:center;gap:.5rem;border:1px solid var(--line);border-radius:10px;padding:4px 4px 4px 12px;background:var(--panel)}
.gcf-linkin:focus-within{border-color:var(--brand)}
.gcf-linkic{color:var(--muted);flex:0 0 auto}
.gcf-linkin input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:13px;color:var(--ink)}
.gcf-addlink{font-size:12px;font-weight:500;color:#fff;background:var(--brand);border:none;border-radius:7px;padding:.35rem .7rem;cursor:pointer}
.gcf-addlink:disabled{opacity:.45;cursor:default}
`;
