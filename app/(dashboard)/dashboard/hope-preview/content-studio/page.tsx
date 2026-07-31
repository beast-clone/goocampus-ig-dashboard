"use client";
import { useEffect, useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { useApi } from "@/lib/use-api";
import {
  IconSparkles, IconBrandInstagram, IconBrandLinkedin, IconMovie, IconPencil, IconCopy, IconCalendar,
  IconCircleDashed, IconCircleCheck, IconAlertTriangle, IconTrash, IconExternalLink,
} from "@tabler/icons-react";

type Draft = { platform: string; label: string; content: string };
type Item = {
  id: string; kind: string; title: string; source: string | null; source_url: string | null;
  interest: string | null; status: "generating" | "ready" | "failed"; factcheck: string | null;
  drafts: Draft[]; citations: string[] | null; model: string | null; error: string | null; created_at: string;
};

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  instagram: <IconBrandInstagram size={17} className="text-brand" />,
  linkedin: <IconBrandLinkedin size={17} className="text-brand" />,
  reel: <IconMovie size={17} className="text-brand" />,
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
      subtitle="Drafts generated from your topics — review, edit, and send to the Scheduler. Nothing posts without your OK.">
      {() => <Inner />}
    </HopeDashboardShell>
  );
}

function Inner() {
  const { data, isLoading, refresh } = useApi<{ drafts: Item[] }>("/api/content");
  const items = data?.drafts || [];
  // Poll while anything is still generating.
  useEffect(() => {
    if (!items.some((d) => d.status === "generating")) return;
    const t = setTimeout(refresh, 4000);
    return () => clearTimeout(t);
  }, [items, refresh]);

  if (isLoading && items.length === 0) return <div className="hope-scope text-[13px] text-gray-400 py-16 text-center">Loading…</div>;

  return (
    <div className="hope-scope space-y-5">
      {items.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
          <IconSparkles size={28} className="text-brand mx-auto mb-2" />
          <div className="text-[15px] font-semibold text-[#232D42] mb-1">No content yet</div>
          <div className="text-[13px] text-gray-500 max-w-md mx-auto">Open <b>Content Radar</b>, find a topic, and hit <b>Make content</b>. The generated drafts land here for review.</div>
        </div>
      ) : items.map((it) => <ContentCard key={it.id} it={it} onChanged={refresh} />)}
    </div>
  );
}

function ContentCard({ it, onChanged }: { it: Item; onChanged: () => void }) {
  const del = async () => { await fetch(`/api/content?id=${it.id}`, { method: "DELETE" }); onChanged(); };
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 md:p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-[#232D42] leading-snug">{it.title}</div>
          <div className="flex items-center gap-2 mt-1.5 text-[11.5px] text-gray-500 flex-wrap">
            {it.interest && <span className="bg-brand-light text-brand rounded-full px-2 py-0.5">{it.interest}</span>}
            <StatusPill status={it.status} />
            {it.source && <span>{it.source}</span>}
            <span>· generated {ago(it.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {it.model && <span className="text-[11px] text-gray-400">via Perplexity</span>}
          <button onClick={del} className="text-gray-300 hover:text-rose-500" title="Delete"><IconTrash size={15} /></button>
        </div>
      </div>

      {it.status === "failed" && (
        <div className="mt-3 text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
          Generation failed{it.error ? `: ${it.error}` : "."} <button onClick={onChanged} className="underline ml-1">Refresh</button>
        </div>
      )}

      {it.factcheck && (
        <div className="mt-3 border border-gray-100 rounded-xl p-3 bg-gray-50/70 text-[12.5px] text-gray-600">
          <span className="font-semibold text-[#232D42]">Fact-check</span> — {it.factcheck}
          {it.source_url && <a href={it.source_url} target="_blank" rel="noreferrer" className="text-brand hover:underline ml-2 inline-flex items-center gap-0.5">source <IconExternalLink size={11} /></a>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        {it.drafts?.map((d) => <DraftCard key={d.platform} d={d} it={it} />)}
        {it.status === "generating" && (
          <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/60 flex items-center gap-2 text-[13px] text-gray-400">
            <IconCircleDashed size={16} className="animate-spin" /> Writing your drafts…
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Item["status"] }) {
  if (status === "ready") return <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 font-medium"><IconCircleCheck size={12} /> Ready to review</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 rounded-full px-2 py-0.5 font-medium"><IconAlertTriangle size={12} /> Failed</span>;
  return <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 rounded-full px-2 py-0.5 font-medium"><IconCircleDashed size={12} className="animate-spin" /> Generating…</span>;
}

function DraftCard({ d, it }: { d: Draft; it: Item }) {
  const [text, setText] = useState(d.content);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  // Prefill the Scheduler composer with this draft (same draft-param the Radar uses).
  const schedHref = (() => {
    const p = new URLSearchParams();
    p.set("title", it.title);
    p.set("content", text);
    if (it.interest) p.set("interest", it.interest);
    return `/dashboard/scheduler?draft=${encodeURIComponent(p.toString())}`;
  })();

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
        <a href={schedHref} className="ml-auto text-[11.5px] inline-flex items-center gap-1 bg-brand text-white rounded-lg px-2.5 py-1 hover:bg-brand-dark"><IconCalendar size={13} /> Scheduler</a>
      </div>
    </div>
  );
}
