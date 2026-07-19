// Free, key-less Google "what's trending" signals for the Content Radar.
//
// Two reliable, free endpoints (verified reachable from the server):
//   1. Daily Trends RSS   — https://trends.google.com/trending/rss?geo=IN
//        National daily breakouts with a real approx-traffic number and the
//        news articles driving each spike. We filter these to the medical /
//        study-abroad domain so only relevant breakouts surface.
//   2. Autocomplete/Suggest — https://suggestqueries.google.com/complete/search
//        The real expanding queries people type around a seed topic. No
//        momentum %, so we present these as content IDEAS, never as fake trends.
//
// NOTE: the Trends *widget* API (relatedqueries with true "+240%" momentum) is
// 429-rate-limited on datacenter IPs, so real per-keyword momentum is NOT free
// from the server — that signal comes from Search Console (own-domain deltas).
// We deliberately do not fabricate momentum numbers here.

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type TrendBreakout = {
  title: string;
  traffic: string;              // e.g. "1,000+" (Google's own approx bucket)
  trafficNum: number;           // parsed lower bound, for sorting
  geo: string;                  // "IN" | "AU" | "GB" | "AE"
  picture: string | null;
  articles: { title: string; url: string; source: string | null }[];
  matched: string[];            // which domain keywords caused the match
};

export type TrendIdeaGroup = {
  seed: string;
  ideas: string[];              // real autocomplete expansions (deduped)
};

// ---------- tiny shared helpers (same style as google-alerts-rss.ts) ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

function tagAll(block: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push(m[1].trim());
  return out;
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}

function trafficToNum(t: string): number {
  const m = t.replace(/,/g, "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

// ---------- domain relevance ----------

// Keep this tight and medical/study-abroad specific so national noise
// ("lenovo fifa") never leaks into a doctor-audience radar.
export const DOMAIN_KEYWORDS = [
  "neet", "amc", "plab", "usmle", "mbbs", "mrcp", "mrcs", "plab 2",
  "oet", "ielts", "doctor", "doctors", "medical", "medicine", "physician",
  "nmc", "ahpra", "dha", "moh", "dhcc", "haad", "scfhs", "gmc",
  "residency", "licensing", "medical council", "img", "medical pg",
  "nbems", "neet pg", "neet ug", "nurse", "nursing", "medical exam",
];

// Whole-word match only. A substring test wrongly flags short keywords —
// "dha" inside "Abu Dhabi", "amc" inside "dynamics" — so we require word
// boundaries around each keyword (phrases with spaces still boundary cleanly).
const DOMAIN_RE = new RegExp(
  `\\b(${DOMAIN_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "gi",
);

function matchDomain(text: string): string[] {
  const hits = text.match(DOMAIN_RE);
  if (!hits) return [];
  return Array.from(new Set(hits.map((h) => h.toLowerCase())));
}

// ---------- daily trends (breakouts) ----------

async function fetchDailyTrends(geo: string): Promise<TrendBreakout[]> {
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml,text/xml,*/*" },
    timeoutMs: 12_000,
  });
  if (!res.ok) throw new Error(`Trends RSS ${geo} HTTP ${res.status}`);
  const xml = await res.text();

  const out: TrendBreakout[] = [];
  for (const item of tagAll(xml, "item")) {
    const title = decodeEntities(tag(item, "title") || "").trim();
    if (!title) continue;

    const articles = tagAll(item, "ht:news_item").map((n) => ({
      title: decodeEntities(tag(n, "ht:news_item_title") || "").trim(),
      url: decodeEntities(tag(n, "ht:news_item_url") || "").trim(),
      source: (tag(n, "ht:news_item_source") || "").trim() || null,
    })).filter((a) => a.title);

    // Match on the trending TERM only — not the article headlines. Matching
    // article text pulled in false positives (a celebrity's "brain cancer" obit
    // matched "cancer/doctor"), which made the niche radar look broken. A breakout
    // is only "in your niche" if the search term itself is (e.g. "neet pg result").
    const matched = matchDomain(title);
    if (matched.length === 0) continue;

    const traffic = (tag(item, "ht:approx_traffic") || "").trim() || "—";
    out.push({
      title,
      traffic,
      trafficNum: trafficToNum(traffic),
      geo,
      picture: (tag(item, "ht:picture") || "").trim() || null,
      articles: articles.slice(0, 3),
      matched: Array.from(new Set(matched)),
    });
  }
  return out;
}

// ---------- autocomplete (idea expansion) ----------

async function fetchSuggestions(seed: string, geo = "IN"): Promise<string[]> {
  const url =
    `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=${geo}` +
    `&q=${encodeURIComponent(seed)}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA }, timeoutMs: 8_000 });
  if (!res.ok) return [];
  const data = (await res.json()) as [string, string[]];
  const list = Array.isArray(data?.[1]) ? data[1] : [];
  // Drop the bare seed echoed back; keep genuine expansions.
  return list
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== seed.toLowerCase())
    .slice(0, 8);
}

// ---------- public: combined domain trends (cached) ----------

export type DomainTrends = {
  breakouts: TrendBreakout[];
  ideas: TrendIdeaGroup[];
  geos: string[];
  fetchedAt: string;
};

// In-memory cache — trends move slowly and the endpoints rate-limit, so we
// serve a cached result for 30 min. Keyed by the seed set + geos.
const CACHE = new Map<string, { at: number; value: DomainTrends }>();
const TTL_MS = 30 * 60_000;

export async function getDomainTrends(opts: {
  seeds: string[];
  geos?: string[];
  force?: boolean;
}): Promise<DomainTrends> {
  const geos = opts.geos?.length ? opts.geos : ["IN", "AU", "GB", "AE"];
  const seeds = Array.from(new Set(opts.seeds.map((s) => s.trim()).filter(Boolean))).slice(0, 8);
  const key = JSON.stringify({ seeds, geos });

  const hit = CACHE.get(key);
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  // Breakouts: one RSS pull per geo, in parallel; a geo failing shouldn't sink the rest.
  const breakoutLists = await Promise.all(
    geos.map((g) => fetchDailyTrends(g).catch(() => [] as TrendBreakout[])),
  );
  const breakouts = breakoutLists.flat().sort((a, b) => b.trafficNum - a.trafficNum);

  // Ideas: one autocomplete pull per seed, in parallel.
  const ideaLists = await Promise.all(
    seeds.map(async (seed) => ({ seed, ideas: await fetchSuggestions(seed).catch(() => []) })),
  );
  const ideas = ideaLists.filter((g) => g.ideas.length > 0);

  const value: DomainTrends = {
    breakouts,
    ideas,
    geos,
    fetchedAt: new Date().toISOString(),
  };
  CACHE.set(key, { at: Date.now(), value });
  return value;
}
