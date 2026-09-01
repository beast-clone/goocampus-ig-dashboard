"use client";
import { useCallback, useEffect, useState } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { useApi } from "@/lib/use-api";
import {
  IconSparkles, IconBrandInstagram, IconBrandLinkedin, IconMovie, IconLayoutGrid, IconPencil, IconCopy,
  IconCircleDashed, IconCircleCheck, IconAlertTriangle, IconTrash, IconExternalLink, IconX, IconChevronRight, IconPalette,
  IconFlame, IconSearch, IconMicroscope, IconWorldSearch, IconTrendingUp,
} from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { PlaybooksLibrary } from "./PlaybooksLibrary";
import MissingFieldsModal, { gateFromResponse, type GateBlock } from "../MissingFieldsModal";
import { SBU_OPTIONS } from "@/lib/sbus";

type Draft = { platform: string; label: string; content: string };
type Item = {
  id: string; kind: string; title: string; source: string | null; source_url: string | null;
  interest: string | null; status: "generating" | "ready" | "failed"; factcheck: string | null;
  drafts: Draft[]; citations: string[] | null; model: string | null; error: string | null; created_at: string;
};
type FeedItem = { id?: string; title: string; link?: string; source?: string; primaryInterest?: string };

// POST body for the make endpoint (Path A radar item or Path B bare topic).
type MakeBody = { title: string; kind: "radar" | "topic"; url?: string; source?: string; interest?: string };
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

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
    <PreviewDashboardShell active="content-studio" title="Content Studio" hideAccountPicker hideRange
      subtitle="Pick a trending topic or research your own. Review the facts and sources, then send each piece to a designer — nothing skips straight to publishing.">
      {() => <StudioTabs />}
    </PreviewDashboardShell>
  );
}

// Two modes live in Content Studio: "Create" (research → drafts) and "Playbooks"
// (the 49-skill marketing framework library). Deep-linkable via ?tab=playbooks.
function StudioTabs() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"create" | "playbooks">(sp.get("tab") === "playbooks" ? "playbooks" : "create");
  return (
    <>
      <div className="flex items-center gap-2 mb-5">
        {(["create", "playbooks"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-[13px] font-medium px-4 py-2 rounded-xl border transition ${tab === k ? "bg-brand text-white border-brand" : "bg-white text-[#4A5468] border-gray-100 hover:border-gray-300"}`}
          >
            {k === "create" ? "Create" : "Playbooks"}
          </button>
        ))}
      </div>
      {tab === "create" ? <Inner /> : <PlaybooksLibrary />}
    </>
  );
}

function Inner() {
  const { data, refresh } = useApi<{ drafts: Item[] }>("/api/content");
  const items = data?.drafts || [];
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!items.some((d) => d.status === "generating")) return;
    const t = setTimeout(refresh, 4000);
    return () => clearTimeout(t);
  }, [items, refresh]);

  // Start a generation job (radar pick or bare topic), then refresh so the new
  // "generating" row appears and polling takes over.
  const startJob = useCallback(async (body: MakeBody) => {
    await fetch("/api/content/make", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify(body),
    });
    await refresh();
  }, [refresh]);

  const open = items.find((i) => i.id === openId) || null;
  // Any recent job that failed on Perplexity quota → the whole engine is out of credit.
  const quotaHit = items.some((i) => i.status === "failed" && /quota|insufficient|401/i.test(i.error || ""));

  return (
    <div className="preview-scope space-y-5">
      {quotaHit && (
        <div className="border border-amber-200 bg-amber-50 rounded-2xl p-3.5 flex items-start gap-2.5">
          <IconAlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[12.5px] text-amber-900">
            <span className="font-semibold">AI credit is exhausted.</span> Content generation is paused because the Perplexity API key ran out of quota. Top up the plan to resume — trending picks and topic research will work again immediately.
            <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noreferrer" className="text-brand hover:underline ml-1 inline-flex items-center gap-0.5">Open Perplexity billing <IconExternalLink size={11} /></a>
          </div>
        </div>
      )}
      <TrendingStrip onPick={startJob} />
      <ResearchBox onResearch={startJob} />

      <div>
        <SectionLabel icon={<IconSparkles size={13} className="text-brand" />}>Your content</SectionLabel>
        {items.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
            <div className="text-[13.5px] text-gray-500 max-w-md mx-auto">Pick a trending topic above, or research your own — the AI-written drafts land here for you to review and hand to a designer.</div>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="text-left font-medium px-4 py-2.5">Topic</th>
                    <th className="text-left font-medium px-3 py-2.5">Source</th>
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
                      <td className="px-4 py-3 max-w-md"><div className="font-medium text-[#232D42] truncate" title={it.title}>{it.title}</div>{it.interest && <div className="text-[11px] text-gray-400">{it.interest}</div>}</td>
                      <td className="px-3 py-3">{it.kind === "topic"
                        ? <span className="inline-flex items-center gap-1 bg-brand-light text-brand rounded-full px-2 py-0.5 text-[11px]"><IconMicroscope size={11} /> Researched</span>
                        : <span className="text-gray-500 text-[12px]">{it.source || "Radar"}</span>}</td>
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
      </div>

      {open && <DetailModal it={open} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}

function SectionLabel({ icon, children, right }: { icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400 mb-2 px-0.5">
      {icon} {children}
      {right && <span className="ml-auto normal-case tracking-normal">{right}</span>}
    </div>
  );
}

// Top strip — trending picks pulled straight from Content Radar. Optional: the team
// glances, picks one to turn into content, or ignores the strip entirely.
function TrendingStrip({ onPick }: { onPick: (b: MakeBody) => Promise<void> }) {
  const { data } = useApi<{ items: FeedItem[] }>("/api/radar/feed?limit=8");
  const [pending, setPending] = useState<string | null>(null);
  const items = (data?.items || []).filter((i) => i.title).slice(0, 6);
  if (items.length === 0) return null;

  const pick = async (it: FeedItem) => {
    const key = it.link || it.title;
    setPending(key);
    try { await onPick({ title: it.title, url: it.link, source: it.source, interest: it.primaryInterest, kind: "radar" }); }
    finally { setPending(null); }
  };

  return (
    <div>
      <SectionLabel icon={<IconFlame size={13} className="text-brand" />} right={<span className="text-brand text-[11px]">Optional — pick one or skip</span>}>
        Trending now · from Content Radar
      </SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {items.map((it) => {
          const key = it.link || it.title;
          const busy = pending === key;
          return (
            <div key={key} className="bg-white border border-gray-100 rounded-xl p-3 flex flex-col">
              <div className="flex items-center gap-1.5 mb-1.5">
                {it.primaryInterest && <span className="bg-brand-light text-brand rounded-full px-2 py-0.5 text-[10.5px]">{it.primaryInterest}</span>}
                <span className="inline-flex items-center gap-0.5 text-[10.5px] text-gray-400"><IconTrendingUp size={11} /> {it.source || "Radar"}</span>
              </div>
              <div className="text-[12.5px] font-medium text-[#232D42] leading-snug mb-2.5 line-clamp-2" title={it.title}>{it.title}</div>
              <button onClick={() => pick(it)} disabled={busy}
                className="mt-auto w-full inline-flex items-center justify-center gap-1 bg-brand text-white rounded-lg px-2 py-1.5 text-[11.5px] hover:bg-brand-dark disabled:opacity-60">
                <IconSparkles size={13} /> {busy ? "Starting…" : "Make content"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Second section — the team types any topic; deep research + fact-check + drafts.
// Deep research is much pricier than a quick post, so we confirm before spending.
function ResearchBox({ onResearch }: { onResearch: (b: MakeBody) => Promise<void> }) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const ask = () => { if (topic.trim() && !busy) setConfirming(true); };
  const run = async () => {
    const t = topic.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await onResearch({ title: t, kind: "topic" }); setTopic(""); setConfirming(false); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <SectionLabel icon={<IconMicroscope size={13} className="text-brand" />}>Research your own topic</SectionLabel>
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 focus-within:border-brand">
            <IconSearch size={16} className="text-gray-400 shrink-0" />
            <input value={topic} onChange={(e) => { setTopic(e.target.value); setConfirming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
              placeholder="e.g. FMGE 2026 pass percentage trends"
              className="w-full py-2.5 text-[13px] text-[#232D42] outline-none bg-transparent placeholder:text-gray-400" />
          </div>
          <button onClick={ask} disabled={busy || !topic.trim()}
            className="inline-flex items-center justify-center gap-1.5 bg-brand text-white rounded-lg px-4 py-2.5 text-[12.5px] font-medium hover:bg-brand-dark disabled:opacity-60 whitespace-nowrap">
            <IconSparkles size={14} /> {busy ? "Starting…" : "Research & write"}
          </button>
        </div>

        {confirming ? (
          <div className="mt-3 border border-brand-light bg-brand-light/40 rounded-xl p-3">
            <div className="text-[12.5px] text-[#232D42] flex items-start gap-2">
              <IconAlertTriangle size={15} className="text-brand shrink-0 mt-0.5" />
              <span>Deep research reads many live sources — it costs noticeably more than a trending-topic post (roughly <b>₹10–30 per topic</b>) and takes ~1–3 minutes. Run it for <b>“{topic.trim()}”</b>?</span>
            </div>
            <div className="flex gap-2 mt-2.5">
              <button onClick={run} disabled={busy}
                className="inline-flex items-center gap-1.5 bg-brand text-white rounded-lg px-3 py-1.5 text-[12px] font-medium hover:bg-brand-dark disabled:opacity-60">
                <IconSparkles size={13} /> {busy ? "Starting…" : "Run deep research"}
              </button>
              <button onClick={() => setConfirming(false)} disabled={busy}
                className="text-[12px] border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-gray-300">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="text-[11.5px] text-gray-400 mt-2 flex items-center gap-1.5">
            <IconWorldSearch size={13} /> Reads multiple live sources, fact-checks, then writes 4 drafts — and shows you where it searched.
          </div>
        )}
      </div>
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
              {it.model && <span className="text-gray-400">· via Perplexity{it.model.includes("deep") ? " deep research" : ""}</span>}
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

          {it.citations && it.citations.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">
                <IconWorldSearch size={13} /> Where it searched · {it.citations.length} source{it.citations.length > 1 ? "s" : ""}
              </div>
              <div className="flex flex-col gap-1.5">
                {it.citations.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-[12px] text-brand hover:bg-brand-light/50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                    <IconExternalLink size={12} className="shrink-0" /> <span className="truncate">{hostOf(u)}</span>
                    <span className="text-gray-400 truncate hidden sm:inline">— {u}</span>
                  </a>
                ))}
              </div>
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
  // The item usually carries its own interest; when it doesn't, the sender picks one
  // here — a task with no SBU is refused by the create gate.
  const [sbu, setSbu] = useState(it.interest || "");
  const [gate, setGate] = useState<GateBlock | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const sendToDesign = async () => {
    setSending(true);
    setSendErr(null);
    try {
      const title = `${it.title} — ${d.label}`;
      const res = await fetch("/api/marketing-hub/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ title, content: text, owner: assignee, sbu: sbu || undefined }),
      });
      if (res.ok) { setSentTo(TEAM.find((t) => t.key === assignee)?.label || assignee); setPickOpen(false); return; }
      // Previously this had no else at all — a refused create looked exactly like
      // nothing had happened.
      const j = await res.json().catch(() => ({}));
      const block = gateFromResponse(res.status, j, title);
      if (block) setGate(block);
      else setSendErr((j as { error?: string }).error || `HTTP ${res.status}`);
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e));
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
            <div className="inline-flex flex-wrap items-center gap-1.5 border border-gray-200 rounded-lg p-1">
              <span className="text-[11px] text-gray-400 pl-1">Assign to</span>
              {TEAM.map((t) => (
                <button key={t.key} onClick={() => setAssignee(t.key)}
                  className={`text-[11.5px] px-2 py-0.5 rounded-md ${assignee === t.key ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"}`}>{t.label}</button>
              ))}
              <select value={sbu} onChange={(e) => setSbu(e.target.value)} title="SBU — which brand this is for"
                className="text-[11.5px] border border-gray-200 rounded-md px-1.5 py-0.5 text-gray-700 max-w-[150px]">
                <option value="">SBU…</option>
                {Array.from(new Set([...(it.interest ? [it.interest] : []), ...SBU_OPTIONS])).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <button onClick={sendToDesign} disabled={sending} className="text-[11.5px] inline-flex items-center gap-1 bg-brand text-white rounded-md px-2.5 py-1 hover:bg-brand-dark disabled:opacity-60 ml-1"><IconPalette size={13} /> {sending ? "Sending…" : "Send"}</button>
            </div>
          ) : (
            <button onClick={() => setPickOpen(true)} className="text-[11.5px] inline-flex items-center gap-1 bg-brand text-white rounded-lg px-2.5 py-1 hover:bg-brand-dark"><IconPalette size={13} /> Send to design</button>
          )}
        </div>
      </div>
      {sendErr && <div className="text-[11.5px] text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5">Couldn&apos;t send — {sendErr}</div>}
      {gate && <MissingFieldsModal {...gate} onClose={() => setGate(null)} />}
    </div>
  );
}
