// Perplexity AI client (OpenAI-compatible chat completions). Zero-dependency.
// PERPLEXITY_API_KEY in .env.local. Sonar models include live web search, so the
// model can ground marketing suggestions in current best practices + cite sources.
// This is the ONLY LLM provider in the dashboard — no OpenAI anywhere.

// The key is stored as PLANNER_SEARCH_KEY in this project (Post Planner + the
// Integrations/Diagnostics tab use it); accept either name so the shared AI layer works.
const KEY = process.env.PERPLEXITY_API_KEY || process.env.PLANNER_SEARCH_KEY || "";

export function hasAI(): boolean {
  return Boolean(KEY);
}

export type Usage = { prompt: number; completion: number; total: number; cost?: number };

export async function askPerplexity(
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<{ text: string; citations: string[]; usage: Usage }> {
  // Bound every call so a slow/stuck upstream can never hang a route.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 25_000);
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts?.model || "sonar",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: opts?.maxTokens ?? 1200,
        temperature: opts?.temperature ?? 0.3,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const citations: string[] = j.citations || (j.search_results || []).map((s: { url: string }) => s.url) || [];
    const u = j.usage || {};
    const usage: Usage = { prompt: u.prompt_tokens || 0, completion: u.completion_tokens || 0, total: u.total_tokens || 0 };
    return { text: j.choices?.[0]?.message?.content || "", citations, usage };
  } finally {
    clearTimeout(timer);
  }
}

// Claude via Perplexity — Perplexity resells Anthropic models through its Agentic
// Research API (OpenAI "Responses" format on /v1/responses), billed to the SAME
// PERPLEXITY_API_KEY / balance as Sonar (Anthropic token rate + a small per-search
// fee). Anthropic models REQUIRE max_output_tokens. A far stronger writer than Sonar;
// this powers the "Claude via Perplexity" engine toggle. Returns the same shape as
// askPerplexity so callers can swap engines with one branch.
export async function askClaudeViaPerplexity(
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<{ text: string; citations: string[]; usage: Usage }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 90_000);
  try {
    const res = await fetch("https://api.perplexity.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts?.model || "anthropic/claude-sonnet-4-5",
        instructions: system,
        input: user,
        max_output_tokens: opts?.maxTokens ?? 2800, // required for Anthropic models
        temperature: opts?.temperature ?? 0.4,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Perplexity(Claude) ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const out: { type?: string; content?: { type?: string; text?: string; annotations?: { url?: string }[] }[] }[] =
      Array.isArray(j.output) ? j.output : [];
    const text = out
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content || [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text || "")
      .join("");
    const citations = out
      .flatMap((o) => o.content || [])
      .flatMap((c) => c.annotations || [])
      .map((a) => a.url || "")
      .filter(Boolean);
    const u = j.usage || {};
    const usage: Usage = { prompt: u.input_tokens || 0, completion: u.output_tokens || 0, total: u.total_tokens || 0, cost: u.cost?.total_cost };
    return { text, citations, usage };
  } finally {
    clearTimeout(timer);
  }
}

// Perplexity Async API — for long jobs (sonar-deep-research) that would otherwise hold
// one HTTP connection open for minutes (which upstream proxies drop → "fetch failed").
// We submit the job, then poll for the result. Safe on a long-lived server (the make
// route runs this fire-and-forget); the page polls Supabase for the finished row.
export async function askPerplexityAsync(
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; temperature?: number; pollMs?: number; maxWaitMs?: number },
): Promise<{ text: string; citations: string[] }> {
  const auth = { Authorization: `Bearer ${KEY}` };
  const submit = await fetch("https://api.perplexity.ai/async/chat/completions", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      request: {
        model: opts?.model || "sonar-deep-research",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: opts?.maxTokens ?? 4000,
        temperature: opts?.temperature ?? 0.2,
      },
    }),
  });
  if (!submit.ok) throw new Error(`Perplexity async submit ${submit.status}: ${(await submit.text()).slice(0, 200)}`);
  const created = await submit.json();
  const id: string | undefined = created?.id;
  if (!id) throw new Error("Perplexity async: no request id returned");

  const pollMs = opts?.pollMs ?? 8_000;
  const maxWaitMs = opts?.maxWaitMs ?? 300_000;
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    let j: { status?: string; error_message?: string; response?: { choices?: { message?: { content?: string } }[]; citations?: string[]; search_results?: { url: string }[] } };
    try {
      const res = await fetch(`https://api.perplexity.ai/async/chat/completions/${id}`, { headers: auth });
      if (!res.ok) continue; // transient — keep polling
      j = await res.json();
    } catch { continue; } // network blip — keep polling
    if (j.status === "COMPLETED") {
      const r = j.response || {};
      const citations: string[] = r.citations || (r.search_results || []).map((s) => s.url) || [];
      return { text: r.choices?.[0]?.message?.content || "", citations };
    }
    if (j.status === "FAILED") throw new Error(`Perplexity async job failed${j.error_message ? `: ${j.error_message}` : ""}`);
  }
  throw new Error("Perplexity async job timed out");
}

// Pull a JSON value out of a model reply that may wrap it in prose / code fences.
export function parseLooseJson<T>(text: string): T | null {
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { /* fall through */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]) as T; } catch { /* fall through */ } }
  const objStart = text.indexOf("{"), objEnd = text.lastIndexOf("}");
  const arrStart = text.indexOf("["), arrEnd = text.lastIndexOf("]");
  const useArr = arrStart >= 0 && (objStart < 0 || arrStart < objStart);
  const [s, e] = useArr ? [arrStart, arrEnd] : [objStart, objEnd];
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)) as T; } catch { return null; } }
  return null;
}

// Ask Perplexity and return a parsed JSON object (null on failure). Appends a
// strict "JSON only" instruction since sonar has no response_format param.
export async function askPerplexityJSON<T>(
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<T | null> {
  const sys = `${system}\n\nIMPORTANT: reply with ONLY valid JSON — no markdown, no code fences, no prose before or after.`;
  const { text } = await askPerplexity(sys, user, opts);
  return parseLooseJson<T>(text);
}
