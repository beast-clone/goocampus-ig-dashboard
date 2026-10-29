"use client";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconSearch, IconUsers, IconMessageCircle, IconMessage2, IconBrandWhatsapp, IconCalendarEvent, IconLayoutGrid, IconExternalLink, IconX, IconSettings, IconPlus, IconTrash, IconSparkles, type Icon } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { DEFAULT_HIDDEN, DEFAULT_TABS, TALKING, isWarm, type SourceSetup, type SourceTab } from "@/lib/lead-channel";
import { fmtDateShort } from "@/lib/date";
import { isBucket, counsellorLabel } from "@/lib/counsellor";

// Marketing Leads (docs/MARKETING_LEADS_SPEC.md) — DM leads only: the non-paid leads who reached
// us through Instagram/Facebook DMs or the DM booking form. Paid leads live in Campaigns.
// Which CRM lead sources show as tabs is an admin setting (/api/leads/source-tabs); a source
// that's neither a tab nor hidden is flagged to admins as new, to add with one click.
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
    <PreviewDashboardShell active="leads" title="Marketing Leads" subtitle="Leads who reached us through Instagram/Facebook DMs or the DM booking form — and who has been contacted." hideAccountPicker hideRange>
      {() => <MarketingLeads />}
    </PreviewDashboardShell>
  );
}

type Lead = { id: string; name: string; source: string; status: string; interest: string; campaign: string; createdAt: string; daysUntouched: number | null; linkToRecord: string; counsellor: string; callAttempts: number; contacted: boolean };
const INK = "text-[#232D42]", MUTED = "text-[#8A92A6]";
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const TAB_COLORS = ["#1AA053", "#3A57E8", "#F16A1B", "#0E9F9F", "#7A5AF8", "#2138B0", "#C03221", "#B7791F"];
// Icon from the source's name, so a new tab (e.g. WhatsApp) gets a sensible one without a code change.
const tabIcon = (t: SourceTab): Icon => {
  const k = `${t.source} ${t.label}`;
  return /whats ?app/i.test(k) ? IconBrandWhatsapp : /booking/i.test(k) ? IconCalendarEvent : /\bdms?\b|instagram|facebook|messenger/i.test(k) ? IconMessageCircle : IconMessage2;
};

function MarketingLeads() {
  const [days, setDays] = useState<number | "custom">(30);
  const today = ymd(new Date());
  const [cFrom, setCFrom] = useState(ymd(new Date(Date.now() - 30 * 86_400_000)));
  const [cTo, setCTo] = useState(today);
  const from = days === "custom" ? cFrom : ymd(new Date(Date.now() - days * 86_400_000));
  const to = days === "custom" ? cTo : today;

  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [src, setSrc] = useState<string>("all");   // "all" or a CRM lead source
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

  const [setup, setSetup] = useState<SourceSetup>({ tabs: DEFAULT_TABS, hidden: DEFAULT_HIDDEN });
  const [isAdmin, setIsAdmin] = useState(false);
  const [managing, setManaging] = useState(false);
  useEffect(() => {
    fetch("/api/leads/source-tabs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d?.tabs && setSetup(d)).catch(() => {});
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((d) => setIsAdmin(!!d?.user?.isAdmin)).catch(() => {});
  }, []);
  const saveSetup = async (next: SourceSetup): Promise<string | null> => {
    const r = await fetch("/api/leads/source-tabs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error || "Couldn't save the tabs.";
    setSetup(j as SourceSetup);
    if (src !== "all" && !(j as SourceSetup).tabs.some((t) => t.source === src)) setSrc("all");
    return null;
  };
  const tabFor = (source: string) => setup.tabs.find((t) => t.source === source);
  const colorOf = (source: string) => TAB_COLORS[Math.max(0, setup.tabs.findIndex((t) => t.source === source)) % TAB_COLORS.length];
  // Every lead source in this range with its lead count — what "new source" detection and Manage tabs offer.
  const seen = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads || []) m.set((l.source || "").trim(), (m.get((l.source || "").trim()) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);
  const newSources = seen.filter(([s]) => !tabFor(s) && !setup.hidden.includes(s));

  // DM leads only — every other CRM source is paid or not a DM.
  const rows = useMemo(() => (leads || []).filter((l) => setup.tabs.some((t) => t.source === l.source)), [leads, setup]);
  type Row = (typeof rows)[number];
  const sel = rows.filter((l) => src === "all" || l.source === src);
  const cN = sel.filter((l) => l.contacted).length;
  const title = src === "all" ? "All DM leads" : tabFor(src)?.label ?? src;
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
      {/* one bar: which DM leads, and the period */}
      <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="inline-flex gap-1 flex-wrap">
          {([["all", "All DM leads", IconUsers, rows.length] as const, ...setup.tabs.map((t) => [t.source, t.label, tabIcon(t), rows.filter((l) => l.source === t.source).length] as const)]).map(([k, lbl, I, n]) => (
            <button key={k} onClick={() => { setSrc(k); setLeadId(null); }}
              className={`h-10 px-3.5 rounded-lg inline-flex items-center gap-2 text-[14px] font-medium ${src === k ? "bg-brand-light text-brand" : "text-[#4A5468] hover:text-brand"}`}>
              <I size={17} stroke={1.8} />{lbl}<span className={`text-[12.5px] rounded-full px-2 py-px ${src === k ? "bg-white text-brand" : "bg-[#F0F2F8] text-[#4A5468]"}`}>{leads ? fmt(n) : "…"}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2.5 flex-wrap">
          {days === "custom" && <span className="inline-flex items-center gap-2">{dateBox(cFrom, (v) => { setCFrom(v); if (v > cTo) setCTo(v); })}<span className={MUTED}>to</span>{dateBox(cTo, (v) => { setCTo(v); if (v < cFrom) setCFrom(v); })}</span>}
          <div className="inline-flex border border-gray-100 rounded-lg overflow-hidden bg-white">
            {([7, 30, 90, "custom"] as const).map((d) => (
              <button key={d} onClick={() => { setDays(d); setLeadId(null); }}
                className={`h-10 px-4 text-[14px] font-medium ${days === d ? "bg-brand-light text-brand" : "text-[#4A5468] hover:text-brand"}`}>{d === "custom" ? "Custom" : `${d}d`}</button>
            ))}
          </div>
          {isAdmin && <button onClick={() => setManaging(true)} title="Choose which lead sources show as tabs"
            className={`h-10 px-3.5 rounded-lg border border-gray-100 inline-flex items-center gap-1.5 text-[14px] font-medium ${INK} hover:border-brand hover:text-brand`}><IconSettings size={16} stroke={1.8} />Manage tabs</button>}
        </div>
      </div>
      {isAdmin && newSources.map(([s, n]) => (
        <div key={s} className="bg-brand-light border border-brand-light rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="w-9 h-9 rounded-[10px] bg-white text-brand grid place-items-center shrink-0"><IconSparkles size={18} stroke={1.8} /></span>
          <div className={`text-[14px] ${INK} mr-auto`}>New lead source found: <b className="font-medium">{s || "(blank)"}</b> <span className={MUTED}>· {fmt(n)} lead{n === 1 ? "" : "s"} in this range</span></div>
          <button onClick={() => void saveSetup({ tabs: [...setup.tabs, { source: s, label: s }], hidden: setup.hidden })}
            className="h-9 px-3.5 rounded-lg bg-brand text-white text-[13px] font-medium inline-flex items-center gap-1.5"><IconPlus size={15} stroke={2} />Add as a tab</button>
          <button onClick={() => void saveSetup({ tabs: setup.tabs, hidden: [...setup.hidden, s] })}
            className={`h-9 px-3.5 rounded-lg bg-white border border-gray-100 text-[13px] font-medium ${INK}`}>Hide</button>
        </div>
      ))}
      <div className={`-mt-2 text-[13px] ${MUTED} px-1`}>{fmtWhen(from)} – {fmtWhen(to)} · by lead created date{src !== "all" ? ` · ${title}` : ""}</div>

      {err ? <div className="bg-white border border-gray-100 rounded-2xl px-6 py-10 text-center text-[14px] text-[#8A92A6]">Couldn&apos;t load leads: {err} <button onClick={load} className="text-brand font-medium">Try again</button></div> : (
      <div className="space-y-5">
        <SummaryCards sel={sel} />

        <div className="grid gap-5 items-start grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px]">
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
                        <td className={`px-4 py-3.5 ${isBucket(l.counsellor) ? MUTED : "text-[#4A5468]"}`}>{counsellorLabel(l.counsellor)}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap"><div className="text-[#4A5468]">{fmtWhenTime(l.createdAt)}</div><div className={`text-[12.5px] ${MUTED}`}>{tabFor(l.source)?.label ?? l.source}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* side column on wide screens; under the table, side by side, on a laptop */}
          <div className="grid gap-5 items-start md:grid-cols-2 2xl:grid-cols-1">
            <FollowUp sel={sel} />
            {src === "all" && <Sources sel={sel} tabs={setup.tabs} colorOf={colorOf} />}
          </div>
        </div>
      </div>
      )}

      {lead && (
        <div className="fixed inset-0 z-50 bg-[#232D42]/40 flex items-center justify-center p-4" onClick={() => setLeadId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-auto px-7 py-6" onClick={(e) => e.stopPropagation()}>
            <LeadDetail l={lead} via={tabFor(lead.source)?.label ?? lead.source} onClose={() => setLeadId(null)} />
          </div>
        </div>
      )}
      {managing && <ManageTabs setup={setup} seen={seen} onSave={saveSetup} onClose={() => setManaging(false)} />}
    </div>
  );
}

type SelLead = { contacted: boolean; status: string; counsellor: string; source: string };
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
    <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4">
      <div className={`text-[13px] ${MUTED}`}>{l}</div><div className={`text-[28px] font-medium ${INK} mt-1 leading-tight`}>{v}</div><div className={`text-[12.5px] ${MUTED} mt-0.5`}>{s}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      {card("DM leads", fmt(sel.length), "contact shared in a DM")}
      {card("Contacted", `${pctOf(cN, sel.length)}%`, `${fmt(cN)} of ${fmt(sel.length)}`)}
      {card("Not contacted yet", <span className="text-[#C0201F]">{fmt(sel.length - cN)}</span>, "no call, note or status change")}
      {card("Hot & interested", fmt(sel.filter((l) => isWarm(l.status)).length), "Hot lead + Interested")}
    </div>
  );
}

function Sources({ sel, tabs, colorOf }: { sel: SelLead[]; tabs: SourceTab[]; colorOf: (source: string) => string }) {
  const n = (t: SourceTab) => sel.filter((l) => l.source === t.source).length;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-6 py-5">
      <CardHead icon={IconLayoutGrid} t="How they reached us" sub="by lead source" />
      {sel.length === 0 ? <div className={`text-[14px] ${MUTED}`}>No leads.</div> : (<>
        <div className="flex h-3 rounded-full overflow-hidden bg-[#EEF0F4]">
          {tabs.map((t) => n(t) ? <i key={t.source} style={{ width: `${(n(t) / sel.length) * 100}%`, background: colorOf(t.source) }} /> : null)}
        </div>
        <div className="mt-4 space-y-2.5">
          {tabs.map((t) => (
            <div key={t.source} className="flex items-center gap-2.5 text-[14px]"><i className="w-[10px] h-[10px] rounded-[3px] inline-block" style={{ background: colorOf(t.source) }} /><span className={INK}>{t.label}</span><span className={`ml-auto ${MUTED}`}>{fmt(n(t))} · {pctOf(n(t), sel.length)}%</span></div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// Admins: which CRM lead sources show as tabs (rename, remove, add), and which are hidden.
function ManageTabs({ setup, seen, onSave, onClose }: { setup: SourceSetup; seen: [string, number][]; onSave: (s: SourceSetup) => Promise<string | null>; onClose: () => void }) {
  const [tabs, setTabs] = useState<SourceTab[]>(setup.tabs);
  const [hidden, setHidden] = useState<string[]>(setup.hidden);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const count = (s: string) => seen.find(([x]) => x === s)?.[1] ?? 0;
  const known = new Set([...seen.map(([x]) => x), ...hidden]);
  const addable = [...known].filter((s) => !tabs.some((t) => t.source === s));
  const save = async () => { setBusy(true); setErr(null); const e = await onSave({ tabs, hidden }); setBusy(false); if (e) setErr(e); else onClose(); };
  return (
    <div className="fixed inset-0 z-50 bg-[#232D42]/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[620px] max-h-[90vh] overflow-auto px-7 py-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1"><div className={`text-[20px] font-medium ${INK}`}>Manage tabs</div>
            <div className={`text-[13px] ${MUTED} mt-0.5`}>Each tab is one CRM Lead Source. Changes apply for everyone.</div></div>
          <button onClick={onClose} aria-label="Close" className={`w-9 h-9 rounded-lg grid place-items-center ${MUTED} hover:bg-[#F6F7FB]`}><IconX size={18} stroke={1.8} /></button>
        </div>

        <div className={`text-[13px] font-medium ${INK} mt-6 mb-2`}>Tabs on the page</div>
        {tabs.map((t, i) => (
          <div key={t.source} className="flex items-center gap-3 py-2.5 border-t border-gray-100">
            <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center shrink-0">{(() => { const I = tabIcon(t); return <I size={16} stroke={1.8} />; })()}</span>
            <div className="flex-1 min-w-0">
              <input value={t.label} onChange={(e) => setTabs(tabs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Name for ${t.source}`}
                className={`h-9 w-full rounded-lg border border-gray-200 px-3 text-[14px] ${INK} outline-none focus:border-brand`} />
              <div className={`text-[12px] ${MUTED} mt-1`}>CRM source: {t.source} · {fmt(count(t.source))} leads in this range</div>
            </div>
            <button disabled={tabs.length === 1} onClick={() => { setTabs(tabs.filter((_, j) => j !== i)); setHidden([...hidden, t.source]); }} title="Remove this tab"
              className={`w-9 h-9 rounded-lg grid place-items-center ${MUTED} hover:bg-[#F6F7FB] hover:text-[#C0201F] disabled:opacity-30`}><IconTrash size={17} stroke={1.8} /></button>
          </div>
        ))}

        <div className={`text-[13px] font-medium ${INK} mt-6 mb-2`}>Other lead sources</div>
        {addable.length === 0 ? <div className={`text-[13px] ${MUTED}`}>None — every source is a tab.</div> : addable.map((s) => (
          <div key={s} className="flex items-center gap-3 py-2.5 border-t border-gray-100 text-[14px]">
            <span className={`flex-1 min-w-0 truncate ${INK}`}>{s || "(blank)"}</span>
            <span className={`text-[12.5px] ${MUTED}`}>{fmt(count(s))} leads{hidden.includes(s) ? " · hidden" : " · new"}</span>
            <button onClick={() => { setTabs([...tabs, { source: s, label: s || "No source" }]); setHidden(hidden.filter((h) => h !== s)); }}
              className="h-8 px-3 rounded-lg border border-gray-100 text-brand text-[13px] font-medium inline-flex items-center gap-1 hover:border-brand"><IconPlus size={14} stroke={2} />Add as a tab</button>
          </div>
        ))}
        <div className={`text-[12px] ${MUTED} mt-3 leading-snug`}>Hidden sources (like paid ads) never show as tabs and aren&apos;t flagged as new. A source appears here once the CRM has a lead with it.</div>

        {err && <div className="text-[13px] text-[#C0201F] mt-4">{err}</div>}
        <div className="flex gap-2.5 mt-6">
          <button onClick={() => void save()} disabled={busy} className="h-10 px-5 rounded-lg bg-brand text-white text-[14px] font-medium disabled:opacity-50">{busy ? "Saving…" : "Save tabs"}</button>
          <button onClick={onClose} className={`h-10 px-4 rounded-lg border border-gray-100 text-[14px] font-medium ${INK}`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function FollowUp({ sel }: { sel: SelLead[] }) {
  // Counsellors only — the New Leads (Maheen) pool and unassigned leads aren't anyone's follow-up.
  const waiting = sel.filter((l) => !l.counsellor || isBucket(l.counsellor)).length;
  const fu = new Map<string, { n: number; c: number; na: number; t: number }>();
  for (const l of sel) {
    if (!l.counsellor || isBucket(l.counsellor)) continue;
    const k = l.counsellor, x = fu.get(k) || { n: 0, c: 0, na: 0, t: 0 };
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
      {fu.size === 0 && <div className={`text-[14px] ${MUTED}`}>No leads assigned to a counsellor.</div>}
      {waiting > 0 && <div className={`mt-3 pt-3 border-t border-gray-100 text-[13px] ${MUTED}`}><b className={`font-medium ${INK}`}>{fmt(waiting)}</b> waiting to be assigned (New Leads (Maheen) pool)</div>}
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
        {row("Assigned to", isBucket(l.counsellor) ? "Not assigned yet — New Leads (Maheen)" : l.counsellor)}
        {row("Primary Interest", l.interest || "—")}
        {row("Campaign", l.campaign || "—")}
        {row("Idle", l.daysUntouched != null ? `${l.daysUntouched} day${l.daysUntouched === 1 ? "" : "s"} since last update` : "—")}
      </div>
      {l.linkToRecord && <a href={l.linkToRecord} target="_blank" rel="noreferrer" className="mt-6 h-10 px-4 rounded-lg bg-brand text-white text-[14px] font-medium inline-flex items-center gap-1.5">Open in CRM<IconExternalLink size={15} stroke={1.8} /></a>}
    </>
  );
}
