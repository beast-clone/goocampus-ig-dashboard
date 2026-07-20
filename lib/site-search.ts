// Keyless-first web search for the Content Radar "site: lanes" — pulls brand
// mentions from the forums / Q&A / review sites that news RSS can't see: Quora,
// Reddit, MouthShut, ValueMD. One combined `(site:a OR site:b …) brand` query per
// call (kind to rate limits), results tagged back to their site by hostname.
//
// Engine, in order of preference:
//   1. Serper.dev — used when SERPER_API_KEY is set. Google results, clean JSON,
//      supports site: + OR. Free tier: 2,500 searches, no credit card. RELIABLE.
//      Key at https://serper.dev (sign up → API key).
//   2. Brave Search API — used when BRAVE_SEARCH_KEY is set. Clean JSON, site: + OR.
//      (Brave dropped its free web-search tier — paid $5/1k, so Serper is preferred.)
//   3. DuckDuckGo HTML — keyless fallback. Works from residential IPs; DDG
//      rate-limits / soft-blocks datacenter IPs (serves a 202 challenge page), so
//      it's BEST-EFFORT: on a block it yields [] and the lane just shows nothing.
//
// Never throws — a dead engine degrades to an empty lane, never a broken radar.
// ponytail: keyless DDG is best-effort by design; drop in a Serper key for reliable.

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { cached } from "@/lib/api-cache";
import { recordApiCall, callsThisMonth } from "@/lib/api-usage";

// Self-imposed monthly ceiling so we never drain Serper's one-time 2,500 free
// credits. Past this, the site: lanes return empty (Google News is unaffected).
const SERPER_MONTHLY_BUDGET = Number(process.env.SERPER_MONTHLY_BUDGET) || 200;
// Cache each query's site results so repeated/identical searches (esp. the brand
// watch that fires on every radar page load) don't spend a fresh credit each time.
const SITE_SEARCH_TTL_MS = Number(process.env.SITE_SEARCH_TTL_MS) || 6 * 60 * 60_000; // 6h

export type SiteHit = {
  title: string;
  url: string;
  snippet: string;
  source: string;        // bare watched domain, e.g. "reddit.com"
  publishedAt: string;   // ISO if the engine gives one, else "" (unknown)
};

// The four sites we watch. A hit is kept only if it lands on one of these.
export const WATCHED_SITES = ["quora.com", "reddit.com", "mouthshut.com", "valuemd.com"];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^(www|old|m|i|np|en)\./, "");
  } catch {
    return null;
  }
}
// Keep only hits on a watched site; normalise source to the bare domain.
function toWatchedSource(url: string): string | null {
  const h = hostOf(url);
  if (!h) return null;
  for (const dom of WATCHED_SITES) if (h === dom || h.endsWith(`.${dom}`)) return dom;
  return null;
}
function siteQuery(brand: string): string {
  return `(${WATCHED_SITES.map((s) => `site:${s}`).join(" OR ")}) ${brand}`;
}

// ---------- Serper.dev (reliable, keyed — preferred) ----------
async function serperSearch(brand: string, limit: number): Promise<SiteHit[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  // Budget guard: stop spending credits once this month's cap is hit.
  if (callsThisMonth("Serper") >= SERPER_MONTHLY_BUDGET) return [];
  const r = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    // Serper's FREE tier only allows num=10 (num>10 → 400 "Query pattern not
    // allowed for free accounts"). 10 hits across the 4 sites is plenty.
    body: JSON.stringify({ q: siteQuery(brand), gl: "in", num: 10 }),
    timeoutMs: 12_000,
    cache: "no-store",
  });
  recordApiCall("Serper", r.ok, r.status);   // 1 successful search = 1 credit
  if (!r.ok) throw new Error(`Serper ${r.status}`);
  const j = (await r.json()) as { organic?: Array<Record<string, unknown>> };
  const out: SiteHit[] = [];
  for (const it of j?.organic || []) {
    const link = String(it.link || "");
    const src = toWatchedSource(link);
    if (!src) continue;
    const date = (it.date || "") as string;
    out.push({
      title: String(it.title || "").trim(),
      url: link,
      snippet: String(it.snippet || "").slice(0, 240),
      source: src,
      publishedAt: date && !Number.isNaN(+new Date(date)) ? new Date(date).toISOString() : "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- Brave (keyed) ----------
async function braveSearch(brand: string, limit: number): Promise<SiteHit[]> {
  const key = process.env.BRAVE_SEARCH_KEY;
  if (!key) return [];
  const url =
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(siteQuery(brand))}` +
    `&count=${Math.min(limit * 2, 20)}&country=in&safesearch=off`;
  const r = await fetchWithTimeout(url, {
    headers: { "X-Subscription-Token": key, Accept: "application/json" },
    timeoutMs: 12_000,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Brave ${r.status}`);
  const j = (await r.json()) as { web?: { results?: Array<Record<string, unknown>> } };
  const out: SiteHit[] = [];
  for (const it of j?.web?.results || []) {
    const link = String(it.url || "");
    const src = toWatchedSource(link);
    if (!src) continue;
    const age = (it.page_age || it.age || "") as string;
    out.push({
      title: String(it.title || "").replace(/<[^>]+>/g, "").trim(),
      url: link,
      snippet: String(it.description || "").replace(/<[^>]+>/g, "").slice(0, 240),
      source: src,
      publishedAt: age && !Number.isNaN(+new Date(age)) ? new Date(age).toISOString() : "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- DuckDuckGo HTML (keyless, best-effort) ----------
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// DDG wraps result URLs as //duckduckgo.com/l/?uddg=<urlencoded real url>&rut=…
function ddgHref(raw: string): string | null {
  const um = raw.match(/[?&]uddg=([^&]+)/);
  if (um) { try { return decodeURIComponent(um[1]); } catch { return null; } }
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("//")) return "https:" + raw;
  return null;
}
// Exported for the self-check — parses a DDG html result page into {title,url,snippet}.
export function parseDdg(html: string): { title: string; url: string; snippet: string }[] {
  const snippets: string[] = [];
  const snipRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = snipRe.exec(html))) snippets.push(stripHtml(sm[1]));

  const out: { title: string; url: string; snippet: string }[] = [];
  const linkRe = /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = linkRe.exec(html))) {
    const url = ddgHref(m[1].replace(/&amp;/g, "&"));
    const title = stripHtml(m[2]);
    if (url && title) out.push({ title, url, snippet: snippets[i] || "" });
    i++;
  }
  return out;
}
async function ddgSearch(brand: string, limit: number): Promise<SiteHit[]> {
  const body = new URLSearchParams({ q: siteQuery(brand), kl: "in-en" });
  const r = await fetchWithTimeout("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
    },
    body: body.toString(),
    timeoutMs: 12_000,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`DDG ${r.status}`); // 202/429 challenge → throw so the empty isn't cached
  const hits = parseDdg(await r.text());
  const out: SiteHit[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const src = toWatchedSource(h.url);
    if (!src || seen.has(h.url)) continue;
    seen.add(h.url);
    out.push({ title: h.title, url: h.url, snippet: h.snippet, source: src, publishedAt: "" });
    if (out.length >= limit) break;
  }
  return out;
}

function runEngines(brand: string, limit: number): Promise<SiteHit[]> {
  if (process.env.SERPER_API_KEY) return serperSearch(brand, limit);
  if (process.env.BRAVE_SEARCH_KEY) return braveSearch(brand, limit);
  return ddgSearch(brand, limit);
}

// Public: mentions of `brand` across the four watched sites. Never throws.
// Results are cached (SITE_SEARCH_TTL_MS) so repeated identical searches — above
// all the brand watch that fires on every radar page load — cost ZERO extra
// credits. cached() only stores successful runs, so a blocked/failed engine
// (which throws) is not cached and simply retries next time.
export async function searchSites(brand: string, opts: { limit?: number } = {}): Promise<SiteHit[]> {
  const q = brand.trim();
  const limit = opts.limit ?? 12;
  if (!q) return [];
  try {
    return await cached(`sites:${q.toLowerCase()}:${limit}`, SITE_SEARCH_TTL_MS, () => runEngines(q, limit));
  } catch {
    return [];
  }
}
