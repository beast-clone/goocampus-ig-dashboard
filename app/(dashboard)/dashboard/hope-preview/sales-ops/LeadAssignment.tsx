"use client";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import MissingFieldsModal, { gateFromResponse, type GateBlock } from "../MissingFieldsModal";
import {
  IconRefresh, IconArrowsExchange, IconTimeline, IconChevronLeft,
  IconCircleCheck, IconAlertTriangle, IconStarFilled, IconStar,
} from "@tabler/icons-react";

// Sales Hub → Leads per day.
//
// Three levels, each answering the next question down:
//   1. how many leads arrived each day, and who got them
//   2. which leads arrived that day            (click a row)
//   3. what happened to one of them, or move it (click Track / Reassign)
//
// Deliberately NOT on screen at level 1: charts, per-counsellor summaries, and a
// flat list of every lead. The in-row bar carries the shape of the week, and the
// counsellor split is just columns — an earlier version showed all three at once
// and was unreadable.

type BoardRow = { key: string; label: string; dow: string; total: number; by: Record<string, number>; cold: number };
type BoardLead = {
  id: string; name: string; source: string; interest: string; counsellor: string;
  counsellorUserId: string; status: string; day: string; date: string;
  daysUntouched: number; cold: boolean; link: string;
};
type RosterEntry = { name: string; userId: string; email: string; label: string; inRoster: boolean };
type Board = {
  range: { from: string; to: string };
  bucket: "day" | "week" | "month";
  counsellors: string[];
  rows: BoardRow[];
  totals: { total: number; by: Record<string, number>; cold: number };
  roster: RosterEntry[];
  leads: BoardLead[];
};

const fmtInt = (n: number) => n.toLocaleString("en-IN");
const BUCKETS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
] as const;

export function LeadAssignment({ range }: { range: { from: string; to: string } }) {
  const [bucket, setBucket] = useState<"day" | "week" | "month">("day");
  const [openDay, setOpenDay] = useState<BoardRow | null>(null);
  const [track, setTrack] = useState<BoardLead | null>(null);
  const [reassign, setReassign] = useState<BoardLead | null>(null);

  const qs = new URLSearchParams({ from: range.from, to: range.to, bucket }).toString();
  const { data, isLoading, error, refresh } = useApi<Board>(`/api/leads-crm/assignments?${qs}`);

  const peak = useMemo(() => Math.max(1, ...(data?.rows || []).map((r) => r.total)), [data]);
  const dayLeads = useMemo(
    () => (openDay ? (data?.leads || []).filter((l) => l.day === openDay.key) : []),
    [data, openDay],
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {openDay && (
            <button onClick={() => setOpenDay(null)}
              className="text-[13px] text-brand hover:underline inline-flex items-center gap-0.5 flex-shrink-0">
              <IconChevronLeft size={15} /> Back
            </button>
          )}
          <div className="min-w-0">
            <div className="text-base font-medium text-[#232D42]">
              {openDay ? openDay.label : "Leads per day"}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              {openDay
                ? `${fmtInt(dayLeads.length)} lead${dayLeads.length === 1 ? "" : "s"} · click Track to see a lead's history`
                : "How many came in, and who they went to."}
            </div>
          </div>
        </div>

        {!openDay && (
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              {BUCKETS.map((b) => (
                <button key={b.key} onClick={() => setBucket(b.key)}
                  className={`text-xs px-3 py-1.5 ${bucket === b.key ? "bg-brand text-white" : "text-[#4A5468] hover:bg-gray-50"}`}>
                  {b.label}
                </button>
              ))}
            </div>
            <button onClick={() => refresh()} title="Refresh"
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-[#4A5468] hover:border-gray-300 inline-flex items-center gap-1">
              <IconRefresh size={13} /> Refresh
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Couldn&apos;t load the board — {(error as Error).message}
        </div>
      )}

      {/* ── LEVEL 1 · leads per bucket ───────────────────────────── */}
      {!openDay && (
        <>
          <div className="overflow-x-auto mt-5">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="py-2.5 pr-4 font-normal text-left text-[11px] uppercase tracking-wide">Date</th>
                  <th className="py-2.5 px-4 font-normal text-right text-[11px] uppercase tracking-wide">Leads</th>
                  {(data?.counsellors || []).map((c) => (
                    <th key={c} className="py-2.5 px-4 font-normal text-right text-[11px] uppercase tracking-wide whitespace-nowrap">
                      {c.split(" ")[0]}
                    </th>
                  ))}
                  <th className="py-2.5 pl-4 font-normal text-right text-[11px] uppercase tracking-wide whitespace-nowrap">Gone cold</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows || []).map((r) => (
                  <tr key={r.key} onClick={() => setOpenDay(r)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {r.dow && <span className="text-gray-300 mr-1.5">{r.dow}</span>}
                      <span className="font-medium text-[#232D42]">{r.label}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      {/* The bar lives in the row — this is what replaces a separate chart. */}
                      <div className="flex items-center justify-end gap-2.5">
                        <b className="font-semibold text-[#232D42]">{r.total}</b>
                        <span className="w-[120px] h-[7px] rounded-full bg-gray-100 overflow-hidden hidden sm:block">
                          <span className="block h-full rounded-full"
                            style={{ width: `${(r.total / peak) * 100}%`, background: r.total === peak ? "#3A57E8" : "#C7D2F7" }} />
                        </span>
                      </div>
                    </td>
                    {(data?.counsellors || []).map((c) => (
                      <td key={c} className="py-2.5 px-4 text-right">
                        {r.by[c] ? <span className="text-[#232D42]">{r.by[c]}</span> : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="py-2.5 pl-4 text-right">
                      {r.cold ? <span className="text-[#B7791F] font-medium">{r.cold}</span> : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {!isLoading && (data?.rows || []).length === 0 && (
                  <tr><td colSpan={3 + (data?.counsellors.length || 0)} className="py-10 text-center text-gray-400">No leads in this range.</td></tr>
                )}
                {isLoading && !data && (
                  <tr><td colSpan={4} className="py-10 text-center text-gray-400">Loading…</td></tr>
                )}
              </tbody>
              {data && data.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-100 font-semibold text-[#232D42]">
                    <td className="py-3 pr-4">{fmtInt(data.rows.length)} {bucket === "day" ? "days" : bucket === "week" ? "weeks" : "months"}</td>
                    <td className="py-3 px-4 text-right">{fmtInt(data.totals.total)}</td>
                    {data.counsellors.map((c) => (
                      <td key={c} className="py-3 px-4 text-right">{fmtInt(data.totals.by[c] || 0)}</td>
                    ))}
                    <td className="py-3 pl-4 text-right">{fmtInt(data.totals.cold)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
            Click any row to see that {bucket === "day" ? "day" : bucket === "week" ? "week" : "month"}&apos;s leads.
            <b className="text-[#3B4457] font-medium"> Gone cold</b> = no CRM activity in over 7 days.
            A lead counts on the day it arrived, in IST.
          </div>
        </>
      )}

      {/* ── LEVEL 2 · one bucket's leads ─────────────────────────── */}
      {openDay && (
        <div className="mt-5">
          {dayLeads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="py-2.5 pr-4 font-normal text-left text-[11px] uppercase tracking-wide">Lead</th>
                    <th className="py-2.5 px-4 font-normal text-left text-[11px] uppercase tracking-wide">Interest</th>
                    <th className="py-2.5 px-4 font-normal text-left text-[11px] uppercase tracking-wide">Counsellor</th>
                    <th className="py-2.5 px-4 font-normal text-left text-[11px] uppercase tracking-wide">Stage</th>
                    <th className="py-2.5 pl-4 font-normal text-right text-[11px] uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dayLeads.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-[#232D42] max-w-[220px] truncate">{l.name}</div>
                        <div className="text-[11px] text-gray-400">{l.source}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[11px] rounded-full px-2 py-0.5 ${l.cold ? "bg-amber-50 text-amber-700" : "bg-brand-light text-[#2138B0]"}`}>
                          {l.interest}{l.cold ? ` · cold ${l.daysUntouched}d` : ""}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-gray-500">{l.counsellor || <span className="text-gray-300">Unassigned</span>}</td>
                      <td className="py-2.5 px-4 text-gray-500">{l.status}</td>
                      <td className="py-2.5 pl-4">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => setTrack(l)} title="See everything that happened to this lead"
                            className="text-xs inline-flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1 text-[#4A5468] hover:border-brand hover:text-brand whitespace-nowrap">
                            <IconTimeline size={13} /> Track
                          </button>
                          <button onClick={() => setReassign(l)} title="Hand this lead to another counsellor"
                            className="text-xs inline-flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1 text-[#4A5468] hover:border-brand hover:text-brand whitespace-nowrap">
                            <IconArrowsExchange size={13} /> Reassign
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="text-sm text-gray-400 py-8 text-center">No leads on this day.</div>}
        </div>
      )}

      {track && <LeadTracker lead={track} onClose={() => setTrack(null)} onReassign={() => { setReassign(track); setTrack(null); }} />}
      {reassign && data && (
        <ReassignModal lead={reassign} roster={data.roster} onClose={() => setReassign(null)} onDone={() => { setReassign(null); refresh(); }} />
      )}
    </div>
  );
}

/* ── LEVEL 3a · the tracker ────────────────────────────────────── */

type TrackPayload = {
  lead: Record<string, unknown> & { name: string; status: string; counsellor: string };
  changes: { date: string; field: "status" | "counsellor"; from: string; to: string }[];
  meetings: { title: string; when: string; status: string; counsellor: string; rating: number | null; summary: string; notes: string }[];
  trackedSince: string | null;
  snapshotDays: number;
};

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[#B7791F]" title={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) =>
        i <= n ? <IconStarFilled key={i} size={12} /> : <IconStar key={i} size={12} className="text-gray-300" />)}
    </span>
  );
}

function LeadTracker({ lead, onClose, onReassign }: { lead: BoardLead; onClose: () => void; onReassign: () => void }) {
  const { data, isLoading, error } = useApi<TrackPayload>(`/api/leads-crm/lead-track?id=${encodeURIComponent(lead.id)}`);
  const l = data?.lead as (TrackPayload["lead"] & Record<string, string | number | boolean>) | undefined;
  const topRating = data?.meetings.find((m) => m.rating)?.rating ?? null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto hope-scope" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-lg font-medium text-[#232D42] truncate">{lead.name}</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {lead.interest} · {lead.source} · with {lead.counsellor || "nobody"}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onReassign}
              className="text-xs font-medium bg-brand text-white rounded-lg px-3 py-1.5 inline-flex items-center gap-1">
              <IconArrowsExchange size={13} /> Reassign
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="max-h-[72vh] overflow-y-auto">
          {error && <div className="m-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Couldn&apos;t load — {(error as Error).message}</div>}
          {isLoading && !data && <div className="p-6 text-sm text-gray-400">Loading…</div>}

          {data && l && (
            <div className="grid grid-cols-1 md:grid-cols-[1.25fr_1fr]">
              <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
                  <Mini label="Stage now" value={String(l.status)} />
                  <Mini label="Idle" value={`${l.daysUntouched}d`} tone={Number(l.daysUntouched) > 7 ? "warn" : undefined} />
                  <Mini label="Call attempts" value={String(l.callAttempts ?? 0)} />
                  <Mini label="Quality" node={topRating ? <Stars n={topRating} /> : <span className="text-gray-300 text-sm">not rated</span>} />
                </div>

                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-3">What happened</div>
                {data.changes.length > 0 ? (
                  <ol className="relative border-l border-gray-200 ml-1">
                    {data.changes.map((c, i) => (
                      <li key={i} className="ml-4 pb-4">
                        <span className={`absolute -left-[4.5px] w-2 h-2 rounded-full ring-2 ring-white ${i === 0 ? "bg-[#1F7256]" : "bg-brand"}`} />
                        <div className="text-[11px] text-gray-400 tabular-nums">{c.date}</div>
                        <div className="text-[13px] text-[#232D42]">
                          {c.field === "status" ? "Stage" : "Counsellor"}{" "}
                          <span className="text-gray-500">{c.from || "—"}</span> → <b className="font-semibold">{c.to || "—"}</b>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="text-sm text-gray-400">
                    {data.snapshotDays === 0
                      ? "No history yet — the nightly tracker hasn't recorded this lead. It builds from its first run."
                      : `No stage changes since ${data.trackedSince}. It has sat in "${l.status}" the whole time.`}
                  </div>
                )}
              </div>

              <div className="p-6 md:border-l border-gray-100">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-3">Meetings</div>
                {data.meetings.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    {data.meetings.map((m, i) => (
                      <div key={i} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <div className="text-[13px] font-medium text-[#232D42]">{m.title || "Meeting"}</div>
                          <div className="text-[11px] text-gray-400 tabular-nums">{(m.when || "").replace("T", " ").slice(0, 16)}</div>
                        </div>
                        <div className="text-[11.5px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{m.counsellor}{m.status ? ` · ${m.status}` : ""}</span>
                          {m.rating ? <Stars n={m.rating} /> : null}
                        </div>
                        {m.summary && <div className="text-[12.5px] text-[#4A5468] mt-2 leading-relaxed whitespace-pre-wrap">{m.summary.slice(0, 700)}</div>}
                      </div>
                    ))}
                  </div>
                ) : <div className="text-sm text-gray-400">No meetings logged on this lead.</div>}

                <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg p-3 mt-4 leading-relaxed">
                  Stage history comes from a snapshot taken <b className="text-[#3B4457] font-medium">once a day</b>.
                  Airtable only stores a lead&apos;s current stage, so history starts building the day the job is
                  switched on — nothing before that can be recovered.
                  {data.trackedSince && <> Tracked since <b className="text-[#3B4457] font-medium">{data.trackedSince}</b>.</>}
                </div>

                {typeof l.link === "string" && l.link && (
                  <a href={l.link} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline mt-3 inline-block">Open in Airtable →</a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, node, tone }: { label: string; value?: string; node?: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-gray-100 px-3 py-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-[15px] font-semibold mt-0.5 ${tone === "warn" ? "text-[#B7791F]" : "text-[#232D42]"}`}>
        {node ?? value}
      </div>
    </div>
  );
}

/* ── LEVEL 3b · reassign ───────────────────────────────────────── */

function ReassignModal({ lead, roster, onClose, onDone }: {
  lead: BoardLead; roster: RosterEntry[]; onClose: () => void; onDone: () => void;
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
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center p-6 overflow-y-auto hope-scope" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg my-10 p-6" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <div className="flex items-center gap-2 text-[#1F7256] mb-2">
              <IconCircleCheck size={20} /><span className="text-lg font-medium">Reassignment requested</span>
            </div>
            <p className="text-sm text-[#4A5468] leading-relaxed">
              Request {done.requestId != null && <b>#{done.requestId} </b>}is in Airtable&apos;s
              <b> Transfer Ownership</b> table. The n8n workflow <b>Transfer Ownership on CRM</b> checks it every
              20 minutes and moves <b>{lead.name}</b> from {lead.counsellor || "nobody"} once the row qualifies.
            </p>
            <div className="flex justify-end mt-5">
              <button onClick={onDone} className="text-sm font-medium bg-brand text-white rounded-lg px-4 py-2">Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg font-medium text-[#232D42]">Reassign {lead.name}</div>
            <p className="text-sm text-gray-500 mt-1 mb-4">currently with {lead.counsellor || "nobody"}</p>

            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Move to <span className="text-rose-500">*</span></label>
            <select value={toUserId} onChange={(e) => setToUserId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white mb-4">
              <option value="">Pick a counsellor…</option>
              {options.map((r) => (
                <option key={r.userId} value={r.userId}>
                  {r.name}{r.inRoster ? "" : " (not on the Counsellors list)"}
                </option>
              ))}
            </select>

            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Reason <span className="text-rose-500">*</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="e.g. Jeswin is on leave this week — Robin can call her today."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1" />
            <div className="text-xs text-gray-400 mb-4">Goes into Transfer Notes in Airtable, so whoever reviews it sees why.</div>

            {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}

            {/* The n8n workflow reads an Airtable view whose filter can't be read via the
                API, so we can't promise the tickbox gates it. Say so rather than imply. */}
            <div className="flex items-start gap-2 text-[12px] text-[#8A6D1F] bg-[#FEF6E7] border border-[#F5D89B] rounded-lg px-3 py-2.5 mb-4 leading-relaxed">
              <IconAlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>
                This writes a request that <b>n8n picks up within 20 minutes</b>. Whether it waits for the
                <b> Confirm Transfer</b> tickbox depends on the <b>Transfer Pending</b> view&apos;s filter in Airtable —
                treat it as live until that&apos;s confirmed.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Cancel</button>
              <button onClick={submit} disabled={busy}
                className="text-sm font-medium bg-brand text-white rounded-lg px-4 py-2 disabled:opacity-50">
                {busy ? "Requesting…" : "Reassign"}
              </button>
            </div>
          </>
        )}
        {gate && <div onClick={(e) => e.stopPropagation()}><MissingFieldsModal {...gate} onClose={() => setGate(null)} /></div>}
      </div>
    </div>
  );
}
