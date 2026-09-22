// Google keyword research (SEO tab → Google research). Nandu: "I need keyword research
// for SEO" (with Ahrefs' keyword-research tutorial). FREE sources only (user's call):
//   • Serper (Google India): autocomplete suggestions, related searches, "People also
//     ask" questions, the top 10 results and where our sites rank.
//   • Search Console: our real searches containing the seed (impressions/clicks/position).
// No search volume or keyword difficulty — those need a paid source (DataForSEO/Semrush).
// ~7 Serper credits per research (1 search + 6 autocompletes); cached 24h per seed.
import { cached } from "@/lib/api-cache";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { recordApiCall } from "@/lib/api-usage";
import { serperRank, type RankReport } from "@/lib/seo";
import { hasGSCAuth, searchConsoleQueriesContaining, type SeoKeyword } from "@/lib/search-console";

export type Idea = { keyword: string; from: "autocomplete" | "related" };
export type KeywordResearch = {
  seed: string;
  ideas: Idea[];
  questions: string[];
  serp: RankReport;
  ours: { rows: SeoKeyword[]; from: string; to: string; error?: string };
  generatedAt: string;
};

async function autocomplete(q: string): Promise<string[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const r = await fetchWithTimeout("https://google.serper.dev/autocomplete", {
      method: "POST", headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q, gl: "in" }), timeoutMs: 10_000, cache: "no-store",
    });
    recordApiCall("Serper", r.ok, r.status);
    if (!r.ok) return [];
    const j = (await r.json()) as { suggestions?: { value?: string }[] };
    return (j.suggestions || []).map((s) => String(s.value || "").trim()).filter(Boolean);
  } catch { return []; }
}

export function keywordResearch(seedRaw: string): Promise<KeywordResearch> {
  const seed = seedRaw.trim().replace(/\s+/g, " ").toLowerCase();
  return cached(`kw-research:v4:${seed}`, 24 * 60 * 60_000, async () => {
    const to = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10); // GSC lags ~2 days
    const from = new Date(Date.now() - 92 * 86_400_000).toISOString().slice(0, 10);
    // Serper returns no "People also ask" / related searches for these queries, so the
    // questions come from Google autocomplete on question starters instead.
    const [serp, ac1, ac2, qWhat, qHow, qWhy, qVs, ours] = await Promise.all([
      serperRank(seed),
      autocomplete(seed),
      autocomplete(`${seed} `), // trailing space → Google's "next word" suggestions
      autocomplete(`what is ${seed}`),   // Google needs natural starts — "what plab" returns planets
      autocomplete(`how to ${seed}`),
      autocomplete(`why ${seed}`),
      autocomplete(`${seed} vs`),
      hasGSCAuth()
        ? searchConsoleQueriesContaining(seed, from, to).then((rows) => ({ rows, from, to })).catch((e) => ({ rows: [], from, to, error: (e as Error).message.slice(0, 160) }))
        : Promise.resolve({ rows: [] as SeoKeyword[], from, to, error: "Search Console isn't connected." }),
    ]);
    const seen = new Set([seed]);
    const ideas: Idea[] = [];
    // Autocomplete also returns prefix matches ("plab" → "planet fitness", "plan b"):
    // keep only suggestions containing every word of the seed as a whole word.
    const words = seed.split(" ").filter(Boolean).map((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i"));
    const relevant = (k: string) => words.every((re) => re.test(k));
    const add = (k: string, from: Idea["from"]) => { const n = k.toLowerCase().trim(); if (n && !seen.has(n) && relevant(n)) { seen.add(n); ideas.push({ keyword: n, from }); } };
    [...ac1, ...ac2].forEach((k) => add(k, "autocomplete"));
    serp.relatedSearches.forEach((k) => add(k, "related"));
    qVs.forEach((k) => add(k, "autocomplete"));
    const qSeen = new Set<string>();
    const questions = [...serp.peopleAlsoAsk, ...qWhat, ...qHow, ...qWhy]
      .map((k) => k.trim()).filter((k) => relevant(k.toLowerCase()) && !qSeen.has(k.toLowerCase()) && qSeen.add(k.toLowerCase()))
      .map((k) => (/[?]$/.test(k) ? k : `${k[0].toUpperCase()}${k.slice(1)}?`)).slice(0, 12);
    return { seed, ideas, questions, serp, ours, generatedAt: new Date().toISOString() };
  }, (d) => d.serp.source === "serper");
}
