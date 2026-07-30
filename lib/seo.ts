// Free SEO helpers — live Google rank checks via Serper (the same free key already
// used for Content Radar). NO DataForSEO / paid data. Never throws; degrades to empty
// so the SEO tab can't break. 1 successful search = 1 Serper credit (free tier 2,500).
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { recordApiCall, callsThisMonth } from "@/lib/api-usage";

// Reuse the same monthly self-cap the Content Radar lanes respect, so the tracker
// can never drain the free Serper credits.
const SERPER_MONTHLY_BUDGET = Number(process.env.SERPER_MONTHLY_BUDGET) || 200;

// GooCampus web properties — used to detect "our" position in a Google SERP.
export const OUR_DOMAINS = ["goocampusevents.com", "goocampus.in", "12thplus.com", "12thplus.in"];

export type SerpResult = { position: number; title: string; link: string; domain: string; snippet: string; ours: boolean };
export type RankReport = {
  keyword: string;
  organic: SerpResult[];            // top ~10 organic results
  ours: { domain: string; position: number; link: string }[]; // where our sites rank
  bestPosition: number | null;      // best (lowest) rank among our domains, null = not in top 10
  peopleAlsoAsk: string[];          // question ideas
  relatedSearches: string[];        // keyword/content ideas
  source: "serper" | "none";
  error?: string;
};

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
export const isOurDomain = (host: string) => OUR_DOMAINS.some((d) => host === d || host.endsWith("." + d));

// One live Google search (gl=in → India results) → parsed rank report.
export async function serperRank(keyword: string, gl = "in"): Promise<RankReport> {
  const empty = (error?: string): RankReport => ({ keyword, organic: [], ours: [], bestPosition: null, peopleAlsoAsk: [], relatedSearches: [], source: "none", error });
  const key = process.env.SERPER_API_KEY;
  if (!key) return empty("No Serper key — add SERPER_API_KEY (free at serper.dev).");
  if (callsThisMonth("Serper") >= SERPER_MONTHLY_BUDGET) return empty("Serper monthly budget reached — raise SERPER_MONTHLY_BUDGET or wait for the reset.");
  try {
    const r = await fetchWithTimeout("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      // Free tier caps num at 10.
      body: JSON.stringify({ q: keyword, gl, num: 10 }),
      timeoutMs: 12_000,
      cache: "no-store",
    });
    recordApiCall("Serper", r.ok, r.status);
    if (!r.ok) return empty(`Serper ${r.status}`);
    const j = (await r.json()) as { organic?: Array<Record<string, unknown>>; peopleAlsoAsk?: Array<Record<string, unknown>>; relatedSearches?: Array<Record<string, unknown>> };
    const organic: SerpResult[] = (j.organic || []).slice(0, 10).map((it, i) => {
      const link = String(it.link || "");
      const domain = hostOf(link);
      return { position: typeof it.position === "number" ? it.position : i + 1, title: String(it.title || "").trim(), link, domain, snippet: String(it.snippet || "").slice(0, 200), ours: isOurDomain(domain) };
    });
    const ours = organic.filter((o) => o.ours).map((o) => ({ domain: o.domain, position: o.position, link: o.link }));
    const bestPosition = ours.length ? Math.min(...ours.map((o) => o.position)) : null;
    const peopleAlsoAsk = (j.peopleAlsoAsk || []).map((p) => String(p.question || "").trim()).filter(Boolean).slice(0, 6);
    const relatedSearches = (j.relatedSearches || []).map((p) => String(p.query || "").trim()).filter(Boolean).slice(0, 8);
    return { keyword, organic, ours, bestPosition, peopleAlsoAsk, relatedSearches, source: "serper" };
  } catch (e) {
    return empty((e as Error).message);
  }
}
