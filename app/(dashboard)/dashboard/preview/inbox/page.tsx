"use client";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useEffect, useMemo, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import {
  IconSearch, IconCircleCheck, IconExternalLink, IconInbox,
  IconHash, IconPhoto, IconSparkles, IconDownload, IconChartBar,
  IconCalendarStats, IconTargetArrow, IconAlertTriangle, IconMessageDots,
} from "@tabler/icons-react";

// Inbox → Leads ledger. A native view of DM leads captured from Instagram via the
// TezDM webhook → n8n pipeline. There is NO replying here (that needs Meta access);
// this tab is the lead ledger: capture → 5-field gate → auto-push to the Airtable
// Sales Hub → follow-through. Complete leads (5/5) go to Airtable automatically and
// silently; only INCOMPLETE ones are flagged here for someone to chase.
//
// CRM status mirrors the Sales Hub → CRM table "Lead Status" single-select (the one
// with Hot lead / Junk lead / Re-Enquiry / Closed won …). The colours below match
// Airtable's own colours for each option, so whatever a counsellor sets shows here.
// (There is a second, coarser "DM Status" on the DM Leads table — Pending / In
// Progress / Converted … — used by the n8n pipeline; we mirror the richer CRM one.)

// Airtable colour name → {bg,fg} for our pills.
const AT: Record<string, { bg: string; fg: string }> = {
  blueBright: { bg: "#E1F0FB", fg: "#0C447C" }, blueDark1: { bg: "#DCE6FA", fg: "#274BB5" },
  greenBright: { bg: "#E3F5EA", fg: "#137A3E" }, greenLight1: { bg: "#EAF7EF", fg: "#2F8F52" },
  greenLight2: { bg: "#EFF8F2", fg: "#3C9A5F" }, greenDark1: { bg: "#CDEED9", fg: "#0F6B36" },
  redBright: { bg: "#FDE7E7", fg: "#C0342E" }, redDark1: { bg: "#FBE4E4", fg: "#B02A24" },
  redLight1: { bg: "#FCECEC", fg: "#C85A54" }, grayDark1: { bg: "#EEF0F4", fg: "#5A6273" },
  grayLight1: { bg: "#F3F5F9", fg: "#8A92A6" }, orangeDark1: { bg: "#FDEBD9", fg: "#B4661E" },
  pinkBright: { bg: "#FBE4EF", fg: "#B83280" },
};
// Airtable status → colour. Two vocabularies live in Sales Hub and both mirror here:
//  · DM Leads "DM Status" — what a DM lead carries on its own record (used now)
//  · CRM "Lead Status"    — the richer sales lifecycle after "Converted to Lead"
// Colours match each option's Airtable colour, so the pill looks like Airtable.
const LEAD_STATUS: Record<string, string> = {
  // DM Status (DM Leads table)
  "Pending": "grayDark1", "In Progress": "blueBright", "Follow up": "pinkBright",
  "Converted to Lead": "greenBright", "Failed to Convert": "redBright",
  // CRM Lead Status (CRM table — after conversion)
  "SQL": "greenBright", "Office enquiry": "grayDark1", "Open Leads": "blueDark1", "Bookings": "blueBright",
  "New": "blueBright", "Re-Enquiry": "blueBright", "Attempted to contact": "greenLight2",
  "Initial discussions": "greenLight1", "Interested": "greenBright", "Hot lead": "greenBright",
  "Contract stage": "greenBright", "Contract sent": "greenBright", "Future prospect": "grayLight1",
  "Not interested": "redDark1", "Closed won": "greenDark1", "Closed lost": "redDark1",
  "Junk lead": "redDark1", "Not eligible": "orangeDark1", "Cold": "grayDark1", "Unreachable": "redDark1",
};
const pillOf = (status: string) => AT[LEAD_STATUS[status]] || AT.grayLight1;

type Lead = {
  id: string; first: string; last: string; email: string; phone: string; query: string;
  keyword: string; sourcePost: string; av: string; when: string;
  status: string;                                   // mirror of Airtable Lead Status ("" until set)
  lastMod: string | null; counsellor: string | null; // from Airtable (pending live sync)
  airtableUrl: string | null; live: boolean;
};

const filledOf = (l: Lead) => [l.first, l.last, l.email, l.phone, l.query].filter((x) => (x || "").trim()).length;


// A real submission from the public per-post form (mh_dm_leads) → the Lead shape.
type LeadRow = { id: string; first_name: string; last_name: string; email: string; phone: string; query: string; source_post: string; keyword: string; ig_username: string; status: string; created_at: string };
function rowToLead(r: LeadRow): Lead {
  const filled = [r.first_name, r.last_name, r.email, r.phone, r.query].filter((x) => (x || "").trim()).length;
  return {
    id: "live-" + r.id, first: r.first_name, last: r.last_name, email: r.email, phone: r.phone, query: r.query,
    keyword: r.keyword || "", av: "#1AA053", when: "just now",
    sourcePost: (r.source_post || "Lead form").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    status: filled >= 5 ? "New" : "",     // real Airtable status arrives once the mirror is wired
    lastMod: null, counsellor: null, airtableUrl: null, live: true,
  };
}

// A real record from the Airtable Sales Hub "DM Leads" table → the Lead shape.
type AtRow = { id: string; first: string; last: string; email: string; phone: string; interest: string; note: string; status: string; lastMod: string | null; counsellor: string; airtableUrl: string };
const AV_PALETTE = ["#3A57E8", "#079AA2", "#8B5CF6", "#0EA5E9", "#D6336C", "#1AA053", "#B7791F", "#6E48F8", "#0B84C4"];
const colorFor = (s: string) => AV_PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_PALETTE.length];
function atToLead(a: AtRow): Lead {
  const phone = a.phone ? (a.phone.length >= 10 ? "+91 " + a.phone.slice(-10) : a.phone) : "";
  return {
    id: "at-" + a.id, first: a.first, last: a.last, email: a.email, phone,
    query: a.interest || a.note || "", keyword: "", sourcePost: a.interest || "Instagram DM",
    av: colorFor(a.id), when: a.lastMod || "",
    status: a.status, lastMod: a.lastMod, counsellor: a.counsellor || null,
    airtableUrl: a.airtableUrl, live: false,
  };
}

type SubTab = "leads" | "activity";

export default function InboxPage() {
  return (
    <PreviewDashboardShell active="inbox" title="Inbox" hideAccountPicker hideRange
      subtitle="Every DM lead captured from Instagram — auto-pushed to your Airtable Sales Hub, then followed through by the sales team. No replying here; this is the lead ledger.">
      {() => <LeadsLedger />}
    </PreviewDashboardShell>
  );
}

function LeadsLedger() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState<SubTab>("leads");
  const [q, setQ] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  // loading → live (leads found) or none (nothing returned / Airtable unreachable).
  // No sample leads: fake names and phone numbers must never show in a lead list.
  const [source, setSource] = useState<"loading" | "live" | "none">("loading");

  // Real leads: Airtable Sales Hub "DM Leads" (the ledger) + any brand-new submissions
  // from the per-post form (mh_dm_leads, not yet in Airtable) on top.
  useEffect(() => {
    Promise.all([
      fetch("/api/dm-leads/airtable").then((r) => r.json()).catch(() => ({ leads: [] })),
      fetch("/api/dm-leads/list").then((r) => r.json()).catch(() => ({ leads: [] })),
    ]).then(([at, sup]) => {
      const atLeads = ((at?.leads || []) as AtRow[]).map(atToLead);
      const supLeads = ((sup?.leads || []) as LeadRow[]).map(rowToLead);
      setLeads([...supLeads, ...atLeads]);
      setSource(atLeads.length || supLeads.length ? "live" : "none");
    }).catch(() => setSource("none"));
  }, []);

  const stats = useMemo(() => {
    const inCrm = leads.filter((l) => l.airtableUrl);                       // has an Airtable record
    const flagged = leads.filter((l) => !l.airtableUrl && filledOf(l) < 5); // incomplete, not yet synced
    const bySource = new Map<string, number>();
    leads.forEach((l) => bySource.set(l.sourcePost, (bySource.get(l.sourcePost) || 0) + 1));
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];
    const topKw = leads.find((l) => l.sourcePost === top?.[0])?.keyword || "";
    return {
      confirmed: inCrm.length,
      today: leads.filter((l) => /just now|today/i.test(l.when)).length,
      flagged: flagged.length,
      top: top?.[0] || "—", topN: top?.[1] || 0, topKw,
    };
  }, [leads]);

  const rows = useMemo(() => leads.filter((l) => {
    if (onlyFlagged && filledOf(l) >= 5) return false;
    if (q.trim()) { const t = q.toLowerCase(); return `${l.first} ${l.last} ${l.email} ${l.phone} ${l.keyword} ${l.sourcePost} ${l.query} ${l.status}`.toLowerCase().includes(t); }
    return true;
  }), [leads, onlyFlagged, q]);

  return (
    <div className="preview-scope space-y-5">
      {/* Connection note */}
      {source === "live" ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] text-emerald-900">
          <IconCircleCheck size={16} className="text-emerald-600 mt-0.5 shrink-0" />
          <span><b>Connected to Airtable Sales Hub.</b> Live DM leads with their real status, counsellor and last activity — click <b>Open ↗</b> for the record. New per-post form submissions show on top with a <b>green “live” badge</b> until they reach Airtable.</span>
        </div>
      ) : source === "loading" ? (
        <LoadingBlock label="Loading DM leads…" />
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[12.5px] text-[#4A5468]">
          <IconInbox size={16} className="text-[#8A92A6] mt-0.5 shrink-0" />
          <span><b>No DM leads to show.</b> The Sales Hub “DM Leads” table returned nothing, or Airtable couldn&apos;t be reached. Leads appear here as soon as there are some.</span>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {([["leads", "Leads", stats.confirmed], ["activity", "Activity", leads.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-[13.5px] font-medium transition ${tab === k ? "text-brand-dark" : "text-[#8A92A6] hover:text-[#4A5468]"}`}>
            {k === "leads" ? <IconInbox size={16} /> : <IconChartBar size={16} />}
            {label}
            <span className={`text-[11px] font-semibold rounded-full px-2 py-[1px] ${tab === k ? "bg-brand-light text-brand-dark" : "bg-gray-100 text-gray-400"}`}>{n}</span>
            {tab === k && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded bg-brand" />}
          </button>
        ))}
      </div>

      {tab === "leads" ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi icon={<IconCircleCheck size={16} className="text-emerald-600" />} label="In CRM" value={String(stats.confirmed)} sub="leads synced to Airtable" accent />
            <Kpi icon={<IconCalendarStats size={16} className="text-brand" />} label="New today" value={String(stats.today)} sub="captured today" />
            <Kpi icon={<IconAlertTriangle size={16} className="text-rose-500" />} label="Flagged" value={String(stats.flagged)} sub="incomplete — chase for details" />
            <Kpi icon={<IconTargetArrow size={16} className="text-sky-600" />} label="Top interest" value={stats.top} sub={`${stats.topN} leads`} small />
          </div>

          {/* Qualify rule */}
          <div className="flex items-start gap-2.5 rounded-xl border border-[#F3E6C4] bg-[#FFFDF5] px-4 py-3 text-[12.5px] text-[#7a5b12]">
            <IconCircleCheck size={16} className="mt-0.5 shrink-0 text-[#B7791F]" />
            <span>A DM becomes a lead when all <b>5</b> details are shared — <b>first name, last name, email, phone, and their question</b>. Complete leads are <b>auto-sent to the Airtable Sales Hub</b> and the CRM status mirrors back here. Ones still <b>missing a detail are flagged</b> below so someone can chase them.</span>
          </div>

          {/* Section header + toolbar */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-[#232D42]">Leads</div>
              <div className="text-[12.5px] text-[#8A92A6] mt-0.5">Newest first · hover the <IconCircleCheck size={13} className="inline -mt-0.5 text-emerald-500" /> for source &amp; details · click <b>Open ↗</b> for the Airtable record.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setOnlyFlagged((v) => !v)}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5 transition ${onlyFlagged ? "border-rose-300 bg-rose-50 text-rose-600" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                <IconAlertTriangle size={13} /> {onlyFlagged ? "Showing flagged only" : "Show flagged only"}
              </button>
              <button className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 inline-flex items-center gap-1.5 hover:border-gray-300"><IconDownload size={13} /> Export</button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 max-w-md focus-within:border-brand">
            <IconSearch size={16} className="text-[#8A92A6] shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, question…"
              className="flex-1 bg-transparent outline-none text-[13px] text-[#232D42] placeholder:text-[#B4BAC6]" />
          </div>

          {/* Ledger table */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[860px]">
                <thead>
                  <tr className="bg-[#FCFCFE]">
                    {["Name", "Phone", "Email", "Question", "CRM status", "In CRM", ""].map((h, i) => (
                      <th key={i} className="text-left text-[10.5px] uppercase tracking-wider text-[#8A92A6] font-semibold px-4 py-3 border-b border-gray-100 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const filled = filledOf(l); const done = filled >= 5;
                    const p = pillOf(l.status);
                    return (
                      <tr key={l.id} className={`border-b border-gray-50 last:border-0 hover:bg-[#FafbFe] align-middle ${!done ? "bg-rose-50/30" : ""}`}>
                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[12.5px] font-semibold" style={{ background: l.av }}>
                              {(l.first || l.email || "?").slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <div className="text-[13.5px] font-semibold text-[#232D42] truncate flex items-center gap-1.5">
                                {`${l.first} ${l.last}`.trim() || "New lead"}
                                {l.live && <span className="text-[12px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 rounded px-1 py-[1px]">live</span>}
                              </div>
                              <div className="text-[11px] text-[#A6ACBE]">{l.when}</div>
                            </div>
                          </div>
                        </td>
                        {/* Phone */}
                        <td className="px-4 py-3 text-[12.5px] text-[#232D42] whitespace-nowrap">{l.phone || <span className="text-rose-400">— missing</span>}</td>
                        {/* Email */}
                        <td className="px-4 py-3 text-[12.5px] text-[#232D42] whitespace-nowrap">{l.email || <span className="text-rose-400">— missing</span>}</td>
                        {/* Question */}
                        <td className="px-4 py-3 text-[12.5px] text-[#232D42] max-w-[240px]">{l.query || <span className="text-rose-400 italic">— no question shared</span>}</td>
                        {/* CRM status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {l.status
                            ? <span className="text-[11px] font-semibold rounded-full px-2.5 py-[3px]" style={{ background: p.bg, color: p.fg }}>{l.status}</span>
                            : <span className="text-[11.5px] text-[#A6ACBE]">—</span>}
                        </td>
                        {/* In CRM — an Airtable record link means it's already in the CRM */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {l.airtableUrl
                            ? <a href={l.airtableUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand border border-brand-light rounded-lg px-2.5 py-1.5 hover:bg-brand-light/60">Open <IconExternalLink size={12} /></a>
                            : done
                              ? <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-600"><IconCircleCheck size={13} /> syncing…</span>
                              : <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-600 bg-rose-50 rounded-lg px-2 py-1"><IconAlertTriangle size={12} /> Incomplete · {filled}/5</span>}
                        </td>
                        {/* ⓘ hover — source, keyword, field check, last-modified */}
                        <td className="px-3 py-3 text-right">
                          <span className="relative inline-block group">
                            {done
                              ? <IconCircleCheck size={17} className="text-emerald-500 hover:text-emerald-600 cursor-help" />
                              : <IconAlertTriangle size={16} className="text-rose-400 hover:text-rose-500 cursor-help" />}
                            <span className="pointer-events-none absolute right-0 top-6 z-20 hidden group-hover:block w-64 text-left bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2">
                              <span className="block">
                                <span className="text-[10px] uppercase tracking-wide text-[#A6ACBE] font-semibold">Source</span>
                                <span className="flex items-center gap-1.5 text-[12.5px] text-[#232D42] mt-0.5"><IconPhoto size={13} className="text-brand shrink-0" />{l.sourcePost}</span>
                                {l.keyword && <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-gray-100 text-[#8A92A6] rounded px-1.5 py-[1px] mt-1"><IconHash size={9} />{l.keyword}</span>}
                              </span>
                              <span className="block border-t border-gray-100 pt-2">
                                <span className="text-[10px] uppercase tracking-wide text-[#A6ACBE] font-semibold">Details captured · {filled}/5</span>
                                <span className="grid grid-cols-1 gap-0.5 mt-1">
                                  {([["First name", l.first], ["Last name", l.last], ["Email", l.email], ["Phone", l.phone], ["Question", l.query]] as const).map(([lbl, v]) => (
                                    <span key={lbl} className="flex items-center gap-1.5 text-[11.5px]">
                                      {(v || "").trim() ? <IconCircleCheck size={12} className="text-emerald-500 shrink-0" /> : <IconAlertTriangle size={12} className="text-rose-400 shrink-0" />}
                                      <span className={(v || "").trim() ? "text-[#4A5468]" : "text-rose-400"}>{lbl}</span>
                                    </span>
                                  ))}
                                </span>
                              </span>
                              <span className="block border-t border-gray-100 pt-2">
                                <span className="text-[10px] uppercase tracking-wide text-[#A6ACBE] font-semibold">Last activity <span className="text-[9px] normal-case">(from Airtable)</span></span>
                                <span className="block text-[12px] text-[#232D42] mt-0.5">{l.lastMod ? `${l.lastMod}` : "—"}{l.counsellor ? ` · ${l.counsellor}` : ""}</span>
                              </span>
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7} className="text-center text-[13px] text-gray-400 py-10">No leads match.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2.5 text-[11.5px] text-[#8A92A6]">
            <span><b>DM Status</b> mirrors the Sales Hub “DM Leads” record, set by the sales team:</span>
            {(["Pending", "In Progress", "Follow up", "Converted to Lead", "Failed to Convert"] as const).map((k) => {
              const p = pillOf(k);
              return <span key={k} className="text-[11px] font-semibold rounded-full px-2.5 py-[3px]" style={{ background: p.bg, color: p.fg }}>{k}</span>;
            })}
            <span className="text-[#A6ACBE]">Once <b>Converted to Lead</b>, the richer CRM status (Hot lead / Junk lead / Re-Enquiry …) applies.</span>
          </div>
        </>
      ) : (
        <Activity leads={leads} />
      )}
    </div>
  );
}

// Activity — the raw DM feed: every inbound conversation, including partial / junk,
// newest first. No triage here; it's the ledger of what came in.
function Activity({ leads }: { leads: Lead[] }) {
  return (
    <div className="space-y-4">
      <div className="text-[12.5px] text-[#8A92A6]">Raw inbound DM feed — every conversation captured, complete or not. The <b>Leads</b> tab is the qualified subset (5/5, auto-sent to CRM).</div>
      <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50">
        {leads.map((l) => {
          const filled = filledOf(l); const done = filled >= 5;
          return (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-[13px] font-semibold" style={{ background: l.av }}>
                {(l.first || l.email || "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[#232D42] truncate flex items-center gap-2">
                  {`${l.first} ${l.last}`.trim() || "New enquiry"}
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500"><IconHash size={9} />{l.keyword || "—"}</span>
                </div>
                <div className="text-[11.5px] text-[#8A92A6] truncate mt-0.5 flex items-center gap-1.5"><IconMessageDots size={12} className="shrink-0" />{l.query || "(no question shared)"}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-[11.5px] font-semibold ${done ? "text-emerald-600" : "text-rose-500"}`}>{filled}/5</div>
                <div className="text-[10.5px] text-[#A6ACBE]">{l.when}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, accent, small }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean; small?: boolean }) {
  return (
    <div className={`bg-white border rounded-2xl p-4 ${accent ? "border-l-[3px] border-l-brand border-y-gray-100 border-r-gray-100" : "border-gray-100"}`}>
      <div className="flex items-center gap-1.5 text-[11.5px] text-[#8A92A6]">{icon}{label}</div>
      <div className={`${small ? "text-[19px]" : "text-[26px]"} font-semibold text-[#232D42] tabular-nums mt-1 truncate leading-tight`}>{value}</div>
      <div className="text-[11px] text-[#A6ACBE] mt-1 truncate">{sub}</div>
    </div>
  );
}
