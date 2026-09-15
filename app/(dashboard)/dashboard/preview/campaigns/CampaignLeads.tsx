"use client";
import { useCallback, useEffect, useState } from "react";
import { IconArrowLeft, IconRefresh, IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";
import { WhatsAppSend } from "@/components/WhatsAppSend";

type Lead = { rowKey: string; sheetRow: number; fields: Record<string, string> };
type Writable = { status: string | null; notes: string | null; options: string[] };
type Data = {
  campaign: { id: string; name: string; spreadsheetId: string; tab: string; keyColumn: string; statusColumn?: string | null; notesColumn?: string | null };
  headers: string[];
  leads: Lead[];
  writable: Writable;
  error?: string;
};

// Best guess at which column holds what, so a sheet works without being told.
// Only used for display — nothing is written based on a guess.
const pick = (headers: string[], re: RegExp) => headers.find((h) => re.test(h)) || null;

export function CampaignLeads({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  const load = useCallback(() => {
    setData(null);
    fetch(`/api/campaigns/leads?id=${encodeURIComponent(id)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { setData(d); setSyncedAt(Date.now()); })
      .catch(() => setData({ campaign: { id, name: "", spreadsheetId: "", tab: "", keyColumn: "" }, headers: [], leads: [], writable: { status: null, notes: null, options: [] }, error: "Couldn't reach the sheet." }));
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

  if (!data) return <Shell onBack={onBack}><div className="px-5 py-8 text-[13px] text-[#8A92A6]">Reading the sheet…</div></Shell>;

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
  const firstName = pick(headers, /^first\s*name$/i);
  const lastName = pick(headers, /^last\s*name$/i);
  const nameCol = firstName || pick(headers, /name/i);
  const phoneCol = pick(headers, /phone|mobile|contact|whats/i);
  const timeCol = pick(headers, /capture|created|timestamp|date|time/i);
  const fullName = (l: Lead) => {
    const a = (firstName && l.fields[firstName]) || (nameCol && l.fields[nameCol]) || "";
    const b = (lastName && l.fields[lastName]) || "";
    return [a, b].filter(Boolean).join(" ").trim() || "—";
  };

  // Which column the dropdown edits is a setting on the campaign, saved so it
  // holds next time. Nothing in the sheet is touched by choosing it.
  const setColumn = async (which: "statusColumn" | "notesColumn", column: string) => {
    if (!data) return;
    setFailed(null);
    const r = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ ...data.campaign, [which]: column || null }),
    });
    const d = await r.json();
    if (!r.ok || d.error) { setFailed(d.error || "Couldn't save that choice"); return; }
    load();
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

  return (
    <Shell
      onBack={onBack}
      title={campaign.name}
      meta={
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#8A92A6]">
            {leads.length} lead{leads.length === 1 ? "" : "s"} from the <b className="font-medium text-[#4A5468]">{campaign.tab}</b> tab
            {writable.status && <> · Status saves into <b className="font-medium text-[#4A5468]">{writable.status}</b></>}
            {syncedAt && <> · synced {new Date(syncedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
          </span>
          <a href={`https://docs.google.com/spreadsheets/d/${campaign.spreadsheetId}/edit`} target="_blank" rel="noopener noreferrer"
            className="text-[#A6ACBE] hover:text-brand" title="Open the sheet"><IconExternalLink size={15} stroke={1.8} /></a>
          <button onClick={load} title="Re-read the sheet now"
            className="inline-flex items-center gap-1.5 text-[12px] text-[#4A5468] border border-gray-200 rounded-lg px-2.5 py-1 hover:border-brand hover:text-brand">
            <IconRefresh size={13} stroke={1.8} /> Sync
          </button>
        </div>
      }
    >
      {failed && (
        <div className="mx-5 my-3 flex items-start gap-2 rounded-lg bg-[#FDECEA] border border-[#F5C6C0] px-3 py-2.5">
          <IconAlertTriangle size={15} stroke={1.9} className="text-[#C0392B] shrink-0 mt-[1px]" />
          <span className="text-[12.5px] text-[#C0392B]">{failed}</span>
        </div>
      )}

      {/* Which columns are editable is a choice, asked once. Guessing it from the
          data picked a yes/no survey question over the real status column, so it
          is not guessed at all. */}
      <div className="flex items-center gap-4 flex-wrap px-5 py-3 border-b border-gray-100 bg-[#FCFCFE]">
        <label className="flex items-center gap-2">
          <span className="text-[11.5px] text-[#8A92A6] whitespace-nowrap">Status column</span>
          <span className="w-[210px]">
            <PreviewSelect value={writable.status || ""} onChange={(v) => setColumn("statusColumn", v)}
              placeholder="Not set — pick one" options={headers.map((h) => ({ value: h, label: h }))} />
          </span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[11.5px] text-[#8A92A6] whitespace-nowrap">Notes column</span>
          <span className="w-[210px]">
            <PreviewSelect value={writable.notes || ""} onChange={(v) => setColumn("notesColumn", v)}
              placeholder="Not set — pick one" options={headers.map((h) => ({ value: h, label: h }))} />
          </span>
        </label>
        <span className="text-[11.5px] text-[#A6ACBE]">
          {writable.status
            ? `Choices come from what's already in ${writable.status} — ${writable.options.length} of them.`
            : "Until one is set, nothing can be written back."}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="bg-[#FCFCFE] border-b border-gray-100">
              {["Lead ID", "Captured", "Lead", "Phone", "Status", "Notes", "WhatsApp"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#A6ACBE] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const phone = (phoneCol && l.fields[phoneCol]) || "";
              return (
                <tr key={l.rowKey || l.sheetRow} className="border-b border-gray-50 last:border-0 hover:bg-[#FCFCFE] align-top">
                  {/* Only here so a row can be traced back to its line in the sheet. */}
                  <td className="px-4 py-3 text-[11px] text-[#C9CDD8] font-mono whitespace-nowrap" title={l.rowKey}>
                    {l.rowKey ? l.rowKey.replace(/^l:/, "").slice(-6) : "—"}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#8A92A6] whitespace-nowrap">{(timeCol && l.fields[timeCol]) || "—"}</td>
                  <td className="px-4 py-3 text-[13px] font-medium text-[#232D42]">{fullName(l)}</td>
                  <td className="px-4 py-3 text-[12.5px] text-[#4A5468] tabular-nums whitespace-nowrap">
                    {phone || <span className="text-[#C9CDD8]">no number</span>}
                  </td>
                  <td className="px-4 py-3 w-[180px]">
                    {writable.status ? (
                      <PreviewSelect
                        value={l.fields[writable.status] || ""}
                        onChange={(v) => write(l, writable.status!, v)}
                        placeholder={busy === `${l.rowKey}:${writable.status}` ? "Saving…" : "Set status…"}
                        options={writable.options.map((op) => ({ value: op, label: op }))}
                      />
                    ) : <span className="text-[12px] text-[#C9CDD8]">pick a column above</span>}
                  </td>
                  <td className="px-4 py-3 min-w-[240px]">
                    {writable.notes ? (
                      <textarea
                        defaultValue={l.fields[writable.notes] || ""}
                        rows={2}
                        placeholder="Add a note…"
                        onBlur={(e) => { const v = e.target.value; if (v !== (l.fields[writable.notes!] || "")) write(l, writable.notes!, v); }}
                        className="w-full resize-y px-2 py-1.5 rounded-lg bg-transparent text-[12.5px] leading-snug text-[#232D42] border border-transparent hover:border-gray-200 focus:border-brand focus:bg-white focus:outline-none placeholder:text-[#C9CDD8]"
                      />
                    ) : <span className="text-[12px] text-[#C9CDD8]">pick a column above</span>}
                  </td>
                  <td className="px-4 py-3"><WhatsAppSend phone={phone} name={fullName(l)} compact /></td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-[13px] text-[#8A92A6]">That tab has no rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
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
