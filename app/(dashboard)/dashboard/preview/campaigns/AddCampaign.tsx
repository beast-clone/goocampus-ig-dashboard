"use client";
import { useEffect, useState } from "react";
import { IconTable, IconX, IconAlertTriangle, IconCheck, IconPlus } from "@tabler/icons-react";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";

type Tab = { title: string; rows: number; columns: number };
type Dup = { value: string; count: number };

// What the dashboard shows and writes, and the shape of a guess at which sheet
// column is which. Guessed once, then shown — so a wrong guess is corrected here
// rather than discovered later by someone typing into the wrong column.
const FIELDS = [
  { key: "captured", label: "Captured", hint: "when the lead came in", re: /capture|created|timestamp|date|time/i },
  { key: "name", label: "Name", hint: "shown in the list", re: /^first\s*name$|name/i },
  { key: "phone", label: "Phone", hint: "used by the WhatsApp button", re: /phone|mobile|contact|whats/i },
  { key: "status", label: "Status", hint: "the dropdown writes here", re: /status|attendance|confirm/i },
  { key: "notes", label: "Notes", hint: "typed in the row, saved here", re: /note|remark|comment/i },
  { key: "community", label: "Community", hint: "the invite-sent tick", re: /communit|invite/i },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

// Paste a sheet link → pick the tab → pick the column that identifies a row.
//
// Three steps rather than one form, because each answer comes from the sheet and
// can only be asked once the previous one is known: the tabs come from the link,
// the columns come from the tab. Nothing is stored until Save.
export function AddCampaign({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The sheets already shared with the dashboard. A list beats hunting for a URL,
  // but it can only ever show what has been shared with the service account —
  // which is why pasting a link stays right below it.
  const [mine, setMine] = useState<{ id: string; name: string; canEdit: boolean }[]>([]);
  const [mineNote, setMineNote] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/campaigns/sheets", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { setMine(d.sheets || []); if (d.error) setMineNote(d.error); })
      .catch(() => setMineNote("Couldn't reach Google to list your sheets — paste a link instead."));
  }, []);

  const [sheet, setSheet] = useState<{ spreadsheetId: string; title: string; tabs: Tab[] } | null>(null);
  const [tab, setTab] = useState("");
  const [cols, setCols] = useState<{ headers: string[]; rowCount: number; sample: Record<string, string>[] } | null>(null);
  const [keyColumn, setKeyColumn] = useState("");
  const [dups, setDups] = useState<Dup[]>([]);
  const [name, setName] = useState("");
  const [map, setMap] = useState<Partial<Record<FieldKey, string>>>({});
  const [newCol, setNewCol] = useState("");
  const [addingCol, setAddingCol] = useState(false);

  const post = async (body: unknown) => {
    const r = await fetch("/api/campaigns/sheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body: JSON.stringify(body),
    });
    return r.json();
  };

  const openSheet = async (explicit?: string) => {
    const target = explicit || url;
    setBusy(true); setError(null); setSheet(null); setCols(null); setTab("");
    try {
      const d = await post({ url: target });
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
      setMap(guessMap(d.headers as string[]));
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

  // A column that doesn't exist yet, created in the sheet from here.
  const addColumn = async () => {
    const n = newCol.trim();
    if (!n) return;
    setAddingCol(true); setError(null);
    try {
      const d = await post({ url: sheet?.spreadsheetId || url, tab, addColumn: n });
      if (d.error) { setError(d.error); return; }
      setCols(d);
      setMap((m) => ({ ...m, ...autoAssign(n, m) }));
      setNewCol("");
    } finally { setAddingCol(false); }
  };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({
          name, spreadsheetId: sheet?.spreadsheetId, tab, keyColumn,
          // Display columns travel in columnMap; the three writable ones have
          // their own fields because the API validates and uses them directly.
          columnMap: { captured: map.captured || "", name: map.name || "", phone: map.phone || "" },
          statusColumn: map.status || null,
          notesColumn: map.notes || null,
          communityColumn: map.community || null,
        }),
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
          {/* 1 — pick one the dashboard can already see… */}
          <label className="block">
            <span className="block text-[11px] font-medium text-[#8A92A6] mb-1.5">
              Pick a sheet {mine.length > 0 && <span className="font-normal">— {mine.length} shared with the dashboard</span>}
            </span>
            <PreviewSelect
              className="w-full justify-between"
              value=""
              onChange={(id) => { setUrl(id); openSheet(id); }}
              placeholder={mine.length ? "Choose a sheet…" : "No sheets to choose from"}
              disabled={mine.length === 0}
              options={mine.map((m) => ({ value: m.id, label: m.canEdit ? m.name : `${m.name} (read-only)` }))}
            />
            {mineNote && <span className="block mt-1.5 text-[11px] leading-snug text-[#A6ACBE]">{mineNote}</span>}
          </label>

          {/* …or paste its link */}
          <label className="block">
            <span className="block text-[11px] font-medium text-[#8A92A6] mb-1.5">Or paste the Google Sheet link</span>
            <div className="flex gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) openSheet(); }}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[13px] text-[#232D42] placeholder:text-[#C9CDD8]" />
              <button onClick={() => openSheet()} disabled={busy || !url.trim()}
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
                {/* Just the names. Google reports a tab's GRID size here — 999, 1102 —
                    which is how many rows the sheet has room for, not how many leads
                    are in it. Showing that next to a tab called "Meta Ads" reads as a
                    lead count and is wrong by a factor of six. The real count appears
                    once a tab is chosen, from the rows themselves. */}
                <PreviewSelect value={tab} onChange={(t) => pickTab(t)} placeholder="Choose a tab…"
                  options={sheet.tabs.map((t) => ({ value: t.title, label: t.title }))} />
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

              {/* Map every column here, at setup. The alternative was setting Status,
                  Notes and Community one at a time from inside the lead table, which
                  is both hidden and too late. */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-3.5 py-2.5 bg-brand-light border-b border-gray-100">
                  <div className="text-[12.5px] font-medium text-[#232D42]">Map the columns</div>
                  <div className="text-[11.5px] text-[#4A5468] mt-0.5">
                    Filled in from your headers. Change anything that looks wrong — Status, Notes and
                    Community are the three the dashboard writes to.
                  </div>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="flex items-center gap-2.5">
                      <span className="w-[86px] shrink-0 text-[11.5px] text-[#4A5468]">{f.label}</span>
                      <span className="flex-1 min-w-0">
                        <PreviewSelect className="w-full justify-between" value={map[f.key] || ""}
                          onChange={(v) => setMap((m) => ({ ...m, [f.key]: v }))}
                          placeholder="Not mapped"
                          options={[{ value: "", label: "Not mapped" }, ...cols.headers.map((h) => ({ value: h, label: h }))]} />
                      </span>
                      <span className="w-[150px] shrink-0 text-[11px] text-[#A6ACBE] truncate">{f.hint}</span>
                    </div>
                  ))}
                </div>
                <div className="px-3 pb-3 flex items-center gap-2">
                  <input value={newCol} onChange={(e) => setNewCol(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newCol.trim()) { e.preventDefault(); addColumn(); } }}
                    placeholder="Missing one? Name it — e.g. Notes"
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[12px] text-[#232D42] placeholder:text-[#C9CDD8]" />
                  <button onClick={addColumn} disabled={!newCol.trim() || addingCol}
                    className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-brand disabled:opacity-40">
                    <IconPlus size={13} stroke={2} /> {addingCol ? "Adding…" : "Add to the sheet"}
                  </button>
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

/** First header matching each field's pattern. A starting point, not a decision. */
function guessMap(headers: string[]): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  const taken = new Set<string>();
  for (const f of FIELDS) {
    const hit = headers.find((h) => f.re.test(h) && !taken.has(h));
    if (hit) { out[f.key] = hit; taken.add(hit); }
  }
  return out;
}

/** A freshly added column slots into the first field its name fits and nothing holds. */
function autoAssign(header: string, current: Partial<Record<FieldKey, string>>) {
  const f = FIELDS.find((f) => f.re.test(header) && !current[f.key]);
  return f ? { [f.key]: header } : {};
}
