"use client";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconSearch, IconUsers, IconMessageCircle, IconCalendarEvent, IconLayoutGrid, IconExternalLink, IconX, type Icon } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { DM_SOURCES, TALKING, isWarm } from "@/lib/lead-channel";
import { fmtDateShort } from "@/lib/date";

// Marketing Leads (docs/MARKETING_LEADS_SPEC.md) — DM leads only: the non-paid leads who reached
// us through Instagram/Facebook DMs or the DM booking form. Paid leads live in Campaigns.
// Leads come live from /api/leads-crm/counsellor (same data + "contacted" rule as Sales Hub).

const fmt = (n: number) => (n ?? 0).toLocaleString("en-IN");
const fmtWhen = (s: string) => fmtDateShort(s, s || "—");
// "28 Oct, 5:30 pm" in IST — CRM Created Date carries the time.
const fmtWhenTime = (s: string) => { const d = new Date(s); return isNaN(+d) ? (s || "—") : d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }); };
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  "New": { bg: "#E1F0FB", fg: "#0C447C" },
  "Junk lead": { bg: "#FBE4EC", fg: "#C03221" },
  "Initial discussions": { bg: "#E3F5EA", fg: "#137A3E" },
  "Bookings": { bg: "#FEF3E2", fg: "#B7791F" },
  "Hot lead": { bg: "#FDE7DA", fg: "#C05621" },
  "SQL": { bg: "#EFEBFE", fg: "#6E48F8" },
  "Interested": { bg: "#DBF3EF", fg: "#0E7C6E" },
  "Attempted to contact": { bg: "#F0F2F8", fg: "#5A6273" },
  "Re-Enquiry": { bg: "#E4F4FD", fg: "#0B84C4" },
  "Contract stage": { bg: "#E9ECFB", fg: "#2138B0" },
  "Closed won": { bg: "#CDEED9", fg: "#0F6B36" },
  "Not interested": { bg: "#F0F2F8", fg: "#8A92A6" },
};
const stStyle = (s: string) => { const c = STATUS_STYLE[s] || { bg: "#F0F2F8", fg: "#8A92A6" }; return { background: c.bg, color: c.fg }; };

export default function LeadsPage() {
  return (
    <PreviewDashboardShell active="leads" title="Marketing Leads" subtitle="DM leads — people who reached us through Instagram/Facebook DMs or the DM booking form, and who has been contacted. Paid leads are in Campaigns." hideAccountPicker hideRange>
      {() => <MarketingLeads />}
    </PreviewDashboardShell>
  );
}

type Lead = { id: string; name: string; source: string; status: string; interest: string; campaign: string; createdAt: string; daysUntouched: number | null; linkToRecord: string; counsellor: string; callAttempts: number; contacted: boolean };
type SourceKey = (typeof DM_SOURCES)[number]["key"];
const INK = "text-[#232D42]", MUTED = "text-[#8A92A6]";
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const SRC_ICON: Record<SourceKey, Icon> = { dm: IconMessageCircle, booking: IconCalendarEvent };
const srcOf = (source: string) => DM_SOURCES.find((s) => s.source === source);
const srcInfo = (k: SourceKey) => DM_SOURCES.find((s) => s.key === k)!;

function MarketingLeads() {
  const [days, setDays] = useState<number | "custom">(30);
  const today = ymd(new Date());
  const [cFrom, setCFrom] = useState(ymd(new Date(Date.now() - 30 * 86_400_000)));
  const [cTo, setCTo] = useState(today);
  const from = days === "custom" ? cFrom : ymd(new Date(Date.now() - days * 86_400_000));
  const to = days === "custom" ? cTo : today;

  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [src, setSrc] = useState<SourceKey | "all">("all");
  const [contactF, setContactF] = useState<"all" | "no" | "yes">("all");
  const [q, setQ] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLeads(null); setErr(null);
    try {
      const r = await fetch(`/api/leads-crm/counsellor?name=all&from=${from}&to=${to}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setLeads(j.leads || []);
    } catch (e) { setErr((e as Error).message); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  // DM leads only — every other CRM source is paid or not a DM.
  const rows = useMemo(() => (leads || []).flatMap((l) => { const s = srcOf(l.source); return s ? [{ ...l, src: s.key as SourceKey }] : []; }), [leads]);
  type Row = (typeof rows)[number];
  const notC = (ls: Row[]) => ls.filter((l) => !l.contacted).length;
  const sel = rows.filter((l) => src === "all" || l.src === src);
  const cN = sel.filter((l) => l.contacted).length;
  const title = src === "all" ? "All DM leads" : srcInfo(src).label;
  const shown = sel
    .filter((l) => (contactF === "all" || (contactF === "yes") === l.contacted) && (!q || `${l.name} ${l.status} ${l.counsellor} ${l.interest}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const lead = leadId ? rows.find((l) => l.id === leadId) : undefined;

  const dateBox = (v: string, set: (s: string) => void) => (
    <input type="date" value={v} max={today} onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* opens natively */ } }}
      onChange={(e) => e.target.value && set(e.target.value)}
      className={`h-10 border border-gray-100 rounded-lg px-3 text-[14px] ${INK} bg-white cursor-pointer`} />
  );

  return (
    <div className="preview-scope space-y-5">
      {/* period */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex border border-gray-100 rounded-lg overflow-hidden bg-white">
          {([7, 30, 90, "custom"] as const).map((d) => (
            <button key={d} onClick={() => { setDays(d); setLeadId(null); }}
              className={`h-10 px-[18px] text-[14px] font-medium ${days === d ? "bg-brand-light text-brand" : "text-[#4A5468] hover:text-brand"}`}>{d === "custom" ? "Custom" : `${d}d`}</button>
          ))}
        </div>
        {days === "custom" && <span className="inline-flex items-center gap-2">{dateBox(cFrom, (v) => { setCFrom(v); if (v > cTo) setCTo(v); })}<span className={MUTED}>to</span>{dateBox(cTo, (v) => { setCTo(v); if (v < cFrom) setCFrom(v); })}</span>}
        <span className={`ml-auto text-[13px] ${MUTED}`}>{fmtWhen(from)} – {fmtWhen(to)} · by lead created date</span>
      </div>

      {err ? <div className="bg-white border border-gray-100 rounded-2xl px-6 py-10 text-center text-[14px] text-[#8A92A6]">Couldn&apos;t load leads: {err} <button onClick={load} className="text-brand font-medium">Try again</button></div> : (
      <div className="grid gap-5 items-start grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* left — how the DM lead came in */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className={`px-[22px] pt-5 pb-3 text-[17px] font-medium ${INK}`}>DM leads</div>
          <div className="px-3 pb-3.5">
            {!leads ? <LoadingBlock /> : (<>
              <NavItem on={src === "all"} onClick={() => { setSrc("all"); setLeadId(null); }} icon={IconUsers} color="#3A57E8" name="All DM leads" sub={notCSub(notC(rows))} count={rows.length} />
              {DM_SOURCES.map((s) => { const ls = rows.filter((l) => l.src === s.key); return (
                <NavItem key={s.key} on={src === s.key} onClick={() => { setSrc(s.key); setLeadId(null); }} icon={SRC_ICON[s.key]} color={s.color} name={s.label} sub={notCSub(notC(ls))} count={ls.length} />
              ); })}
            </>)}
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          {/* the selection: name and numbers */}
          <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
            <div className={`text-[20px] font-medium ${INK}`}>{title}</div>
            <div className={`text-[13px] ${MUTED}`}>{leads ? `${fmt(sel.length)} leads` : "Loading…"}</div>
            <SummaryCards sel={sel} />
          </div>

          {/* the leads */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-center gap-3 flex-wrap">
              <div className={`text-[16px] font-medium ${INK} mr-auto`}>Leads <span className={`text-[13px] font-normal ${MUTED}`}>· newest first · click one for details</span></div>
              <div className="flex items-center gap-2 border border-gray-100 rounded-xl px-3 h-10 w-[260px]">
                <IconSearch size={16} className="text-[#8A92A6] shrink-0" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, status, counsellor…" className={`flex-1 min-w-0 outline-none text-[14px] ${INK} bg-transparent`} />
              </div>
              <div className="inline-flex border border-gray-100 rounded-lg overflow-hidden">
                {([["all", "All", sel.length], ["no", "Not yet", sel.length - cN], ["yes", "Contacted", cN]] as const).map(([k, lbl, n]) => (
                  <button key={k} onClick={() => setContactF(k)}
                    className={`h-10 px-4 text-[13.5px] font-medium whitespace-nowrap ${contactF === k ? "bg-brand-light text-brand" : "bg-white text-[#4A5468] hover:text-brand"}`}>
                    {lbl} <span className={`font-normal ${contactF === k ? "" : MUTED}`}>{fmt(n)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-auto border-t border-gray-100" style={{ maxHeight: "max(480px, calc(100vh - 420px))" }}>
              {!leads ? <LoadingBlock /> : shown.length === 0 ? <div className={`py-10 text-center text-[14px] ${MUTED}`}>No leads here.</div> : (
                <table className="w-full min-w-[600px] text-[14px]">
                  <thead className="sticky top-0 bg-white z-[1]"><tr className={`text-left text-[12.5px] ${MUTED}`}>
                    {["Person", "Status", "Contacted", "Assigned to", "When"].map((h) => <th key={h} className="font-normal px-4 py-3 border-b border-gray-100 whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {shown.map((l) => (
                      <tr key={l.id} onClick={() => setLeadId(l.id)} className="cursor-pointer hover:bg-[#FAFBFD] border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3.5 max-w-[220px]"><div className={`font-medium ${INK} truncate`}>{l.name || "—"}</div><div className={`text-[12.5px] ${MUTED} truncate`}>{l.interest || "No interest set"}</div></td>
                        <td className="px-4 py-3.5"><span className="inline-block text-[12px] font-medium rounded-full px-2.5 py-0.5 leading-snug" style={stStyle(l.status)}>{l.status || "—"}</span></td>
                        <td className="px-4 py-3.5 whitespace-nowrap"><ContactedDot on={l.contacted} /></td>
                        <td className="px-4 py-3.5 text-[#4A5468]">{l.counsellor}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap"><div className="text-[#4A5468]">{fmtWhenTime(l.createdAt)}</div><div className={`text-[12.5px] ${MUTED}`}>{srcInfo(l.src).short}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className={`grid gap-5 items-start ${src === "all" ? "lg:grid-cols-2" : ""}`}>
            {src === "all" && <Sources sel={sel} />}
            <FollowUp sel={sel} />
          </div>
        </div>
      </div>
      )}

      {lead && (
        <div className="fixed inset-0 z-50 bg-[#232D42]/40 flex items-center justify-center p-4" onClick={() => setLeadId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-auto px-7 py-6" onClick={(e) => e.stopPropagation()}>
            <LeadDetail l={lead} via={srcInfo(lead.src).label} onClose={() => setLeadId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

const notCSub = (n: number) => (n ? <><b className="font-medium text-[#C0201F]">{fmt(n)}</b> not contacted</> : <>all contacted</>);

function NavItem({ on, onClick, icon: I, color, name, sub, count }: { on: boolean; onClick: () => void; icon: Icon; color: string; name: string; sub?: ReactNode; count?: number }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 text-left px-2.5 py-[11px] rounded-xl mb-0.5 ${on ? "bg-brand-light" : "hover:bg-[#FAFBFD]"}`}>
      <span className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style={{ background: `${color}1F`, color }}><I size={18} stroke={1.8} /></span>
      <span className="flex-1 min-w-0">
        <span className={`block truncate text-[14.5px] font-medium ${INK}`}>{name}</span>
        {sub && <span className={`block truncate text-[12.5px] ${MUTED} mt-px`}>{sub}</span>}
      </span>
      {count != null && <span className={`shrink-0 min-w-[32px] h-[26px] px-2 rounded-full grid place-items-center text-[13px] font-medium ${on ? "bg-white text-brand" : "bg-[#F0F2F8] text-[#4A5468]"}`}>{fmt(count)}</span>}
    </button>
  );
}

type SelLead = { contacted: boolean; status: string; counsellor: string; src: SourceKey };
const ContactedDot = ({ on }: { on: boolean }) => (
  <span className={`inline-flex items-center gap-1.5 font-medium ${on ? "text-[#137A3E]" : MUTED}`}>
    <span className="w-2 h-2 rounded-full" style={{ background: on ? "#1AA053" : "#C6CBD6" }} />{on ? "Contacted" : "Not yet"}
  </span>
);
const CardHead = ({ icon: I, t, sub }: { icon: Icon; t: string; sub?: string }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="w-9 h-9 rounded-[10px] bg-brand-light text-brand grid place-items-center shrink-0"><I size={18} stroke={1.8} /></span>
    <div><div className={`text-[16px] font-medium ${INK}`}>{t}</div>{sub && <div className={`text-[13px] ${MUTED}`}>{sub}</div>}</div>
  </div>
);

function SummaryCards({ sel }: { sel: SelLead[] }) {
  const cN = sel.filter((l) => l.contacted).length;
  const card = (l: string, v: ReactNode, s: string) => (
    <div className="border border-gray-100 rounded-[14px] px-5 py-4">
      <div className={`text-[13px] ${MUTED}`}>{l}</div><div className={`text-[28px] font-medium ${INK} mt-1 leading-tight`}>{v}</div><div className={`text-[12.5px] ${MUTED} mt-0.5`}>{s}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
      {card("DM leads", fmt(sel.length), "contact shared in a DM")}
      {card("Contacted", `${pctOf(cN, sel.length)}%`, `${fmt(cN)} of ${fmt(sel.length)}`)}
      {card("Not contacted yet", <span className="text-[#C0201F]">{fmt(sel.length - cN)}</span>, "no call, note or status change")}
      {card("Hot & interested", fmt(sel.filter((l) => isWarm(l.status)).length), "Hot lead + Interested")}
    </div>
  );
}

function Sources({ sel }: { sel: SelLead[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
      <CardHead icon={IconLayoutGrid} t="How they reached us" sub="DM or the DM booking form" />
      {sel.length === 0 ? <div className={`text-[14px] ${MUTED}`}>No leads.</div> : (<>
        <div className="flex h-3 rounded-full overflow-hidden bg-[#EEF0F4]">
          {DM_SOURCES.map((s) => { const n = sel.filter((l) => l.src === s.key).length; return n ? <i key={s.key} style={{ width: `${(n / sel.length) * 100}%`, background: s.color }} /> : null; })}
        </div>
        <div className="mt-4 space-y-2.5">
          {DM_SOURCES.map((s) => { const n = sel.filter((l) => l.src === s.key).length; return (
            <div key={s.key} className="flex items-center gap-2.5 text-[14px]"><i className="w-[10px] h-[10px] rounded-[3px] inline-block" style={{ background: s.color }} /><span className={INK}>{s.label}</span><span className={`ml-auto ${MUTED}`}>{fmt(n)} · {pctOf(n, sel.length)}%</span></div>
          ); })}
        </div>
      </>)}
    </div>
  );
}

function FollowUp({ sel }: { sel: SelLead[] }) {
  const fu = new Map<string, { n: number; c: number; na: number; t: number }>();
  for (const l of sel) {
    const k = l.counsellor || "Unassigned", x = fu.get(k) || { n: 0, c: 0, na: 0, t: 0 };
    x.n++; if (l.contacted) x.c++;
    if (/^attempted to contact$/i.test(l.status)) x.na++; else if (TALKING.has(l.status)) x.t++;
    fu.set(k, x);
  }
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
      <CardHead icon={IconUsers} t="Follow-up by counsellor" sub="share contacted" />
      {[...fu.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, x]) => {
        const p = pctOf(x.c, x.n);
        return (
          <div key={k} className="py-3 border-t border-gray-100 first-of-type:border-t-0">
            <div className="flex items-center"><span className={`text-[14px] font-medium ${INK}`}>{k}</span><span className={`ml-auto text-[14px] font-medium ${INK}`}>{p}% <span className={`text-[11px] font-normal ${MUTED}`}>contacted</span></span></div>
            <div className="h-1.5 rounded-full bg-[#EEF0F4] my-2 overflow-hidden"><span className="block h-full rounded-full bg-brand" style={{ width: `${p}%` }} /></div>
            <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[13px] ${MUTED}`}><span>{x.n} assigned</span><span><b className="font-medium text-[#C0201F]">{x.n - x.c}</b> not contacted</span><span>{x.na} no answer</span><span>{x.t} talking</span></div>
          </div>
        );
      })}
      {sel.length === 0 && <div className={`text-[14px] ${MUTED}`}>No leads.</div>}
    </div>
  );
}

function LeadDetail({ l, via, onClose }: { l: Lead; via: string; onClose: () => void }) {
  const row = (k: string, v: ReactNode) => <><span className={MUTED}>{k}</span><div className={INK}>{v}</div></>;
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className={`text-[22px] font-medium ${INK}`}>{l.name || "—"}</div>
          <div className={`${MUTED} text-[13px] mt-0.5`}>{fmtWhenTime(l.createdAt)} · {via}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className={`w-9 h-9 rounded-lg grid place-items-center ${MUTED} hover:bg-[#F6F7FB]`}><IconX size={18} stroke={1.8} /></button>
      </div>
      <div className="grid grid-cols-[150px_1fr] gap-x-[18px] gap-y-4 text-[14px] mt-5">
        {row("Status", <span className="inline-block text-[12px] font-medium rounded-full px-2.5 py-0.5 whitespace-nowrap" style={stStyle(l.status)}>{l.status || "—"}</span>)}
        {row("Contacted", <><ContactedDot on={l.contacted} />{l.callAttempts ? <span className={MUTED}> · {l.callAttempts} call{l.callAttempts > 1 ? "s" : ""}</span> : null}</>)}
        {row("Assigned to", l.counsellor)}
        {row("Primary Interest", l.interest || "—")}
        {row("Campaign", l.campaign || "—")}
        {row("Idle", l.daysUntouched != null ? `${l.daysUntouched} day${l.daysUntouched === 1 ? "" : "s"} since last update` : "—")}
      </div>
      {l.linkToRecord && <a href={l.linkToRecord} target="_blank" rel="noreferrer" className="mt-6 h-10 px-4 rounded-lg bg-brand text-white text-[14px] font-medium inline-flex items-center gap-1.5">Open in CRM<IconExternalLink size={15} stroke={1.8} /></a>}
    </>
  );
}
