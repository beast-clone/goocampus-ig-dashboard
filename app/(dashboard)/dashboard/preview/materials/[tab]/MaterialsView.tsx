"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconPlus, IconSearch, IconX, IconPaperclip, IconCheck, IconTrash, IconFileText, IconReceipt, IconPhoto,
  IconFileDescription, IconSpeakerphone, IconRepeat, IconNotes, IconCalendar, IconCurrencyRupee, IconListNumbers,
} from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { confirmDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { showToast } from "@/app/(dashboard)/dashboard/preview/Toast";
import { LoadingBlock } from "@/components/LoadingBlock";
import { FilesCard, type FileTile } from "@/components/FilesCard";
import { PdfThumb, isPdf } from "@/components/PdfThumb";
import { openRefPreview } from "@/components/RefPreview";
import { uploadMaterialFile } from "@/lib/upload-task-file";
import { type MTab, type MField } from "@/lib/materials";

// One page for all six Marketing Materials tabs (lib/materials.ts): totals at the top
// for the money tabs, search and filters, then a table (or a picture grid for photos
// and brochures). Click a row to edit it in the side window; "Add" opens it empty.

type MFile = { url: string; name: string; mime?: string; size?: number };
type Row = Record<string, unknown> & { id: string };

const ICONS = { expenses: IconReceipt, photos: IconPhoto, materials: IconFileDescription, promotions: IconSpeakerphone, subscriptions: IconRepeat, meetings: IconNotes };
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (d: unknown) => (typeof d === "string" && d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).slice(0, 7);
const filesOf = (r: Row | Record<string, unknown>): MFile[] => (Array.isArray(r.files) ? (r.files as MFile[]) : []);
const isImage = (f: MFile) => (f.mime || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f.name);
const fileKind = (f: MFile): FileTile["kind"] => (isImage(f) ? "image" : isPdf(f.url, f.mime) ? "pdf" : (f.mime || "").startsWith("video/") ? "video" : "file");

export function MaterialsView({ tab }: { tab: MTab }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [shown, setShown] = useState(100);

  const load = async () => {
    const r = await fetch(`/api/materials/${tab.key}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setError((j as { error?: string }).error || "Couldn't load this tab."); setRows([]); return; }
    setError(null); setRows((j as { rows: Row[] }).rows);
  };
  useEffect(() => { void load(); }, [tab.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choices for a select / multi field: the configured ones plus every value used.
  const optionsFor = (f: MField): string[] => {
    const seen = new Set(f.options || []);
    for (const r of rows || []) { const v = r[f.key]; (Array.isArray(v) ? v : [v]).forEach((x) => { if (typeof x === "string" && x.trim()) seen.add(x.trim()); }); }
    return [...seen].sort((a, b) => a.localeCompare(b));
  };
  const filterFields = tab.fields.filter((f) => (f.type === "select" || f.type === "multi") && f.col !== false && f.key !== "attendees").slice(0, 3);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      for (const [k, v] of Object.entries(filters)) {
        if (!v) continue;
        const cell = r[k];
        if (Array.isArray(cell) ? !cell.includes(v) : cell !== v) return false;
      }
      if (!needle) return true;
      return tab.fields.some((f) => {
        const v = r[f.key];
        if (typeof v === "string") return v.toLowerCase().includes(needle);
        if (Array.isArray(v)) return v.some((x) => typeof x === "string" ? x.toLowerCase().includes(needle) : typeof x === "object" && x && String((x as MFile).name || "").toLowerCase().includes(needle));
        return false;
      });
    });
  }, [rows, q, filters, tab]);
  useEffect(() => { setShown(100); }, [q, filters]);

  const Icon = ICONS[tab.key];
  return (
    <PreviewDashboardShell active="marketing-materials" title={tab.label} subtitle={tab.intro} hideAccountPicker hideRange>
      {() => (
        <div className="preview-scope space-y-4">
          {rows === null ? <div className="bg-white border border-gray-100 rounded-2xl"><LoadingBlock label={`Loading ${tab.nounPlural}…`} /></div> : <>
            <Totals tab={tab} rows={list} all={rows} />
            <div className="bg-white border border-gray-100 rounded-2xl">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
                <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center flex-shrink-0"><Icon size={16} stroke={1.8} /></span>
                <div className="mr-2">
                  <div className="text-[14px] font-medium text-[#232D42]">{tab.label}</div>
                  <div className="text-[12px] text-[#8A92A6]">{list.length === rows.length ? `${rows.length} ${rows.length === 1 ? tab.noun : tab.nounPlural}` : `${list.length} of ${rows.length}`}</div>
                </div>
                <label className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white flex-1 min-w-[180px] max-w-[320px]">
                  <IconSearch size={15} stroke={1.8} className="text-[#8A92A6]" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab.nounPlural}…`} className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-[#232D42] placeholder:text-[#8A92A6]" />
                  {q && <button onClick={() => setQ("")} aria-label="Clear search" className="text-[#8A92A6] hover:text-[#232D42]"><IconX size={14} /></button>}
                </label>
                {filterFields.map((f) => (
                  <PreviewSelect key={f.key} value={filters[f.key] || ""} onChange={(v) => setFilters((s) => ({ ...s, [f.key]: v }))}
                    options={[{ value: "", label: `All ${f.label.toLowerCase()}` }, ...optionsFor(f).map((o) => ({ value: o, label: o }))]} ariaLabel={f.label} />
                ))}
                <button onClick={() => setEditing("new")} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-brand text-white text-[13px] font-medium hover:bg-[#2138B0]">
                  <IconPlus size={15} stroke={2} /> Add {tab.noun}
                </button>
              </div>
              {error && <div className="px-4 py-3 text-[13px] text-[#C03221]">{error}</div>}
              {list.length === 0 ? (
                <div className="px-4 py-14 text-center text-[13px] text-[#8A92A6]">{rows.length ? "Nothing matches — clear the search or filters." : `No ${tab.nounPlural} yet.`}</div>
              ) : tab.grid ? (
                <Grid tab={tab} rows={list.slice(0, shown)} onOpen={setEditing} />
              ) : (
                <Table tab={tab} rows={list.slice(0, shown)} all={rows} onOpen={setEditing} />
              )}
              {list.length > shown && (
                <div className="px-4 py-3 border-t border-gray-100 text-center">
                  <button onClick={() => setShown((n) => n + 100)} className="text-[13px] text-brand font-medium hover:underline">Show more ({list.length - shown} left)</button>
                </div>
              )}
            </div>
          </>}
          {editing && <Editor tab={tab} row={editing === "new" ? null : editing} optionsFor={optionsFor}
            onClose={() => setEditing(null)}
            onSaved={(row) => { setRows((rs) => { const all = rs || []; return all.some((r) => r.id === row.id) ? all.map((r) => (r.id === row.id ? row : r)) : [row, ...all]; }); setEditing(null); }}
            onRemoved={(row) => {
              setRows((rs) => (rs || []).filter((r) => r.id !== row.id)); setEditing(null);
              showToast({ who: "Removed", body: String(row.title || tab.noun), av: "✓", action: "Undo", onOpen: async () => {
                const r = await fetch(`/api/materials/${tab.key}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, restore: true }) });
                if (r.ok) void load();
              } });
            }} />}
        </div>
      )}
    </PreviewDashboardShell>
  );
}

// Money tabs: total, this month, count. Others: count (and this month when dated).
function Totals({ tab, rows, all }: { tab: MTab; rows: Row[]; all: Row[] }) {
  const month = thisMonth();
  const sum = (rs: Row[]) => rs.reduce((n, r) => n + (Number(r[tab.money!]) || 0), 0);
  const inMonth = tab.date ? rows.filter((r) => String(r[tab.date!] || "").startsWith(month)) : [];
  const cards: { label: string; value: string; icon: typeof IconCalendar; note?: string }[] = [];
  if (tab.key === "subscriptions") {
    const live = rows.filter((r) => r.status === "Still in use");
    cards.push({ label: "Still in use", value: String(live.length), icon: IconCheck, note: `of ${rows.length} tools` });
    cards.push({ label: "Monthly", value: String(live.filter((r) => r.frequency === "Monthly").length), icon: IconRepeat, note: "billed every month" });
    cards.push({ label: "Annual", value: String(live.filter((r) => r.frequency === "Annual").length), icon: IconCalendar, note: "billed once a year" });
  } else if (tab.money) {
    cards.push({ label: "Total", value: inr(sum(rows)), icon: IconCurrencyRupee, note: rows.length === all.length ? "all time" : "matching the filters" });
    if (tab.date) cards.push({ label: "This month", value: inr(sum(inMonth)), icon: IconCalendar, note: `${inMonth.length} ${inMonth.length === 1 ? tab.noun : tab.nounPlural}` });
    cards.push({ label: tab.nounPlural[0].toUpperCase() + tab.nounPlural.slice(1), value: String(rows.length), icon: IconListNumbers });
  } else if (tab.date) {
    cards.push({ label: tab.nounPlural[0].toUpperCase() + tab.nounPlural.slice(1), value: String(rows.length), icon: IconListNumbers });
    cards.push({ label: "This month", value: String(inMonth.length), icon: IconCalendar });
  }
  if (!cards.length) return null;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-brand-light text-brand grid place-items-center flex-shrink-0"><c.icon size={17} stroke={1.8} /></span>
          <div className="min-w-0">
            <div className="text-[12px] text-[#8A92A6]">{c.label}</div>
            <div className="text-[18px] font-medium text-[#232D42] leading-tight">{c.value}</div>
            {c.note && <div className="text-[11.5px] text-[#8A92A6]">{c.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

const Chip = ({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "muted" | "good" }) => (
  <span className={`inline-flex items-center max-w-full px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap overflow-hidden text-ellipsis ${
    tone === "good" ? "bg-[#E3F5EA] text-[#1AA053]" : tone === "muted" ? "bg-[#F0F2F8] text-[#4A5468]" : "bg-brand-light text-[#2138B0]"}`}>{children}</span>
);

function Cell({ f, v }: { f: MField; v: unknown }) {
  if (f.type === "money") return <span className="tabular-nums text-[#232D42]">{v == null || v === "" ? "—" : inr(Number(v))}</span>;
  if (f.type === "date") return <span className="text-[#4A5468] whitespace-nowrap">{fmtDate(v)}</span>;
  if (f.type === "bool") return v ? <IconCheck size={16} stroke={2} className="text-[#1AA053]" /> : <span className="text-[#C2C8D6]">—</span>;
  if (f.type === "multi") {
    const a = Array.isArray(v) ? (v as string[]) : [];
    if (!a.length) return <span className="text-[#C2C8D6]">—</span>;
    return <span className="flex flex-wrap gap-1">{a.slice(0, 3).map((x) => <Chip key={x}>{x}</Chip>)}{a.length > 3 && <Chip tone="muted">+{a.length - 3}</Chip>}</span>;
  }
  if (f.type === "select") {
    if (!v) return <span className="text-[#C2C8D6]">—</span>;
    return <Chip tone={v === "Still in use" ? "good" : f.key === "status" || f.key === "frequency" || f.key === "billing" || f.key === "owner" ? "muted" : "brand"}>{String(v)}</Chip>;
  }
  if (f.type === "files") {
    const a = Array.isArray(v) ? (v as MFile[]) : [];
    if (!a.length) return <span className="text-[#C2C8D6]">—</span>;
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); openRefPreview(a.map((x) => ({ url: x.url, title: x.name, from: f.label }))); }}
        className="inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline">
        <IconPaperclip size={14} stroke={1.8} /> {a.length === 1 ? "1 file" : `${a.length} files`}
      </button>
    );
  }
  return <span className="text-[#4A5468] line-clamp-2">{v ? String(v) : <span className="text-[#C2C8D6]">—</span>}</span>;
}

function Table({ tab, rows, all, onOpen }: { tab: MTab; rows: Row[]; all: Row[]; onOpen: (r: Row) => void }) {
  const title = tab.fields.find((f) => f.key === "title")!;
  // A column nobody has filled in (Subscriptions' Amount, for now) only adds dashes.
  const filled = (f: MField) => all.some((r) => { const v = r[f.key]; return Array.isArray(v) ? v.length > 0 : v != null && v !== "" && v !== false; });
  const cols = tab.fields.filter((f) => f.col && filled(f));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[#8A92A6]">
            <th className="font-medium px-4 py-2.5">{title.label}</th>
            {cols.map((f) => <th key={f.key} className={`font-medium px-3 py-2.5 ${f.type === "money" ? "text-right" : ""}`}>{f.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onOpen(r)} className="border-t border-gray-100 hover:bg-[#F7F8FC] cursor-pointer align-middle">
              <td className="px-4 py-2.5 font-medium text-[#232D42] min-w-[180px]">{String(r.title || "") || <span className="text-[#C2C8D6]">Untitled</span>}</td>
              {cols.map((f) => <td key={f.key} className={`px-3 py-2.5 ${f.type === "money" ? "text-right" : ""}`}><Cell f={f} v={r[f.key]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Thumb({ file }: { file?: MFile }) {
  if (!file) return <div className="h-full grid place-items-center text-[#C2C8D6]"><IconPhoto size={26} stroke={1.5} /></div>;
  if (isImage(file)) return <div className="h-full bg-cover bg-center" style={{ backgroundImage: `url(${file.url})` }} />;
  if (isPdf(file.url, file.mime)) return <PdfThumb url={file.url} width={240} fallback={<div className="h-full grid place-items-center text-[#8A92A6]"><IconFileText size={26} stroke={1.5} /></div>} />;
  return <div className="h-full grid place-items-center text-[#8A92A6] text-[11px] uppercase gap-1"><IconFileText size={26} stroke={1.5} />{file.name.split(".").pop()}</div>;
}

function Grid({ tab, rows, onOpen }: { tab: MTab; rows: Row[]; onOpen: (r: Row) => void }) {
  const chips = tab.fields.filter((f) => f.col && f.type === "select");
  return (
    <div className="p-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
      {rows.map((r) => {
        const fs = filesOf(r);
        return (
          <button key={r.id} type="button" onClick={() => onOpen(r)} className="text-left border border-gray-100 rounded-xl overflow-hidden bg-white hover:border-brand transition">
            <div className="relative h-[150px] bg-[#F0F2F8] overflow-hidden">
              <Thumb file={fs[0]} />
              {fs.length > 1 && <span className="absolute top-2 right-2 text-[11px] bg-[rgba(35,45,66,.6)] text-white rounded-md px-1.5">{fs.length} files</span>}
              {r.non_usable === true && <span className="absolute top-2 left-2 text-[11px] bg-[#FDECEC] text-[#C03221] rounded-md px-1.5">Not usable</span>}
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[13px] font-medium text-[#232D42] truncate">{String(r.title || "") || fs[0]?.name || "Untitled"}</div>
              {(chips.some((f) => r[f.key]) || r.design_files === true) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {chips.map((f) => (r[f.key] ? <Chip key={f.key} tone={f.key === "education_level" ? "muted" : "brand"}>{String(r[f.key])}</Chip> : null))}
                  {r.design_files === true && <Chip tone="muted">Design files</Chip>}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// The side window: every field of the tab, saved together.
function Editor({ tab, row, optionsFor, onClose, onSaved, onRemoved }: {
  tab: MTab; row: Row | null; optionsFor: (f: MField) => string[];
  onClose: () => void; onSaved: (r: Row) => void; onRemoved: (r: Row) => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const d: Record<string, unknown> = {};
    for (const f of tab.fields) d[f.key] = row ? row[f.key] : f.type === "multi" || f.type === "files" ? [] : f.type === "bool" ? false : "";
    return d;
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = !row || tab.fields.some((f) => JSON.stringify(draft[f.key] ?? null) !== JSON.stringify(row[f.key] ?? (f.type === "multi" || f.type === "files" ? [] : null)));

  const close = async () => {
    if (dirty && row && !(await confirmDialog({ title: "Discard your changes?", body: "They haven't been saved.", action: "Discard", danger: true }))) return;
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[data-overlay]")) void close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const save = async () => {
    if (!String(draft.title || "").trim()) { setErr("Give it a name first."); return; }
    setSaving(true); setErr(null);
    const r = await fetch(`/api/materials/${tab.key}`, {
      method: row ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row ? { id: row.id, values: draft } : { values: draft }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setSaving(false);
    if (!r || !r.ok) { setErr((j as { error?: string }).error || "Couldn't save — try again."); return; }
    onSaved((j as { row: Row }).row);
  };
  const remove = async () => {
    if (!row) return;
    if (!(await confirmDialog({ title: `Remove this ${tab.noun}?`, body: `"${String(row.title || "")}" is taken off the list. You can undo it straight after.`, action: "Remove", danger: true }))) return;
    const r = await fetch(`/api/materials/${tab.key}?id=${row.id}`, { method: "DELETE" }).catch(() => null);
    if (!r || !r.ok) { setErr("Couldn't remove it — try again."); return; }
    onRemoved(row);
  };
  const addFiles = async (picked: FileList | File[], key: string) => {
    const list = Array.from(picked);
    setUploading((n) => n + list.length);
    for (const f of list) {
      const res = await uploadMaterialFile(tab.key, f);
      setUploading((n) => n - 1);
      if (!res.ok) { setErr(`${f.name}: ${res.error}`); continue; }
      setDraft((d) => ({ ...d, [key]: [...((d[key] as MFile[]) || []), res.file] }));
    }
  };

  const input = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-[13px] text-[#232D42] outline-none focus:border-brand";
  const field = (f: MField) => {
    const v = draft[f.key];
    if (f.type === "files") {
      const files = (v as MFile[]) || [];
      return (
        <FilesCard title={f.label} count={`${files.length} file${files.length === 1 ? "" : "s"}`} drop={tab.grid}
          accept="image/*,video/*,.pdf,.docx,.xlsx,.pptx,.csv" onFiles={(fl) => void addFiles(fl, f.key)}
          busyText={uploading ? `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…` : undefined}
          tiles={files.map((x, i): FileTile => ({ key: `${x.url}-${i}`, name: x.name, url: x.url, kind: fileKind(x),
            onRemove: () => set(f.key, files.filter((_, j) => j !== i)) }))} />
      );
    }
    if (f.type === "longtext") return <textarea value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} rows={f.key === "minutes" ? 14 : 4} className={`${input} h-auto py-2 leading-relaxed resize-y`} />;
    if (f.type === "bool") return (
      <button type="button" role="switch" aria-checked={!!v} onClick={() => set(f.key, !v)} className={`relative w-10 h-6 rounded-full transition ${v ? "bg-brand" : "bg-gray-200"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${v ? "left-[18px]" : "left-0.5"}`} />
      </button>
    );
    if (f.type === "select") return (
      <PreviewSelect value={String(v ?? "")} onChange={(x) => set(f.key, x)} placeholder={`Choose ${f.label.toLowerCase()}…`}
        className="w-full font-normal [&>span]:flex-1 [&>span]:text-left"
        options={[...(v ? [{ value: "", label: "Clear" }] : []), ...optionsFor(f).map((o) => ({ value: o, label: o }))]}
        addOption={{ label: `Add a ${f.label.toLowerCase()}`, onAdd: (x) => set(f.key, x.trim()) }} />
    );
    if (f.type === "multi") {
      const sel = (v as string[]) || [];
      const opts = [...new Set([...optionsFor(f), ...sel])];
      return (
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => {
            const on = sel.includes(o);
            return <button key={o} type="button" onClick={() => set(f.key, on ? sel.filter((x) => x !== o) : [...sel, o])}
              className={`px-2.5 py-1 rounded-full text-[12px] font-medium border transition ${on ? "bg-brand-light border-brand text-[#2138B0]" : "bg-white border-gray-200 text-[#4A5468] hover:border-brand"}`}>{o}</button>;
          })}
          <AddChip onAdd={(x) => { if (!sel.includes(x)) set(f.key, [...sel, x]); }} />
        </div>
      );
    }
    return <input type={f.type === "date" ? "date" : f.type === "money" ? "number" : "text"} step={f.type === "money" ? "0.01" : undefined}
      value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} className={input} inputMode={f.type === "money" ? "decimal" : undefined} />;
  };

  const Icon = ICONS[tab.key];
  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black/30 flex justify-end" onClick={() => void close()}>
      <div className="preview-scope h-full w-full bg-[#F6F7FB] flex flex-col border-l border-gray-100" style={{ maxWidth: 560, margin: 0 }} onClick={(e) => e.stopPropagation()} data-ref-dock>
        <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100">
          <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center"><Icon size={16} stroke={1.8} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-[#8A92A6]">{tab.label}</div>
            <div className="text-[15px] font-medium text-[#232D42] truncate">{row ? String(row.title || "Untitled") : `New ${tab.noun}`}</div>
          </div>
          {/* Save sits up here: the team's Comment button covers the bottom-right corner. */}
          <button onClick={() => void save()} disabled={saving || uploading > 0 || !dirty} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium hover:bg-[#2138B0] disabled:opacity-50">
            {saving ? "Saving…" : row ? "Save changes" : `Add ${tab.noun}`}
          </button>
          <button onClick={() => void close()} aria-label="Close" className="w-9 h-9 rounded-lg border border-gray-200 grid place-items-center text-[#4A5468] hover:border-brand hover:text-brand"><IconX size={15} /></button>
        </div>
        {err && <div className="px-5 py-2 bg-[#FDECEC] text-[12.5px] text-[#C03221]">{err}</div>}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4">
            {tab.fields.filter((f) => f.type !== "files").map((f) => (
              <label key={f.key} className="block" onClick={(e) => { if (f.type === "bool" || f.type === "multi" || f.type === "select") e.preventDefault(); }}>
                <div className="text-[12px] text-[#8A92A6] mb-1.5">{f.label}{f.key === "title" && <span className="text-[#C03221]"> *</span>}</div>
                {field(f)}
                {f.key === "card_last4" && <div className="text-[11.5px] text-[#8A92A6] mt-1">Only the last 4 digits are kept — never the full card number.</div>}
              </label>
            ))}
          </div>
          {tab.fields.filter((f) => f.type === "files").map((f) => <div key={f.key}>{field(f)}</div>)}
          {row && (
            <div className="flex items-center gap-3 px-1 pb-14">
              <span className="text-[11.5px] text-[#8A92A6]">{row.created_by === "airtable" ? "Copied from Airtable" : "Added in the dashboard"} · last changed {fmtDate(String(row.updated_at || ""))}</span>
              <button onClick={() => void remove()} className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#F3C6CE] text-[#C03221] text-[12.5px] font-medium hover:bg-[#FDECEC]"><IconTrash size={14} stroke={1.8} /> Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AddChip({ onAdd }: { onAdd: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="px-2.5 py-1 rounded-full text-[12px] font-medium border border-dashed border-gray-300 text-brand hover:border-brand">+ Add</button>;
  const done = () => { if (v.trim()) onAdd(v.trim()); setV(""); setOpen(false); };
  return <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
    className="h-7 w-[140px] px-2.5 rounded-full border border-brand text-[12px] outline-none" placeholder="Type and press Enter" />;
}
