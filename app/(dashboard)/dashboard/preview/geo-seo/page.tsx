"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useApi } from "@/lib/use-api";
import { confirmDialog, alertDialog, promptDialog } from "@/app/(dashboard)/dashboard/preview/ConfirmDialog";
import { showToast } from "@/app/(dashboard)/dashboard/preview/Toast";
import {
  IconList, IconCheck, IconX, IconClock, IconHistory, IconCoin, IconAlertTriangle, IconFileAnalytics, IconSearch,
  IconPlus, IconPlayerPlay, IconPlayerPause, IconPencil, IconTrash, IconLink, IconBrandOpenai, IconBrandGoogle,
  IconSparkles, IconWorldSearch, IconFileSpreadsheet, IconPrinter, IconExternalLink, IconLoader2,
} from "@tabler/icons-react";

// GEO SEO (28 Oct): when students and doctors ask ChatGPT, Gemini, Perplexity or
// Google's AI a question, do the AIs name our brands? Topics → real Google India
// questions → asked to 4 AIs every Monday (and on "Check now") → every answer kept.
// Layout follows the Scheduler: views | questions | the opened question.
// Engine: lib/geo.ts · data: /api/geo/*.

type Engine = "chatgpt" | "google" | "gemini" | "perplexity";
const ENGINES: { key: Engine; label: string; Icon: typeof IconBrandOpenai }[] = [
  { key: "chatgpt", label: "ChatGPT", Icon: IconBrandOpenai },
  { key: "google", label: "Google AI", Icon: IconBrandGoogle },
  { key: "gemini", label: "Gemini", Icon: IconSparkles },
  { key: "perplexity", label: "Perplexity", Icon: IconWorldSearch },
];
type Brand = { id: string; name: string; domain: string | null; aliases: string[] };
type Latest = { named: boolean | null; position: number | null; competitors: string[]; status: string; at: string };
type Question = { id: string; brand_id: string; topic: string; question: string; kind: "real" | "search" | "choose" | "own"; source: string | null; paused: boolean; added_by: string | null; created_at: string; latest: Partial<Record<Engine, Latest>>; asked: number };
type Run = { id: string; brand_id: string | null; trigger: "weekly" | "manual"; started_by: string | null; status: string; questions: number; expected: number; started_at: string; finished_at: string | null; counts: { done: number; failed: number; pending: number; named: number; cost: number } | null };
type Data = { connected: boolean; canEditLimit: boolean; brands: Brand[]; questions: Question[]; runs: Run[]; running: number; spent: number; limit: number; costPerQuestion: number };
type Answer = { id: string; run_id: string; engine: Engine; status: string; named: boolean | null; cited: boolean | null; position: number | null; competitors: string[]; sources: { url: string; domain: string; title?: string }[]; answer: string | null; model: string | null; error: string | null; cost: number; created_at: string };
type Suggestion = { question: string; kind: "real" | "search" | "choose"; source: string };

const KIND: Record<Question["kind"], string> = { real: "Real Google question", search: "Reworded from a real search", choose: "“Who should I choose” question", own: "Written by the team" };
const usd = (n: number | null | undefined, d = 2) => (n == null ? "—" : `$${n.toFixed(d)}`);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const who = (k: string | null) => (k ? k.charAt(0).toUpperCase() + k.slice(1) : "");
const namedCount = (q: Question) => ENGINES.filter((e) => q.latest[e.key]?.status === "done" && q.latest[e.key]?.named).length;
const checked = (q: Question) => ENGINES.some((e) => q.latest[e.key]?.status === "done");

const post = async (url: string, body: unknown, method = "POST") => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong");
  return j;
};

type View = "all" | "yes" | "no" | "wait" | "paused" | "hist" | "use" | "err" | "rep";
const VIEWS: { key: View; name: string; hint: string; tone: string; tint: string; Icon: typeof IconList }[] = [
  { key: "all", name: "All questions", hint: "Everything we track", tone: "#3A57E8", tint: "#E9ECFB", Icon: IconList },
  { key: "yes", name: "Recommends us", hint: "At least one AI names us", tone: "#1AA053", tint: "#E8F6EE", Icon: IconCheck },
  { key: "no", name: "Doesn't name us", hint: "No AI names us — work on these", tone: "#C03221", tint: "#FBEAE8", Icon: IconX },
  { key: "wait", name: "Not checked yet", hint: "Asked on the next check", tone: "#F16A1B", tint: "#FEF1E8", Icon: IconClock },
  { key: "paused", name: "Paused", hint: "Not being asked", tone: "#8A92A6", tint: "#F6F7FB", Icon: IconPlayerPause },
  { key: "hist", name: "Run history", hint: "Every check that ran", tone: "#8A92A6", tint: "#F6F7FB", Icon: IconHistory },
  { key: "use", name: "Usage & credits", hint: "Balance, spend, limits", tone: "#8A92A6", tint: "#F6F7FB", Icon: IconCoin },
  { key: "err", name: "Errors", hint: "Failed answers", tone: "#8A92A6", tint: "#F6F7FB", Icon: IconAlertTriangle },
  { key: "rep", name: "Reports", hint: "Download Excel / PDF", tone: "#8A92A6", tint: "#F6F7FB", Icon: IconFileAnalytics },
];
const LIST_VIEWS: View[] = ["all", "yes", "no", "wait", "paused"];

export default function GeoSeoPage() {
  return (
    <PreviewDashboardShell active="geo-seo" title="GEO SEO" subtitle="When students and doctors ask ChatGPT and other AIs a question, do the AIs recommend us?" hideAccountPicker hideRange>
      {() => <GeoSeo />}
    </PreviewDashboardShell>
  );
}

function GeoSeo() {
  const { data, error, isLoading, refresh } = useApi<Data>("/api/geo");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [topicOpen, setTopicOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);

  const brands = data?.brands || [];
  const brand = brands.find((b) => b.id === brandId) || brands[0] || null;
  useEffect(() => { if (!brandId && brands[0]) setBrandId(brands[0].id); }, [brandId, brands]);

  // While a check is running, pull in finished answers every 20 s.
  const running = data?.running || 0;
  const collecting = useRef(false);
  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      if (collecting.current || document.hidden) return;
      collecting.current = true;
      try { await fetch("/api/geo/collect", { method: "POST" }); await refresh(); } finally { collecting.current = false; }
    };
    tick();
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, [running, refresh]);

  const mine = useMemo(() => (data?.questions || []).filter((q) => q.brand_id === brand?.id), [data, brand]);
  const inView = useCallback((v: View) => mine.filter((q) =>
    v === "paused" ? q.paused
      : q.paused ? false
      : v === "all" ? true
      : v === "wait" ? !checked(q)
      : v === "yes" ? checked(q) && namedCount(q) > 0
      : v === "no" ? checked(q) && namedCount(q) === 0 : false), [mine]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return inView(view).filter((q) => !s || q.question.toLowerCase().includes(s) || q.topic.toLowerCase().includes(s))
      .sort((a, b) => a.topic.localeCompare(b.topic) || a.created_at.localeCompare(b.created_at));
  }, [inView, view, search]);
  useEffect(() => { if (LIST_VIEWS.includes(view) && !rows.some((q) => q.id === sel)) setSel(rows[0]?.id || null); }, [rows, sel, view]);

  const checkedQs = mine.filter((q) => !q.paused && checked(q));
  const answers = checkedQs.reduce((s, q) => s + ENGINES.filter((e) => q.latest[e.key]?.status === "done").length, 0);
  const named = checkedQs.reduce((s, q) => s + namedCount(q), 0);
  const lastRun = (data?.runs || []).find((r) => r.status !== "running");
  const activeCount = mine.filter((q) => !q.paused).length;

  const checkNow = async () => {
    if (!brand) return;
    const est = activeCount * (data?.costPerQuestion || 0.011);
    const ok = await confirmDialog({
      title: `Check ${brand.name} now?`,
      body: `Asks all ${activeCount} active questions to ChatGPT, Google AI, Gemini and Perplexity. About ${usd(est)} (${usd(data?.spent)} of the ${usd(data?.limit, 0)} monthly limit used). Answers come in over the next few minutes.`,
      action: "Yes, check",
    });
    if (!ok) return;
    try { const r = await post("/api/geo/run", { brandId: brand.id }); showToast({ who: "Check started", body: `${r.questions} questions × 4 AIs — answers arrive over a few minutes` }); refresh(); }
    catch (e) { alertDialog("Couldn't start the check", (e as Error).message); }
  };

  if (isLoading) return <LoadingBlock label="Loading GEO SEO…" />;
  if (error || !data) return <div className="bg-white border border-gray-100 rounded-xl p-6 text-[14px] text-[#C03221]">Couldn&apos;t load GEO SEO. {error?.message}</div>;
  if (!data.connected) return <div className="bg-white border border-gray-100 rounded-xl p-6 text-[14px] text-[#8A92A6]">DataForSEO isn&apos;t connected yet — add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to the site settings.</div>;

  const pending = (data.runs || []).filter((r) => r.status === "running").reduce((s, r) => s + (r.counts?.pending || 0), 0);
  const listView = LIST_VIEWS.includes(view);

  return (
    <div className="geo-wrap">
      <style>{CSS}</style>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {brands.map((b) => (
          <button key={b.id} onClick={() => { setBrandId(b.id); setSel(null); }}
            className={`h-9 px-3.5 rounded-lg border text-[13px] font-medium ${b.id === brand?.id ? "bg-brand border-brand text-white" : "bg-white border-gray-200 text-[#232D42] hover:border-brand"}`}>{b.name}</button>
        ))}
        <button onClick={() => setBrandOpen(true)} className="h-9 px-3.5 rounded-lg border border-dashed border-brand text-brand text-[13px] font-medium inline-flex items-center gap-1"><IconPlus size={14} stroke={1.8} />Add brand</button>
        <span className="flex-1" />
        <span className="text-[13px] text-[#8A92A6]">
          {answers ? <>AIs named <b className="font-medium text-[#232D42]">{brand?.name}</b> in <b className="font-medium text-[#232D42]">{named} of {answers}</b> answers</> : "No answers yet"}
          {lastRun ? ` · last check ${day(lastRun.started_at)}` : ""}
        </span>
        <button onClick={() => setTopicOpen(true)} className="h-9 px-3.5 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-[#232D42] hover:border-brand inline-flex items-center gap-1.5"><IconPlus size={15} stroke={1.8} />Add a topic</button>
        <button onClick={checkNow} disabled={!activeCount || running > 0} className="h-9 px-3.5 rounded-lg bg-brand text-white text-[13px] font-medium hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5">
          {running ? <IconLoader2 size={15} className="animate-spin" /> : <IconPlayerPlay size={15} stroke={1.8} />}{running ? "Checking…" : "Check now"}
        </button>
      </div>
      {running > 0 && (
        <div className="mb-3 rounded-xl bg-brand-light text-[13px] text-[#2138B0] px-4 py-2.5 flex items-center gap-2">
          <IconLoader2 size={15} className="animate-spin" />Check running — {pending} answer{pending === 1 ? "" : "s"} still to come. ChatGPT and Google take a minute or two, Gemini up to five. You can leave this page; it carries on.
        </div>
      )}

      <div className="geo-split">
        <aside className="geo-pane">
          <div className="geo-head"><div className="text-base font-medium text-[#232D42]">View</div></div>
          <div className="geo-scroll geo-rail">
            {VIEWS.map((v, i) => (
              <div key={v.key}>
                {i === 5 && <div className="h-px bg-gray-100 my-1.5 mx-1" />}
                <button onClick={() => setView(v.key)} className={`geo-status${view === v.key ? " on" : ""}`} style={{ ["--tint" as string]: v.tint, ["--tone" as string]: v.tone } as CSSProperties}>
                  <span className="ic" style={{ background: v.tint, color: v.tone }}><v.Icon size={16} stroke={1.8} /></span>
                  <span className="nm">{v.name}<span className="hint">{v.hint}</span></span>
                  {LIST_VIEWS.includes(v.key) && <span className="ct">{inView(v.key).length}</span>}
                </button>
              </div>
            ))}
          </div>
        </aside>

        {listView ? (<>
          <section className="geo-pane">
            <div className="geo-head">
              <div className="text-base font-medium text-[#232D42]">{VIEWS.find((v) => v.key === view)?.name}</div>
              <div className="text-xs text-[#8A92A6]">{rows.length} question{rows.length === 1 ? "" : "s"} · grouped by topic</div>
            </div>
            <div className="geo-search"><IconSearch size={15} stroke={1.8} className="text-[#8A92A6]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" /></div>
            <div className="geo-scroll px-2 pb-2">
              {rows.length === 0 ? (
                <div className="geo-empty">{mine.length === 0 ? <>No questions for {brand?.name} yet.<br /><button onClick={() => setTopicOpen(true)} className="text-brand mt-2">Add a topic</button> to find the real questions people ask.</> : "Nothing here."}</div>
              ) : rows.map((q, i) => (
                <div key={q.id}>
                  {(i === 0 || rows[i - 1].topic !== q.topic) && <div className="geo-group">{q.topic}</div>}
                  <button onClick={() => setSel(q.id)} className={`geo-row${sel === q.id ? " on" : ""}`}>
                    <span className="t">{q.question}</span>
                    <span className="flex flex-wrap gap-1 mt-1.5">
                      {checked(q) ? ENGINES.map((e) => {
                        const l = q.latest[e.key];
                        return <span key={e.key} className={`geo-ai${l?.status === "done" && l.named ? " y" : ""}`}>{e.label}</span>;
                      }) : <span className="geo-ai">{q.paused ? "paused" : "not checked yet"}</span>}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="geo-pane">
            {sel ? <QuestionPanel key={sel} q={mine.find((q) => q.id === sel)!} brand={brand!} onChanged={refresh} /> : <div className="geo-empty py-20">Pick a question</div>}
          </section>
        </>) : (
          <section className="geo-pane geo-wide"><div className="geo-scroll">
            {view === "hist" && <History runs={data.runs} brands={brands} />}
            {view === "use" && <Usage canEdit={data.canEditLimit} onSaved={refresh} />}
            {view === "err" && <Errors />}
            {view === "rep" && <Report brands={brands} />}
          </div></section>
        )}
      </div>

      {topicOpen && brand && <TopicModal brand={brand} onClose={() => setTopicOpen(false)} onAdded={() => { setTopicOpen(false); setView("wait"); refresh(); }} />}
      {brandOpen && <BrandModal onClose={() => setBrandOpen(false)} onAdded={(id) => { setBrandOpen(false); setBrandId(id); refresh(); }} />}
    </div>
  );
}

// ---------- the opened question ----------

function highlight(text: string, ours: string[], others: string[]) {
  const names = [...ours.map((n) => ({ n, us: true })), ...others.map((n) => ({ n, us: false }))].filter((x) => x.n.length > 2).sort((a, b) => b.n.length - a.n.length);
  if (!names.length) return text;
  const re = new RegExp(`(${names.map((x) => x.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) => {
    const hit = names.find((x) => x.n.toLowerCase() === part.toLowerCase());
    return hit ? <mark key={i} className={hit.us ? "us" : ""}>{part}</mark> : part;
  });
}

// The AIs answer in markdown. Show it as plain reading text: headings as headings,
// bullets as bullets, links as their words, citation markers and table rules dropped.
function Readable({ text, ours, others }: { text: string; ours: string[]; others: string[] }) {
  const lines = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[\[\d+\]\]\([^)]*\)/g, "").replace(/\[(\d+)\]/g, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]*)\)/g, "$1").replace(/`/g, "").replace(/\\([^\w\s])/g, "$1")
    .split("\n").map((l) => l.trimEnd()).filter((l) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l) || !l.includes("-"));
  return (<>{lines.map((raw, i) => {
    if (!raw.trim()) return <div key={i} className="h-2" />;
    const head = /^\s*#{1,6}\s+/.test(raw);
    const bullet = /^\s*[-*•]\s+/.test(raw);
    const num = raw.match(/^\s*(\d+)[.)]\s+/);
    let t = raw.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*•]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").replace(/\*\*|__/g, "");
    if (t.includes("|")) t = t.split("|").map((c) => c.trim()).filter(Boolean).join("  ·  ");
    return (
      <div key={i} className={head ? "font-medium text-[14px] mt-2" : bullet || num ? "flex gap-2 pl-1" : ""}>
        {bullet && <span className="text-[#8A92A6]">•</span>}{num && <span className="text-[#8A92A6]">{num[1]}.</span>}
        <span>{highlight(t, ours, others)}</span>
      </div>
    );
  })}</>);
}

function QuestionPanel({ q, brand, onChanged }: { q: Question; brand: Brand; onChanged: () => void }) {
  const { data, isLoading } = useApi<{ answers: Answer[] }>(`/api/geo/answers?question=${q.id}`);
  const [eng, setEng] = useState<Engine>("chatgpt");
  const all = data?.answers || [];
  const forEng = all.filter((a) => a.engine === eng);
  const cur = forEng.find((a) => a.status === "done") || forEng[0];
  const history = forEng.filter((a) => a.status === "done").slice(0, 8).reverse();
  const ours = [brand.name, ...brand.aliases];

  const act = async (body: Record<string, unknown>, done: string) => {
    try { await post("/api/geo/questions", { id: q.id, ...body }, "PATCH"); showToast({ who: done }); onChanged(); }
    catch (e) { alertDialog("Couldn't save", (e as Error).message); }
  };
  const edit = async () => {
    const v = await promptDialog({ title: "Edit the question", label: "Write it the way a student or doctor would ask ChatGPT", defaultValue: q.question, action: "Save", required: true });
    if (v && v.trim() !== q.question) act({ question: v.trim() }, "Question updated");
  };
  const remove = async () => {
    if (await confirmDialog({ title: "Stop tracking this question?", body: "It won't be asked again. Its past answers stay in Run history and Reports.", action: "Stop tracking", danger: true })) act({ remove: true }, "No longer tracked");
  };

  return (
    <div className="geo-scroll">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="geo-chip brand">{KIND[q.kind]}</span>
          <span className="geo-chip">Topic: {q.topic}</span>
          {q.source && <span className="geo-chip">{q.source}</span>}
        </div>
        <div className="text-[18px] font-medium text-[#232D42] leading-snug">{q.question}</div>
        <div className="text-[13px] text-[#8A92A6] mt-1">
          {checked(q) ? `${namedCount(q)} of 4 AIs named ${brand.name} last time` : "Not checked yet — it's asked on the next check"}
          {` · asked ${q.asked} time${q.asked === 1 ? "" : "s"}`}{q.added_by ? ` · added by ${who(q.added_by)} on ${day(q.created_at)}` : ""}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => act({ paused: !q.paused }, q.paused ? "Resumed" : "Paused")} className="geo-btn">{q.paused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}{q.paused ? "Resume" : "Pause"}</button>
          <button onClick={edit} className="geo-btn"><IconPencil size={14} />Edit</button>
          <button onClick={remove} className="geo-btn"><IconTrash size={14} />Stop tracking</button>
        </div>
      </div>
      {isLoading ? <LoadingBlock label="Loading answers…" /> : all.length === 0 ? <div className="geo-empty">No answers yet.</div> : (
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {ENGINES.map((e) => {
              const l = q.latest[e.key];
              return (
                <button key={e.key} onClick={() => setEng(e.key)} className={`geo-eng${eng === e.key ? " on" : ""}`}>
                  <e.Icon size={15} stroke={1.8} />{e.label}
                  {l?.status === "done" ? (l.named ? <IconCheck size={14} className="text-[#1AA053]" /> : <IconX size={14} className="text-[#C03221]" />) : l?.status === "pending" ? <IconClock size={14} className="text-[#F16A1B]" /> : null}
                </button>
              );
            })}
          </div>
          {!cur ? <div className="geo-empty">Not asked to this AI yet.</div> : cur.status === "pending" ? <div className="geo-empty">Waiting for the answer…</div> : cur.status === "failed" ? (
            <div className="mt-3 rounded-xl border border-gray-100 p-4 text-[13px] text-[#C03221]">No answer: {cur.error}</div>
          ) : (<>
            <div className="text-[12px] text-[#8A92A6] mt-3">
              {cur.named ? <span className="geo-chip ok">Named us{cur.position ? ` · #${cur.position}` : ""}</span> : <span className="geo-chip bad">Didn&apos;t name us</span>}
              {cur.cited && <span className="geo-chip brand ml-1.5">Used our site as a source</span>}
              <span className="ml-2">Asked {when(cur.created_at)} · {cur.model} · India, English</span>
            </div>
            {cur.competitors.length > 0 && <div className="text-[13px] text-[#232D42] mt-2"><span className="text-[#8A92A6]">Also named: </span>{cur.competitors.join(", ")}</div>}
            <div className="geo-answer">{cur.answer ? <Readable text={cur.answer} ours={ours} others={cur.competitors} /> : <span className="text-[#8A92A6]">{cur.error || "No answer text."}</span>}</div>
            {cur.sources.length > 0 && (<>
              <div className="geo-lbl">Sources this AI used</div>
              {cur.sources.slice(0, 10).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-1.5 border-b border-gray-100 text-[13px] text-[#232D42] hover:text-brand">
                  <IconLink size={14} className="text-[#8A92A6] flex-shrink-0" /><span className="truncate">{s.title || s.domain}</span><span className="text-[#8A92A6] flex-shrink-0">{s.domain}</span>
                  {brand.domain && s.domain.endsWith(brand.domain) && <span className="geo-chip brand">ours</span>}
                </a>
              ))}
            </>)}
            {history.length > 1 && (<>
              <div className="geo-lbl">Every time {ENGINES.find((e) => e.key === eng)?.label} was asked</div>
              <div className="flex gap-1.5 flex-wrap">
                {history.map((h) => (
                  <div key={h.id} className="rounded-lg border border-gray-100 px-3 py-1.5 text-center text-[11px] text-[#8A92A6]">{day(h.created_at)}
                    <div className={`text-[13px] font-medium ${h.named ? "text-[#1AA053]" : "text-[#C03221]"}`}>{h.named ? `Yes${h.position ? ` #${h.position}` : ""}` : "No"}</div></div>
                ))}
              </div>
            </>)}
          </>)}
        </div>
      )}
    </div>
  );
}

// ---------- add a topic ----------

function TopicModal({ brand, onClose, onAdded }: { brand: Brand; onClose: () => void; onAdded: () => void }) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Suggestion[] | null>(null);
  const [cost, setCost] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [own, setOwn] = useState("");

  const find = async () => {
    setBusy(true);
    try {
      const r = await post("/api/geo/topics", { brandId: brand.id, topic: topic.trim() });
      setFound(r.suggestions); setCost(r.cost);
      setPicked(new Set(r.suggestions.map((s: Suggestion, i: number) => (s.kind !== "search" || i < 6 ? i : -1)).filter((i: number) => i >= 0)));
    } catch (e) { alertDialog("Couldn't find questions", (e as Error).message); }
    finally { setBusy(false); }
  };
  const track = async () => {
    const items = (found || []).filter((_, i) => picked.has(i)).map((s) => ({ ...s }));
    if (own.trim()) items.push({ question: own.trim(), kind: "own" as never, source: "Written by the team" });
    if (!items.length) return;
    setBusy(true);
    try { const r = await post("/api/geo/questions", { brandId: brand.id, topic: topic.trim(), items }); showToast({ who: `${r.added} question${r.added === 1 ? "" : "s"} added`, body: "Asked on the next check, or press Check now" }); onAdded(); }
    catch (e) { alertDialog("Couldn't add them", (e as Error).message); setBusy(false); }
  };

  return (
    <div className="preview-scope fixed inset-0 z-50 bg-[#232D42]/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[640px] p-6" onClick={(e) => e.stopPropagation()}>
        {!found ? (<>
          <div className="text-[17px] font-medium text-[#232D42]">Add a topic for {brand.name}</div>
          <div className="text-[13px] text-[#8A92A6] mt-1">A few words about what the brand does. We fetch the questions and searches people really make about it on Google India.</div>
          <input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && topic.trim().length > 2 && find()}
            placeholder="e.g. Karnataka NEET PG counselling" className="mt-4 w-full h-11 rounded-lg border border-gray-200 px-3 text-[14px] outline-none focus:border-brand" />
          <div className="flex items-center gap-2 mt-5">
            <span className="text-[12px] text-[#8A92A6] mr-auto">About $0.002 per topic</span>
            <button onClick={onClose} className="geo-btn">Cancel</button>
            <button onClick={find} disabled={busy || topic.trim().length < 3} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy ? <IconLoader2 size={15} className="animate-spin" /> : <IconSearch size={15} />}Find questions</button>
          </div>
        </>) : (<>
          <div className="text-[17px] font-medium text-[#232D42]">What people ask about “{topic}”</div>
          <div className="text-[13px] text-[#8A92A6] mt-1">Tick the ones to track — each is asked to 4 AIs every Monday. Found for {usd(cost, 3)}.</div>
          <div className="mt-3 max-h-[380px] overflow-auto rounded-xl border border-gray-100">
            {found.length === 0 && <div className="geo-empty">Google returned nothing for this topic. Try fewer or broader words.</div>}
            {found.map((s, i) => (
              <label key={i} className="flex gap-3 items-start px-4 py-2.5 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-[#F6F7FB]">
                <input type="checkbox" className="mt-1" checked={picked.has(i)} onChange={() => setPicked((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                <span className="min-w-0">
                  <span className="block text-[14px] text-[#232D42]">{s.question}</span>
                  <span className="block text-[12px] text-[#8A92A6] mt-0.5"><span className={`geo-chip${s.kind === "search" ? "" : " brand"}`}>{KIND[s.kind]}</span> {s.source}</span>
                </span>
              </label>
            ))}
          </div>
          <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Or write your own question (optional)" className="mt-3 w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-brand" />
          <div className="flex items-center gap-2 mt-5 justify-end">
            <button onClick={() => setFound(null)} className="geo-btn mr-auto">Back</button>
            <button onClick={onClose} className="geo-btn">Cancel</button>
            <button onClick={track} disabled={busy || (picked.size === 0 && !own.trim())} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium disabled:opacity-50">
              Track {picked.size + (own.trim() ? 1 : 0)} question{picked.size + (own.trim() ? 1 : 0) === 1 ? "" : "s"}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

function BrandModal({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [name, setName] = useState(""), [domain, setDomain] = useState(""), [aliases, setAliases] = useState(""), [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await post("/api/geo/brands", { name, domain, aliases }); showToast({ who: `${name} added`, body: "Now add a topic for it" }); onAdded(r.id); }
    catch (e) { alertDialog("Couldn't add the brand", (e as Error).message); setBusy(false); }
  };
  const field = "mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-[14px] outline-none focus:border-brand";
  return (
    <div className="preview-scope fixed inset-0 z-50 bg-[#232D42]/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[460px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-[17px] font-medium text-[#232D42]">Add a brand</div>
        <div className="text-[13px] text-[#8A92A6] mt-1">Its name and website, so we can spot it in the AIs&apos; answers.</div>
        <label className="block text-[12px] text-[#8A92A6] mt-4">Brand name, as an AI would write it<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Samvaya" className={field} /></label>
        <label className="block text-[12px] text-[#8A92A6] mt-3">Website<input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. samvaya.com" className={field} /></label>
        <label className="block text-[12px] text-[#8A92A6] mt-3">Other names that also count as us (comma-separated)<input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. Samvaya Matrimony" className={field} /></label>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="geo-btn">Cancel</button>
          <button onClick={save} disabled={busy || name.trim().length < 2} className="h-9 px-4 rounded-lg bg-brand text-white text-[13px] font-medium disabled:opacity-50">Add brand</button>
        </div>
      </div>
    </div>
  );
}

// ---------- the wide views ----------

function History({ runs, brands }: { runs: Run[]; brands: Brand[] }) {
  const name = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name || "—" : "All brands");
  return (<>
    <div className="geo-head"><div className="text-base font-medium text-[#232D42]">Run history</div><div className="text-xs text-[#8A92A6]">Every check, newest first</div></div>
    {runs.length === 0 ? <div className="geo-empty">No checks yet. Press Check now, or wait for Monday&apos;s automatic one.</div> : (
      <table className="geo-table"><thead><tr><th>When</th><th>Started by</th><th>Brand</th><th>Questions × AIs</th><th>Answers back</th><th>Named us</th><th>Took</th><th>Cost</th><th>Status</th></tr></thead>
        <tbody>{runs.map((r) => {
          const c = r.counts;
          const took = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 60000) : null;
          return (
            <tr key={r.id}>
              <td>{when(r.started_at)}</td>
              <td>{r.trigger === "weekly" ? "Weekly (automatic)" : `${who(r.started_by) || "Someone"} (Check now)`}</td>
              <td>{name(r.brand_id)}</td>
              <td>{r.questions} × 4</td>
              <td>{c ? `${c.done} of ${r.expected}` : "—"}</td>
              <td>{c ? c.named : "—"}</td>
              <td>{took == null ? "—" : took < 1 ? "under a minute" : `${took} min`}</td>
              <td>{c ? usd(c.cost, 3) : "—"}</td>
              <td><span className={`geo-chip ${r.status === "done" ? "ok" : r.status === "running" ? "warn" : "bad"}`}>{r.status === "done" ? "Done" : r.status === "running" ? `Running · ${c?.pending ?? 0} to come` : r.status === "partial" ? `${c?.failed ?? 0} failed` : "Failed"}</span></td>
            </tr>
          );
        })}</tbody></table>
    )}
  </>);
}

type UsageData = {
  account: { login?: string; balance?: number | null; totalAdded?: number | null; dayLimitUsd?: number | null; spentToday?: number | null; requestsToday?: number | null; error?: string };
  spent: number; limit: number; byEngine: Record<string, number>; byBrand: Record<string, number>; topicsMonth: number;
  weeks: { week: string; cost: number }[]; topics: { topic: string; cost: number; created_at: string; created_by: string | null }[];
};
function Usage({ canEdit, onSaved }: { canEdit: boolean; onSaved: () => void }) {
  const { data, isLoading, refresh } = useApi<UsageData>("/api/geo/usage");
  if (isLoading || !data) return <LoadingBlock label="Reading DataForSEO…" />;
  const a = data.account;
  const max = Math.max(0.0001, ...data.weeks.map((w) => w.cost));
  const changeLimit = async () => {
    const v = await promptDialog({ title: "Monthly GEO SEO limit", label: "US dollars — checks stop once this month's spend reaches it", defaultValue: String(data.limit), action: "Save", required: true });
    const n = Math.round(Number(v));
    if (!v || !Number.isFinite(n) || n < 1 || n > 500) return;
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "geoMonthlyUsd", value: n }) });
    if (r.ok) { showToast({ who: "Limit saved", body: `$${n} a month` }); refresh(); onSaved(); } else alertDialog("Couldn't save", (await r.json().catch(() => ({}))).error);
  };
  const tile = (v: string, l: string) => <div className="rounded-xl border border-gray-100 p-3.5"><div className="text-[20px] font-medium text-[#232D42]">{v}</div><div className="text-[12px] text-[#8A92A6] mt-0.5">{l}</div></div>;
  const line = (l: React.ReactNode, v: React.ReactNode) => <div className="flex justify-between px-4 py-2.5 border-t border-gray-100 text-[13px]"><span className="text-[#232D42]">{l}</span><span className="font-medium text-[#232D42]">{v}</span></div>;
  return (<>
    <div className="geo-head"><div className="text-base font-medium text-[#232D42]">Usage &amp; credits</div><div className="text-xs text-[#8A92A6]">Live from the DataForSEO account{a.login ? ` (${a.login})` : ""}</div></div>
    {a.error && <div className="mx-4 mt-3 text-[13px] text-[#C03221]">Couldn&apos;t read the account: {a.error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
      {tile(usd(a.balance), "Balance left on DataForSEO")}
      {tile(usd(a.totalAdded), "Total money added so far")}
      {tile(a.totalAdded != null && a.balance != null ? usd(a.totalAdded - a.balance) : "—", "Spent so far (all DataForSEO use)")}
      {tile(`${usd(data.spent)} / $${data.limit}`, "GEO SEO this month / monthly limit")}
    </div>
    <div className="px-4"><div className="h-2 rounded-full bg-[#F6F7FB] overflow-hidden"><div className="h-full bg-brand" style={{ width: `${Math.min(100, (data.spent / data.limit) * 100)}%` }} /></div>
      <div className="flex justify-between text-[12px] text-[#8A92A6] mt-1.5"><span>Checks stop when the limit is reached.</span>{canEdit && <button onClick={changeLimit} className="text-brand">Change limit</button>}</div></div>
    <div className="grid lg:grid-cols-2 gap-4 p-4">
      <div className="rounded-xl border border-gray-100">
        <div className="px-4 py-3 text-[14px] font-medium text-[#232D42]">Spend per week</div>
        {data.weeks.length === 0 ? <div className="geo-empty">Nothing spent yet.</div> : (
          <div className="flex items-end gap-2 h-36 px-4 pb-7 pt-6">
            {data.weeks.map((w) => (
              <div key={w.week} className="flex-1 bg-brand rounded-t relative" style={{ height: `${Math.max(4, (w.cost / max) * 100)}%` }}>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] text-[#232D42] whitespace-nowrap">{usd(w.cost)}</span>
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[11px] text-[#8A92A6] whitespace-nowrap">{day(w.week)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-gray-100">
        <div className="px-4 py-3 text-[14px] font-medium text-[#232D42]">Where the money went · this month</div>
        {ENGINES.map((e) => line(`${e.label} answers`, usd(data.byEngine[e.key] || 0, 3)))}
        {line("Finding questions for topics", usd(data.topicsMonth, 3))}
        {line("By brand", Object.entries(data.byBrand).map(([b, c]) => `${b} ${usd(c)}`).join(" · ") || "—")}
      </div>
    </div>
    <div className="mx-4 mb-4 rounded-xl border border-gray-100">
      <div className="px-4 py-3 text-[14px] font-medium text-[#232D42]">Account</div>
      {line("Spent on DataForSEO today", usd(a.spentToday, 3))}
      {line("Daily spending cap on the account", usd(a.dayLimitUsd, 0))}
      {line("Top up", <a href="https://app.dataforseo.com/api-dashboard" target="_blank" rel="noreferrer" className="text-brand inline-flex items-center gap-1">Open DataForSEO <IconExternalLink size={13} /></a>)}
    </div>
    {data.topics.length > 0 && (
      <div className="mx-4 mb-4 rounded-xl border border-gray-100">
        <div className="px-4 py-3 text-[14px] font-medium text-[#232D42]">Topics searched</div>
        {data.topics.slice(0, 20).map((t, i) => line(`${t.topic} — ${who(t.created_by) || "someone"}, ${when(t.created_at)}`, usd(t.cost, 3)))}
      </div>
    )}
  </>);
}

type ErrData = { dataforseo: { id: string; at: string; what: string; code: number | null; message: string }[] | null; failed: { id: string; engine: Engine; error: string | null; cost: number; created_at: string; geo_questions: { question: string } | null }[] };
function Errors() {
  const { data, isLoading } = useApi<ErrData>("/api/geo/errors");
  if (isLoading || !data) return <LoadingBlock label="Loading errors…" />;
  return (<>
    <div className="geo-head"><div className="text-base font-medium text-[#232D42]">Errors</div><div className="text-xs text-[#8A92A6]">DataForSEO&apos;s own error log, and answers that failed in our checks</div></div>
    <div className="px-4 pt-4 text-[14px] font-medium text-[#232D42]">DataForSEO error log</div>
    {data.dataforseo === null ? <div className="geo-empty">Couldn&apos;t read DataForSEO&apos;s log just now.</div> : data.dataforseo.length === 0 ? <div className="mx-4 mt-2 rounded-xl bg-[#E8F6EE] text-[#1AA053] text-[13px] px-4 py-2.5">No errors on the account.</div> : (
      <table className="geo-table"><thead><tr><th>When</th><th>What</th><th>Code</th><th>Message</th></tr></thead>
        <tbody>{data.dataforseo.map((e) => <tr key={e.id}><td>{e.at}</td><td className="break-all">{e.what}</td><td>{e.code}</td><td>{e.message}</td></tr>)}</tbody></table>
    )}
    <div className="px-4 pt-5 text-[14px] font-medium text-[#232D42]">Failed answers</div>
    {data.failed.length === 0 ? <div className="mx-4 my-2 rounded-xl bg-[#E8F6EE] text-[#1AA053] text-[13px] px-4 py-2.5">Every answer came back.</div> : (
      <table className="geo-table"><thead><tr><th>When</th><th>AI</th><th>Question</th><th>What went wrong</th><th>Charged</th></tr></thead>
        <tbody>{data.failed.map((f) => <tr key={f.id}><td>{when(f.created_at)}</td><td>{ENGINES.find((e) => e.key === f.engine)?.label}</td><td>{f.geo_questions?.question}</td><td>{f.error}</td><td>{usd(Number(f.cost || 0), 3)}</td></tr>)}</tbody></table>
    )}
  </>);
}

type RepRow = { date: string; brand: string; topic: string; question: string; ai: string; status: string; named: boolean | null; position: number | null; others: string[]; sources: string[]; change: string; cost: number };
type RepData = { summary: { from: string; to: string; answers: number; named: number; cost: number; questions: number; gained: number; lost: number; topOthers: [string, number][] }; rows: RepRow[] };
function Report({ brands }: { brands: Brand[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const back = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
  const [range, setRange] = useState<[string, string]>([back(7), today]);
  const [brand, setBrand] = useState(""), [engine, setEngine] = useState("");
  const qs = `from=${range[0]}&to=${range[1]}${brand ? `&brand=${brand}` : ""}${engine ? `&engine=${engine}` : ""}`;
  const { data, isLoading } = useApi<RepData>(`/api/geo/report?${qs}`);
  const preset = (label: string, d: number) => (
    <button onClick={() => setRange([back(d), today])} className={`h-8 px-3 rounded-lg border text-[13px] ${range[0] === back(d) && range[1] === today ? "bg-brand border-brand text-white" : "bg-white border-gray-200 text-[#232D42]"}`}>{label}</button>
  );
  const s = data?.summary;
  return (<div className="geo-report">
    <div className="geo-head"><div className="text-base font-medium text-[#232D42]">Report</div><div className="text-xs text-[#8A92A6]">Every question we asked, every AI, every answer</div></div>
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 geo-noprint">
      {preset("Last 7 days", 7)}{preset("Last 30 days", 30)}{preset("Last 3 months", 90)}
      <input type="date" value={range[0]} max={range[1]} onChange={(e) => setRange([e.target.value, range[1]])} className="h-8 rounded-lg border border-gray-200 px-2 text-[13px]" />
      <span className="text-[#8A92A6]">to</span>
      <input type="date" value={range[1]} min={range[0]} max={today} onChange={(e) => setRange([range[0], e.target.value])} className="h-8 rounded-lg border border-gray-200 px-2 text-[13px]" />
      <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-8 rounded-lg border border-gray-200 px-2 text-[13px]"><option value="">All brands</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select value={engine} onChange={(e) => setEngine(e.target.value)} className="h-8 rounded-lg border border-gray-200 px-2 text-[13px]"><option value="">All AIs</option>{ENGINES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</select>
      <span className="flex-1" />
      <a href={`/api/geo/report?${qs}&format=csv`} className="geo-btn"><IconFileSpreadsheet size={14} />Download Excel</a>
      <button onClick={() => window.print()} className="geo-btn"><IconPrinter size={14} />Save as PDF</button>
    </div>
    {isLoading || !s ? <LoadingBlock label="Building the report…" /> : (<>
      <div className="mx-4 rounded-xl bg-brand-light px-4 py-3 text-[14px] text-[#232D42] leading-relaxed">
        <b className="font-medium">{day(s.from)} – {day(s.to)}{brand ? ` · ${brands.find((b) => b.id === brand)?.name}` : " · all brands"}.</b>{" "}
        {s.answers ? <>{s.questions} questions, {s.answers} answers ({usd(s.cost)}). The AIs named us in <b className="font-medium">{s.named} of {s.answers}</b>.
          {s.gained || s.lost ? <> Compared with the answer before: <b className="font-medium">{s.gained} gained</b>, <b className="font-medium">{s.lost} lost</b>.</> : null}
          {s.topOthers.length ? <> Named most instead of us: {s.topOthers.map(([n, c]) => `${n} (${c})`).join(", ")}.</> : null}</> : "No answers in this period."}
      </div>
      {data!.rows.length > 0 && (
        <table className="geo-table mt-3"><thead><tr><th>Date</th><th>Brand</th><th>Question</th><th>AI</th><th>Named us?</th><th>Spot</th><th>Named instead</th><th>Sources</th><th>Change</th></tr></thead>
          <tbody>{data!.rows.map((r, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{day(r.date)}</td><td>{r.brand}</td><td className="min-w-[220px]">{r.question}</td><td>{r.ai}</td>
              <td>{r.status !== "done" ? <span className="geo-chip">{r.status === "failed" ? "Failed" : "Waiting"}</span> : r.named ? <span className="geo-chip ok">Yes</span> : <span className="geo-chip bad">No</span>}</td>
              <td>{r.position ? `#${r.position}` : "—"}</td><td>{r.others.join(", ") || "—"}</td><td className="text-[#8A92A6]">{r.sources.join(", ") || "—"}</td>
              <td>{r.change ? <span className={`geo-chip ${r.change === "Gained" ? "ok" : "bad"}`}>{r.change}</span> : "—"}</td>
            </tr>
          ))}</tbody></table>
      )}
    </>)}
  </div>);
}

const CSS = `
.geo-wrap{container:geo / inline-size}
.geo-split{display:grid;gap:12px;align-items:start;grid-template-columns:232px minmax(300px,380px) minmax(0,1fr)}
.geo-pane{position:sticky;top:12px;max-height:calc(100vh - 24px);min-height:420px;display:flex;flex-direction:column;background:#fff;border:1px solid #EEF0F4;border-radius:14px;min-width:0}
.geo-wide{grid-column:span 2}
.geo-scroll{overflow:auto;min-height:0;flex:1}
.geo-head{padding:12px 14px 10px;border-bottom:1px solid #EEF0F4;flex-shrink:0}
.geo-rail{padding:6px}
.geo-status{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:9px 10px;border-radius:10px;text-align:left;color:#232D42}
.geo-status:hover{background:#F6F7FB}
.geo-status.on{background:var(--tint)}
.geo-status .ic{width:30px;height:30px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.geo-status .nm{flex:1;min-width:0;font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.geo-status .hint{display:block;font-size:11.5px;font-weight:400;color:#8A92A6;overflow:hidden;text-overflow:ellipsis}
.geo-status .ct{font-size:12.5px;font-weight:500;color:#232D42;background:#F6F7FB;border-radius:999px;padding:1px 8px;min-width:26px;text-align:center;flex-shrink:0}
.geo-status.on .ct{background:#fff;color:var(--tone)}
.geo-search{margin:10px 10px 4px;display:flex;align-items:center;gap:8px;border:1px solid #EEF0F4;border-radius:10px;padding:7px 10px;flex-shrink:0}
.geo-search input{border:0;outline:0;flex:1;min-width:0;font-size:13px;color:#232D42;background:transparent}
.geo-group{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8A92A6;padding:10px 8px 4px}
.geo-row{display:block;width:100%;border:1px solid transparent;background:transparent;border-radius:10px;padding:9px 10px;text-align:left}
.geo-row:hover{background:#F6F7FB}
.geo-row.on{background:#E9ECFB;border-color:rgba(58,87,232,.25)}
.geo-row .t{display:block;font-size:13.5px;font-weight:500;color:#232D42;line-height:1.35}
.geo-ai{font-size:10.5px;border-radius:6px;padding:1px 6px;background:#F6F7FB;color:#8A92A6}
.geo-ai.y{background:#E8F6EE;color:#1AA053}
.geo-empty{padding:28px 14px;text-align:center;font-size:13px;color:#8A92A6}
.geo-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;border-radius:999px;padding:2px 9px;background:#F6F7FB;color:#8A92A6;white-space:nowrap}
.geo-chip.brand{background:#E9ECFB;color:#3A57E8}.geo-chip.ok{background:#E8F6EE;color:#1AA053}.geo-chip.bad{background:#FBEAE8;color:#C03221}.geo-chip.warn{background:#FEF1E8;color:#F16A1B}
.geo-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:8px;border:1px solid #EEF0F4;background:#fff;font-size:13px;font-weight:500;color:#232D42}
.geo-btn:hover{border-color:#3A57E8;color:#3A57E8}
.geo-eng{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:8px;border:1px solid #EEF0F4;background:#fff;font-size:13px;color:#232D42}
.geo-eng.on{border-color:#3A57E8;background:#E9ECFB;color:#3A57E8}
.geo-answer{margin-top:12px;background:#F6F7FB;border:1px solid #EEF0F4;border-radius:12px;padding:14px 16px;font-size:13.5px;line-height:1.65;color:#232D42;max-height:520px;overflow:auto}
.geo-answer mark{background:#FEF1E8;color:#232D42;border-radius:3px;padding:0 2px}
.geo-answer mark.us{background:#E9ECFB;color:#2138B0}
.geo-lbl{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#8A92A6;margin:18px 0 6px}
.geo-table{width:100%;border-collapse:collapse;font-size:13px}
.geo-table th{text-align:left;font-size:11px;font-weight:500;letter-spacing:.03em;text-transform:uppercase;color:#8A92A6;background:#F6F7FB;padding:9px 14px;border-bottom:1px solid #EEF0F4}
.geo-table td{padding:10px 14px;border-bottom:1px solid #EEF0F4;color:#232D42;vertical-align:top}
@container geo (max-width: 1123px){ .geo-split{grid-template-columns:196px minmax(260px,320px) minmax(0,1fr)} .geo-status .hint{display:none} }
@container geo (max-width: 860px){ .geo-split{grid-template-columns:minmax(0,1fr)} .geo-wide{grid-column:auto} .geo-pane{position:static;max-height:none;min-height:0} }
@media print{ .geo-noprint{display:none!important} .geo-pane{position:static;max-height:none;border:0} .geo-split{display:block} .geo-split > aside{display:none} }
`;
