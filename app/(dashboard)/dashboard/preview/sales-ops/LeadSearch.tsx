"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconUserShare, IconExternalLink, IconX, IconLoader2, IconUsersGroup } from "@tabler/icons-react";

// Sales Hub → Search leads. Find any lead across the whole CRM by name / phone /
// email (Airtable filters server-side), narrow by counsellor / status, open a lead
// to see everything the CRM holds on it, and reassign — one lead or a whole
// selection at once. Reassign reuses the Transfer request flow (a Pending row n8n
// applies); nothing edits the CRM lead directly, so the detail view is read-only.

type Roster = { name: string; userId: string; label: string };
type Lead = {
  id: string; name: string; counsellor: { id: string; name: string } | null;
  status: string; interest: string; source: string; location: string;
  phone: string; email: string; created: string; assigned: string; idleDays: number; link: string;
};

export function LeadSearch() {
  const [q, setQ] = useState("");
  const [counsellor, setCounsellor] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reassign, setReassign] = useState<Lead | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (counsellor) p.set("counsellor", counsellor);
      if (status.trim()) p.set("status", status.trim());
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const d = await fetch(`/api/leads-crm/search?${p.toString()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("search failed"))));
      if (mine !== seq.current) return;
      setLeads((d.leads || []) as Lead[]);
      setTruncated(!!d.truncated);
      setSelected(new Set());
      if ((d.roster || []).length) setRoster(d.roster as Roster[]);
    } catch (e) {
      if (mine === seq.current) { setError(e instanceof Error ? e.message : "Search failed"); setLeads([]); }
    } finally { if (mine === seq.current) setLoading(false); }
  }, [q, counsellor, status, from, to]);

  useEffect(() => { const t = setTimeout(run, 350); return () => clearTimeout(t); }, [run]);

  const list = leads || [];
  const allSelected = list.length > 0 && list.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(list.map((l) => l.id)));
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedLeads = useMemo(() => list.filter((l) => selected.has(l.id)), [list, selected]);

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
          {roster.map((r) => <option key={r.userId} value={r.name}>{r.name}</option>)}
        </select>
        <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Status contains…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-[150px] focus:outline-none focus:border-brand" />
        <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
          <span className="text-gray-400">Created</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Created from"
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-[#232D42] focus:outline-none focus:border-brand" />
          <span className="text-gray-400">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Created to"
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-[#232D42] focus:outline-none focus:border-brand" />
          {(from || to) && <button onClick={() => { setFrom(""); setTo(""); }} className="text-gray-400 hover:text-gray-600" title="Clear dates"><IconX size={14} /></button>}
        </div>
        {loading && <IconLoader2 size={18} className="animate-spin text-brand" />}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-brand-light border border-[#D7DEFB] rounded-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-[13px] font-medium text-[#2138B0]">{selected.size} lead{selected.size === 1 ? "" : "s"} selected</span>
          <button onClick={() => setBulkOpen(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-brand rounded-lg px-3.5 py-1.5 hover:bg-brand-dark"><IconUsersGroup size={15} stroke={1.8} /> Reassign selected</button>
          <button onClick={() => setSelected(new Set())} className="text-[13px] text-[#2138B0] hover:underline ml-auto">Clear</button>
        </div>
      )}

      {/* Results */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <div className="text-[13px] text-gray-500">
            {error ? <span className="text-red-600">{error}</span>
              : leads == null ? "Searching…"
              : `${list.length} lead${list.length === 1 ? "" : "s"}${truncated ? "+ — narrow the search to see the rest" : ""}`}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="font-medium px-4 py-2.5 w-9"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#3A57E8] cursor-pointer" /></th>
                <th className="font-medium px-1 py-2.5">Lead</th>
                <th className="font-medium px-3 py-2.5">Counsellor</th>
                <th className="font-medium px-3 py-2.5">Status</th>
                <th className="font-medium px-3 py-2.5">Interest</th>
                <th className="font-medium px-3 py-2.5">Created</th>
                <th className="font-medium px-3 py-2.5">Assigned</th>
                <th className="font-medium px-3 py-2.5">Idle</th>
                <th className="font-medium px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads && list.length === 0 && !loading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No leads match. Try a different name, number or filter.</td></tr>
              )}
              {list.map((l) => (
                <tr key={l.id} className={`border-b border-gray-50 hover:bg-[#F6F7FB] ${selected.has(l.id) ? "bg-brand-light/40" : ""}`}>
                  <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} className="accent-[#3A57E8] cursor-pointer" /></td>
                  <td className="px-1 py-2.5">
                    <button onClick={() => setDetailId(l.id)} className="text-left group">
                      <div className="font-medium text-[#232D42] group-hover:text-brand">{l.name}</div>
                      <div className="text-[12px] text-gray-400">{[l.phone, l.email].filter(Boolean).join(" · ") || "—"}</div>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-[#3B4457]">{l.counsellor?.name || <span className="text-gray-400">Unassigned</span>}</td>
                  <td className="px-3 py-2.5"><span className="text-[12px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{l.status || "—"}</span></td>
                  <td className="px-3 py-2.5 text-[#3B4457]">{l.interest || "—"}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{l.created || "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{l.assigned ? <span className="text-[#3B4457]">{l.assigned}</span> : <span className="text-gray-300">—</span>}</td>
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
      {bulkOpen && <BulkReassignModal leads={selectedLeads} roster={roster} onClose={() => setBulkOpen(false)} onDone={() => { setBulkOpen(false); run(); }} />}
      {detailId && <LeadDetailModal id={detailId} onClose={() => setDetailId(null)} onReassign={(l) => { setDetailId(null); setReassign(l); }} />}
    </div>
  );
}

// ── Single-lead reassign ───────────────────────────────────────────────────────
function ReassignModal({ lead, roster, onClose, onDone }: { lead: Lead; roster: Roster[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
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
        body: JSON.stringify({ leadId: lead.id, fromUserId: lead.counsellor?.id, toUserId: to, notes: notes.trim(), leadName: lead.name, confirm }),
      });
      const j = await res.json();
      if (!res.ok) { setErr((j?.missing ? j.missing.join(", ") : j?.error) || "Could not raise the transfer."); return; }
      setOk(j?.message || "Transfer requested.");
      setTimeout(onDone, 1400);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not raise the transfer."); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell onClose={onClose} icon={<IconUserShare size={18} stroke={1.8} />} title="Reassign lead"
      sub={<>{lead.name} · currently with <b className="text-[#3B4457]">{lead.counsellor?.name || "Unassigned"}</b></>}>
      {ok ? <Ok msg={ok} /> : (
        <>
          <Label>Reassign to</Label>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Pick a counsellor…</option>
            {targets.map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
          </select>
          <Label className="mt-3">Reason</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Why is this moving? — goes into the transfer note."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] resize-none focus:outline-none focus:border-brand" />
          <ConfirmToggle checked={confirm} onChange={setConfirm} />
          {err && <div className="text-[12.5px] text-red-600 mt-2">{err}</div>}
          <Actions onClose={onClose} onSubmit={submit} busy={busy} label={confirm ? "Reassign & confirm" : "Reassign"} />
        </>
      )}
    </ModalShell>
  );
}

// ── Batch reassign ─────────────────────────────────────────────────────────────
function BulkReassignModal({ leads, roster, onClose, onDone }: { leads: Lead[]; roster: Roster[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!to) { setErr("Pick a counsellor to reassign them to."); return; }
    if (!notes.trim()) { setErr("Add a reason — it goes into the transfer note."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/leads-crm/transfer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: leads.map((l) => l.id), toUserId: to, notes: notes.trim(), confirm }),
      });
      const j = await res.json();
      if (!res.ok && !j?.requested) { setErr((j?.missing ? j.missing.join(", ") : j?.error) || "Could not raise the transfers."); return; }
      setOk(j?.message || `${leads.length} transfer requests raised.`);
      setTimeout(onDone, 1600);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not raise the transfers."); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell onClose={onClose} icon={<IconUsersGroup size={18} stroke={1.8} />} title={`Reassign ${leads.length} leads`}
      sub={<>Handing over {leads.length} selected lead{leads.length === 1 ? "" : "s"} at once</>}>
      {ok ? <Ok msg={ok} /> : (
        <>
          <div className="mt-1 max-h-24 overflow-y-auto rounded-lg bg-[#F6F7FB] border border-gray-100 px-3 py-2 text-[12px] text-[#3B4457] leading-relaxed">
            {leads.slice(0, 8).map((l) => l.name).join(", ")}{leads.length > 8 ? ` +${leads.length - 8} more` : ""}
          </div>
          <Label className="mt-3">Reassign all to</Label>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Pick a counsellor…</option>
            {roster.map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
          </select>
          <Label className="mt-3">Reason</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Why are these moving? — goes into each transfer note."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] resize-none focus:outline-none focus:border-brand" />
          <ConfirmToggle checked={confirm} onChange={setConfirm} plural />
          {err && <div className="text-[12.5px] text-red-600 mt-2">{err}</div>}
          <Actions onClose={onClose} onSubmit={submit} busy={busy} label={confirm ? `Reassign & confirm ${leads.length}` : `Reassign ${leads.length}`} />
        </>
      )}
    </ModalShell>
  );
}

// ── Lead detail (everything the CRM holds, read-only) ──────────────────────────
type Detail = { id: string; name: string; counsellor: { id: string; name: string } | null; idleDays: number; link: string; groups: { title: string; rows: { label: string; value: string }[] }[] };
function LeadDetailModal({ id, onClose, onReassign }: { id: string; onClose: () => void; onReassign: (l: Lead) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/leads-crm/lead?id=${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("could not load the lead"))))
      .then((j) => { if (alive) setD(j as Detail); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "could not load the lead"); });
    return () => { alive = false; };
  }, [id]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white rounded-2xl border border-gray-100" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold text-[#232D42]">{d?.name || "Loading…"}</div>
            <div className="text-[13px] text-[#8A92A6] mt-0.5">
              {d ? <>With <b className="text-[#3B4457]">{d.counsellor?.name || "Unassigned"}</b> · <span className={d.idleDays > 7 ? "text-red-600 font-medium" : ""}>idle {d.idleDays}d</span></> : " "}
            </div>
          </div>
          {d && <button onClick={() => onReassign({ id: d.id, name: d.name, counsellor: d.counsellor, status: "", interest: "", source: "", location: "", phone: "", email: "", created: "", assigned: "", idleDays: d.idleDays, link: d.link })}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand border border-[#E9ECFB] rounded-lg px-2.5 py-1.5 hover:bg-brand-light flex-shrink-0"><IconUserShare size={14} stroke={1.8} /> Reassign</button>}
          <a href={d?.link || "#"} target="_blank" rel="noopener noreferrer" title="Open in Airtable" className="text-gray-400 hover:text-brand mt-1 flex-shrink-0"><IconExternalLink size={17} stroke={1.8} /></a>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0">×</button>
        </div>
        <div className="p-5">
          {err ? <div className="text-[13px] text-red-600">{err}</div>
            : !d ? <div className="text-[13px] text-gray-400 py-8 text-center">Loading the lead…</div>
            : (
              <div className="space-y-5">
                {d.groups.map((g) => (
                  <div key={g.title}>
                    <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">{g.title}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      {g.rows.map((r) => (
                        <div key={r.label} className="flex gap-3 text-[13px] border-b border-gray-50 pb-1.5">
                          <span className="text-[#8A92A6] w-40 flex-shrink-0">{r.label}</span>
                          <span className="text-[#232D42] min-w-0 break-words">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="text-[11.5px] text-[#8A92A6] pt-1">Lead data is read-only here — edits are made in Airtable / the CRM.</div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// ── Small shared modal bits ────────────────────────────────────────────────────
function ModalShell({ icon, title, sub, children, onClose }: { icon: React.ReactNode; title: string; sub: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-light text-brand flex items-center justify-center flex-shrink-0">{icon}</div>
          <div className="min-w-0"><div className="text-[15px] font-semibold text-[#232D42]">{title}</div><div className="text-[13px] text-[#8A92A6] mt-0.5 truncate">{sub}</div></div>
        </div>
        {children}
      </div>
    </div>
  );
}
const Label = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <label className={`block text-[12.5px] font-medium text-[#232D42] mb-1 ${className}`}>{children}</label>;
// Confirm now → sets Confirm Transfer on the request so the 20-min automation moves
// the lead(s) without anyone opening Airtable. Unticked = parked for a manual review.
function ConfirmToggle({ checked, onChange, plural = false }: { checked: boolean; onChange: (v: boolean) => void; plural?: boolean }) {
  const it = plural ? "leads move" : "lead moves";
  return (
    <label className="flex items-start gap-2 mt-3 cursor-pointer select-none rounded-lg border border-gray-100 bg-[#F6F7FB] px-3 py-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#3A57E8] mt-0.5 cursor-pointer" />
      <span className="text-[12px] leading-snug">
        <b className="text-[#232D42]">Confirm now</b> <span className="text-[#3B4457]">— the {it} within ~20 min automatically.</span>
        <span className="block text-[#8A92A6] mt-0.5">{checked ? "Confirmed: goes straight to the transfer queue." : "Unticked: filed as a request; someone ticks Confirm in Airtable to move it."}</span>
      </span>
    </label>
  );
}
const Ok = ({ msg }: { msg: string }) => <div className="mt-4 text-[13px] text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">{msg}</div>;
function Actions({ onClose, onSubmit, busy, label }: { onClose: () => void; onSubmit: () => void; busy: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button onClick={onClose} disabled={busy} className="px-3.5 py-2 rounded-lg text-[13px] font-medium text-[#232D42] border border-gray-200 hover:bg-gray-50">Cancel</button>
      <button onClick={onSubmit} disabled={busy} className="px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60">{busy ? "Requesting…" : label}</button>
    </div>
  );
}
