"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconUserShare, IconExternalLink, IconX, IconLoader2 } from "@tabler/icons-react";

// Sales Hub → Search leads. Find any lead across the whole CRM by name / phone /
// email (Airtable filters server-side), narrow by counsellor / status, and reassign
// straight from a result row (reuses the Transfer request flow — a Pending row that
// n8n applies; nothing edits the CRM lead directly).

type Roster = { name: string; userId: string; label: string };
type Lead = {
  id: string; name: string; counsellor: { id: string; name: string } | null;
  status: string; interest: string; source: string; location: string;
  phone: string; email: string; created: string; idleDays: number; link: string;
};

export function LeadSearch() {
  const [q, setQ] = useState("");
  const [counsellor, setCounsellor] = useState("");
  const [status, setStatus] = useState("");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reassign, setReassign] = useState<Lead | null>(null);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (counsellor) p.set("counsellor", counsellor);
      if (status.trim()) p.set("status", status.trim());
      const d = await fetch(`/api/leads-crm/search?${p.toString()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("search failed"))));
      if (mine !== seq.current) return; // a newer search superseded this one
      setLeads((d.leads || []) as Lead[]);
      setTruncated(!!d.truncated);
      if ((d.roster || []).length) setRoster(d.roster as Roster[]);
    } catch (e) {
      if (mine === seq.current) { setError(e instanceof Error ? e.message : "Search failed"); setLeads([]); }
    } finally { if (mine === seq.current) setLoading(false); }
  }, [q, counsellor, status]);

  // Debounced live search — first load (empty query) shows the most recent leads.
  useEffect(() => { const t = setTimeout(run, 350); return () => clearTimeout(t); }, [run]);

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <IconSearch size={16} stroke={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any lead — name, phone or email…" autoFocus
            className="w-full border border-gray-200 rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-brand" />
          {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><IconX size={15} /></button>}
        </div>
        <select value={counsellor} onChange={(e) => setCounsellor(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#232D42] bg-white min-w-[150px]">
          <option value="">All counsellors</option>
          {roster.map((r) => <option key={r.userId} value={r.name}>{r.label || r.name}</option>)}
        </select>
        <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Status contains…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-[150px] focus:outline-none focus:border-brand" />
        {loading && <IconLoader2 size={18} className="animate-spin text-brand" />}
      </div>

      {/* Results */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <div className="text-[13px] text-gray-500">
            {error ? <span className="text-red-600">{error}</span>
              : leads == null ? "Searching…"
              : `${leads.length} lead${leads.length === 1 ? "" : "s"}${truncated ? "+" : ""}${truncated ? " — narrow the search to see the rest" : ""}`}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 820 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="font-medium px-4 py-2.5">Lead</th>
                <th className="font-medium px-3 py-2.5">Counsellor</th>
                <th className="font-medium px-3 py-2.5">Status</th>
                <th className="font-medium px-3 py-2.5">Interest</th>
                <th className="font-medium px-3 py-2.5">Source</th>
                <th className="font-medium px-3 py-2.5">Idle</th>
                <th className="font-medium px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads && leads.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No leads match. Try a different name, number or filter.</td></tr>
              )}
              {(leads || []).map((l) => (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-[#F6F7FB]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[#232D42]">{l.name}</div>
                    <div className="text-[12px] text-gray-400">{[l.phone, l.email].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-[#3B4457]">{l.counsellor?.name || <span className="text-gray-400">Unassigned</span>}</td>
                  <td className="px-3 py-2.5"><span className="text-[12px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{l.status || "—"}</span></td>
                  <td className="px-3 py-2.5 text-[#3B4457]">{l.interest || "—"}</td>
                  <td className="px-3 py-2.5 text-gray-500">{l.source || "—"}</td>
                  <td className="px-3 py-2.5"><span className={l.idleDays > 7 ? "text-red-600 font-medium" : "text-gray-500"}>{l.idleDays}d</span></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <a href={l.link} target="_blank" rel="noopener noreferrer" title="Open in Airtable" className="text-gray-400 hover:text-brand"><IconExternalLink size={16} stroke={1.8} /></a>
                      <button onClick={() => setReassign(l)} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand border border-[#E9ECFB] rounded-lg px-2.5 py-1.5 hover:bg-brand-light"><IconUserShare size={14} stroke={1.8} /> Reassign</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reassign && <ReassignModal lead={reassign} roster={roster} onClose={() => setReassign(null)} onDone={() => { setReassign(null); run(); }} />}
    </div>
  );
}

function ReassignModal({ lead, roster, onClose, onDone }: { lead: Lead; roster: Roster[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const targets = useMemo(() => roster.filter((r) => r.userId !== lead.counsellor?.id), [roster, lead]);

  const submit = async () => {
    setErr(null);
    if (!to) { setErr("Pick a counsellor to reassign to."); return; }
    if (!notes.trim()) { setErr("Add a reason — it goes into the transfer note."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/leads-crm/transfer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, fromUserId: lead.counsellor?.id, toUserId: to, notes: notes.trim(), leadName: lead.name }),
      });
      const j = await res.json();
      if (!res.ok) { setErr((j?.missing ? j.missing.join(", ") : j?.error) || "Could not raise the transfer."); return; }
      setOk(j?.message || "Transfer requested.");
      setTimeout(onDone, 1400);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not raise the transfer."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-light text-brand flex items-center justify-center flex-shrink-0"><IconUserShare size={18} stroke={1.8} /></div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-[#232D42]">Reassign lead</div>
            <div className="text-[13px] text-[#8A92A6] mt-0.5 truncate">{lead.name} · currently with <b className="text-[#3B4457]">{lead.counsellor?.name || "Unassigned"}</b></div>
          </div>
        </div>
        {ok ? (
          <div className="mt-4 text-[13px] text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">{ok}</div>
        ) : (
          <>
            <label className="block text-[12.5px] font-medium text-[#232D42] mt-4 mb-1">Reassign to</label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Pick a counsellor…</option>
              {targets.map((r) => <option key={r.userId} value={r.userId}>{r.label || r.name}</option>)}
            </select>
            <label className="block text-[12.5px] font-medium text-[#232D42] mt-3 mb-1">Reason</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Why is this moving? — goes into the transfer note."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] resize-none focus:outline-none focus:border-brand" />
            <div className="text-[11.5px] text-[#8A92A6] mt-2">This raises a transfer request — the lead moves once it&apos;s confirmed in Airtable / n8n, not instantly.</div>
            {err && <div className="text-[12.5px] text-red-600 mt-2">{err}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} disabled={busy} className="px-3.5 py-2 rounded-lg text-[13px] font-medium text-[#232D42] border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={submit} disabled={busy} className="px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60">{busy ? "Requesting…" : "Reassign"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
