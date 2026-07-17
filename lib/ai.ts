// Perplexity AI client (OpenAI-compatible chat completions). Zero-dependency.
// PERPLEXITY_API_KEY in .env.local. Sonar models include live web search, so the
// model can ground marketing suggestions in current best practices + cite sources.

const KEY = process.env.PERPLEXITY_API_KEY || "";

export function hasAI(): boolean {
  return Boolean(KEY);
}

export async function askPerplexity(
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number },
): Promise<{ text: string; citations: string[] }> {
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
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const citations: string[] = j.citations || (j.search_results || []).map((s: { url: string }) => s.url) || [];
  return { text: j.choices?.[0]?.message?.content || "", citations };
}
