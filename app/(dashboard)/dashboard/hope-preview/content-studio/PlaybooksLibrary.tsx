"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IconSearch, IconArrowLeft, IconSparkles, IconPlayerPlayFilled, IconExternalLink,
  IconLayoutGrid, IconMovie, IconFileText, IconBrandLinkedin, IconBrandInstagram, IconPalette, IconCircleCheck, IconPencil, IconBolt, IconBulb,
} from "@tabler/icons-react";
import { PLAYBOOK_GUIDES } from "@/lib/playbook-guides";

// The marketing library (Corey Haines' open pack + a Pillar Content skill), run via
// Perplexity. Lives inside Content Studio as the "Playbooks" tab. After a result,
// you can turn it into only the formats you pick (the V2 "choose your output" step).

type SkillMeta = { slug: string; name: string; category: string; version: string; description: string; chars: number };
type DeriveDraft = { format: string; label: string; dest: string; content: string };

const CAT_ORDER = ["SEO & Content", "CRO", "Content & Copy", "Paid & Measurement", "Growth & Retention", "Sales & GTM", "Strategy"];

// The output formats a result can be turned into (the "choose what to make" step).
const FORMATS = [
  { key: "carousel", label: "Instagram Carousel", sub: "5–7 slides", icon: IconLayoutGrid },
  { key: "reel", label: "Reel / Shorts", sub: "30–45s script", icon: IconMovie },
  { key: "blog", label: "Blog article", sub: "SEO long-form", icon: IconFileText },
  { key: "linkedin", label: "LinkedIn post", sub: "120–180 words", icon: IconBrandLinkedin },
  { key: "instagram", label: "IG caption", sub: "single image", icon: IconBrandInstagram },
  { key: "poster", label: "Poster brief", sub: "for a designer", icon: IconPalette },
];

// Producers a piece can be assigned to on approval (same roster the Create tab uses).
const TEAM = [
  { key: "manya", label: "Manya" },
  { key: "praveen", label: "Praveen" },
  { key: "nikhil", label: "Nikhil" },
  { key: "nandu", label: "Nandu" },
];

export function PlaybooksLibrary() {
  const [skills, setSkills] = useState<SkillMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<SkillMeta | null>(null);

  useEffect(() => {
    fetch("/api/marketing-skills")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setSkills((d.skills || []) as SkillMeta[]); })
      .catch((e) => setError((e as Error).message));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = skills || [];
    if (!term) return list;
    return list.filter((s) => `${s.name} ${s.category} ${s.description}`.toLowerCase().includes(term));
  }, [skills, q]);

  const byCat = useMemo(() => {
    const m = new Map<string, SkillMeta[]>();
    for (const s of filtered) { const a = m.get(s.category) || []; a.push(s); m.set(s.category, a); }
    return CAT_ORDER.filter((c) => m.has(c)).map((c) => ({ cat: c, items: m.get(c)! }));
  }, [filtered]);

  if (active) return <SkillRunner skill={active} onBack={() => setActive(null)} />;

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 mb-6 focus-within:border-brand transition">
        <IconSearch size={18} className="text-[#8A92A6] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${skills?.length ?? 50} playbooks — copywriting, SEO, pricing, cold email…`}
          className="flex-1 bg-transparent outline-none text-[14px] text-[#232D42] placeholder:text-[#B4BAC6]"
        />
        {skills && <span className="text-[12px] text-[#8A92A6]">{filtered.length} / {skills.length}</span>}
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-5 py-4 text-sm">Couldn&rsquo;t load — {error}</div>}
      {!skills && !error && <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}</div>}

      {byCat.map(({ cat, items }) => (
        <div key={cat} className="mb-7">
          <div className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold mb-2.5">{cat} · {items.length}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((s) => (
              <button
                key={s.slug}
                onClick={() => setActive(s)}
                className="text-left rounded-2xl border border-gray-100 bg-white p-4 hover:border-brand hover:shadow-sm transition group"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="text-[14px] font-medium text-[#232D42]">{s.name}</div>
                  <span className="text-brand opacity-0 group-hover:opacity-100 transition inline-flex items-center gap-1 text-[11.5px] font-medium shrink-0"><IconPlayerPlayFilled size={11} /> Run</span>
                </div>
                <div className="text-[12px] text-[#8A92A6] leading-snug line-clamp-3">{s.description}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {skills && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-[#8A92A6]">No playbook matches “{q}”.</div>
      )}
    </div>
  );
}

// Render bold + strip Perplexity's inline [1][2] citation refs and stray ** noise.
function inlineMd(s: string, keyBase: string) {
  const clean = s.replace(/\[\d+\](\s*\[\d+\])*/g, "");
  return clean.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? <strong key={`${keyBase}-${i}`} className="font-semibold text-[#232D42]">{p.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{p.replace(/\*\*/g, "")}</span>,
  );
}

// Lightweight markdown → clean styled output (headings, bullets, bold). Keeps it
// professional; no raw ### / ** symbols shown.
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: JSX.Element[] = [];
  let bullets: string[] = [];
  const flush = (k: string) => {
    if (!bullets.length) return;
    const b = bullets; bullets = [];
    out.push(<ul key={`ul-${k}`} className="list-disc pl-5 space-y-1 my-2">{b.map((x, j) => <li key={j}>{inlineMd(x, `li-${k}-${j}`)}</li>)}</ul>);
  };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    if (/^#{1,6}\s+/.test(line)) { flush(String(i)); out.push(<div key={i} className="font-semibold text-[#232D42] text-[14px] mt-4 mb-1.5 first:mt-0">{inlineMd(line.replace(/^#{1,6}\s+/, ""), `h-${i}`)}</div>); }
    else if (/^\s*[-*]\s+/.test(line)) { bullets.push(line.replace(/^\s*[-*]\s+/, "")); }
    else if (line.trim() === "") { flush(String(i)); }
    else { flush(String(i)); out.push(<p key={i} className="my-1.5">{inlineMd(line, `p-${i}`)}</p>); }
  });
  flush("end");
  return <div className="text-[13.5px] text-[#232D42] leading-relaxed">{out}</div>;
}

// A generated output — editable, then Approve → assign to a producer, which creates
// a Content-Pending item in the pipeline (reuses /api/marketing-hub/create, the same
// hand-off the Create tab uses). It never publishes directly.
function DerivedCard({ d, skillName, source, isNew, onTokens }: { d: DeriveDraft; skillName: string; source: string; isNew?: boolean; onTokens?: (n: number) => void }) {
  const [text, setText] = useState(d.content);
  const [editing, setEditing] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [assignee, setAssignee] = useState("manya");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Custom prompt to regenerate just this card (e.g. "add 2 bullets per slide", or a reference link).
  const [cardPrompt, setCardPrompt] = useState("");
  const [regenning, setRegenning] = useState(false);
  const [regenErr, setRegenErr] = useState<string | null>(null);

  const regenerate = async () => {
    const p = cardPrompt.trim();
    if (!p || regenning) return;
    setRegenning(true); setRegenErr(null);
    try {
      const r = await fetch("/api/content/derive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, formats: [d.format], custom: p }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const draft = (j.drafts || [])[0];
      if (!draft?.content) throw new Error("Nothing came back — try rephrasing the prompt.");
      setText(draft.content); onTokens?.(typeof j.tokens === "number" ? j.tokens : 0); setCardPrompt("");
    } catch (e) { setRegenErr((e as Error).message); }
    finally { setRegenning(false); }
  };

  const approve = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/marketing-hub/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ title: `${skillName} — ${d.label}`, content: text, owner: assignee }),
      });
      if (res.ok) { setSentTo(TEAM.find((t) => t.key === assignee)?.label || assignee); setPickOpen(false); }
    } finally { setSending(false); }
  };

  return (
    <div className={`rounded-2xl border bg-white p-4 ${isNew ? "border-brand" : "border-gray-100"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-medium text-[#232D42]">{d.label}</span>
        {isNew && <span className="text-[10px] font-semibold uppercase tracking-wide text-white bg-brand rounded-full px-2 py-0.5">New</span>}
      </div>
      {editing ? (
        <div className="space-y-2.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className="w-full text-[12.5px] text-[#232D42] border border-gray-200 rounded-lg p-2 leading-relaxed focus:border-brand outline-none resize-y" />
          <div className="rounded-lg border border-gray-100 bg-[#F9FAFC] p-2.5">
            <label className="text-[11.5px] font-medium text-[#232D42]">Custom prompt — tell it what to change, then regenerate</label>
            <div className="flex items-start gap-2 mt-1.5">
              <textarea value={cardPrompt} onChange={(e) => setCardPrompt(e.target.value)} rows={2}
                placeholder={`e.g. Each slide: a heading + 2 bullets. Or paste a reference link to match its style.`}
                className="flex-1 text-[12px] text-[#232D42] border border-gray-200 rounded-lg p-2 bg-white focus:border-brand outline-none resize-y" />
              <button onClick={regenerate} disabled={!cardPrompt.trim() || regenning}
                className="shrink-0 text-[11.5px] inline-flex items-center gap-1 bg-brand text-white rounded-lg px-3 py-2 hover:bg-brand-dark disabled:opacity-50">
                <IconSparkles size={13} /> {regenning ? "Working…" : "Regenerate"}
              </button>
            </div>
            {regenErr && <div className="text-[11px] text-rose-600 mt-1">{regenErr}</div>}
            <div className="text-[11px] text-[#8A92A6] mt-1">Rewrites only this {d.label}. Facts still come only from the verified source.</div>
          </div>
        </div>
      ) : <MarkdownLite text={text} />}
      <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gray-100">
        <button onClick={() => setEditing((v) => !v)} className="text-[11.5px] inline-flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1 text-[#4A5468] hover:border-gray-300"><IconPencil size={12} /> {editing ? "Done" : "Edit"}</button>
        <div className="ml-auto">
          {sentTo ? (
            <span className="text-[11.5px] inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1"><IconCircleCheck size={13} /> Assigned to {sentTo}</span>
          ) : pickOpen ? (
            <div className="inline-flex items-center gap-2">
              <span className="text-[11.5px] text-[#8A92A6]">Assign to</span>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}
                className="text-[12px] text-[#232D42] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:border-brand outline-none">
                {TEAM.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <button onClick={approve} disabled={sending} className="text-[11.5px] inline-flex items-center gap-1 bg-brand text-white rounded-md px-3 py-1.5 hover:bg-brand-dark disabled:opacity-60">{sending ? "Sending…" : "Confirm"}</button>
              <button onClick={() => setPickOpen(false)} className="text-[11.5px] text-[#8A92A6] hover:text-[#232D42] px-1">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setPickOpen(true)} className="text-[11.5px] inline-flex items-center gap-1 bg-brand text-white rounded-lg px-3 py-1.5 hover:bg-brand-dark"><IconCircleCheck size={13} /> Approve</button>
          )}
        </div>
      </div>
    </div>
  );
}

// One labelled line in the "How to use this playbook" cheat-sheet.
function GuideField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-[#8A92A6] font-semibold mb-0.5">{label}</div>
      <div className="text-[13px] text-[#232D42] leading-snug">{children}</div>
    </div>
  );
}

function SkillRunner({ skill, onBack }: { skill: SkillMeta; onBack: () => void }) {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [citations, setCitations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // "Choose your output" step (V2)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deriving, setDeriving] = useState(false);
  const [derived, setDerived] = useState<DeriveDraft[]>([]);
  const [deriveErr, setDeriveErr] = useState<string | null>(null);
  // Token usage so the team can see what each generation costs (Perplexity billing).
  const [runTokens, setRunTokens] = useState<number | null>(null);
  const [deriveTokens, setDeriveTokens] = useState(0);
  // Formats made in the most recent generation — tagged "New" so the team spots them.
  const [newFormats, setNewFormats] = useState<Set<string>>(new Set());
  // Masonry: each card is placed into whichever column is currently shorter, in
  // generation order (Pinterest-style) — packs tight with no big gaps. Once a card
  // is assigned a column it stays there, so its edit state never resets.
  const col0Ref = useRef<HTMLDivElement>(null);
  const col1Ref = useRef<HTMLDivElement>(null);
  const [colOf, setColOf] = useState<Record<string, 0 | 1>>({});

  const run = async () => {
    const t = task.trim();
    if (!t || loading) return;
    setLoading(true); setError(null); setOutput(null); setCitations([]);
    setSelected(new Set()); setDerived([]); setDeriveErr(null); setRunTokens(null); setDeriveTokens(0); setNewFormats(new Set()); setColOf({});
    try {
      const r = await fetch("/api/marketing-skills/run", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: skill.slug, task: t }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setOutput(d.output || "—"); setCitations(d.citations || []); setRunTokens(typeof d.tokens === "number" ? d.tokens : 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // V2 — turn the result into ONLY the picked formats.
  const generate = async () => {
    // Only make formats not already on the board — new outputs ADD, never replace.
    const toMake = Array.from(selected).filter((f) => !derived.some((d) => d.format === f));
    if (!output || !toMake.length || deriving) return;
    setDeriving(true); setDeriveErr(null);
    try {
      const r = await fetch("/api/content/derive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: output, formats: toMake }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDerived((prev) => [...prev, ...((d.drafts || []) as DeriveDraft[])]);
      setDeriveTokens((prev) => prev + (typeof d.tokens === "number" ? d.tokens : 0));
      setNewFormats(new Set(((d.drafts || []) as DeriveDraft[]).map((x) => x.format)));
      setSelected(new Set());
    } catch (e) {
      setDeriveErr((e as Error).message);
    } finally {
      setDeriving(false);
    }
  };

  // Place one unassigned card per pass into the currently-shorter column. Runs again
  // after each assignment (colOf changes) until every card has a column.
  useLayoutEffect(() => {
    const next = derived.find((d) => colOf[d.format] === undefined);
    if (!next) return;
    const h0 = col0Ref.current?.offsetHeight ?? 0;
    const h1 = col1Ref.current?.offsetHeight ?? 0;
    setColOf((m) => ({ ...m, [next.format]: h1 < h0 ? 1 : 0 }));
  }, [derived, colOf]);

  return (
    <div className="w-full">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4A5468] hover:text-[#232D42] mb-4">
        <IconArrowLeft size={16} /> All playbooks
      </button>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-light text-brand shrink-0"><IconSparkles size={16} /></span>
          <div className="text-[16px] font-medium text-[#232D42]">{skill.name}</div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F3F9] text-[#6B7280]">{skill.category}</span>
          {runTokens !== null && (
            <span
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-[12px] font-medium text-amber-900"
              title="Perplexity tokens billed for this topic — the playbook run plus every output you generate. Watch this before generating dozens of formats."
            >
              <IconBolt size={13} className="text-amber-600" />
              {(runTokens + deriveTokens).toLocaleString()} tokens
              <span className="text-amber-700 font-normal">· run {runTokens.toLocaleString()}{deriveTokens > 0 ? ` + outputs ${deriveTokens.toLocaleString()}` : ""}</span>
            </span>
          )}
        </div>
        <div className="text-[12.5px] text-[#8A92A6] leading-snug">{skill.description}</div>
      </div>

      {(() => {
        const g = PLAYBOOK_GUIDES[skill.slug];
        if (!g) return null;
        return (
          <div className="rounded-2xl border border-[#D7DDFB] bg-brand-light/40 p-5 mb-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-brand mb-3 flex items-center gap-1.5"><IconBulb size={14} /> How to use this playbook</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <GuideField label="What it is">{g.tagline}</GuideField>
              <GuideField label="Use it when">{g.useWhen}</GuideField>
              <GuideField label="You&rsquo;ll get">{g.expect}</GuideField>
              <GuideField label="How to check it">{g.verify}</GuideField>
            </div>
            <div className="mt-4 rounded-xl border border-[#C9D2F9] bg-white p-3">
              <div className="text-[10.5px] uppercase tracking-wide text-[#8A92A6] font-semibold mb-1">Try this</div>
              <div className="flex items-start gap-3">
                <p className="flex-1 text-[13px] text-[#232D42] italic">&ldquo;{g.example}&rdquo;</p>
                <button onClick={() => setTask(g.example)} className="shrink-0 text-[11.5px] inline-flex items-center gap-1 border border-brand text-brand rounded-lg px-2.5 py-1 hover:bg-brand-light transition"><IconSparkles size={12} /> Use this example</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <label className="text-[12px] font-semibold text-[#232D42] uppercase tracking-wide">Your task</label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={`Describe your task — the ${skill.name} playbook will produce it for GooCampus.`}
          rows={4}
          className="w-full mt-2 rounded-xl border border-gray-200 focus:border-brand outline-none p-3 text-[13.5px] text-[#232D42] resize-y"
        />
        <div className="flex justify-end mt-3">
          <button
            onClick={run}
            disabled={!task.trim() || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-white text-[13px] font-medium px-4 py-2 disabled:opacity-40 hover:bg-brand-dark transition"
          >
            <IconPlayerPlayFilled size={13} /> {loading ? "Running…" : "Run playbook"}
          </button>
        </div>
      </div>

      {loading && <div className="rounded-2xl border border-gray-100 bg-white p-5 text-[13px] text-[#8A92A6]">Applying the {skill.name} framework via Perplexity… this can take 20–40s.</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-5 py-4 text-sm">Couldn&rsquo;t run — {error}</div>}
      {output && (
        <>
          {/* Choose what to make — compact bar; already-made formats show as done */}
          <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-medium text-[#232D42] mr-1">Make from this:</span>
              {FORMATS.map((f) => {
                const made = derived.some((d) => d.format === f.key);
                const on = selected.has(f.key);
                const Icon = f.icon;
                if (made) return (
                  <span key={f.key} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-medium text-emerald-700">
                    <IconCircleCheck size={13} /> {f.label} · made
                  </span>
                );
                return (
                  <button key={f.key} onClick={() => toggle(f.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${on ? "border-brand bg-brand-light text-brand-dark" : "border-gray-200 text-[#4A5468] hover:border-gray-300"}`}>
                    {on ? <IconCircleCheck size={13} /> : <Icon size={13} />} {f.label}
                  </button>
                );
              })}
              {(() => {
                const n = Array.from(selected).filter((f) => !derived.some((d) => d.format === f)).length;
                return (
                  <button onClick={generate} disabled={!n || deriving}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-brand text-white text-[13px] font-medium px-4 py-2 disabled:opacity-40 hover:bg-brand-dark transition">
                    <IconPlayerPlayFilled size={12} /> {deriving ? "Generating…" : n ? `Generate ${n}` : "Pick a format"}
                  </button>
                );
              })()}
            </div>
            <div className="text-[11.5px] text-[#8A92A6] mt-2">Pick any format and generate — new outputs add to the board below, they don&rsquo;t replace what&rsquo;s there. Not happy with one? Click <span className="font-medium text-[#4A5468]">Edit</span> on it to tweak the text or give a custom prompt. Approve to assign it to a producer — nothing publishes directly.</div>
          </div>

          {deriveErr && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-5 py-4 text-sm">Couldn&rsquo;t generate — {deriveErr}</div>}

          {/* Source — full width, full content (no internal scroll) */}
          <div className="rounded-2xl border border-emerald-200 bg-white p-5 mb-4">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="text-[10.5px] uppercase tracking-wide text-emerald-700 font-semibold">Source · verified</div>
              <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1"><IconCircleCheck size={14} /> Verified — {citations.length} live source{citations.length === 1 ? "" : "s"}</div>
            </div>
            <MarkdownLite text={output} />
            {citations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
                {citations.slice(0, 8).map((c, i) => (
                  <a key={i} href={c} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-brand hover:underline inline-flex items-center gap-1 max-w-[300px] truncate">
                    <IconExternalLink size={10} className="shrink-0" /> <span className="truncate">{c}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Outputs — masonry: each card drops into the shorter column, in generation
              order. Packs tight (no gaps) and keeps a sensible order. */}
          {(deriving || derived.length > 0) && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div ref={col0Ref} className="flex flex-col gap-4">
                  {derived.filter((d) => colOf[d.format] === 0).map((d) => (
                    <DerivedCard key={d.format} d={d} skillName={skill.name} source={output || ""} isNew={newFormats.has(d.format)} onTokens={(n) => setDeriveTokens((p) => p + n)} />
                  ))}
                </div>
                <div ref={col1Ref} className="flex flex-col gap-4">
                  {derived.filter((d) => colOf[d.format] === 1).map((d) => (
                    <DerivedCard key={d.format} d={d} skillName={skill.name} source={output || ""} isNew={newFormats.has(d.format)} onTokens={(n) => setDeriveTokens((p) => p + n)} />
                  ))}
                </div>
              </div>
              {deriving && <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 text-[13px] text-[#8A92A6]">Creating your selected format(s)… 20–40s.</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}
