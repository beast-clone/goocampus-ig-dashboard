"use client";
import { useState } from "react";
import { IconTable, IconX, IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";

type Tab = { title: string; rows: number; columns: number };
type Dup = { value: string; count: number };

// Paste a sheet link → pick the tab → pick the column that identifies a row.
//
// Three steps rather than one form, because each answer comes from the sheet and
// can only be asked once the previous one is known: the tabs come from the link,
// the columns come from the tab. Nothing is stored until Save.
export function AddCampaign({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sheet, setSheet] = useState<{ spreadsheetId: string; title: string; tabs: Tab[] } | null>(null);
  const [tab, setTab] = useState("");
  const [cols, setCols] = useState<{ headers: string[]; rowCount: number; sample: Record<string, string>[] } | null>(null);
  const [keyColumn, setKeyColumn] = useState("");
  const [dups, setDups] = useState<Dup[]>([]);
  const [name, setName] = useState("");

  const post = async (body: unknown) => {
    const r = await fetch("/api/campaigns/sheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body: JSON.stringify(body),
    });
    return r.json();
  };

  const openSheet = async () => {
    setBusy(true); setError(null); setSheet(null); setCols(null); setTab("");
    try {
      const d = await post({ url });
      if (d.error) { setError(d.error); return; }
      setSheet(d);
      setName((n) => n || d.title);
      if (d.tabs?.length === 1) pickTab(d.tabs[0].title, d.spreadsheetId);
    } finally { setBusy(false); }
  };

  const pickTab = async (t: string, sid?: string) => {
    setTab(t); setBusy(true); setError(null); setCols(null); setKeyColumn(""); setDups([]);
    try {
      const d = await post({ url: sid || sheet?.spreadsheetId || url, tab: t });
      if (d.error) { setError(d.error); return; }
      setCols(d);
      // A column called id / registration / phone is the usual answer, so offer it.
      const guess = (d.headers as string[]).find((h) => /(^|\b)(id|reg|registration|phone|mobile|contact)\b/i.test(h));
      if (guess) checkKey(guess, t, sid);
    } finally { setBusy(false); }
  };

  const checkKey = async (col: string, t?: string, sid?: string) => {
    setKeyColumn(col); setBusy(true); setDups([]);
    try {
      const d = await post({ url: sid || sheet?.spreadsheetId || url, tab: t || tab, keyColumn: col });
      if (!d.error) setDups(d.duplicates || []);
    } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ name, spreadsheetId: sheet?.spreadsheetId, tab, keyColumn, columnMap: {} }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || "Couldn't save"); return; }
      onSaved();
    } finally { setBusy(false); }
  };

  const canSave = Boolean(sheet && tab && keyColumn && name.trim() && dups.length === 0);

  return (
    <Overlay onClose={onClose} className="fixed inset-0 z-[300] bg-black/40 flex items-start justify-center p-4 pt-[8vh] overflow-auto">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
          <span className="w-7 h-7 rounded-lg bg-brand-light text-brand grid place-items-center shrink-0"><IconTable size={15} stroke={1.8} /></span>
          <h3 className="text-[14px] font-medium text-[#232D42]">Add a campaign</h3>
          <button onClick={onClose} aria-label="Close" className="ml-auto text-[#A6ACBE] hover:text-[#232D42] rounded-lg p-1 hover:bg-[#F6F7FB]"><IconX size={16} stroke={2} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* 1 — the link */}
          <label className="block">
            <span className="block text-[11px] font-medium text-[#8A92A6] mb-1.5">Paste the Google Sheet link</span>
            <div className="flex gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) openSheet(); }}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[13px] text-[#232D42] placeholder:text-[#C9CDD8]" />
              <button onClick={openSheet} disabled={busy || !url.trim()}
                className="text-[13px] font-medium bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50 shrink-0">
                {busy && !sheet ? "Opening…" : "Open"}
              </button>
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-[#FDECEA] border border-[#F5C6C0] px-3 py-2.5">
              <IconAlertTriangle size={15} stroke={1.9} className="text-[#C0392B] shrink-0 mt-[1px]" />
              <span className="text-[12.5px] leading-snug text-[#C0392B] break-words">{error}</span>
            </div>
          )}

          {/* 2 — the tab */}
          {sheet && (
            <>
              <div className="flex items-center gap-2 text-[12.5px] text-[#2F9E6F] bg-[#E8F6F0] rounded-lg px-3 py-2">
                <IconCheck size={14} stroke={2.2} /> Opened <b className="font-medium">{sheet.title}</b> · {sheet.tabs.length} tab{sheet.tabs.length === 1 ? "" : "s"}
              </div>

              <label className="block">
                <span className="block text-[11px] font-medium text-[#8A92A6] mb-1.5">Which tab holds the leads</span>
                <PreviewSelect value={tab} onChange={(t) => pickTab(t)} placeholder="Choose a tab…"
                  options={sheet.tabs.map((t) => ({ value: t.title, label: `${t.title} — ${t.rows} rows` }))} />
              </label>
            </>
          )}

          {/* 3 — the key column */}
          {cols && (
            <>
              <label className="block">
                <span className="block text-[11px] font-medium text-[#8A92A6] mb-1.5">
                  Which column identifies a row <span className="font-normal">— updates are written back by matching on it</span>
                </span>
                <PreviewSelect value={keyColumn} onChange={(c) => checkKey(c)} placeholder="Choose a column…"
                  options={cols.headers.map((h) => ({ value: h, label: h }))} />
              </label>

              {dups.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-[#FDF6E7] border border-[#F0DFB8] px-3 py-2.5">
                  <IconAlertTriangle size={15} stroke={1.9} className="text-[#B7791F] shrink-0 mt-[1px]" />
                  <span className="text-[12px] leading-snug text-[#7A5410]">
                    <b>{keyColumn}</b> repeats in the sheet — {dups.slice(0, 3).map((d) => `“${d.value}” ×${d.count}`).join(", ")}
                    {dups.length > 3 ? `, and ${dups.length - 3} more` : ""}. A repeated value means an update could land on the
                    wrong person, so pick a different column or fix the sheet first.
                  </span>
                </div>
              )}

              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <div className="px-3 py-2 bg-[#FCFCFE] border-b border-gray-100 text-[11.5px] text-[#8A92A6]">
                  {cols.rowCount} lead{cols.rowCount === 1 ? "" : "s"} · {cols.headers.length} columns · first row
                </div>
                <div className="px-3 py-2 text-[11.5px] text-[#4A5468] break-words">
                  {cols.sample[0]
                    ? cols.headers.slice(0, 6).map((h) => `${h}: ${cols.sample[0][h] || "—"}`).join("  ·  ")
                    : "No rows in this tab yet."}
                </div>
              </div>

              <label className="block">
                <span className="block text-[11px] font-medium text-[#8A92A6] mb-1.5">Call this campaign</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[13px] text-[#232D42]" />
              </label>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-gray-100">
          <button onClick={save} disabled={!canSave || busy}
            className="text-[13px] font-medium bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-40">
            {busy ? "Working…" : "Save campaign"}
          </button>
          <button onClick={onClose} className="text-[13px] text-[#8A92A6] hover:text-[#232D42] px-2">Cancel</button>
          <span className="ml-auto text-[11px] text-[#A6ACBE]">Nothing is copied — the leads stay in your sheet.</span>
        </div>
      </div>
    </Overlay>
  );
}
