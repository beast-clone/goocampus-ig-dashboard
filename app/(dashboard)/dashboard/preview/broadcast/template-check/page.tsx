"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconArrowLeft, IconAlertTriangle, IconAlertCircle, IconInfoCircle, IconSparkles,
  IconCheck, IconCopy, IconExternalLink,
} from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { PreviewSelect } from "@/app/(dashboard)/dashboard/preview/PreviewSelect";

// Our estimate, derived from what the rules actually found. Red below a third,
// amber to two thirds, green above. Never 0 or 100 — we do not get a vote.
function Meter({ score, why }: { score: number; why: string }) {
  const tone = score < 35 ? { bar: "#C03221", text: "text-[#C03221]", bg: "bg-[#FBE7E4]" }
    : score < 70 ? { bar: "#BA7517", text: "text-[#8A5A00]", bg: "bg-[#FDF6E7]" }
    : { bar: "#1E7B4C", text: "text-[#0F6E3C]", bg: "bg-[#EEF7F1]" };
  return (
    <div className={`rounded-xl px-4 py-3 ${tone.bg}`}>
      <div className="flex items-baseline gap-2">
        <span className={`text-[26px] font-medium tabular-nums ${tone.text}`}>{score}%</span>
        <span className={`text-[13px] ${tone.text}`}>likely to be accepted as submitted</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/70 mt-2 mb-2 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: tone.bar }} />
      </div>
      <div className="text-[12px] text-[#5A6478] leading-relaxed">{why}</div>
    </div>
  );
}

// Check a WhatsApp template before submitting it to Meta.
//
// Built because template approval was costing days: a Utility template that reads as
// promotional gets silently reclassified rather than explained, so it comes back looking
// like a rejection for no reason, over and over.
//
// This is deliberately NOT a template manager. Submitting still happens in WhatsApp
// Manager — duplicating that screen would have been a lot of work for a button that
// already exists somewhere else. What did not exist anywhere was being told, before you
// submit, what is going to go wrong.

type Finding = { severity: "blocker" | "risk" | "note"; what: string; why: string };
type Ai = { category?: string; verdict?: string; problems?: string[]; rewrite?: string };
type Result = {
  findings: Finding[]; likely: string; categoryWhy: string[];
  marketingHits: string[]; utilityHits: string[]; vars: number[];
  ai?: Ai | null; aiError?: string; aiRaw?: string | null; rewriteFindings?: Finding[];
  score: number; scoreWhy: string;
};

const SEV: Record<Finding["severity"], { label: string; cls: string; icon: React.ReactNode }> = {
  blocker: { label: "Will be rejected", cls: "bg-[#FBE7E4] text-[#C03221]", icon: <IconAlertTriangle size={14} /> },
  risk:    { label: "Likely moved",     cls: "bg-[#FDF6E7] text-[#8A5A00]", icon: <IconAlertCircle size={14} /> },
  note:    { label: "Worth knowing",    cls: "bg-[#F3F5F9] text-[#5F5E5A]", icon: <IconInfoCircle size={14} /> },
};

const MANAGER = "https://business.facebook.com/latest/whatsapp_manager/message_templates";

export default function TemplateCheckPage() {
  return (
    <PreviewDashboardShell active="broadcast" title="Template check"
      subtitle="What will get this rejected, and which category Meta will file it under — before you submit it."
      hideAccountPicker hideRange>
      {() => <Checker />}
    </PreviewDashboardShell>
  );
}

function Checker() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [before, setBefore] = useState<string | null>(null);

  // bodyOverride lets a freshly accepted rewrite be scored before React has
  // committed it to state — otherwise the meter keeps reporting the old draft.
  const run = async (rewrite: boolean, bodyOverride?: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/broadcast/template-check", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ name, category, header, body: bodyOverride ?? body, footer, rewrite }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRes(d);
      if (!bodyOverride) setBefore(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const blockers = (res?.findings || []).filter((f) => f.severity === "blocker");
  const moved = res && res.likely !== category;

  return (
    <>
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <Link href="/dashboard/preview/broadcast"
          className="inline-flex items-center gap-1 text-[12.5px] text-[#8A92A6] hover:text-brand">
          <IconArrowLeft size={14} stroke={1.8} /> Community Broadcast
        </Link>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ── the draft ─────────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="text-[16.5px] font-medium text-[#232D42] mb-4">Your draft</div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[12px] text-[#8A92A6] mb-1">Template name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="neet_enquiry_reply"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-[13px] text-[#232D42] focus:border-brand outline-none font-mono" />
            </div>
            <div>
              <label className="block text-[12px] text-[#8A92A6] mb-1">Submitting as</label>
              <PreviewSelect value={category} onChange={setCategory} options={[
                { value: "UTILITY", label: "Utility" },
                { value: "MARKETING", label: "Marketing" },
                { value: "AUTHENTICATION", label: "Authentication" },
              ]} />
            </div>
          </div>

          <label className="block text-[12px] text-[#8A92A6] mb-1">Header &mdash; optional</label>
          <input value={header} onChange={(e) => setHeader(e.target.value)} placeholder="GooCampus"
            className="w-full h-9 px-3 rounded-lg border border-gray-200 text-[13px] text-[#232D42] focus:border-brand outline-none mb-3" />

          <label className="block text-[12px] text-[#8A92A6] mb-1">Body</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8}
            placeholder={"Hi {{1}}, thanks for your interest in {{2}}. Here are the details you asked for: {{3}}"}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13.5px] text-[#232D42] focus:border-brand outline-none leading-relaxed resize-y" />
          <div className="text-[11.5px] text-[#8A92A6] mt-1 mb-3">{body.length} / 1024 &middot; use {"{{1}}"}, {"{{2}}"} for the parts that change</div>

          <label className="block text-[12px] text-[#8A92A6] mb-1">Footer &mdash; optional</label>
          <input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Reply STOP to opt out"
            className="w-full h-9 px-3 rounded-lg border border-gray-200 text-[13px] text-[#232D42] focus:border-brand outline-none mb-4" />

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => run(false)} disabled={busy || !body.trim()}
              className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium disabled:opacity-50">
              {busy ? "Checking…" : "Check it"}
            </button>
            <button onClick={() => run(true)} disabled={busy || !body.trim()}
              className="h-9 px-4 rounded-lg border border-gray-200 text-[13px] text-[#4A5468] hover:border-brand hover:text-brand inline-flex items-center gap-1.5 disabled:opacity-50">
              <IconSparkles size={14} /> Check and rewrite
            </button>
          </div>
          {err && <div className="text-[12.5px] text-[#C03221] mt-2">{err}</div>}
        </div>

        {/* ── what we think ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <span className="text-[16.5px] font-medium text-[#232D42]">What will happen</span>
            <span className="text-[11.5px] text-[#8A92A6]">our reading, not Meta&rsquo;s decision</span>
          </div>
          {/* Said once, plainly, and never dressed up as a verdict. No API previews a
              Meta decision; the only way to know is to submit. */}
          <div className="text-[12px] text-[#8A92A6] mb-4 leading-relaxed">
            Meta publishes no way to check a template before submitting. This catches what usually goes wrong.
          </div>

          {!res && <div className="text-[13px] text-[#8A92A6]">Paste a draft and press Check it.</div>}

          {res && (
            <div className="space-y-4">
              <Meter score={res.score} why={res.scoreWhy} />
              <div className={`rounded-xl border px-4 py-3 ${
                blockers.length ? "border-[#F1C4BD] bg-[#FFF9F8]"
                : moved ? "border-[#F3DCB4] bg-[#FDFBF5]"
                : "border-[#BFE6CD] bg-[#F4FBF7]"}`}>
                <div className="text-[13.5px] text-[#232D42] leading-relaxed">
                  {blockers.length
                    ? `${blockers.length} thing${blockers.length === 1 ? "" : "s"} here will be rejected outright.`
                    : moved
                      ? `This will probably be filed as ${res.likely.toLowerCase()}, not ${category.toLowerCase()}.`
                      : `Nothing structural is wrong, and ${res.likely.toLowerCase()} looks like the right category.`}
                </div>
                {res.categoryWhy.map((w, i) => (
                  <div key={i} className="text-[12px] text-[#5A6478] mt-1.5">{w}</div>
                ))}
              </div>

              {res.findings.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {res.findings.map((f, i) => (
                    <div key={i} className="py-2.5 flex items-start gap-2.5">
                      <span className={`text-[10.5px] font-medium rounded-full px-2 py-0.5 shrink-0 inline-flex items-center gap-1 ${SEV[f.severity].cls}`}>
                        {SEV[f.severity].icon}{SEV[f.severity].label}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] text-[#232D42]">{f.what}</div>
                        <div className="text-[12px] text-[#5A6478] leading-relaxed mt-0.5">{f.why}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {res.aiError && <div className="text-[12px] text-[#8A92A6]">{res.aiError}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Step three, under both columns rather than squeezed into one: the version
          offered, and then the version taken. Same slot for both, so accepting
          continues the page downwards instead of moving it. */}
      {before !== null ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#EEF7F1] text-[#0F6E3C] shrink-0"><IconCheck size={14} /></span>
            <span className="text-[15px] font-medium text-[#232D42]">You swapped it</span>
            <button onClick={() => { setBody(before); setBefore(null); run(false, before); }}
              className="ml-auto text-[12px] text-[#8A92A6] hover:text-brand">Put the original back</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-[#FBE7E4] p-3.5">
              <div className="text-[11px] uppercase tracking-wide text-[#C03221] mb-1.5">What you pasted</div>
              <div className="text-[13.5px] text-[#232D42] whitespace-pre-wrap leading-relaxed">{before}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-[#EEF7F1] p-3.5">
              <div className="text-[11px] uppercase tracking-wide text-[#0F6E3C] mb-1.5">What you have now</div>
              <div className="text-[13.5px] text-[#232D42] whitespace-pre-wrap leading-relaxed">{body}</div>
            </div>
          </div>
          <a href={MANAGER} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-brand hover:underline mt-3.5">
            Submit it in WhatsApp Manager <IconExternalLink size={13} />
          </a>
        </div>
      ) : res?.ai?.rewrite ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 mt-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-light text-brand shrink-0"><IconSparkles size={14} /></span>
            <span className="text-[15px] font-medium text-[#232D42]">A version that should go through</span>
            {/* Puts it in the box rather than the clipboard. The point is to end up
                with the fixed version in hand, not to paste it yourself. */}
            <button onClick={() => { setBefore(body); setBody(res.ai!.rewrite!); run(false, res.ai!.rewrite!); }}
              className="ml-auto h-8 px-3 rounded-lg bg-brand text-white text-[12.5px] font-medium inline-flex items-center gap-1.5 hover:bg-brand-dark">
              <IconCheck size={14} /> Use this
            </button>
          </div>
          <div className="rounded-xl border border-gray-100 bg-[#F6F7FB] p-3.5 text-[13.5px] text-[#232D42] whitespace-pre-wrap leading-relaxed">{res.ai.rewrite}</div>
          {res.ai.verdict && <div className="text-[12.5px] text-[#5A6478] mt-2.5 leading-relaxed">{res.ai.verdict}</div>}
          {/* Checked by the same rules as the draft, because it has already come
              back breaking one. */}
          {(res.rewriteFindings || []).length > 0 && (
            <div className="mt-2.5 rounded-lg bg-[#FBE7E4] px-3 py-2">
              <div className="text-[12px] text-[#C03221] font-medium">This rewrite still has a problem &mdash; fix it before submitting:</div>
              {(res.rewriteFindings || []).map((f, i) => (
                <div key={i} className="text-[12px] text-[#C03221] mt-0.5">{f.what}. {f.why}</div>
              ))}
            </div>
          )}
        </div>
      ) : res ? (
        <div className="mt-4">
          <a href={MANAGER} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-brand hover:underline">
            Submit it in WhatsApp Manager <IconExternalLink size={13} />
          </a>
        </div>
      ) : null}
    </>
  );
}
