// Perplexity AI client (OpenAI-compatible chat completions). Zero-dependency.
// PERPLEXITY_API_KEY in .env.local. Sonar models include live web search, so the
// model can ground marketing suggestions in current best practices + cite sources.
// This is the ONLY LLM provider in the dashboard — no OpenAI anywhere.

const KEY = process.env.PERPLEXITY_API_KEY || "";

export function hasAI(): boolean {
  return Boolean(KEY);
}

export async function askPerplexity(
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<{ text: string; citations: string[] }> {
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
    return { text: j.choices?.[0]?.message?.content || "", citations };
  } finally {
    clearTimeout(timer);
  }
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
