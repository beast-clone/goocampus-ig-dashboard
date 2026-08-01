"use client";
import { useEffect, useMemo, useState } from "react";
import { IconSearch, IconArrowLeft, IconSparkles, IconPlayerPlayFilled, IconExternalLink } from "@tabler/icons-react";

// The 49-skill marketing library (Corey Haines' open pack, run via Perplexity).
// Lives inside Content Studio as the "Playbooks" tab.

type SkillMeta = { slug: string; name: string; category: string; version: string; description: string; chars: number };

const CAT_ORDER = ["SEO & Content", "CRO", "Content & Copy", "Paid & Measurement", "Growth & Retention", "Sales & GTM", "Strategy"];

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
          placeholder="Search 49 playbooks — copywriting, SEO, pricing, cold email…"
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

function SkillRunner({ skill, onBack }: { skill: SkillMeta; onBack: () => void }) {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [citations, setCitations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const t = task.trim();
    if (!t || loading) return;
    setLoading(true); setError(null); setOutput(null); setCitations([]);
    try {
      const r = await fetch("/api/marketing-skills/run", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: skill.slug, task: t }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setOutput(d.output || "—"); setCitations(d.citations || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[860px] mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4A5468] hover:text-[#232D42] mb-4">
        <IconArrowLeft size={16} /> All playbooks
      </button>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-light text-brand shrink-0"><IconSparkles size={16} /></span>
          <div className="text-[16px] font-medium text-[#232D42]">{skill.name}</div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F3F9] text-[#6B7280]">{skill.category}</span>
        </div>
        <div className="text-[12.5px] text-[#8A92A6] leading-snug">{skill.description}</div>
      </div>

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
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="text-[11px] uppercase tracking-wide text-[#8A92A6] font-semibold mb-2">Result</div>
          <MarkdownLite text={output} />
          {citations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-[10.5px] uppercase tracking-wide text-[#8A92A6] font-semibold mb-1.5">Sources</div>
              <div className="flex flex-col gap-1">
                {citations.slice(0, 8).map((c, i) => (
                  <a key={i} href={c} target="_blank" rel="noopener noreferrer" className="text-[12px] text-brand hover:underline inline-flex items-center gap-1 truncate">
                    <IconExternalLink size={11} className="shrink-0" /> <span className="truncate">{c}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
