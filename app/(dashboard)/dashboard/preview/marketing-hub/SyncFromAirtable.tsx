"use client";
import { useState } from "react";
import { IconRefresh, IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { Overlay } from "@/app/(dashboard)/dashboard/preview/Overlay";
import { PreviewDatePicker } from "@/app/(dashboard)/dashboard/preview/PreviewDatePicker";

// Pull a window of Airtable's Content Calendar into the master sheet.
//
// A date range and a button, rather than a background job. The team plans months
// ahead in Airtable; nobody wants all 4,294 rows, they want September.
//
// Check first, then import: the same request runs twice, once counting and once
// writing, so nobody presses a button that writes to 400 rows without being told
// how many and what will happen to them.

type Result = {
  scanned: number; created: number; updated: number;
  skipped: { reason: string; count: number }[];
  errors: string[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function SyncFromAirtable({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [busy, setBusy] = useState<"check" | "run" | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (dryRun: boolean) => {
    setBusy(dryRun ? "check" : "run"); setError(null);
    try {
      const r = await fetch("/api/marketing-hub/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ from, to, dryRun }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || `HTTP ${r.status}`); return; }
      if (dryRun) { setPreview(d); setDone(null); } else { setDone(d); setPreview(null); onImported(); }
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(null); }
  };

  const month = (back: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + back, 1);
    setFrom(iso(d));
    setTo(iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    setPreview(null); setDone(null);
  };

  return (
    <>
      <button onClick={() => { setOpen(true); setPreview(null); setDone(null); setError(null); }}
        title="Copy a date range of Airtable's Content Calendar into this sheet"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#4A5468] border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand hover:text-brand">
        <IconRefresh size={14} stroke={1.9} /> Sync from Airtable
      </button>

      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 24px 60px rgba(35,45,66,.24)" }}
            className="mt-[10vh] w-full max-w-[520px] bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <header className="px-5 py-4 bg-brand-light border-b border-gray-100">
              <h3 className="text-[15px] font-medium text-[#232D42]">Sync from Airtable</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#4A5468]">
                Copies the Content Calendar into this sheet for the dates you choose, matching on
                Publishing Date. Nothing is written back to Airtable.
              </p>
            </header>

            <div className="px-5 py-4 space-y-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-[#8A92A6] uppercase tracking-wide">Dates</span>
                <PreviewDatePicker value={from} onChange={(v) => { setFrom(v); setPreview(null); setDone(null); }} size="sm" max={to || undefined} />
                <span className="text-[12px] text-[#A6ACBE]">to</span>
                <PreviewDatePicker value={to} onChange={(v) => { setTo(v); setPreview(null); setDone(null); }} size="sm" min={from || undefined} />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[["This month", 0], ["Last month", -1], ["Next month", 1]].map(([label, back]) => (
                  <button key={label as string} onClick={() => month(back as number)}
                    className="text-[11.5px] text-[#4A5468] border border-gray-200 rounded-lg px-2.5 py-1 hover:border-brand hover:text-brand">
                    {label as string}
                  </button>
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-[#FDECEA] border border-[#F5C6C0] px-3 py-2.5">
                  <IconAlertTriangle size={15} stroke={1.9} className="text-[#C0392B] shrink-0 mt-[1px]" />
                  <span className="text-[12.5px] text-[#C0392B]">{error}</span>
                </div>
              )}

              {preview && <Summary r={preview} heading={`${preview.scanned} record${preview.scanned === 1 ? "" : "s"} in that range`} />}
              {done && (
                <div className="rounded-lg bg-[#E8F6F0] border border-[#BFE6D4] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#2F9E6F]">
                    <IconCheck size={15} stroke={2.2} /> Imported
                  </div>
                  <Summary r={done} heading="" bare />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-5 py-3.5 border-t border-gray-100">
              <button onClick={() => call(true)} disabled={Boolean(busy)}
                className="text-[13px] font-medium text-[#4A5468] border border-gray-200 rounded-lg px-4 py-2 hover:border-brand hover:text-brand disabled:opacity-40">
                {busy === "check" ? "Checking…" : "Check first"}
              </button>
              <button onClick={() => call(false)} disabled={Boolean(busy)}
                className="text-[13px] font-medium bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-40">
                {busy === "run" ? "Importing…" : "Import"}
              </button>
              <button onClick={() => setOpen(false)} className="text-[13px] text-[#8A92A6] hover:text-[#232D42] px-2">Close</button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}

function Summary({ r, heading, bare }: { r: Result; heading: string; bare?: boolean }) {
  return (
    <div className={bare ? "mt-1" : "rounded-lg border border-gray-200 px-3 py-2.5"}>
      {heading && <div className="text-[12.5px] font-medium text-[#232D42]">{heading}</div>}
      <div className="text-[12px] text-[#4A5468] mt-1 space-y-0.5">
        <div>{r.created} new · {r.updated} updated</div>
        {r.skipped.map((s) => <div key={s.reason} className="text-[#8A92A6]">{s.count} skipped — {s.reason}</div>)}
        {r.errors.length > 0 && (
          <div className="text-[#C0392B]">
            {r.errors.length} failed: {r.errors[0]}
          </div>
        )}
      </div>
    </div>
  );
}
