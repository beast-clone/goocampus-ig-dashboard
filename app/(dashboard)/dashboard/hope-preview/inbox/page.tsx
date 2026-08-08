"use client";
import { useEffect, useMemo, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import {
  IconSearch, IconBrandInstagram, IconMail, IconPhone, IconMessage2, IconCircleCheck,
  IconAlertTriangle, IconExternalLink, IconInbox, IconHash, IconPhoto, IconUser, IconSparkles,
} from "@tabler/icons-react";

// Inbox (PROTOTYPE) — a native, in-dashboard view of DM leads captured from
// Instagram via the TezDM webhook → n8n → CRM pipeline. Sample data here shows the
// layout + behaviour; the real feed plugs into the same shapes once TezDM is renewed
// and the webhook payload (post id + keyword + contact fields) is confirmed.

type Status = "confirmed" | "new" | "junk";
type Msg = { from: "them" | "us"; text: string; when: string; auto?: boolean };
type Convo = {
  id: string; name: string; handle: string; av: string;
  firstName: string; lastName: string; email: string; phone: string; query: string;
  keyword: string; sourcePost: string; status: Status; when: string; unread: boolean;
  thread: Msg[];
};

// Representative sample — GooCampus funnels (gulf webinar, AMC, MBBS abroad, PLAB, NEET).
const SAMPLE: Convo[] = [
  {
    id: "1", name: "Dr. Ananya Reddy", handle: "@ananya.reddy.md", av: "#3A57E8",
    firstName: "Ananya", lastName: "Reddy", email: "ananya.reddy@gmail.com", phone: "+91 98450 11234",
    query: "Want to attend the Gulf pathway webinar — am I eligible for DHA with an Indian MBBS?",
    keyword: "gulf", sourcePost: "Gulf pathway webinar", status: "confirmed", when: "2m", unread: true,
    thread: [
      { from: "them", text: "gulf", when: "10:02" },
      { from: "us", text: "hi doctor, thank you for showing interest in the Gulf pathway webinar! Date: 10th July, Fri · 5:00 pm IST. Share your details and we'll send the link.", when: "10:02", auto: true },
      { from: "them", text: "Ananya Reddy, ananya.reddy@gmail.com, +91 98450 11234. Am I eligible for DHA with an Indian MBBS?", when: "10:05" },
    ],
  },
  {
    id: "2", name: "Rahul Menon", handle: "@rahul_menon", av: "#0EA5E9",
    firstName: "Rahul", lastName: "", email: "", phone: "+91 99001 55221",
    query: "AMC exam guidance",
    keyword: "AMC", sourcePost: "Australia AMC MCQ guide", status: "new", when: "18m", unread: true,
    thread: [
      { from: "them", text: "AMC", when: "09:44" },
      { from: "us", text: "Hi! Thanks for your interest in the Australia AMC pathway. Share your name, email and phone and our counsellor will reach out.", when: "09:44", auto: true },
      { from: "them", text: "this is my number +91 99001 55221", when: "09:46" },
    ],
  },
  {
    id: "3", name: "Sneha Iyer", handle: "@sneha.iyer", av: "#079AA2",
    firstName: "Sneha", lastName: "Iyer", email: "sneha.iyer21@gmail.com", phone: "+91 90350 78120",
    query: "MBBS in Georgia — fees and NEET requirement for 2026 intake?",
    keyword: "MBBS", sourcePost: "MBBS in Georgia reel", status: "confirmed", when: "1h", unread: false,
    thread: [
      { from: "them", text: "MBBS", when: "08:58" },
      { from: "us", text: "Hi! Here's how MBBS in Georgia works for Indian students. Share your details for a counsellor call.", when: "08:58", auto: true },
      { from: "them", text: "Sneha Iyer · sneha.iyer21@gmail.com · +91 90350 78120 — fees and NEET requirement for 2026 intake?", when: "09:03" },
    ],
  },
  {
    id: "4", name: "Fatima Sheikh", handle: "@fatima.sheikh", av: "#8B5CF6",
    firstName: "Fatima", lastName: "Sheikh", email: "fatima.sheikh@outlook.com", phone: "+91 97410 33098",
    query: "PLAB UK pathway — timeline and total cost?",
    keyword: "PLAB", sourcePost: "PLAB UK pathway", status: "confirmed", when: "3h", unread: false,
    thread: [
      { from: "them", text: "PLAB", when: "07:20" },
      { from: "us", text: "Hi doctor! The PLAB UK pathway guide is on its way. Share your details for the full roadmap.", when: "07:20", auto: true },
      { from: "them", text: "Fatima Sheikh, fatima.sheikh@outlook.com, +91 97410 33098 — timeline and total cost?", when: "07:26" },
    ],
  },
  {
    id: "5", name: "Karthik Nair", handle: "@karthik_nair", av: "#B7791F",
    firstName: "", lastName: "", email: "", phone: "",
    query: "",
    keyword: "NEET", sourcePost: "NEET PG cutoff carousel", status: "junk", when: "5h", unread: false,
    thread: [
      { from: "them", text: "hi", when: "05:11" },
      { from: "us", text: "Hi! Share your name, email and phone and our team will help with your NEET PG query.", when: "05:11", auto: true },
    ],
  },
  {
    id: "6", name: "Arjun Das", handle: "@arjun.das", av: "#D6336C",
    firstName: "Arjun", lastName: "Das", email: "", phone: "+91 96320 71145",
    query: "Gulf webinar link please",
    keyword: "gulf", sourcePost: "Gulf pathway webinar", status: "new", when: "6h", unread: false,
    thread: [
      { from: "them", text: "gulf", when: "04:02" },
      { from: "us", text: "hi doctor, thank you for showing interest in the Gulf pathway webinar! Share your details and we'll send the link.", when: "04:02", auto: true },
      { from: "them", text: "Arjun Das, +91 96320 71145 — send the link please", when: "04:09" },
    ],
  },
];

// A real submission from the public per-post form (mh_dm_leads) → the Convo shape.
type LeadRow = { id: string; first_name: string; last_name: string; email: string; phone: string; query: string; source_post: string; keyword: string; ig_username: string; status: string; created_at: string };
function rowToConvo(r: LeadRow): Convo {
  const name = `${r.first_name} ${r.last_name}`.trim() || r.email || r.phone || "New lead";
  const filled = [r.first_name, r.last_name, r.email, r.phone, r.query].filter((x) => (x || "").trim()).length;
  const status: Status = filled >= 5 ? "confirmed" : filled === 0 ? "junk" : "new";
  return {
    id: "live-" + r.id,
    name, handle: r.ig_username ? "@" + r.ig_username : "via lead form", av: "#1AA053",
    firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone, query: r.query,
    keyword: r.keyword || "", sourcePost: (r.source_post || "Lead form").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    status, when: "new", unread: true,
    thread: [{ from: "them", text: r.query || "(submitted the lead form)", when: "just now" }],
  };
}

const STATUS: Record<Status, { label: string; bg: string; fg: string }> = {
  confirmed: { label: "Confirmed lead", bg: "#CDEED9", fg: "#0F6B36" },
  new: { label: "New enquiry", bg: "#E1F0FB", fg: "#0C447C" },
  junk: { label: "Junk", bg: "#F0F2F8", fg: "#8A92A6" },
};

export default function InboxPage() {
  return (
    <HopeDashboardShell active="inbox" title="Inbox" hideAccountPicker hideRange
      subtitle="DM leads from Instagram — captured via TezDM → n8n. A lead is Confirmed only when all five details are shared.">
      {() => <InboxPrototype />}
    </HopeDashboardShell>
  );
}

function InboxPrototype() {
  const [convos, setConvos] = useState<Convo[]>(SAMPLE);
  const [selId, setSelId] = useState<string>(SAMPLE[0].id);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");

  // Pull REAL submissions from the per-post form (mh_dm_leads) and put them on top,
  // so a lead you just captured appears here live. Falls back to sample if none yet.
  useEffect(() => {
    fetch("/api/dm-leads/list")
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.leads || []) as LeadRow[];
        if (!rows.length) return;
        const live = rows.map(rowToConvo);
        setConvos([...live, ...SAMPLE]);
        setSelId(live[0].id);
      })
      .catch(() => { /* keep sample */ });
  }, []);

  const counts = useMemo(() => ({
    total: convos.length,
    confirmed: convos.filter((c) => c.status === "confirmed").length,
    newq: convos.filter((c) => c.status === "new").length,
  }), [convos]);

  // Top source posts by conversation volume.
  const byPost = useMemo(() => {
    const m = new Map<string, number>();
    convos.forEach((c) => m.set(c.sourcePost, (m.get(c.sourcePost) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [convos]);

  const shown = convos.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (q.trim()) { const t = q.toLowerCase(); return `${c.name} ${c.email} ${c.phone} ${c.keyword} ${c.sourcePost}`.toLowerCase().includes(t); }
    return true;
  });
  const sel = convos.find((c) => c.id === selId) || shown[0] || convos[0];

  const setStatus = (id: string, status: Status) => setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
  const markRead = (id: string) => setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: false } : c)));

  return (
    <div className="hope-scope space-y-5">
      {/* Prototype note */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
        <IconSparkles size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <span><b>Live demo.</b> Real submissions from the per-post lead form appear at the <b>top (green avatar)</b>; the rest is sample data showing the layout. Fill the form at <b>/lead/&lt;post&gt;</b> and it lands here. Replying still opens Instagram (that step needs Meta access) — everything else lives here.</span>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={<IconInbox size={18} className="text-brand" />} label="DMs this month" value={String(128)} sub="all inbound conversations" />
        <Stat icon={<IconCircleCheck size={18} className="text-emerald-600" />} label="Confirmed leads" value={String(41)} sub="all 5 details shared" accent />
        <Stat icon={<IconUser size={18} className="text-sky-600" />} label="New enquiries" value={String(63)} sub="partial — need follow-up" />
        <Stat icon={<IconPhoto size={18} className="text-brand" />} label="Top source post" value={byPost[0]?.[0].split(" ").slice(0, 2).join(" ") || "—"} sub={`${byPost[0]?.[1] || 0} leads · ${byPost[0]?.[0] || ""}`} />
      </div>

      {/* Two-pane inbox */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
        {/* List */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-brand">
              <IconSearch size={16} className="text-[#8A92A6] shrink-0" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, keyword…"
                className="flex-1 bg-transparent outline-none text-[13px] text-[#232D42] placeholder:text-[#B4BAC6]" />
            </div>
            <div className="flex gap-1.5 mt-2.5">
              {(["all", "confirmed", "new", "junk"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-[11.5px] font-medium px-2.5 py-1 rounded-lg border transition ${filter === f ? "border-brand bg-brand-light text-brand" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  {f === "all" ? "All" : f === "new" ? "New" : f === "confirmed" ? "Confirmed" : "Junk"}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-50">
            {shown.map((c) => {
              const st = STATUS[c.status];
              const on = c.id === sel?.id;
              return (
                <button key={c.id} onClick={() => { setSelId(c.id); markRead(c.id); }}
                  className={`w-full text-left px-3.5 py-3 flex gap-3 hover:bg-gray-50/70 transition ${on ? "bg-brand-light/40" : ""}`}>
                  <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-[13px] font-semibold" style={{ background: c.av }}>
                    {c.name.replace("Dr. ", "").slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`text-[13px] truncate ${c.unread ? "font-semibold text-[#232D42]" : "font-medium text-[#4A5468]"}`}>{c.name}</span>
                      <span className="ml-auto text-[10.5px] text-gray-400 shrink-0">{c.when}</span>
                    </span>
                    <span className="block text-[11.5px] text-gray-500 truncate mt-0.5">{c.thread[c.thread.length - 1].text}</span>
                    <span className="flex items-center gap-1.5 mt-1.5">
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500"><IconHash size={9} />{c.keyword}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                      {c.unread && <span className="ml-auto w-2 h-2 rounded-full bg-brand shrink-0" />}
                    </span>
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && <div className="text-[13px] text-gray-400 text-center py-10">No conversations match.</div>}
          </div>
        </div>

        {/* Detail */}
        {sel && <Detail key={sel.id} c={sel} onStatus={(s) => setStatus(sel.id, s)} />}
      </div>
    </div>
  );
}

function Detail({ c, onStatus }: { c: Convo; onStatus: (s: Status) => void }) {
  const st = STATUS[c.status];
  const fields: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <IconUser size={14} />, label: "First name", value: c.firstName },
    { icon: <IconUser size={14} />, label: "Last name", value: c.lastName },
    { icon: <IconMail size={14} />, label: "Email", value: c.email },
    { icon: <IconPhone size={14} />, label: "Phone", value: c.phone },
    { icon: <IconMessage2 size={14} />, label: "Query", value: c.query },
  ];
  const filled = fields.filter((f) => f.value.trim()).length;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl flex flex-col min-h-[560px]">
      {/* header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-100">
        <span className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white text-[15px] font-semibold" style={{ background: c.av }}>{c.name.replace("Dr. ", "").slice(0, 1)}</span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-[#232D42] flex items-center gap-2">{c.name}
            <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
          </div>
          <div className="text-[12px] text-gray-400">{c.handle}</div>
        </div>
        <a href="https://ig.me/m/goocampus" target="_blank" rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium bg-brand text-white rounded-lg px-3 py-2 hover:bg-brand-dark transition">
          <IconBrandInstagram size={15} /> Reply in Instagram <IconExternalLink size={12} />
        </a>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-0 flex-1 min-h-0">
        {/* thread */}
        <div className="p-4 flex flex-col gap-2.5 overflow-y-auto max-h-[470px] border-b xl:border-b-0 xl:border-r border-gray-100">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Conversation</div>
          {c.thread.map((m, i) => (
            <div key={i} className={`max-w-[78%] ${m.from === "us" ? "self-end items-end" : "self-start items-start"} flex flex-col`}>
              <div className={`text-[12.5px] leading-relaxed rounded-2xl px-3 py-2 ${m.from === "us" ? "bg-brand text-white rounded-br-sm" : "bg-gray-100 text-[#232D42] rounded-bl-sm"}`}>{m.text}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 px-1">{m.auto ? "auto-reply · " : ""}{m.when}</div>
            </div>
          ))}
          <div className="mt-auto pt-2 text-[11px] text-gray-400 flex items-center gap-1.5">
            <IconAlertTriangle size={13} className="text-amber-500" /> Replies are sent from Instagram — use the button above (in-dashboard sending needs Meta access).
          </div>
        </div>

        {/* right rail: captured details + source + actions */}
        <div className="p-4 space-y-4">
          {/* completeness */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Captured details</div>
              <span className={`text-[11px] font-semibold ${filled === 5 ? "text-emerald-600" : "text-amber-600"}`}>{filled}/5</span>
            </div>
            <div className="space-y-1.5">
              {fields.map((f) => (
                <div key={f.label} className="flex items-start gap-2 text-[12.5px]">
                  <span className={`mt-0.5 shrink-0 ${f.value.trim() ? "text-emerald-500" : "text-gray-300"}`}>
                    {f.value.trim() ? <IconCircleCheck size={15} /> : <span className="inline-block w-[15px] text-center">—</span>}
                  </span>
                  <span className="text-gray-400 w-[64px] shrink-0">{f.label}</span>
                  <span className={`flex-1 ${f.value.trim() ? "text-[#232D42]" : "text-gray-300 italic"}`}>{f.value.trim() || "not shared"}</span>
                </div>
              ))}
            </div>
            {filled === 5
              ? <div className="mt-2 text-[11.5px] text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5"><IconCircleCheck size={13} /> All 5 shared — counts as a confirmed lead.</div>
              : <div className="mt-2 text-[11.5px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">Missing {5 - filled} — still an enquiry until all 5 are shared.</div>}
          </div>

          {/* source */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Source</div>
            <div className="flex items-center gap-2 text-[12.5px] text-[#232D42]">
              <IconPhoto size={15} className="text-brand shrink-0" />
              <span className="flex-1">{c.sourcePost}</span>
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-gray-500 mt-1.5">
              <IconHash size={15} className="text-gray-400 shrink-0" />
              <span>triggered by keyword <b className="text-[#232D42]">"{c.keyword}"</b></span>
            </div>
          </div>

          {/* actions */}
          <div className="pt-1 flex flex-wrap gap-2">
            <button onClick={() => onStatus("confirmed")} className="text-[11.5px] font-medium inline-flex items-center gap-1 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100"><IconCircleCheck size={13} /> Mark confirmed</button>
            <button onClick={() => onStatus("junk")} className="text-[11.5px] font-medium inline-flex items-center gap-1 border border-gray-200 text-gray-500 rounded-lg px-2.5 py-1.5 hover:border-gray-300">Mark junk</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`bg-white border rounded-2xl p-4 ${accent ? "border-emerald-200" : "border-gray-100"}`}>
      <div className="flex items-center gap-2 text-[12px] text-gray-500">{icon}{label}</div>
      <div className="text-[24px] font-semibold text-[#232D42] tabular-nums mt-1 truncate">{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</div>
    </div>
  );
}
