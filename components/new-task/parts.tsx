"use client";
import { useEffect, useState } from "react";
import { IconLink } from "@tabler/icons-react";
import { useTeam, NEWCOMER_COLOR } from "@/lib/use-team";

// Presentational pieces the new-task form is built from, lifted out of
// PreviewMyDay so the form can be rendered on more than one screen.
//
// They are unchanged from the My Day originals and still carry the same class
// names (.av, .ui-dd-*, .dp-*), which are styled by MY_DAY_CSS under its `.hmd`
// scope — so whatever renders them has to sit inside a .hmd element. My Day
// already does; NewTaskDialog wraps itself in one.

// dropped in later (from ind_users) with no render changes.
export type Person = { name: string; av: string; color: string; photo?: string };

export const PHOTOS: Record<string, string> = {};
export function Avatar({ p, cls = "av av-sm" }: { p: { name?: string; av: string; color: string; photo?: string }; cls?: string }) {
  const photo = p.photo || PHOTOS[(p.name || "").split(" ")[0].toLowerCase()];
  if (photo) {
    return <span className={cls} title={p.name} style={{ backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "center" }} />;
  }
  return <span className={cls} title={p.name} style={{ background: p.color }}>{p.av}</span>;
}


export function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const base = value ? new Date(value + "T00:00:00") : new Date();
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const p2 = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, m: number, d: number) => `${y}-${p2(m + 1)}-${p2(d)}`;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const sel = value ? new Date(value + "T00:00:00") : null;
  const now = new Date();
  const startDow = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const label = sel ? sel.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "";
  const shift = (dir: number) => setView((v) => { const m = v.m + dir; if (m < 0) return { y: v.y - 1, m: 11 }; if (m > 11) return { y: v.y + 1, m: 0 }; return { y: v.y, m }; });
  return (
    <div className="dp">
      <button type="button" className="dp-field" onClick={() => setOpen((o) => !o)}>
        <span className={label ? "" : "dp-ph"}>{label || "Pick a date"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="dp-cal"><rect x="3" y="4.5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M3 9h18M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <>
          <div className="dp-backdrop" onClick={() => setOpen(false)} />
          <div className="dp-pop">
            <div className="dp-head">
              <span className="dp-title">{MONTHS[view.m]} {view.y}</span>
              <div className="dp-nav"><button type="button" onClick={() => shift(-1)}>‹</button><button type="button" onClick={() => shift(1)}>›</button></div>
            </div>
            <div className="dp-grid dp-dow">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="dp-grid">
              {cells.map((d, i) => d === null ? <span key={i} className="dp-empty" /> : (
                <button key={i} type="button"
                  className={`dp-day ${sel && sel.getFullYear() === view.y && sel.getMonth() === view.m && sel.getDate() === d ? "sel" : ""} ${now.getFullYear() === view.y && now.getMonth() === view.m && now.getDate() === d ? "today" : ""}`}
                  onClick={() => { onChange(iso(view.y, view.m, d)); setOpen(false); }}>{d}</button>
              ))}
            </div>
            <div className="dp-foot">
              <button type="button" className="dp-link" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
              <button type="button" className="dp-link" onClick={() => { onChange(iso(now.getFullYear(), now.getMonth(), now.getDate())); setView({ y: now.getFullYear(), m: now.getMonth() }); setOpen(false); }}>Today</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// The team, by key. Owner / collaborator chips read names and colours from here.
// Today's team is typed for its colours; anyone added on the Team page is added at
// runtime by usePplTeam() — named from the roster, neutral colour.
export const PPL: Record<string, Person> = {
  manya: { name: "Manya", av: "M", color: "#E0791F" },
  praveen: { name: "Praveen", av: "P", color: "#C2410C" },
  nikhil: { name: "Nikhil", av: "N", color: "#3A57E8" },
  nandu: { name: "Nandu", av: "N", color: "#6E48F8" },
  maheen: { name: "Maheen", av: "M", color: "#2F9E6F" },
};

/** Add Team-page newcomers to PPL and re-render once they arrive. Call at the top of
 *  any screen that lists people from PPL (My Day, the New task form). */
export function usePplTeam() {
  const team = useTeam();
  const [, bump] = useState(0);
  useEffect(() => {
    let added = false;
    for (const p of team) {
      if (!p.active || PPL[p.id]) continue;
      PPL[p.id] = { name: p.first, av: (p.first || p.id).charAt(0).toUpperCase(), color: NEWCOMER_COLOR };
      added = true;
    }
    if (added) bump((n) => n + 1);
  }, [team]);
}

export function MenuDropdown({ value, options, onChange, placeholder = "Select…", icon, wide, align = "right" }: {
  value: string | number | "";
  options: { value: string | number; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string; icon?: React.ReactNode; wide?: boolean; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => String(o.value) === String(value));
  return (
    <div className={`ui-dd ${wide ? "wide" : ""}`}>
      <button type="button" className="ui-dd-btn" onClick={() => setOpen((o) => !o)}>
        {icon && <span className="ui-dd-ic">{icon}</span>}
        <span className="ui-dd-val">{cur ? cur.label : placeholder}</span>
        <span className="ui-dd-caret" />
      </button>
      {open && (
        <>
          <div className="ui-dd-back" onClick={() => setOpen(false)} />
          <div className="ui-dd-menu" style={wide ? { left: 0, right: 0 } : { [align]: 0 }}>
            {options.map((o) => (
              <button type="button" key={String(o.value)} className={`ui-dd-item ${String(o.value) === String(value) ? "on" : ""}`} onClick={() => { onChange(String(o.value)); setOpen(false); }}>
                <span className="ui-dd-item-lbl">{o.label}</span>
                {String(o.value) === String(value) && <span className="ui-dd-check">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// local preview) + links in memory; the parent uploads them once the task row exists
// (references → mh_attachments kind='reference' + reference_links; output → kind='creative'
// + output_link). `oneLink` caps output at a single final-creative link (the DB column
// output_link is singular). Mirrors the detail-view ReferencesSection UI + classes.
export type PendingFile = { file: File; url: string };
export type PendingAsset = { links: string[]; files: PendingFile[] };
export type NewTaskAssets = { refLinks: string[]; refFiles: File[]; outLink: string; outFiles: File[] };
export const EMPTY_ASSET: PendingAsset = { links: [], files: [] };

export function PendingAssets({ hint, oneLink, value, onChange }: { hint: string; oneLink?: boolean; value: PendingAsset; onChange: (p: PendingAsset) => void }) {
  const [url, setUrl] = useState("");
  const addUrl = () => {
    const raw = url.trim(); if (!raw) return;
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    onChange({ ...value, links: oneLink ? [href] : [...value.links, href] });
    setUrl("");
  };
  const addFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const added = Array.from(files).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    onChange({ ...value, files: [...value.files, ...added] });
  };
  const rmFile = (i: number) => { const f = value.files[i]; if (f) URL.revokeObjectURL(f.url); onChange({ ...value, files: value.files.filter((_, j) => j !== i) }); };
  const rmLink = (i: number) => onChange({ ...value, links: value.links.filter((_, j) => j !== i) });
  return (
    <>
      <div className="refs">
        {value.files.map((f, i) => (
          <div key={i} className="thumb ref-thumb" title={f.file.name}>
            <div className="thumb-img" style={{ backgroundImage: `url(${f.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
            <div className="thumb-name">{f.file.name}</div>
            <button type="button" className="ref-x" onClick={() => rmFile(i)} title="Remove">✕</button>
          </div>
        ))}
        <label className="thumb thumb-add" title="Add image">
          <span className="thumb-add-plus">＋</span><span className="thumb-add-lbl">Image</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {value.links.length > 0 && (
        <div className="refs" style={{ marginTop: ".45rem" }}>
          {value.links.map((l, i) => (
            <a key={i} className="ref-link" href={l} target="_blank" rel="noreferrer" title={l}>
              <span className="ref-link-ic"><IconLink size={14} stroke={1.8} /></span>
              <span className="ref-link-lbl">{l.replace(/^https?:\/\//i, "")}</span>
              <span className="ref-x sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); rmLink(i); }} title="Remove">✕</span>
            </a>
          ))}
        </div>
      )}
      <div className="ref-url" style={{ marginTop: ".45rem" }}>
        <input className="nt-input" placeholder={oneLink ? "Paste the final creative link (Drive / Canva)…" : "Paste a reference URL…"} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} />
        <button type="button" className="btn primary sm" onClick={addUrl} disabled={!url.trim()}>Add link</button>
      </div>
      <div className="nt-hint" style={{ marginTop: ".35rem", display: "block" }}>{hint}</div>
    </>
  );
}
