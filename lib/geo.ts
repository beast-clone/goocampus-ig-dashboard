// GEO SEO engine (28 Oct). Do ChatGPT, Gemini, Perplexity and Google's AI answer
// name our brands when people in India ask them something?
//
//   findQuestions(topic)  real Google India questions + searches for a topic
//   startRun()            queues every active question to the 4 AIs
//   collect()             picks up finished answers and scores them
//
// ChatGPT, Gemini and Google go through DataForSEO's queue (cheaper; answers take
// 20 s – 5 min, so collect() runs from the page while a check is open and from the
// n8n cron). Perplexity has no queue, so collect() asks it directly, a few at a time.
import { getSupabase } from "@/lib/supabase";
import { dfsGet, dfsPost, type DfsTask } from "@/lib/dataforseo";
import { askPerplexityJSON, hasAI } from "@/lib/ai";

export type Engine = "chatgpt" | "google" | "gemini" | "perplexity";
export const ENGINES: Engine[] = ["chatgpt", "google", "gemini", "perplexity"];
const INDIA = { location_code: 2356, language_code: "en" };
const QUEUED: Record<Exclude<Engine, "perplexity">, { post: string; get: string }> = {
  chatgpt: { post: "/v3/ai_optimization/chat_gpt/llm_scraper/task_post", get: "/v3/ai_optimization/chat_gpt/llm_scraper/task_get/advanced/" },
  gemini: { post: "/v3/ai_optimization/gemini/llm_scraper/task_post", get: "/v3/ai_optimization/gemini/llm_scraper/task_get/advanced/" },
  google: { post: "/v3/serp/google/organic/task_post", get: "/v3/serp/google/organic/task_get/advanced/" },
};
/** Rough cost of one question across all 4 AIs, for the "this will cost" line and the monthly cap. */
export const COST_PER_QUESTION = 3 * 0.0012 + 0.007;
export const DEFAULT_MONTHLY_LIMIT = 10;

export type Brand = { id: string; name: string; domain: string | null; aliases: string[] };
export type Suggestion = { question: string; kind: "real" | "search" | "choose"; source: string };

const db = () => {
  const sb = getSupabase();
  if (!sb) throw new Error("Database not configured");
  return sb;
};
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };

export async function monthlyLimit(): Promise<number> {
  const { data } = await db().from("mh_settings").select("value").eq("key", "geoMonthlyUsd").maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_LIMIT;
}

/** GEO spend this month: every answer plus every topic search. */
export async function monthSpend(): Promise<number> {
  const since = monthStart();
  const [a, t] = await Promise.all([
    db().from("geo_answers").select("cost").gte("created_at", since),
    db().from("geo_topics").select("cost").gte("created_at", since),
  ]);
  const sum = (rows: { cost: number | string }[] | null) => (rows || []).reduce((s, r) => s + Number(r.cost || 0), 0);
  return sum(a.data) + sum(t.data);
}

// ---------- finding questions ----------

/** Real questions and searches for a topic, from Google India. */
export async function findQuestions(topic: string, brand: Brand, by: string | null): Promise<{ suggestions: Suggestion[]; cost: number }> {
  const [t] = await dfsPost("/v3/serp/google/organic/live/advanced", [{ keyword: topic, ...INDIA, depth: 10, people_also_ask_click_depth: 1 }]);
  if (!t || t.status_code !== 20000) throw new Error(t?.status_message || "Google search failed");
  const items = ((t.result?.[0] as { items?: { type: string; items?: unknown[] }[] })?.items) || [];
  const real: string[] = [], searches: string[] = [];
  for (const it of items) {
    if (it.type === "people_also_ask") for (const q of (it.items || []) as { title?: string }[]) if (q.title) real.push(q.title);
    if (it.type === "related_searches") for (const s of (it.items || []) as string[]) if (typeof s === "string") searches.push(s);
  }
  const out: Suggestion[] = real.map((q) => ({ question: q, kind: "real", source: "Asked on Google" }));
  out.push(...(await reword(topic, brand.name, searches)));
  const seen = new Set<string>();
  const suggestions = out.filter((s) => { const k = s.question.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const cost = Number(t.cost || 0);
  await db().from("geo_topics").insert({ brand_id: brand.id, topic, found: suggestions, cost, created_by: by });
  return { suggestions, cost };
}

/** Turn real searches into questions, and draft two "who should I choose" ones. */
async function reword(topic: string, brand: string, searches: string[]): Promise<Suggestion[]> {
  const fallback: Suggestion[] = [
    ...searches.map((s) => ({ question: `What should I know about ${s}?`, kind: "search" as const, source: `From the search “${s}”` })),
    { question: `Which is the best ${topic} service in India?`, kind: "choose", source: "Drafted from the topic" },
    { question: `Is ${brand} good for ${topic}?`, kind: "choose", source: "Drafted from the topic" },
  ];
  if (!hasAI()) return fallback;
  type Out = { searches?: { search: string; question: string }[]; choose?: string[] };
  const j = await askPerplexityJSON<Out>(
    "You rewrite Google searches made by Indian students and doctors as the natural question that person would type into ChatGPT. Keep every fact in the search (state, year, exam, round); add nothing. Also write two short questions a person would ask an AI when choosing a service for the topic — one 'which is the best…' and one asking whether the named brand is good for it.",
    `Topic: ${topic}\nBrand: ${brand}\nSearches:\n${searches.map((s) => `- ${s}`).join("\n")}\n\nReply as {"searches":[{"search":"…","question":"…"}],"choose":["…","…"]}`,
    { maxTokens: 900, temperature: 0.2, feature: "geo-seo" } as Parameters<typeof askPerplexityJSON>[2],
  ).catch(() => null);
  if (!j?.searches?.length) return fallback;
  const bySearch = new Map(j.searches.map((s) => [s.search.toLowerCase(), s.question]));
  return [
    ...searches.map((s) => ({ question: bySearch.get(s.toLowerCase()) || `What should I know about ${s}?`, kind: "search" as const, source: `From the search “${s}”` })),
    ...(j.choose || []).slice(0, 2).map((q) => ({ question: q, kind: "choose" as const, source: "Drafted from the topic" })),
  ];
}

// ---------- running a check ----------

/** Queue every active question (one brand, or all) to the 4 AIs. */
export async function startRun(opts: { brandId: string | null; trigger: "weekly" | "manual"; by: string | null }) {
  let q = db().from("geo_questions").select("id, brand_id, question").eq("paused", false).is("deleted_at", null);
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  const { data: qs, error } = await q;
  if (error) throw error;
  if (!qs?.length) throw new Error("There are no active questions to check.");

  const [spent, limit] = await Promise.all([monthSpend(), monthlyLimit()]);
  const estimate = qs.length * COST_PER_QUESTION;
  if (spent + estimate > limit) throw new Error(`This check (about $${estimate.toFixed(2)}) would go over this month's limit ($${spent.toFixed(2)} of $${limit} used).`);

  const { data: run, error: rErr } = await db().from("geo_runs")
    .insert({ brand_id: opts.brandId, trigger: opts.trigger, started_by: opts.by, questions: qs.length, expected: qs.length * ENGINES.length })
    .select("id").single();
  if (rErr || !run) throw rErr || new Error("Couldn't start the check");

  const rows: Record<string, unknown>[] = [];
  for (const engine of ["chatgpt", "gemini", "google"] as const) {
    for (let i = 0; i < qs.length; i += 100) {
      const batch = qs.slice(i, i + 100);
      const body = batch.map((x) => engine === "google"
        ? { keyword: x.question, ...INDIA, depth: 10, load_async_ai_overview: true, tag: x.id }
        : { keyword: x.question, ...INDIA, tag: x.id });
      let tasks: DfsTask[] = [];
      try { tasks = await dfsPost(QUEUED[engine].post, body); } catch (e) { tasks = []; console.error("geo task_post", engine, e); }
      batch.forEach((x, k) => {
        const t = tasks[k];
        const ok = t && t.status_code === 20100;
        rows.push({ run_id: run.id, question_id: x.id, brand_id: x.brand_id, engine, task_id: ok ? t.id : null,
          status: ok ? "pending" : "failed", error: ok ? null : (t?.status_message || "Couldn't queue the question"), cost: ok ? Number(t.cost || 0) : 0 });
      });
    }
  }
  for (const x of qs) rows.push({ run_id: run.id, question_id: x.id, brand_id: x.brand_id, engine: "perplexity", task_id: null, status: "pending", error: null, cost: 0 });
  // Every row carries the same columns: a bulk insert fills a missing one with null,
  // and a null cost fails the whole insert.
  const { error: aErr } = await db().from("geo_answers").insert(rows);
  if (aErr) {
    await db().from("geo_runs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", run.id);
    throw aErr;
  }
  return { runId: run.id as string, questions: qs.length, estimate };
}

// ---------- collecting answers ----------

type Parsed = { text: string; sources: { url: string; domain: string; title?: string }[]; model: string; entities: string[] };
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u.replace(/^www\./, ""); } };

function parse(engine: Engine, r: Record<string, unknown>): Parsed {
  type Src = { url?: string; domain?: string; title?: string };
  const srcs = (list: Src[] | undefined) => (list || []).filter((s) => s.url || s.domain).map((s) => ({ url: s.url || "", domain: (s.domain || domainOf(s.url || "")).replace(/^www\./, ""), title: s.title }));
  if (engine === "google") {
    const ai = ((r.items as { type: string; markdown?: string; references?: Src[] }[]) || []).find((i) => i.type === "ai_overview");
    return { text: ai?.markdown || "", sources: srcs(ai?.references), model: "Google AI Overview", entities: [] };
  }
  if (engine === "perplexity") {
    const sec = ((r.items as { sections?: { text?: string; annotations?: Src[] }[] }[]) || []).flatMap((i) => i.sections || []);
    return { text: sec.map((s) => s.text || "").join("\n\n"), sources: srcs(sec.flatMap((s) => s.annotations || [])), model: String(r.model_name || "sonar"), entities: [] };
  }
  // ChatGPT's own list of brands it mentioned — only the ones it files as a business.
  const ents = ((r.brand_entities as { markdown?: string; title?: string; category?: string }[]) || [])
    .filter((e) => ["organization", "local_business", "brand", "company"].includes(String(e.category)))
    .map((e) => (e.markdown || e.title || "").replace(/\*\*/g, "").trim()).filter((n) => n.length > 2);
  return { text: String(r.markdown || ""), sources: srcs(r.sources as Src[]), model: String(r.model || engine), entities: ents };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Did the answer name us, cite us, where, and who else did it name? */
function score(p: Parsed, brand: Brand, known: string[]) {
  const text = norm(p.text);
  const ours = [brand.name, ...brand.aliases, brand.domain?.split(".")[0] || ""].map(norm).filter((s) => s.length > 2);
  const firstAt = (names: string[]) => Math.min(...names.map((n) => { const i = (" " + text + " ").indexOf(" " + n + " "); return i < 0 ? Infinity : i; }));
  const ourAt = firstAt(ours);
  const named = ourAt !== Infinity;
  const cited = !!brand.domain && p.sources.some((s) => s.domain.endsWith(brand.domain!));
  // Others: known competitors found in the text, ChatGPT's own brand list, and bold
  // names that match a website the answer used ("**ZyNerd**" + zynerd.com). Bold on
  // its own isn't enough — answers bold plenty of things that aren't companies.
  const roots = p.sources.map((s) => s.domain.split(".")[0].replace(/[^a-z0-9]/g, "")).filter((r) => r.length > 2);
  const bold = Array.from(p.text.matchAll(/\*\*([^*\n]{2,40})\*\*/g)).map((m) => m[1].trim().replace(/[:.]$/, ""))
    .filter((b) => { const k = b.toLowerCase().replace(/[^a-z0-9]/g, ""); return k.length > 2 && roots.includes(k); });
  const cands = Array.from(new Set([...known.filter((k) => firstAt([norm(k)]) !== Infinity), ...p.entities, ...bold]))
    .filter((c) => !ours.some((o) => norm(c).includes(o)));
  const placed = cands.map((c) => ({ c, at: firstAt([norm(c)]) })).filter((x) => x.at !== Infinity).sort((a, b) => a.at - b.at);
  const position = named ? placed.filter((x) => x.at < ourAt).length + 1 : null;
  return { named, cited, position, competitors: placed.map((x) => x.c).slice(0, 8) };
}

async function knownCompetitors(): Promise<string[]> {
  const { data } = await db().from("mh_competitors").select("name");
  return Array.from(new Set((data || []).map((r) => String(r.name || "").trim()).filter((n) => n.length > 2)));
}

/** Pick up finished answers. Runs for at most `budgetMs`, so it fits a web request. */
export async function collect(budgetMs = 40_000): Promise<{ done: number; pending: number }> {
  const t0 = Date.now();
  const left = () => budgetMs - (Date.now() - t0);
  const { data: pend } = await db().from("geo_answers").select("id, run_id, question_id, brand_id, engine, task_id, created_at").eq("status", "pending").order("created_at").limit(400);
  if (!pend?.length) { await finishRuns(); return { done: 0, pending: 0 }; }

  const [{ data: brands }, { data: qrows }, known] = await Promise.all([
    db().from("geo_brands").select("id, name, domain, aliases"),
    db().from("geo_questions").select("id, question").in("id", Array.from(new Set(pend.map((p) => p.question_id)))),
    knownCompetitors(),
  ]);
  const brandOf = new Map((brands || []).map((b) => [b.id, b as Brand]));
  const qOf = new Map((qrows || []).map((q) => [q.id, q.question as string]));
  let done = 0;

  const save = async (id: string, engine: Engine, brandId: string, r: Record<string, unknown> | null, err: string | null, cost?: number) => {
    if (!r) { await db().from("geo_answers").update({ status: "failed", error: err, done_at: new Date().toISOString() }).eq("id", id); return; }
    const p = parse(engine, r);
    const s = score(p, brandOf.get(brandId)!, known);
    await db().from("geo_answers").update({
      status: "done", answer: p.text || null, sources: p.sources.slice(0, 20), model: p.model, ...s,
      done_at: new Date().toISOString(), ...(cost !== undefined ? { cost } : {}),
      error: p.text ? null : (engine === "google" ? "Google showed no AI answer for this question" : "Empty answer"),
    }).eq("id", id);
    done++;
  };

  // Queued answers: task_get is free; one still cooking just stays pending.
  const queued = pend.filter((p) => p.engine !== "perplexity" && p.task_id && Date.now() - new Date(p.created_at).getTime() > 15_000);
  for (let i = 0; i < queued.length && left() > 8_000; i += 6) {
    await Promise.all(queued.slice(i, i + 6).map(async (p) => {
      try {
        const [t] = await dfsGet(QUEUED[p.engine as Exclude<Engine, "perplexity">].get + p.task_id, 20_000);
        if (t?.status_code === 20000) await save(p.id, p.engine as Engine, p.brand_id, (t.result?.[0] || {}) as Record<string, unknown>, null);
        else if (t && ![40601, 40602, 40100].includes(t.status_code)) await save(p.id, p.engine as Engine, p.brand_id, null, t.status_message);
        else if (Date.now() - new Date(p.created_at).getTime() > 3 * 3600_000) await save(p.id, p.engine as Engine, p.brand_id, null, "No answer after 3 hours");
      } catch { /* try again next time */ }
    }));
  }

  // Perplexity: asked directly, three at a time while there's time.
  const direct = pend.filter((p) => p.engine === "perplexity");
  for (let i = 0; i < direct.length && left() > 25_000; i += 3) {
    await Promise.all(direct.slice(i, i + 3).map(async (p) => {
      try {
        const [t] = await dfsPost("/v3/ai_optimization/perplexity/llm_responses/live",
          [{ user_prompt: qOf.get(p.question_id), model_name: "sonar", web_search: true, web_search_country_iso_code: "IN", max_output_tokens: 1024 }], 22_000);
        if (t?.status_code === 20000) await save(p.id, "perplexity", p.brand_id, (t.result?.[0] || {}) as Record<string, unknown>, null, Number(t.cost || 0));
        else await save(p.id, "perplexity", p.brand_id, null, t?.status_message || "No answer");
      } catch { /* timed out — try again next time */ }
    }));
  }

  await finishRuns();
  const { count } = await db().from("geo_answers").select("id", { count: "exact", head: true }).eq("status", "pending");
  return { done, pending: count || 0 };
}

/** A check is finished once nothing in it is pending. */
async function finishRuns() {
  const { data: runs } = await db().from("geo_runs").select("id").eq("status", "running");
  for (const r of runs || []) {
    const { data: a } = await db().from("geo_answers").select("status").eq("run_id", r.id);
    if (!a || a.some((x) => x.status === "pending")) continue;
    const failed = a.filter((x) => x.status === "failed").length;
    await db().from("geo_runs").update({ status: a.length && failed === 0 ? "done" : failed === a.length ? "failed" : "partial", finished_at: new Date().toISOString() }).eq("id", r.id);
  }
}
