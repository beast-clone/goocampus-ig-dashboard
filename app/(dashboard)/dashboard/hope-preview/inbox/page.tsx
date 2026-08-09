"use client";
import { useEffect, useMemo, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import {
  IconSearch, IconMail, IconPhone, IconCircleCheck, IconExternalLink, IconInbox,
  IconHash, IconPhoto, IconUser, IconSparkles, IconDownload, IconBolt, IconMessageDots,
  IconArrowRight, IconChartBar, IconCalendarStats, IconTargetArrow,
} from "@tabler/icons-react";

// Inbox → Leads ledger. A native view of DM leads captured from Instagram via the
// TezDM webhook → n8n pipeline. There is NO replying here (that needs Meta access);
// this tab is the lead ledger: capture → 5-field gate → push to Airtable CRM →
// follow-through (called? hot? junk?). CRM status is owned by sales in Airtable and
// mirrors back. Real form submissions (mh_dm_leads) show at the top with a green
// avatar; the rest is sample data showing the full layout.

// CRM status — set by the sales team in Airtable, mirrored back here.
type CrmStatus = "new" | "initial" | "hot" | "reenq" | "won" | "junk" | "enquiry";
const CRM: Record<CrmStatus, { label: string; bg: string; fg: string }> = {
  new:      { label: "New",                bg: "#E1F0FB", fg: "#0C447C" },
  initial:  { label: "Initial discussion", bg: "#E3F5EA", fg: "#137A3E" },
  hot:      { label: "Hot lead",           bg: "#FBE4EC", fg: "#C03221" },
  reenq:    { label: "Re-enquiry",         bg: "#E4F4FD", fg: "#0B84C4" },
  won:      { label: "Closed won",         bg: "#CDEED9", fg: "#0F6B36" },
  junk:     { label: "Junk",               bg: "#F0F2F8", fg: "#8A92A6" },
  enquiry:  { label: "Enquiry",            bg: "#F0F2F8", fg: "#8A92A6" },
};

type Lead = {
  id: string; first: string; last: string; email: string; phone: string; query: string;
  keyword: string; sourcePost: string; av: string; when: string;
  crm: CrmStatus; called: { label: string; by?: string } | null;
  airtableUrl: string | null; live: boolean;
};

const filledOf = (l: Lead) => [l.first, l.last, l.email, l.phone, l.query].filter((x) => (x || "").trim()).length;

// Representative sample — GooCampus funnels (gulf webinar, MBBS abroad, AMC, PLAB, NEET, Canada PRA).
const SAMPLE: Lead[] = [
  { id: "s1", first: "Ananya", last: "Reddy", email: "ananya.reddy@gmail.com", phone: "+91 98450 11234",
    query: "Eligible for DHA with an Indian MBBS?", keyword: "gulf", sourcePost: "Gulf webinar", av: "#3A57E8",
    when: "2 Aug · 10:05", crm: "hot", called: { label: "Called 3 Aug", by: "Robin" }, airtableUrl: "#", live: false },
  { id: "s2", first: "Sneha", last: "Iyer", email: "sneha.iyer21@gmail.com", phone: "+91 90350 78120",
    query: "MBBS Georgia fees & NEET for 2026?", keyword: "mbbs", sourcePost: "MBBS Georgia reel", av: "#079AA2",
    when: "1 Aug · 09:03", crm: "initial", called: { label: "Called 2 Aug", by: "Gopi" }, airtableUrl: "#", live: false },
  { id: "s3", first: "Fatima", last: "Sheikh", email: "fatima.sheikh@outlook.com", phone: "+91 97410 33098",
    query: "PLAB UK timeline and total cost?", keyword: "plab", sourcePost: "PLAB UK pathway", av: "#8B5CF6",
    when: "31 Jul · 07:26", crm: "won", called: { label: "Enrolled 4 Aug" }, airtableUrl: "#", live: false },
  { id: "s4", first: "Rahul", last: "Menon", email: "rahul.menon@gmail.com", phone: "+91 99001 55221",
    query: "AMC exam guidance", keyword: "amc", sourcePost: "AMC MCQ guide", av: "#0EA5E9",
    when: "1 Aug · 09:46", crm: "new", called: null, airtableUrl: "#", live: false },
  { id: "s5", first: "Priya", last: "Nair", email: "priya.nair@gmail.com", phone: "+91 98765 43210",
    query: "Can I attend the Gulf webinar?", keyword: "gulf", sourcePost: "Gulf webinar", av: "#1AA053",
    when: "Just now", crm: "new", called: null, airtableUrl: null, live: false },
  { id: "s6", first: "Vikram", last: "Das", email: "vikram.das@gmail.com", phone: "+91 96320 71145",
    query: "Re-enquiry — asked about Canada PRA again", keyword: "canada", sourcePost: "Canada PRA post", av: "#D6336C",
    when: "30 Jul · 04:09", crm: "reenq", called: { label: "Called 28 Jul", by: "Jeswin" }, airtableUrl: "#", live: false },
  { id: "s7", first: "", last: "", email: "", phone: "", query: 'just said "hi", never shared details',
    keyword: "neet", sourcePost: "NEET PG carousel", av: "#B7791F",
    when: "30 Jul · 05:11", crm: "junk", called: null, airtableUrl: null, live: false },
];

// A real submission from the public per-post form (mh_dm_leads) → the Lead shape.
type LeadRow = { id: string; first_name: string; last_name: string; email: string; phone: string; query: string; source_post: string; keyword: string; ig_username: string; status: string; created_at: string };
function rowToLead(r: LeadRow): Lead {
  const filled = [r.first_name, r.last_name, r.email, r.phone, r.query].filter((x) => (x || "").trim()).length;
  return {
    id: "live-" + r.id, first: r.first_name, last: r.last_name, email: r.email, phone: r.phone, query: r.query,
    keyword: r.keyword || "", av: "#1AA053", when: "just now",
    sourcePost: (r.source_post || "Lead form").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    crm: filled >= 5 ? "new" : filled === 0 ? "junk" : "enquiry",
    called: null, airtableUrl: null, live: true,
  };
}

type SubTab = "leads" | "activity";
type Filter = "all" | "hot" | "new" | "junk" | "reenq";

export default function InboxPage() {
  return (
    <HopeDashboardShell active="inbox" title="Inbox" hideAccountPicker hideRange
      subtitle="Every DM lead captured from Instagram — tracked from capture, pushed to your Airtable CRM, and followed through to called / hot / junk. No replying here; this is the lead ledger.">
      {() => <LeadsLedger />}
    </HopeDashboardShell>
  );
}

function LeadsLedger() {
  const [leads, setLeads] = useState<Lead[]>(SAMPLE);
  const [tab, setTab] = useState<SubTab>("leads");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [autoPush, setAutoPush] = useState(true);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  // Pull REAL submissions (mh_dm_leads) and put them on top so a lead you just
  // captured appears live. Falls back to sample-only if none yet.
  useEffect(() => {
    fetch("/api/dm-leads/list")
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.leads || []) as LeadRow[];
        if (rows.length) setLeads([...rows.map(rowToLead), ...SAMPLE]);
      })
      .catch(() => { /* keep sample */ });
  }, []);

  const stats = useMemo(() => {
    const confirmed = leads.filter((l) => filledOf(l) >= 5);
    const enquiries = leads.filter((l) => { const f = filledOf(l); return f >= 1 && f < 5; });
    const pushed = confirmed.filter((l) => l.airtableUrl);
    const bySource = new Map<string, number>();
    leads.forEach((l) => bySource.set(l.sourcePost, (bySource.get(l.sourcePost) || 0) + 1));
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];
    const topKw = leads.find((l) => l.sourcePost === top?.[0])?.keyword || "";
    return {
      confirmed: confirmed.length, today: confirmed.filter((l) => /just now|today/i.test(l.when)).length,
      enquiries: enquiries.length, pushed: pushed.length,
      top: top?.[0] || "—", topN: top?.[1] || 0, topKw,
    };
  }, [leads]);

  const rows = useMemo(() => leads.filter((l) => {
    if (filter === "hot" && l.crm !== "hot") return false;
    if (filter === "new" && l.crm !== "new") return false;
    if (filter === "reenq" && l.crm !== "reenq") return false;
    if (filter === "junk" && l.crm !== "junk" && l.crm !== "enquiry") return false;
    if (q.trim()) { const t = q.toLowerCase(); return `${l.first} ${l.last} ${l.email} ${l.phone} ${l.keyword} ${l.sourcePost} ${l.query}`.toLowerCase().includes(t); }
    return true;
  }), [leads, filter, q]);

  const onPush = () => setPushMsg("Airtable CRM isn't connected yet — share your Sales Hub base + table and “Push to CRM” will create the record, store its link here, and mirror the status back.");

  return (
    <div className="hope-scope space-y-5">
      {/* Live-demo note */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
        <IconSparkles size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <span><b>Live demo.</b> Real submissions from the per-post lead form appear at the <b>top (green avatar)</b>; the rest is sample data showing the layout. Fill the form at <b>/lead/&lt;post&gt;</b> and it lands here.</span>
      </div>

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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <Kpi icon={<IconCircleCheck size={16} className="text-emerald-600" />} label="Confirmed · this month" value={String(stats.confirmed)} sub="all 5 details shared" accent />
            <Kpi icon={<IconCalendarStats size={16} className="text-brand" />} label="Today" value={String(stats.today)} sub="new confirmed leads" />
            <Kpi icon={<IconUser size={16} className="text-amber-600" />} label="Enquiries" value={String(stats.enquiries)} sub="partial — missing a field" />
            <Kpi icon={<IconBolt size={16} className="text-violet-600" />} label="Pushed to CRM" value={`${stats.pushed}`} sub={`${Math.max(stats.confirmed - stats.pushed, 0)} pending push`} muted={`/ ${stats.confirmed}`} />
            <Kpi icon={<IconTargetArrow size={16} className="text-sky-600" />} label="Top source" value={stats.top} sub={`${stats.topN} leads · keyword "${stats.topKw}"`} small />
          </div>

          {/* Qualify rule */}
          <div className="flex items-start gap-2.5 rounded-xl border border-[#F3E6C4] bg-[#FFFDF5] px-4 py-3 text-[12.5px] text-[#7a5b12]">
            <IconCircleCheck size={16} className="mt-0.5 shrink-0 text-[#B7791F]" />
            <span><b>How a lead qualifies:</b> a DM only becomes a lead when all <b>5</b> details are shared — <b>first name, last name, email, phone, and their question</b>. The moment that happens it's <b>auto-pushed to Airtable</b>; the CRM link + status (called? hot? junk?) sync back into the table below. Partial ones stay under "Enquiries".</span>
          </div>

          {/* Section header + toolbar */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-[#232D42]">Confirmed leads</div>
              <div className="text-[12.5px] text-[#8A92A6] mt-0.5">Newest first · click <b>Open ↗</b> to jump into the full Airtable record.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "hot", "new", "junk", "reenq"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-lg border transition ${filter === f ? "border-brand bg-brand-light text-brand" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  {f === "all" ? "All" : f === "reenq" ? "Re-enquiry" : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
              <button className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 inline-flex items-center gap-1.5 hover:border-gray-300"><IconDownload size={13} /> Export</button>
              <button onClick={() => setAutoPush((v) => !v)}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition ${autoPush ? "bg-brand text-white" : "border border-gray-200 text-gray-500"}`}>
                <IconBolt size={13} /> Auto-push to CRM · {autoPush ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 max-w-md focus-within:border-brand">
            <IconSearch size={16} className="text-[#8A92A6] shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, keyword, question…"
              className="flex-1 bg-transparent outline-none text-[13px] text-[#232D42] placeholder:text-[#B4BAC6]" />
          </div>

          {pushMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-brand/30 bg-brand-light/50 px-4 py-2.5 text-[12.5px] text-brand-dark">
              <IconBolt size={15} className="mt-0.5 shrink-0" /><span>{pushMsg}</span>
              <button onClick={() => setPushMsg(null)} className="ml-auto text-brand-dark/60 hover:text-brand-dark">✕</button>
            </div>
          )}

          {/* Ledger table */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[920px]">
                <thead>
                  <tr className="bg-[#FCFCFE]">
                    {["Lead", "Contact", "Question", "Source", "Fields", "CRM status", "Last contact", "Airtable"].map((h) => (
                      <th key={h} className="text-left text-[10.5px] uppercase tracking-wider text-[#8A92A6] font-semibold px-4 py-3 border-b border-gray-100 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const filled = filledOf(l); const done = filled >= 5;
                    const st = CRM[l.crm];
                    return (
                      <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-[#FafbFe] align-middle">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[12.5px] font-semibold" style={{ background: l.av }}>
                              {(l.first || l.email || "?").slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <div className="text-[13.5px] font-semibold text-[#232D42] truncate flex items-center gap-1.5">
                                {`${l.first} ${l.last}`.trim() || "New lead"}
                                {l.live && <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 rounded px-1 py-[1px]">live</span>}
                              </div>
                              <div className="text-[11px] text-[#A6ACBE]">{l.when}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-[#232D42] whitespace-nowrap">
                          {l.email || <span className="text-gray-300">—</span>}
                          <div className="text-[11.5px] text-[#8A92A6]">{l.phone || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-[#232D42] max-w-[230px]">{l.query || <span className="text-gray-300 italic">—</span>}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="text-[12.5px] text-[#232D42] whitespace-nowrap">{l.sourcePost}</span>
                            {l.keyword && <span className="text-[10px] font-semibold bg-gray-100 text-[#8A92A6] rounded px-1.5 py-[1px]">#&nbsp;{l.keyword}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${done ? "text-emerald-600" : "text-amber-600"}`}>
                            {done ? <IconCircleCheck size={13} /> : null}{filled}/5
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[11px] font-semibold rounded-full px-2.5 py-[3px]" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[#232D42] whitespace-nowrap">
                          {l.called ? <>{l.called.label}{l.called.by && <div className="text-[11px] text-[#A6ACBE]">by {l.called.by}</div>}</> : <span className="text-[#A6ACBE]">{done ? "Not called yet" : "—"}</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {l.airtableUrl
                            ? <a href={l.airtableUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand border border-brand-light rounded-lg px-2.5 py-1.5 hover:bg-brand-light/60">Open <IconExternalLink size={12} /></a>
                            : done
                              ? <button onClick={onPush} className="inline-flex items-center gap-1 text-[12px] font-semibold text-white bg-brand rounded-lg px-2.5 py-1.5 hover:bg-brand-dark">Push to CRM <IconArrowRight size={12} /></button>
                              : <span className="text-[12px] text-[#C2C7D3]">not pushed</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={8} className="text-center text-[13px] text-gray-400 py-10">No leads match.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-[#8A92A6]">
            <span><b>Status</b> is set by your sales team in Airtable and mirrors back here:</span>
            {(["new", "initial", "hot", "reenq", "won", "junk"] as const).map((k) => (
              <span key={k} className="text-[11px] font-semibold rounded-full px-2.5 py-[3px]" style={{ background: CRM[k].bg, color: CRM[k].fg }}>{CRM[k].label}</span>
            ))}
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
      <div className="text-[12.5px] text-[#8A92A6]">Raw inbound DM feed — every conversation captured, complete or not. The <b>Leads</b> tab is the qualified subset (5/5).</div>
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
                <div className={`text-[11.5px] font-semibold ${done ? "text-emerald-600" : "text-amber-600"}`}>{filled}/5</div>
                <div className="text-[10.5px] text-[#A6ACBE]">{l.when}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, accent, muted, small }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean; muted?: string; small?: boolean }) {
  return (
    <div className={`bg-white border rounded-2xl p-4 ${accent ? "border-l-[3px] border-l-brand border-y-gray-100 border-r-gray-100" : "border-gray-100"}`}>
      <div className="flex items-center gap-1.5 text-[11.5px] text-[#8A92A6]">{icon}{label}</div>
      <div className={`${small ? "text-[19px]" : "text-[26px]"} font-semibold text-[#232D42] tabular-nums mt-1 truncate leading-tight`}>
        {value}{muted && <span className="text-[13px] text-[#A6ACBE] font-normal"> {muted}</span>}
      </div>
      <div className="text-[11px] text-[#A6ACBE] mt-1 truncate">{sub}</div>
    </div>
  );
}
