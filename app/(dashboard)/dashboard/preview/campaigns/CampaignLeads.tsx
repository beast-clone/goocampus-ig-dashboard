"use client";
import { useCallback, useEffect, useState } from "react";
import { IconArrowLeft, IconRefresh, IconAlertTriangle, IconExternalLink, IconUserPlus, IconPlus, IconCheck, IconSearch, IconGripVertical, IconX } from "@tabler/icons-react";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { LoadingBlock } from "@/components/LoadingBlock";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";
import { WhatsAppSend } from "@/components/WhatsAppSend";
import { type ColumnPrefs } from "./ColumnChooser";

type Col = { key: string; label: string; width: number; cell: (l: Lead) => React.ReactNode };

type Lead = { rowKey: string; sheetRow: number; fields: Record<string, string> };
type Writable = { status: string | null; notes: string | null; community: string | null; communityValue: string; options: string[] };
type Data = {
  campaign: { id: string; name: string; spreadsheetId: string; tab: string; keyColumn: string; columnMap?: Record<string, string>; statusColumn?: string | null; notesColumn?: string | null; links?: { name: string; url: string }[]; hiddenStatuses?: string[]; communityColumn?: string | null; columnPrefs?: ColumnPrefs | null };
  headers: string[];
  leads: Lead[];
  writable: Writable;
  error?: string;
};

// Best guess at which column holds what, so a sheet works without being told.
// Only used for display — nothing is written based on a guess.
const pick = (headers: string[], re: RegExp) => headers.find((h) => re.test(h)) || null;

// Meta writes phone numbers into the sheet as "p:+919848660520" — the "p:" is
// Meta's field marker, not part of the number. Stripped for display only; the
// sheet keeps whatever it holds, and WhatsApp works off the digits regardless.
const tidyPhone = (raw: string) => (raw || "").replace(/^\s*p\s*:\s*/i, "").trim();

export function CampaignLeads({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState<string | null>(null);
  // Which field's column is being chosen, if any. Opened from the settings row at
  // the top OR from the cell itself — a person who wants to type a note looks at
  // the note, not at a settings bar two hundred rows above it.
  const [picking, setPicking] = useState<"status" | "notes" | "community" | null>(null);
  // Filters. Sorting 173 event leads by hand to find the ones worth calling is the
  // job this tab exists to remove.
  const [q, setQ] = useState("");
  const [filterCol, setFilterCol] = useState("");
  const [filterVal, setFilterVal] = useState("");
  // Opens on the leads nobody has touched yet. A caller coming back the next day
  // should not have to scroll past 150 finished rows to find the next call.
  const [todoOnly, setTodoOnly] = useState(true);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setData(null);
    fetch(`/api/campaigns/leads?id=${encodeURIComponent(id)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { setData(d); setSyncedAt(Date.now()); })
      .catch(() => setData({ campaign: { id, name: "", spreadsheetId: "", tab: "", keyColumn: "" }, headers: [], leads: [], writable: { status: null, notes: null, community: null, communityValue: "", options: [] }, error: "Couldn't reach the sheet." }));
  }, [id]);
  useEffect(load, [load]);

  // Re-read the sheet every two minutes so someone editing the spreadsheet
  // directly shows up here without anyone pressing anything. Writes already go
  // straight out, so this is only the inbound half.
  //
  // Paused while the tab is in the background: a list nobody is looking at does
  // not need polling, and it would burn the Sheets quota all afternoon.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 120_000);
    return () => clearInterval(id);
  }, [load]);

  if (!data) return <Shell onBack={onBack}><LoadingBlock label="Reading the sheet…" /></Shell>;

  if (data.error) {
    return (
      <Shell onBack={onBack}>
        <div className="flex items-start gap-2.5 px-5 py-4">
          <IconAlertTriangle size={16} stroke={1.9} className="text-[#C0392B] shrink-0 mt-[1px]" />
          <span className="text-[13px] text-[#C0392B]">{data.error}</span>
        </div>
      </Shell>
    );
  }

  const { campaign, headers, leads, writable } = data;
  // Fixed column order, whatever the sheet calls things: id, when it came in,
  // who it is, how to reach them, then the two editable fields. Used for DISPLAY
  // only — nothing is written on the strength of a guessed column.
  // Mapped at setup wins; the guess is only a fallback for campaigns made before
  // the mapping step existed.
  const mapped = (campaign.columnMap || {}) as Record<string, string>;
  const firstName = pick(headers, /^first\s*name$/i);
  const lastName = pick(headers, /^last\s*name$/i);
  const nameCol = (mapped.name && headers.includes(mapped.name) ? mapped.name : null) || firstName || pick(headers, /name/i);
  const phoneCol = (mapped.phone && headers.includes(mapped.phone) ? mapped.phone : null) || pick(headers, /phone|mobile|contact|whats/i);
  const timeCol = (mapped.captured && headers.includes(mapped.captured) ? mapped.captured : null) || pick(headers, /capture|created|timestamp|date|time/i);
  const fullName = (l: Lead) => {
    const a = (nameCol && l.fields[nameCol]) || (firstName && l.fields[firstName]) || "";
    const b = (lastName && l.fields[lastName]) || "";
    return [a, b].filter(Boolean).join(" ").trim() || "—";
  };

  // Which column the dropdown edits is a setting on the campaign, saved so it
  // holds next time. Nothing in the sheet is touched by choosing it.
  const setColumn = async (which: "statusColumn" | "notesColumn" | "communityColumn", column: string) => {
    if (!data) return;
    setFailed(null);
    const r = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ ...data.campaign, [which]: column || null }),
    });
    const d = await r.json();
    if (!r.ok || d.error) { setFailed(d.error || "Couldn't save that choice"); return; }
    setPicking(null);
    load();
  };

  // Make a brand-new column in the sheet and point the field at it. Needed
  // because a sheet filled in at an event has no Notes column, and the only
  // columns on offer are ones already holding someone's answers.
  const createColumn = async (use: "status" | "notes" | "community", name: string) => {
    setFailed(null);
    const r = await fetch("/api/campaigns/column", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ id, use, name }),
    });
    const d = await r.json();
    if (!r.ok || d.error) { setFailed(d.error || "Couldn't add that column"); return; }
    setPicking(null);
    load();
  };

  // A named link (the community invite, a brochure) saved on the campaign so it
  // is offered on every lead. Nothing sends by itself — it only pre-fills.
  const addLink = async (link: { name: string; url: string }) => {
    if (!data) return;
    setFailed(null);
    const links = [...(data.campaign.links || []).filter((l) => l.name !== link.name), link];
    const r = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ ...data.campaign, links }),
    });
    const d = await r.json();
    if (!r.ok || d.error) { setFailed(d.error || "Couldn't save that link"); return; }
    setData((prev) => prev && ({ ...prev, campaign: { ...prev.campaign, links } }));
  };

  // Take a value out of the dropdown. The sheet is not touched — a row that still
  // holds "cofirmed" keeps it until someone changes that row. Hiding a choice and
  // rewriting 172 cells are different things, and only one of them is reversible.
  const hideStatus = async (value: string) => {
    if (!data) return;
    setFailed(null);
    const hiddenStatuses = [...new Set([...(data.campaign.hiddenStatuses || []), value])];
    const r = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ ...data.campaign, hiddenStatuses }),
    });
    const d = await r.json();
    if (!r.ok || d.error) { setFailed(d.error || "Couldn't hide that status"); return; }
    setData((prev) => prev && ({
      ...prev,
      campaign: { ...prev.campaign, hiddenStatuses },
      writable: { ...prev.writable, options: prev.writable.options.filter((o) => o !== value) },
    }));
  };

  const removeLink = async (name: string) => {
    if (!data) return;
    const links = (data.campaign.links || []).filter((l) => l.name !== name);
    setData((prev) => prev && ({ ...prev, campaign: { ...prev.campaign, links } }));
    await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ ...data.campaign, links }),
    });
  };

  const restoreStatuses = async () => {
    if (!data) return;
    await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ ...data.campaign, hiddenStatuses: [] }),
    });
    load();
  };

  // Send the ticked leads to the Sales Hub CRM. One or a hundred — same path,
  // because doing a hundred one at a time is how people give up on a tool.
  const sendToCrm = async () => {
    if (picked.size === 0) return;
    setPushing(true); setFailed(null); setPushed(null);
    try {
      const r = await fetch("/api/campaigns/crm", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ id, rowKeys: [...picked] }),
      });
      const d = await r.json();
      if (d.error) { setFailed(d.error); return; }
      const bits = [`${d.created} sent to the CRM`];
      if (d.skipped?.length) bits.push(`${d.skipped.length} skipped (no phone number)`);
      if (d.failed?.length) bits.push(`${d.failed.length} failed: ${d.failed[0]}`);
      setPushed(bits.join(" · "));
      setPicked(new Set());
    } catch {
      setFailed("Couldn't reach the CRM — nothing was sent.");
    } finally { setPushing(false); }
  };

  const write = async (lead: Lead, column: string, value: string) => {
    setBusy(`${lead.rowKey}:${column}`); setFailed(null);
    try {
      const r = await fetch("/api/campaigns/leads", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ id: campaign.id, rowKey: lead.rowKey, column, value }),
      });
      const d = await r.json();
      if (d.error) { setFailed(d.error); return; }
      // Reflect it locally rather than re-reading the whole sheet for one cell.
      setData((prev) => prev && ({
        ...prev,
        leads: prev.leads.map((l) => l.rowKey === lead.rowKey ? { ...l, fields: { ...l.fields, [column]: value } } : l),
      }));
    } catch {
      setFailed("Couldn't reach the sheet — the change wasn't saved.");
    } finally { setBusy(null); }
  };

  // Two filters that between them cover what people actually ask: "show me the
  // ones that say X" and "find the person who said something about Y". The value
  // list is built from the column, so it can only offer what is really in there.
  const valuesIn = (col: string) => {
    const seen = new Map<string, number>();
    for (const l of leads) {
      const v = (l.fields[col] || "").trim();
      if (v) seen.set(v, (seen.get(v) || 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  };

  // Every other column in the sheet, carried through read-only. "What is your
  // domicile state?" is exactly the kind of answer someone needs mid-call, and it
  // was being dropped because it wasn't one of the six the dashboard writes to.
  const usedCols = new Set([campaign.keyColumn, nameCol, firstName, lastName, phoneCol, timeCol,
    writable.status, writable.notes, writable.community].filter(Boolean) as string[]);
  const allExtras = headers.filter((h) => !usedCols.has(h));
  const prefs: ColumnPrefs = campaign.columnPrefs || { order: [], hidden: [] };

  const saveColumnPrefs = async (next: ColumnPrefs) => {
    if (!data) return;
    setData((prev) => prev && ({ ...prev, campaign: { ...prev.campaign, columnPrefs: next } }));
    await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ ...data.campaign, columnPrefs: next }),
    });
  };

  const untouched = (l: Lead) => !writable.status || !(l.fields[writable.status] || "").trim();
  const todoCount = leads.filter(untouched).length;

  const needle = q.trim().toLowerCase();
  const shown = leads.filter((l) => {
    if (todoOnly && !untouched(l)) return false;
    if (filterCol && filterVal) {
      const v = (l.fields[filterCol] || "").trim();
      if (filterVal === "\u0000blank" ? v !== "" : v !== filterVal) return false;
    }
    if (!needle) return true;
    // Every column, not just the visible ones — "60 lakhs" lives in a note, and
    // the budget answer lives in a column this table never shows.
    return Object.values(l.fields).some((v) => (v || "").toLowerCase().includes(needle));
  });
  const shownKeys = shown.map((l) => l.rowKey).filter(Boolean);
  const allShownPicked = shownKeys.length > 0 && shownKeys.every((k) => picked.has(k));

  // Every column the table can show. Core ones keep a "#" key so a sheet header
  // called "Name" can never collide with ours.
  const baseCols: Col[] = [
    { key: "#leadid", label: "Lead ID", width: 86, cell: (l) => (
      // Only here so a row can be traced back to its line in the sheet. Truncated
      // for width; a write always matches on the whole value, never on these six.
      <span className="block text-[11px] text-[#C9CDD8] font-mono truncate" title={`Sheet ${campaign.keyColumn}: ${l.rowKey}`}>
        …{l.rowKey ? l.rowKey.slice(-6) : "—"}
      </span>
    ) },
    { key: "#captured", label: "Captured", width: 110, cell: (l) => (
      <span className="block text-[11.5px] text-[#8A92A6] truncate">{(timeCol && l.fields[timeCol]) || "—"}</span>
    ) },
    { key: "#name", label: "Name", width: 200, cell: (l) => (
      <span className="block text-[13px] font-medium text-[#232D42] truncate" title={fullName(l)}>{fullName(l)}</span>
    ) },
    { key: "#phone", label: "Phone", width: 150, cell: (l) => (
      <span className="block text-[12.5px] text-[#4A5468] tabular-nums truncate">
        {tidyPhone((phoneCol && l.fields[phoneCol]) || "") || <span className="text-[#C9CDD8]">no number</span>}
      </span>
    ) },
    { key: "#status", label: "Status", width: 190, cell: (l) => writable.status ? (
      // Fixed width so "ATC" and "Will not be attending" are the same size —
      // ragged boxes down a column read as broken.
      <PreviewSelect
        className="w-full justify-between overflow-hidden"
        value={l.fields[writable.status] || ""}
        onChange={(v) => write(l, writable.status!, v)}
        placeholder={busy === `${l.rowKey}:${writable.status}` ? "Saving…" : "Not contacted"}
        options={writable.options.map((op) => ({ value: op, label: op }))}
        addOption={{ label: "Add a status", onAdd: (v) => write(l, writable.status!, v) }}
        onRemoveOption={hideStatus}
      />
    ) : <PickPrompt onClick={() => setPicking("status")}>Choose a Status column</PickPrompt> },
    { key: "#notes", label: "Notes", width: 250, cell: (l) => writable.notes ? (
      <textarea
        defaultValue={l.fields[writable.notes] || ""}
        rows={1}
        placeholder="Add a note…"
        onBlur={(e) => { const v = e.target.value; if (v !== (l.fields[writable.notes!] || "")) write(l, writable.notes!, v); }}
        className="w-full resize-y px-2.5 py-1.5 rounded-lg bg-white text-[12.5px] leading-snug text-[#232D42] border border-gray-200 hover:border-gray-300 focus:border-brand focus:outline-none placeholder:text-[#C9CDD8]"
      />
    ) : <PickPrompt onClick={() => setPicking("notes")}>Choose a Notes column to type in</PickPrompt> },
    { key: "#community", label: "Community", width: 130, cell: (l) => writable.community ? (
      // A tick, because "did we send the invite" is a yes/no. It writes the word
      // this column already uses, so the sheet keeps reading the way whoever
      // filled it in expects.
      <label className="inline-flex items-center gap-2 cursor-pointer"
        title={l.fields[writable.community] ? `Sheet says “${l.fields[writable.community]}”` : "Not sent yet"}>
        <input type="checkbox"
          checked={Boolean((l.fields[writable.community] || "").trim())}
          disabled={busy === `${l.rowKey}:${writable.community}`}
          onChange={(e) => write(l, writable.community!, e.target.checked ? writable.communityValue : "")}
          className="w-[15px] h-[15px] accent-[#3A57E8] cursor-pointer disabled:opacity-40" />
        <span className="text-[11.5px] text-[#8A92A6] truncate">
          {busy === `${l.rowKey}:${writable.community}` ? "Saving…"
            : (l.fields[writable.community] || "").trim() || "Not sent"}
        </span>
      </label>
    ) : <PickPrompt onClick={() => setPicking("community")}>Choose a column</PickPrompt> },
    { key: "#whatsapp", label: "WhatsApp", width: 130, cell: (l) => (
      <WhatsAppSend phone={(phoneCol && l.fields[phoneCol]) || ""} name={fullName(l)} compact
        links={campaign.links || []} onAddLink={addLink} onRemoveLink={removeLink} />
    ) },
    // The sheet's own answers, read-only: they are not ours to edit.
    ...allExtras.map((h) => ({
      key: h, label: h, width: 170,
      cell: (l: Lead) => (
        <span className="block text-[12px] text-[#4A5468] truncate" title={l.fields[h] || ""}>
          {l.fields[h] || <span className="text-[#C9CDD8]">—</span>}
        </span>
      ),
    })),
  ];

  const allKeys = baseCols.map((c) => c.key);
  const orderedKeys = [...(prefs.order || []).filter((k) => allKeys.includes(k)),
    ...allKeys.filter((k) => !(prefs.order || []).includes(k))];
  const hiddenKeys = new Set(prefs.hidden || []);
  const cols = orderedKeys.filter((k) => !hiddenKeys.has(k)).map((k) => baseCols.find((c) => c.key === k)!);
  const hiddenCols = baseCols.filter((c) => hiddenKeys.has(c.key));

  // Dropping a column onto another puts it in that one's place. The saved order
  // keeps hidden columns in it, so unhiding one returns it where it was.
  const dropOn = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); setOverKey(null); return; }
    const next = orderedKeys.filter((k) => k !== dragKey);
    next.splice(next.indexOf(targetKey), 0, dragKey);
    setDragKey(null); setOverKey(null);
    saveColumnPrefs({ order: next, hidden: [...hiddenKeys] });
  };

  const hideColumn = (key: string) =>
    saveColumnPrefs({ order: orderedKeys, hidden: [...new Set([...hiddenKeys, key])] });
  const showColumn = (key: string) =>
    saveColumnPrefs({ order: orderedKeys, hidden: [...hiddenKeys].filter((k) => k !== key) });

  return (
    <Shell
      onBack={onBack}
      title={campaign.name}
      meta={
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#8A92A6]">
            {shown.length === leads.length
              ? <>{leads.length} lead{leads.length === 1 ? "" : "s"}</>
              : <><b className="font-medium text-[#4A5468]">{shown.length}</b> of {leads.length} leads</>}
            {" "}from the <b className="font-medium text-[#4A5468]">{campaign.tab}</b> tab
            {writable.status && <> · Status saves into <b className="font-medium text-[#4A5468]">{writable.status}</b></>}
            {syncedAt && <> · synced {new Date(syncedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
          </span>
          <a href={`https://docs.google.com/spreadsheets/d/${campaign.spreadsheetId}/edit`} target="_blank" rel="noopener noreferrer"
            className="text-[#A6ACBE] hover:text-brand" title="Open the sheet"><IconExternalLink size={15} stroke={1.8} /></a>
          <button onClick={load} title="Re-reads the sheet now. It also re-reads on its own every 2 minutes, so leads added to the sheet turn up here without anyone pressing this."
            className="inline-flex items-center gap-1.5 text-[12px] text-[#4A5468] border border-gray-200 rounded-lg px-2.5 py-1 hover:border-brand hover:text-brand">
            <IconRefresh size={13} stroke={1.8} /> Sync
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-2.5 flex-wrap px-5 py-2.5 border-b border-gray-100">
        <span className="relative">
          <IconSearch size={14} stroke={1.9} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A6ACBE]" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search every column — a name, a number, “60 lakhs”…"
            className="w-[300px] pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 focus:border-brand focus:outline-none text-[12.5px] text-[#232D42] placeholder:text-[#C9CDD8]" />
        </span>
        <PreviewSelect className="justify-between min-w-[170px]" value={filterCol}
          onChange={(v) => { setFilterCol(v); setFilterVal(""); }}
          placeholder="Filter by a column…"
          options={[{ value: "", label: "No column filter" }, ...headers.map((h) => ({ value: h, label: h }))]} />
        {filterCol && (
          <PreviewSelect className="justify-between min-w-[170px]" value={filterVal} onChange={setFilterVal}
            placeholder="Any value"
            options={[
              { value: "", label: "Any value" },
              { value: "\u0000blank", label: "(blank)" },
              ...valuesIn(filterCol).map(([v, n]) => ({ value: v, label: `${v} (${n})` })),
            ]} />
        )}
        {/* Not hidden: the counts are on the buttons, so it is obvious both that a
            subset is showing and how to see the rest. */}
        {writable.status && (
          <span className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setTodoOnly(true)}
              className={`px-2.5 py-1.5 text-[12px] ${todoOnly ? "bg-brand text-white" : "text-[#4A5468] hover:bg-[#F6F7FB]"}`}>
              Not contacted ({todoCount})
            </button>
            <button onClick={() => setTodoOnly(false)}
              className={`px-2.5 py-1.5 text-[12px] border-l border-gray-200 ${!todoOnly ? "bg-brand text-white" : "text-[#4A5468] hover:bg-[#F6F7FB]"}`}>
              All ({leads.length})
            </button>
          </span>
        )}
        {(q || filterVal) && (
          <button onClick={() => { setQ(""); setFilterCol(""); setFilterVal(""); }}
            className="text-[12px] text-[#8A92A6] hover:text-brand">Clear</button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap px-5 py-2.5 border-b border-gray-100">
        <span className="text-[12px] text-[#8A92A6]">
          {picked.size > 0 ? `${picked.size} selected` : "Tick leads to send them to the CRM"}
        </span>
        <button onClick={sendToCrm} disabled={picked.size === 0 || pushing}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium bg-brand text-white rounded-lg px-3 py-1.5 hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed">
          <IconUserPlus size={14} stroke={1.9} />
          {pushing ? "Sending…" : `Send to CRM${picked.size > 0 ? ` (${picked.size})` : ""}`}
        </button>
        {pushed && <span className="text-[12px] text-[#2F9E6F]">{pushed}</span>}
      </div>

      {failed && (
        <div className="mx-5 my-3 flex items-start gap-2 rounded-lg bg-[#FDECEA] border border-[#F5C6C0] px-3 py-2.5">
          <IconAlertTriangle size={15} stroke={1.9} className="text-[#C0392B] shrink-0 mt-[1px]" />
          <span className="text-[12.5px] text-[#C0392B]">{failed}</span>
        </div>
      )}

      {/* Which columns are editable is a choice, asked once. Guessing it from the
          data picked a yes/no survey question over the real status column, so it
          is not guessed at all. */}
      <div className="flex items-center gap-2.5 flex-wrap px-5 py-3 border-b border-gray-100 bg-[#FCFCFE]">
        <span className="text-[11.5px] text-[#8A92A6] whitespace-nowrap">Saves into this sheet&rsquo;s columns:</span>
        <SettingChip label="Status" column={writable.status} onClick={() => setPicking("status")} />
        <SettingChip label="Notes" column={writable.notes} onClick={() => setPicking("notes")} />
        <SettingChip label="Community" column={writable.community} onClick={() => setPicking("community")} />
        <span className="text-[11.5px] text-[#A6ACBE]">
          {writable.status
            ? `Status choices come from what's already in ${writable.status} — ${writable.options.length} of them.`
            : "Until a column is set, nothing can be written back."}
        </span>
        {/* Hiding a status with no way back would be a trap, so the way back lives
            here rather than nowhere. */}
        {hiddenCols.length > 0 && (
          <span className="flex items-center gap-1.5 flex-wrap text-[11.5px] text-[#A6ACBE]">
            Hidden:
            {hiddenCols.map((c) => (
              <button key={c.key} onClick={() => showColumn(c.key)} title="Show this column again"
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-200 px-1.5 py-0.5 text-[11px] text-[#8A92A6] hover:border-brand hover:text-brand">
                <IconPlus size={10} stroke={2.2} /> {c.label}
              </button>
            ))}
          </span>
        )}
        {(campaign.hiddenStatuses || []).length > 0 && (
          <button onClick={restoreStatuses} className="text-[11.5px] text-brand hover:text-brand-dark underline decoration-dotted">
            {campaign.hiddenStatuses!.length} hidden — show them again
          </button>
        )}
      </div>

      {picking && (
        <ColumnPicker
          what={picking}
          headers={headers}
          current={picking === "status" ? writable.status : picking === "notes" ? writable.notes : writable.community}
          onPick={(h) => setColumn(picking === "status" ? "statusColumn" : picking === "notes" ? "notesColumn" : "communityColumn", h)}
          onCreate={(name) => createColumn(picking, name)}
          onClose={() => setPicking(null)}
          error={failed}
        />
      )}

      {/* One descriptor per column, then ordered by the campaign's saved list.
          Rendering the cells from the same list is what makes drag-reordering
          possible at all — before this the header and the row were two hand-kept
          sequences that only agreed by luck. */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed" style={{ minWidth: 46 + cols.reduce((n, c) => n + c.width, 0) }}>
          <thead>
            <tr className="bg-[#FCFCFE] border-b border-gray-100">
              <th className="pl-5 pr-3 py-2.5 w-[46px]">
                {/* Selects what is on screen, not what is hidden behind a filter —
                    a tick that quietly picks 173 leads when 6 are showing is how
                    the wrong people end up in the CRM. */}
                <input type="checkbox" aria-label="Select all shown"
                  title={`Select the ${shownKeys.length} lead${shownKeys.length === 1 ? "" : "s"} showing`}
                  checked={allShownPicked}
                  onChange={(e) => setPicked(e.target.checked ? new Set(shownKeys) : new Set())}
                  className="w-[14px] h-[14px] accent-[#3A57E8] cursor-pointer" />
              </th>
              {cols.map((c, i) => (
                <th key={c.key} style={{ width: c.width }}
                  draggable
                  onDragStart={(e) => { setDragKey(c.key); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (dragKey && dragKey !== c.key) setOverKey(c.key); }}
                  onDragLeave={() => setOverKey((k) => (k === c.key ? null : k))}
                  onDrop={(e) => { e.preventDefault(); dropOn(c.key); }}
                  title={`${c.label} — drag to move it`}
                  className={`group py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#A6ACBE] cursor-grab active:cursor-grabbing select-none
                    ${i === cols.length - 1 ? "pl-3 pr-5" : "px-3"}
                    ${dragKey === c.key ? "opacity-40" : ""}
                    ${overKey === c.key ? "bg-brand-light" : ""}`}>
                  <span className="flex items-center gap-1 min-w-0">
                    <IconGripVertical size={12} stroke={1.8} className="shrink-0 text-transparent group-hover:text-[#C9CDD8]" />
                    <span className="truncate">{c.label}</span>
                    {/* Hidden, not deleted — the sheet keeps the column. */}
                    <button onClick={() => hideColumn(c.key)} title={`Hide ${c.label}`}
                      className="shrink-0 ml-auto p-0.5 rounded text-transparent group-hover:text-[#C9CDD8] hover:!text-[#C0392B]">
                      <IconX size={11} stroke={2.4} />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.rowKey || l.sheetRow} className={`border-b border-gray-50 last:border-0 align-top ${picked.has(l.rowKey) ? "bg-brand-light/40" : "hover:bg-[#FCFCFE]"}`}>
                <td className="pl-5 pr-3 py-3">
                  <input type="checkbox" aria-label={`Select ${fullName(l)}`}
                    checked={picked.has(l.rowKey)} disabled={!l.rowKey}
                    onChange={(e) => setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(l.rowKey); else next.delete(l.rowKey);
                      return next;
                    })}
                    className="w-[14px] h-[14px] accent-[#3A57E8] cursor-pointer disabled:opacity-30" />
                </td>
                {cols.map((c, i) => (
                  <td key={c.key} className={`py-3 ${i === cols.length - 1 ? "pl-3 pr-5" : "px-3"}`}>{c.cell(l)}</td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={1 + cols.length} className="px-5 py-8 text-center text-[13px] text-[#8A92A6]">
                {leads.length === 0 ? "That tab has no rows yet."
                  : todoOnly ? "Everyone has a status — switch to All to see them." : "No lead matches that filter."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/** The current column for a field, in the settings row. Click to change it. */
function SettingChip({ label, column, onClick }: { label: string; column: string | null; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[12px] rounded-lg border px-2.5 py-1 ${
        column ? "border-gray-200 text-[#4A5468] hover:border-brand hover:text-brand"
               : "border-[#F0C36D] bg-[#FFF8E8] text-[#8A6D1F] hover:border-[#D9A93F]"}`}>
      <span className="font-medium">{label}</span>
      <span className="text-[#A6ACBE]">→</span>
      <span className="max-w-[200px] truncate">{column || "not set — pick a column"}</span>
    </button>
  );
}

/** What an unset cell shows: the fix, not a note telling you to go find it. */
function PickPrompt({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12px] text-[#8A92A6] rounded-lg border border-dashed border-gray-200 px-2.5 py-1.5 hover:border-brand hover:text-brand">
      <IconPlus size={13} stroke={2} /> {children}
    </button>
  );
}

/**
 * Chooses which of the sheet's columns a field writes to — or makes a new one.
 *
 * The "add a column" half is not a convenience. A sheet filled in at an event has
 * no Notes column, so every column on offer already holds somebody's answers, and
 * pointing Notes at one of them destroys data the moment anyone types. Adding a
 * column at the end is the only option that writes nothing over.
 */
function ColumnPicker({ what, headers, current, onPick, onCreate, onClose, error }: {
  what: "status" | "notes" | "community";
  headers: string[];
  current: string | null;
  onPick: (h: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
  /** Shown inside the dialog: the page's own banner is behind it and unreadable. */
  error: string | null;
}) {
  const [name, setName] = useState(what === "notes" ? "Notes" : what === "community" ? "Added to community" : "Status");
  const [saving, setSaving] = useState(false);
  const exists = headers.some((h) => h.toLowerCase() === name.trim().toLowerCase());

  return (
    <Overlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 24px 60px rgba(35,45,66,.24)" }}
        className="mt-[12vh] w-full max-w-[520px] bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <header className="px-5 py-4 bg-brand-light border-b border-gray-100">
          <h3 className="text-[15px] font-medium text-[#232D42]">
            {what === "notes" ? "Where should notes be saved?"
              : what === "community" ? "Which column records the community invite?"
              : "Which column holds the status?"}
          </h3>
          <p className="mt-1 text-[12.5px] text-[#4A5468]">
            {what === "notes"
              ? "Notes are typed here and written straight into this column of your sheet. Pick an empty one, or add a new column."
              : what === "community"
              ? "Ticking the box on a row writes into this column. It uses the wording already in there, so the sheet keeps reading the way it does now."
              : "The dropdown on each row edits this column, and its choices are whatever values are already in it."}
          </p>
        </header>

        <div className="px-5 py-4 max-h-[42vh] overflow-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A6ACBE] mb-2">Columns already in the sheet</p>
          <div className="flex flex-col gap-1">
            {headers.map((h) => (
              <button key={h} onClick={() => onPick(h)}
                className={`flex items-center gap-2 text-left rounded-lg px-3 py-2 text-[12.5px] ${
                  h === current ? "bg-brand-light/60 font-medium text-[#232D42]" : "text-[#4A5468] hover:bg-[#F6F7FB]"}`}>
                <span className="flex-1 truncate">{h}</span>
                {h === current && <IconCheck size={14} stroke={2.5} className="text-brand shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-[#FCFCFE]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A6ACBE] mb-2">Or add a new column</p>
          <div className="flex items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[12.5px] text-[#232D42] focus:border-brand focus:outline-none" />
            <button disabled={!name.trim() || exists || saving}
              onClick={async () => { setSaving(true); await onCreate(name.trim()); setSaving(false); }}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium bg-brand text-white rounded-lg px-3 py-1.5 hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed">
              <IconPlus size={14} stroke={2} /> {saving ? "Adding…" : "Add to the sheet"}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-[#A6ACBE]">
            {exists
              ? `Your sheet already has a “${name.trim()}” column — pick it from the list above.`
              : "It goes in as a new, empty column at the end of the tab. Nothing already in the sheet is touched."}
          </p>
        </div>

        {error && (
          <div className="mx-5 my-3 flex items-start gap-2 rounded-lg bg-[#FDECEA] border border-[#F5C6C0] px-3 py-2.5">
            <IconAlertTriangle size={15} stroke={1.9} className="text-[#C0392B] shrink-0 mt-[1px]" />
            <span className="text-[12.5px] text-[#C0392B]">{error}</span>
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-[12.5px] text-[#8A92A6] hover:text-[#232D42] px-3 py-1.5">Cancel</button>
        </div>
      </div>
    </Overlay>
  );
}

function Shell({ onBack, title, meta, children }: { onBack: () => void; title?: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:text-brand-dark">
          <IconArrowLeft size={15} stroke={1.9} /> Campaigns
        </button>
        {title && <h2 className="text-[14px] font-medium text-[#232D42] truncate">{title}</h2>}
        {meta && <div className="ml-auto">{meta}</div>}
      </header>
      {children}
    </section>
  );
}
