"use client";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import MissingFieldsModal, { gateFromResponse, type GateBlock } from "../MissingFieldsModal";
import {
  IconRefresh, IconArrowsExchange, IconTimeline, IconAlertTriangle, IconX,
  IconCircleCheck, IconClock, IconUserOff,
} from "@tabler/icons-react";

// Sales Hub → Lead assignment & tracker.
//
// Answers the three questions the round-robin can't: who is holding what, whether
// any of it landed on someone who was on leave, and what has actually happened to
// a given lead since it arrived.
//
// Reassignment never edits a lead. It raises a "Pending" row in Airtable's
// Transfer Ownership table — the same request the team writes by hand — and a
// human ticks Confirm Transfer to complete it. See app/api/leads-crm/transfer.

type BucketPoint = { key: string; label: string; generated: number; assigned: number; unassigned: number };
type CounsellorTally = {
  name: string; userId: string; assigned: number; untouched: number;
  conflicts: number; closed: number; byStatus: { status: string; count: number }[];
};
type AssignedLead = {
  id: string; name: string; mobile: string; counsellor: string; counsellorUserId: string;
  status: string; source: string; interest: string; assignedOn: string; lastActivityAt: string;
  daysUntouched: number; callAttempts: number; link: string; onLeaveConflict: boolean;
};
type RosterEntry = { name: string; userId: string; email: string; label: string };
type Board = {
  range: { from: string; to: string };
  bucket: "day" | "week";
  totals: { generated: number; assigned: number; unassigned: number; conflicts: number; untouched: number };
  series: BucketPoint[];
  counsellors: CounsellorTally[];
  roster: RosterEntry[];
  leads: AssignedLead[];
  declared: { date: string; counsellor: string; dmLeads: number; totalLeads: number; notes: string }[];
  attendance: { latest: string | null; rowsInRange: number; coversRange: boolean };
};

const fmtInt = (n: number) => n.toLocaleString("en-IN");

function statusTone(s: string): { bg: string; fg: string } {
  const k = s.toLowerCase();
  if (/converted|won|hot/.test(k)) return { bg: "#E9F6F0", fg: "#1F7256" };
  if (/junk|not interested|lost|dead/.test(k)) return { bg: "#FDECEA", fg: "#C0392B" };
  if (/new|open|re-enquiry/.test(k)) return { bg: "#EEF1FE", fg: "#2138B0" };
  return { bg: "#FEF6E7", fg: "#B7791F" };
}

export function LeadAssignment({ range }: { range: { from: string; to: string } }) {
  const [bucket, setBucket] = useState<"day" | "week">("day");
  const [activeOnly, setActiveOnly] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);       // counsellor filter
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [reassign, setReassign] = useState<AssignedLead | null>(null);
  const [track, setTrack] = useState<AssignedLead | null>(null);

  const qs = new URLSearchParams({
    from: range.from, to: range.to, bucket, ...(activeOnly ? { active: "1" } : {}),
  }).toString();
  const { data, isLoading, error, refresh } = useApi<Board>(`/api/leads-crm/assignments?${qs}`);

  const leads = useMemo(() => {
    let rows = data?.leads || [];
    if (focus) rows = rows.filter((l) => l.counsellor === focus);
    if (conflictsOnly) rows = rows.filter((l) => l.onLeaveConflict);
    return rows;
  }, [data, focus, conflictsOnly]);

  const maxBar = useMemo(() => Math.max(1, ...(data?.series || []).map((p) => p.generated)), [data]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <div>
          <div className="text-base font-medium text-[#232D42]">Lead assignment &amp; tracker</div>
          <div className="text-sm text-gray-500 mt-0.5">
            Who is holding what, what the round-robin handed out, and anything that landed on a counsellor who was away.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {(["day", "week"] as const).map((b) => (
              <button key={b} onClick={() => setBucket(b)}
                className={`text-xs px-3 py-1.5 ${bucket === b ? "bg-brand text-white" : "text-[#4A5468] hover:bg-gray-50"}`}>
                {b === "day" ? "By day" : "By week"}
              </button>
            ))}
          </div>
          <button onClick={() => setActiveOnly((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${activeOnly ? "border-brand text-brand bg-brand-light/40" : "border-gray-200 text-[#4A5468] hover:border-gray-300"}`}>
            Active only
          </button>
          <button onClick={() => refresh()} title="Refresh"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-[#4A5468] hover:border-gray-300 inline-flex items-center gap-1">
            <IconRefresh size={13} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Couldn&apos;t load the board — {(error as Error).message}
        </div>
      )}

      {/* The leave check is only as good as the Attendance table. If nobody has been
          filling it, "0 on leave" is a false all-clear — say so rather than imply it. */}
      {data && !data.attendance.coversRange && (
        <div className="mt-4 flex items-start gap-2.5 text-sm text-[#8A6D1F] bg-[#FEF6E7] border border-[#F5D89B] rounded-lg px-3.5 py-2.5">
          <IconAlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <b className="font-medium">Leave check can&apos;t run for this range.</b>{" "}
            Airtable&apos;s Attendance table has no rows here
            {data.attendance.latest ? <> — the last one recorded is <b>{data.attendance.latest}</b></> : <> and appears to be empty</>}.
            &ldquo;Went to someone on leave&rdquo; reads 0 because nobody logged who was away, not because nothing went wrong.
            Start marking attendance daily and this fills in on its own.
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
        <Stat label="Generated" value={data ? fmtInt(data.totals.generated) : "—"} hint="created in range" />
        <Stat label="Assigned" value={data ? fmtInt(data.totals.assigned) : "—"}
          hint={data && data.totals.generated ? `${Math.round((data.totals.assigned / data.totals.generated) * 100)}% of generated` : "to a counsellor"} />
        <Stat label="Unassigned" value={data ? fmtInt(data.totals.unassigned) : "—"} hint="no counsellor yet"
          tone={data && data.totals.unassigned > 0 ? "warn" : undefined} />
        <Stat
          label="Went to someone on leave"
          value={data ? (data.attendance.coversRange ? fmtInt(data.totals.conflicts) : "n/a") : "—"}
          hint={data && !data.attendance.coversRange ? "no attendance logged" : "revoke these first"}
          tone={data && data.attendance.coversRange && data.totals.conflicts > 0 ? "crit" : undefined} />
        <Stat label="Untouched >7d" value={data ? fmtInt(data.totals.untouched) : "—"} hint="assigned but idle"
          tone={data && data.totals.untouched > 0 ? "warn" : undefined} />
      </div>

      {/* Generated vs assigned over time */}
      <div className="mt-6">
        <div className="text-sm font-medium text-[#232D42] mb-3">Generated vs assigned · {bucket === "day" ? "per day" : "per week"}</div>
        {data && data.series.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-2 min-w-full" style={{ height: 130 }}>
              {data.series.map((p) => (
                <div key={p.key} className="flex flex-col items-center gap-1 flex-1 min-w-[34px]" title={`${p.label} · ${p.generated} generated, ${p.assigned} assigned, ${p.unassigned} unassigned`}>
                  <div className="w-full flex items-end justify-center gap-0.5" style={{ height: 100 }}>
                    <div className="w-2.5 rounded-t" style={{ height: `${(p.generated / maxBar) * 100}%`, background: "#C7D2F7", minHeight: p.generated ? 2 : 0 }} />
                    <div className="w-2.5 rounded-t" style={{ height: `${(p.assigned / maxBar) * 100}%`, background: "#3A57E8", minHeight: p.assigned ? 2 : 0 }} />
                  </div>
                  <div className="text-[10px] text-gray-400 whitespace-nowrap">{p.label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 mt-3">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#C7D2F7" }} /> Generated</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#3A57E8" }} /> Assigned</span>
            </div>
          </div>
        ) : <div className="text-sm text-gray-400">{isLoading ? "Loading…" : "No leads in this range."}</div>}
      </div>

      {/* Per-counsellor tally */}
      <div className="mt-7">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-[#232D42]">Per counsellor</div>
          {focus && (
            <button onClick={() => setFocus(null)} className="text-xs text-brand hover:underline inline-flex items-center gap-1">
              <IconX size={12} /> Clear filter: {focus}
            </button>
          )}
        </div>
        {data && data.counsellors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-left border-b border-gray-100">
                <tr>
                  <th className="py-2.5 font-normal">Counsellor</th>
                  <th className="py-2.5 font-normal text-right">Assigned</th>
                  <th className="py-2.5 font-normal text-right">On leave</th>
                  <th className="py-2.5 font-normal text-right">Untouched</th>
                  <th className="py-2.5 font-normal text-right">Closed</th>
                  <th className="py-2.5 font-normal">Status mix</th>
                </tr>
              </thead>
              <tbody>
                {data.counsellors.map((c) => (
                  <tr key={c.userId} onClick={() => setFocus(focus === c.name ? null : c.name)}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${focus === c.name ? "bg-brand-light/30" : ""}`}>
                    <td className="py-2.5 font-medium text-[#232D42]">{c.name}</td>
                    <td className="py-2.5 text-right">{fmtInt(c.assigned)}</td>
                    <td className="py-2.5 text-right">
                      {c.conflicts > 0
                        ? <span className="inline-flex items-center gap-1 text-[#C0392B] font-medium"><IconUserOff size={13} />{c.conflicts}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 text-right">{c.untouched > 0 ? <span className="text-[#B7791F]">{c.untouched}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="py-2.5 text-right text-gray-500">{fmtInt(c.closed)}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {c.byStatus.slice(0, 4).map((s) => {
                          const t = statusTone(s.status);
                          return <span key={s.status} className="text-[11px] rounded-full px-2 py-0.5" style={{ background: t.bg, color: t.fg }}>{s.status} {s.count}</span>;
                        })}
                        {c.byStatus.length > 4 && <span className="text-[11px] text-gray-400">+{c.byStatus.length - 4}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm text-gray-400">{isLoading ? "Loading…" : "Nothing assigned in this range."}</div>}
      </div>

      {/* The lead list */}
      <div className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="text-sm font-medium text-[#232D42]">
            Assigned leads {focus && <span className="text-gray-400 font-normal">· {focus}</span>}
            <span className="text-gray-400 font-normal"> · {fmtInt(leads.length)}</span>
          </div>
          <button onClick={() => setConflictsOnly((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5 ${conflictsOnly ? "border-[#C0392B] text-[#C0392B] bg-red-50" : "border-gray-200 text-[#4A5468] hover:border-gray-300"}`}>
            <IconAlertTriangle size={13} /> Only leads that went to someone on leave
          </button>
        </div>
        {leads.length > 0 ? (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-left border-b border-gray-100 sticky top-0 bg-white">
                <tr>
                  <th className="py-2.5 font-normal">Lead</th>
                  <th className="py-2.5 font-normal">Interest</th>
                  <th className="py-2.5 font-normal">Counsellor</th>
                  <th className="py-2.5 font-normal">Status</th>
                  <th className="py-2.5 font-normal">Assigned</th>
                  <th className="py-2.5 font-normal text-right">Idle</th>
                  <th className="py-2.5 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 400).map((l) => {
                  const t = statusTone(l.status);
                  return (
                    <tr key={l.id} className={`border-b border-gray-50 hover:bg-gray-50 ${l.onLeaveConflict ? "bg-red-50/40" : ""}`}>
                      <td className="py-2.5">
                        <div className="font-medium text-[#232D42] max-w-[200px] truncate">{l.name}</div>
                        <div className="text-[11px] text-gray-400">{l.source}</div>
                      </td>
                      <td className="py-2.5 text-gray-600 max-w-[150px] truncate">{l.interest}</td>
                      <td className="py-2.5">
                        <span className="text-[#232D42]">{l.counsellor}</span>
                        {l.onLeaveConflict && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-[#C0392B] bg-red-100 rounded-full px-1.5 py-0.5" title="This counsellor was marked Absent on the day the lead landed">
                            <IconUserOff size={10} /> on leave
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className="text-[11px] rounded-full px-2 py-0.5" style={{ background: t.bg, color: t.fg }}>{l.status}</span>
                      </td>
                      <td className="py-2.5 text-gray-500 whitespace-nowrap">{l.assignedOn}</td>
                      <td className="py-2.5 text-right">
                        {l.daysUntouched > 7
                          ? <span className="text-[#C0392B] font-medium">{l.daysUntouched}d</span>
                          : <span className="text-gray-400">{l.daysUntouched}d</span>}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => setTrack(l)} title="See everything that happened to this lead"
                            className="text-xs inline-flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1 text-[#4A5468] hover:border-brand hover:text-brand whitespace-nowrap">
                            <IconTimeline size={13} /> Track
                          </button>
                          <button onClick={() => setReassign(l)} title="Revoke and hand to another counsellor"
                            className="text-xs inline-flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1 text-[#4A5468] hover:border-brand hover:text-brand whitespace-nowrap">
                            <IconArrowsExchange size={13} /> Reassign
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {leads.length > 400 && (
              <div className="text-xs text-gray-400 mt-3">
                Showing the first 400 of {fmtInt(leads.length)} — narrow the date range or pick a counsellor to see the rest.
              </div>
            )}
          </div>
        ) : <div className="text-sm text-gray-400">{isLoading ? "Loading…" : "No leads match."}</div>}
      </div>

      <div className="text-xs text-gray-400 mt-5 pt-3 border-t border-gray-100">
        <b className="text-[#3B4457] font-medium">On leave</b> cross-references Airtable&apos;s Attendance table — the counsellor was marked
        Absent on the day the lead arrived. Assignment date is the lead&apos;s created date, since the round-robin assigns on arrival.
        Reassigning raises a <b className="text-[#3B4457] font-medium">Pending</b> Transfer Ownership request; the lead moves once
        someone ticks Confirm Transfer in Airtable.
      </div>

      {reassign && data && (
        <ReassignModal lead={reassign} roster={data.roster} onClose={() => setReassign(null)} onDone={() => { setReassign(null); refresh(); }} />
      )}
      {track && <LeadTrackerModal lead={track} onClose={() => setTrack(null)} />}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "crit" | "warn" }) {
  const color = tone === "crit" ? "text-[#C0392B]" : tone === "warn" ? "text-[#B7791F]" : "text-[#232D42]";
  return (
    <div className="rounded-lg border border-gray-100 bg-[#FAFBFF] px-4 py-3">
      <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-medium mt-1 ${color}`}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>
    </div>
  );
}

function ReassignModal({ lead, roster, onClose, onDone }: {
  lead: AssignedLead; roster: RosterEntry[]; onClose: () => void; onDone: () => void;
}) {
  const [toUserId, setToUserId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<GateBlock | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ requestId: number | null } | null>(null);

  const options = roster.filter((r) => r.userId !== lead.counsellorUserId);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/leads-crm/transfer", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ leadId: lead.id, fromUserId: lead.counsellorUserId, toUserId, notes, leadName: lead.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const block = gateFromResponse(res.status, j, lead.name);
        if (block) setGate(block);
        else setErr((j as { error?: string }).error || `HTTP ${res.status}`);
        return;
      }
      setDone({ requestId: (j as { requestId: number | null }).requestId ?? null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto hope-scope" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg my-10 p-6" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <div className="flex items-center gap-2 text-[#1F7256] mb-2">
              <IconCircleCheck size={20} /><span className="text-lg font-medium">Transfer requested</span>
            </div>
            <p className="text-sm text-[#4A5468] leading-relaxed">
              Request {done.requestId != null && <b>#{done.requestId} </b>}is sitting in Airtable&apos;s
              <b> Transfer Ownership</b> table as <b>Pending</b>. <b>{lead.name}</b> stays with {lead.counsellor || "nobody"} until
              someone ticks <b>Confirm Transfer</b> there — that&apos;s what actually moves the lead.
            </p>
            <div className="flex justify-end mt-5">
              <button onClick={onDone} className="text-sm font-medium bg-brand text-white rounded-lg px-4 py-2">Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg font-medium text-[#232D42]">Revoke &amp; reassign</div>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              <b className="text-[#232D42]">{lead.name}</b> — currently with {lead.counsellor || "nobody"}
              {lead.onLeaveConflict && <span className="text-[#C0392B]"> · they were on leave the day it landed</span>}
            </p>

            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Reassign to <span className="text-rose-500">*</span></label>
            <select value={toUserId} onChange={(e) => setToUserId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white mb-4">
              <option value="">Pick a counsellor…</option>
              {options.map((r) => <option key={r.userId} value={r.userId}>{r.name}</option>)}
            </select>

            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Reason <span className="text-rose-500">*</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="e.g. Robin is on leave this week — Jeswin is free and can call today."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1" />
            <div className="text-xs text-gray-400 mb-4">Goes into Transfer Notes in Airtable, so whoever approves it sees why.</div>

            {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}

            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Cancel</button>
              <button onClick={submit} disabled={busy}
                className="text-sm font-medium bg-brand text-white rounded-lg px-4 py-2 disabled:opacity-50">
                {busy ? "Requesting…" : "Request transfer"}
              </button>
            </div>
          </>
        )}
        {gate && <div onClick={(e) => e.stopPropagation()}><MissingFieldsModal {...gate} onClose={() => setGate(null)} /></div>}
      </div>
    </div>
  );
}

type TrackPayload = {
  lead: Record<string, unknown> & { name: string; status: string; counsellor: string };
  changes: { date: string; field: "status" | "counsellor"; from: string; to: string }[];
  meetings: { title: string; when: string; status: string; counsellor: string; rating: number | null; summary: string; notes: string }[];
  trackedSince: string | null;
  snapshotDays: number;
};

function LeadTrackerModal({ lead, onClose }: { lead: AssignedLead; onClose: () => void }) {
  const { data, isLoading, error } = useApi<TrackPayload>(`/api/leads-crm/lead-track?id=${encodeURIComponent(lead.id)}`);
  const l = data?.lead as (TrackPayload["lead"] & Record<string, string | number | boolean>) | undefined;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto hope-scope" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-lg font-medium text-[#232D42] truncate">{lead.name}</div>
            <div className="text-sm text-gray-500 mt-0.5">{lead.interest} · {lead.source} · with {lead.counsellor || "nobody"}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Couldn&apos;t load — {(error as Error).message}</div>}
          {isLoading && <div className="text-sm text-gray-400">Loading…</div>}

          {data && l && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <Mini label="Stage now" value={String(l.status)} />
                <Mini label="Idle" value={`${l.daysUntouched}d`} tone={Number(l.daysUntouched) > 7 ? "crit" : undefined} />
                <Mini label="Call attempts" value={String(l.callAttempts ?? 0)} />
                <Mini label="Arrived" value={String(l.createdAt || "").slice(0, 10)} />
              </div>

              <div className="text-sm font-medium text-[#232D42] mb-2">What happened</div>
              {data.changes.length > 0 ? (
                <ol className="relative border-l border-gray-200 ml-1.5 mb-6">
                  {data.changes.map((c, i) => (
                    <li key={i} className="ml-4 pb-3.5">
                      <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-brand" />
                      <div className="text-xs text-gray-400">{c.date}</div>
                      <div className="text-sm text-[#232D42]">
                        {c.field === "status" ? "Stage" : "Counsellor"}{" "}
                        <span className="text-gray-500">{c.from || "—"}</span> → <b>{c.to || "—"}</b>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="text-sm text-gray-400 mb-6">
                  {data.snapshotDays === 0
                    ? "No history yet — the nightly tracker hasn't recorded this lead. It starts building from its first run."
                    : `No stage changes recorded since ${data.trackedSince}. It has sat in "${l.status}" the whole time.`}
                </div>
              )}

              <div className="text-sm font-medium text-[#232D42] mb-2">Meetings</div>
              {data.meetings.length > 0 ? (
                <div className="flex flex-col gap-2 mb-4">
                  {data.meetings.map((m, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-sm text-[#232D42]">{m.title || "Meeting"}</div>
                        <div className="text-xs text-gray-400 inline-flex items-center gap-1"><IconClock size={12} />{(m.when || "").replace("T", " ").slice(0, 16)}</div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {m.counsellor}{m.status ? ` · ${m.status}` : ""}{m.rating ? ` · rated ${m.rating}/5` : ""}
                      </div>
                      {m.summary && <div className="text-xs text-[#4A5468] mt-2 leading-relaxed whitespace-pre-wrap">{m.summary.slice(0, 600)}</div>}
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm text-gray-400 mb-4">No meetings logged on this lead.</div>}

              {data.trackedSince && (
                <div className="text-xs text-gray-400 pt-3 border-t border-gray-100">
                  Tracked nightly since {data.trackedSince} · {data.snapshotDays} day{data.snapshotDays === 1 ? "" : "s"} recorded.
                  Anything before that predates the tracker.
                </div>
              )}
              {typeof l.link === "string" && l.link && (
                <a href={l.link} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline mt-2 inline-block">Open in Airtable →</a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "crit" }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-[#FAFBFF] px-3 py-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-medium mt-0.5 ${tone === "crit" ? "text-[#C0392B]" : "text-[#232D42]"}`}>{value}</div>
    </div>
  );
}
