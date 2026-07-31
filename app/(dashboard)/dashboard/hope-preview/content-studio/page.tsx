"use client";
import { useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { useApi } from "@/lib/use-api";
import {
  IconSparkles, IconBrandInstagram, IconBrandLinkedin, IconMovie, IconLayoutGrid, IconPencil, IconCopy,
  IconCircleDashed, IconCircleCheck, IconAlertTriangle, IconTrash, IconExternalLink, IconX, IconChevronRight, IconPalette,
} from "@tabler/icons-react";

type Draft = { platform: string; label: string; content: string };
type Item = {
  id: string; kind: string; title: string; source: string | null; source_url: string | null;
  interest: string | null; status: "generating" | "ready" | "failed"; factcheck: string | null;
  drafts: Draft[]; citations: string[] | null; model: string | null; error: string | null; created_at: string;
};

// Design work is coordinated by Manya (she sets publishing date, type, status) but the
// assignee is pickable per hand-off.
const TEAM = [
  { key: "manya", label: "Manya" },
  { key: "praveen", label: "Praveen" },
  { key: "nikhil", label: "Nikhil" },
  { key: "nandu", label: "Nandu" },
];
const PLATFORM_ICON: Record<string, React.ReactNode> = {
  instagram: <IconBrandInstagram size={16} className="text-brand" />,
  carousel: <IconLayoutGrid size={16} className="text-brand" />,
  linkedin: <IconBrandLinkedin size={16} className="text-brand" />,
  reel: <IconMovie size={16} className="text-brand" />,
};
const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

export default function ContentStudioPage() {
  return (
    <HopeDashboardShell active="content-studio" title="Content Studio" hideAccountPicker hideRange
      subtitle="AI-written copy from your topics. Review it, then send each piece to a designer to create the visual — nothing skips straight to publishing.">
      {() => <Inner />}
    </HopeDashboardShell>
  );
}

function Inner() {
  const { data, isLoading, refresh } = useApi<{ drafts: Item[] }>("/api/content");
  const items = data?.drafts || [];
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!items.some((d) => d.status === "generating")) return;
    const t = setTimeout(refresh, 4000);
    return () => clearTimeout(t);
  }, [items, refresh]);

  const open = items.find((i) => i.id === openId) || null;

  if (isLoading && items.length === 0) return <div className="hope-scope text-[13px] text-gray-400 py-16 text-center">Loading…</div>;

  return (
    <div className="hope-scope space-y-4">
      {items.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
          <IconSparkles size={28} className="text-brand mx-auto mb-2" />
          <div className="text-[15px] font-semibold text-[#232D42] mb-1">No content yet</div>
          <div className="text-[13px] text-gray-500 max-w-md mx-auto">Open <b>Content Radar</b>, find a topic, and hit <b>Make content</b>. The AI-written copy lands here for you to review and hand to a designer.</div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="text-left font-medium px-4 py-2.5">Topic</th>
                  <th className="text-left font-medium px-3 py-2.5">Interest</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5">Drafts</th>
                  <th className="text-left font-medium px-3 py-2.5">Generated</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} onClick={() => setOpenId(it.id)}
                    className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-brand-light/40 transition">
                    <td className="px-4 py-3 max-w-md"><div className="font-medium text-[#232D42] truncate" title={it.title}>{it.title}</div><div className="text-[11px] text-gray-400">{it.source || "—"}</div></td>
                    <td className="px-3 py-3">{it.interest ? <span className="bg-brand-light text-brand rounded-full px-2 py-0.5 text-[11.5px]">{it.interest}</span> : "—"}</td>
                    <td className="px-3 py-3"><StatusPill status={it.status} /></td>
                    <td className="px-3 py-3 text-gray-600">{it.status === "ready" ? `${it.drafts?.length || 0} pieces` : it.status === "generating" ? "…" : "—"}</td>
                    <td className="px-3 py-3 text-gray-400 whitespace-nowrap">{ago(it.created_at)}</td>
                    <td className="px-3 py-3 text-right"><IconChevronRight size={15} className="text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && <DetailModal it={open} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}

function StatusPill({ status }: { status: Item["status"] }) {
  if (status === "ready") return <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 font-medium text-[11.5px]"><IconCircleCheck size={12} /> Ready</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 rounded-full px-2 py-0.5 font-medium text-[11.5px]"><IconAlertTriangle size={12} /> Failed</span>;
  return <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 rounded-full px-2 py-0.5 font-medium text-[11.5px]"><IconCircleDashed size={12} className="animate-spin" /> Generating</span>;
}

function DetailModal({ it, onClose, onChanged }: { it: Item; onClose: () => void; onChanged: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const del = async () => { await fetch(`/api/content?id=${it.id}`, { method: "DELETE" }); onChanged(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-[#232D42] leading-snug">{it.title}</div>
            <div className="flex items-center gap-2 mt-1.5 text-[11.5px] text-gray-500 flex-wrap">
              {it.interest && <span className="bg-brand-light text-brand rounded-full px-2 py-0.5">{it.interest}</span>}
              <StatusPill status={it.status} />
              {it.source && <span>{it.source}</span>}
              <span>· {ago(it.created_at)}</span>
              {it.model && <span className="text-gray-400">· via Perplexity</span>}
            </div>
          </div>
          <button onClick={del} className="text-gray-300 hover:text-rose-500" title="Delete"><IconTrash size={16} /></button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><IconX size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {it.status === "failed" && <div className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">Generation failed{it.error ? `: ${it.error}` : "."}</div>}
          {it.status === "generating" && <div className="flex items-center gap-2 text-[13px] text-gray-400 py-6 justify-center"><IconCircleDashed size={16} className="animate-spin" /> Writing your drafts…</div>}

          {it.factcheck && (
            <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/70 text-[12.5px] text-gray-600">
              <span className="font-semibold text-[#232D42]">Fact-check</span> — {it.factcheck}
              {it.source_url && <a href={it.source_url} target="_blank" rel="noreferrer" className="text-brand hover:underline ml-2 inline-flex items-center gap-0.5">source <IconExternalLink size={11} /></a>}
            </div>
          )}

          {it.drafts?.map((d) => <DraftCard key={d.platform} d={d} it={it} />)}
        </div>
      </div>
    </div>
  );
}

function DraftCard({ d, it }: { d: Draft; it: Item }) {
  const [text, setText] = useState(d.content);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [assignee, setAssignee] = useState("manya");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const sendToDesign = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/marketing-hub/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ title: `${it.title} — ${d.label}`, content: text, owner: assignee, sbu: it.interest || undefined }),
      });
      if (res.ok) { setSentTo(TEAM.find((t) => t.key === assignee)?.label || assignee); setPickOpen(false); }
    } finally { setSending(false); }
  };

  return (
    <div className="border border-gray-100 rounded-xl p-3 bg-white flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#232D42]">
        {PLATFORM_ICON[d.platform] || <IconSparkles size={16} className="text-brand" />}{d.label}
      </div>
      {editing
        ? <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="w-full text-[12.5px] text-gray-800 border border-gray-200 rounded-lg p-2 leading-relaxed" />
        : <div className="text-[12.5px] text-gray-700 whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto">{text}</div>}
      <div className="flex items-center gap-2 flex-wrap mt-0.5">
        <button onClick={() => setEditing((v) => !v)} className="text-[11.5px] inline-flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 text-gray-700 hover:border-gray-300"><IconPencil size={13} /> {editing ? "Done" : "Edit"}</button>
        <button onClick={copy} className="text-[11.5px] inline-flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 text-gray-700 hover:border-gray-300"><IconCopy size={13} /> {copied ? "Copied" : "Copy"}</button>
        <div className="ml-auto relative">
          {sentTo ? (
            <span className="text-[11.5px] inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1"><IconCircleCheck size={13} /> Sent to {sentTo}</span>
          ) : pickOpen ? (
            <div className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg p-1">
              <span className="text-[11px] text-gray-400 pl-1">Assign to</span>
              {TEAM.map((t) => (
                <button key={t.key} onClick={() => setAssignee(t.key)}
                  className={`text-[11.5px] px-2 py-0.5 rounded-md ${assignee === t.key ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"}`}>{t.label}</button>
              ))}
              <button onClick={sendToDesign} disabled={sending} className="text-[11.5px] inline-flex items-center gap-1 bg-brand text-white rounded-md px-2.5 py-1 hover:bg-brand-dark disabled:opacity-60 ml-1"><IconPalette size={13} /> {sending ? "Sending…" : "Send"}</button>
            </div>
          ) : (
            <button onClick={() => setPickOpen(true)} className="text-[11.5px] inline-flex items-center gap-1 bg-brand text-white rounded-lg px-2.5 py-1 hover:bg-brand-dark"><IconPalette size={13} /> Send to design</button>
          )}
        </div>
      </div>
    </div>
  );
}
