"use client";
import { useEffect, useState } from "react";
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

type FacetKey = "owner" | "collaborators" | "type" | "status" | "sbu";
type Facets = Record<FacetKey, { value: string; count: number }[]>;
type Result = {
  inRange: number; facets: Facets;
  scanned: number; created: number; updated: number;
  skipped: { reason: string; count: number }[];
  errors: string[];
};

// The Airtable fields the team filters by, in the order they filter.
const FILTERS: { key: FacetKey; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "collaborators", label: "Collaborators" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "sbu", label: "Primary interest / SBU" },
];

// This modal portals to <body>, outside .preview-scope, where `bg-brand` resolves
// to the old purple — so the dashboard blue is spelled out here.
const BLUE = "#3A57E8";

// Local calendar date, not toISOString(): that converts to UTC, and midnight on
// the 1st in India is still the previous day in UTC — the default range opened
// as 31 Aug – 29 Sep instead of 1 – 30 Sep, dropping the month's last day.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function SyncFromAirtable({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [filters, setFilters] = useState<Partial<Record<FacetKey, string[]>>>({});
  const [busy, setBusy] = useState<"check" | "run" | null>(null);
  const [facets, setFacets] = useState<{ inRange: number; facets: Facets; scanned: number } | null>(null);
  const [loadingFacets, setLoadingFacets] = useState(false);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const post = async (extra: Record<string, unknown>) => {
    const r = await fetch("/api/marketing-hub/import", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ from, to, filters, ...extra }),
    });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    return d as Result;
  };

  // Filter options come from the records actually in the chosen dates, with counts,
  // and the match count updates as filters are picked.
  useEffect(() => {
    if (!open || !from || !to || from > to) return;
    let live = true;
    setLoadingFacets(true);
    post({ facetsOnly: true })
      .then((d) => { if (live) { setFacets(d); setError(null); } })
      .catch((e) => { if (live) setError((e as Error).message); })
      .finally(() => { if (live) setLoadingFacets(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to, JSON.stringify(filters)]);

  const call = async (dryRun: boolean) => {
    setBusy(dryRun ? "check" : "run"); setError(null);
    try {
      const d = await post({ dryRun });
      if (dryRun) { setPreview(d); setDone(null); } else { setDone(d); setPreview(null); onImported(); }
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(null); }
  };

  const reset = () => { setPreview(null); setDone(null); };
  const month = (back: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + back, 1);
    setFrom(iso(d));
    setTo(iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    reset();
  };
  const toggle = (key: FacetKey, value: string) => {
    setFilters((f) => {
      const cur = f[key] || [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...f, [key]: next };
    });
    reset();
  };
  const activeCount = Object.values(filters).reduce((n, v) => n + (v?.length || 0), 0);

  return (
    <>
      <button onClick={() => { setOpen(true); setPreview(null); setDone(null); setError(null); }}
        title="Copy a date range of Airtable's Content Calendar into this sheet"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white bg-brand rounded-lg px-3 py-1.5 hover:bg-brand-dark">
        <IconRefresh size={14} stroke={1.9} /> Sync from Airtable
      </button>

      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 24px 60px rgba(35,45,66,.24)" }}
            className="mt-[6vh] w-full max-w-[760px] bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <header className="px-5 py-4 bg-[#E9ECFB] border-b border-gray-100">
              <h3 className="text-[16px] font-medium text-[#232D42]">Sync from Airtable</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[#4A5468]">
                Copies the Content Calendar into this sheet for the dates you choose, matching on
                Publishing Date. Narrow it with the same fields you filter by in Airtable. Nothing is
                written back to Airtable.
              </p>
            </header>

            <div className="px-5 py-4 space-y-4 max-h-[62vh] overflow-y-auto">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-[160px] text-[12px] font-medium text-[#8A92A6] uppercase tracking-wide">Publishing date</span>
                  <PreviewDatePicker value={from} onChange={(v) => { setFrom(v); reset(); }} size="sm" max={to || undefined} />
                  <span className="text-[12px] text-[#A6ACBE]">to</span>
                  <PreviewDatePicker value={to} onChange={(v) => { setTo(v); reset(); }} size="sm" min={from || undefined} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pl-[168px]">
                  {[["This month", 0], ["Last month", -1], ["Next month", 1]].map(([label, back]) => (
                    <button key={label as string} onClick={() => month(back as number)}
                      className="h-7 text-[12px] text-[#4A5468] border border-gray-200 rounded px-2.5 hover:border-[#3A57E8] hover:text-[#3A57E8]">
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-[#232D42]">Filters</span>
                  <span className="text-[12px] text-[#8A92A6]">
                    {loadingFacets ? "Reading Airtable…" : facets ? `${facets.scanned} of ${facets.inRange} records in these dates match` : ""}
                  </span>
                  {activeCount > 0 && (
                    <button onClick={() => { setFilters({}); reset(); }} className="ml-auto text-[12px] text-[#8A92A6] hover:text-[#232D42]">Clear filters</button>
                  )}
                </div>
                {FILTERS.map(({ key, label }) => {
                  const picked = filters[key] || [];
                  const opts = facets?.facets[key] || [];
                  // Keep picked values visible even if these dates have none of them.
                  const shown = [...opts, ...picked.filter((p) => !opts.some((o) => o.value === p)).map((value) => ({ value, count: 0 }))];
                  return (
                    <div key={key} className="flex items-start gap-2">
                      <span className="w-[160px] shrink-0 pt-1 text-[12px] font-medium text-[#8A92A6] uppercase tracking-wide">{label}</span>
                      <div className="flex flex-wrap gap-1.5 min-w-0">
                        {shown.length === 0 && <span className="pt-1 text-[12px] text-[#A6ACBE]">{loadingFacets ? "…" : "None in these dates"}</span>}
                        {shown.map((o) => {
                          const on = picked.includes(o.value);
                          return (
                            <button key={o.value} onClick={() => toggle(key, o.value)}
                              style={on ? { background: BLUE, borderColor: BLUE } : undefined}
                              className={`h-7 inline-flex items-center gap-1.5 text-[12px] border rounded px-2.5 ${on ? "text-white" : "text-[#4A5468] border-gray-200 hover:border-[#3A57E8]"}`}>
                              {on && <IconCheck size={12} stroke={2.4} />}
                              {o.value}
                              <span className={on ? "text-white/75" : "text-[#A6ACBE]"}>{o.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded bg-[#FDECEA] border border-[#F5C6C0] px-3 py-2.5">
                  <IconAlertTriangle size={15} stroke={1.9} className="text-[#C0392B] shrink-0 mt-[1px]" />
                  <span className="text-[14px] text-[#C0392B]">{error}</span>
                </div>
              )}

              {preview && <Summary r={preview} heading={`${preview.scanned} record${preview.scanned === 1 ? "" : "s"} will be imported`} />}
              {done && (
                <div className="rounded bg-[#E8F6F0] border border-[#BFE6D4] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[14px] font-medium text-[#2F9E6F]">
                    <IconCheck size={15} stroke={2.2} /> Imported
                  </div>
                  <Summary r={done} heading="" bare />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-5 py-3.5 border-t border-gray-100">
              <button onClick={() => call(true)} disabled={Boolean(busy)}
                className="h-9 text-[14px] font-medium text-[#4A5468] border border-gray-200 rounded px-4 hover:border-[#3A57E8] hover:text-[#3A57E8] disabled:opacity-40">
                {busy === "check" ? "Checking…" : "Check first"}
              </button>
              <button onClick={() => call(false)} disabled={Boolean(busy) || facets?.scanned === 0}
                style={{ background: BLUE }}
                className="h-9 text-[14px] font-medium text-white rounded px-4 hover:brightness-110 disabled:opacity-40">
                {busy === "run" ? "Importing…" : facets ? `Import ${facets.scanned}` : "Import"}
              </button>
              <button onClick={() => setOpen(false)} className="h-9 text-[14px] text-[#8A92A6] hover:text-[#232D42] px-2">Close</button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}

function Summary({ r, heading, bare }: { r: Result; heading: string; bare?: boolean }) {
  return (
    <div className={bare ? "mt-1" : "rounded border border-gray-200 px-3 py-2.5"}>
      {heading && <div className="text-[14px] font-medium text-[#232D42]">{heading}</div>}
      <div className="text-[14px] text-[#4A5468] mt-1 space-y-0.5">
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
