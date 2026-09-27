// Free, key-less "where is this mentioned on the web" engine — powers both the
// Content Radar search bar and the Brand-mentions lane.
//
// Working zero-setup source: Google News RSS (verified ~58 results/query from the
// server). Richer mention sources — Reddit, YouTube comments, Google reviews — are
// each gated behind a one-time FREE credential (Reddit OAuth app / YouTube+Places
// API key), so they're modelled here as optional connectors, not hard deps.
//
// Sentiment is a fast lexicon heuristic (free, instant). It's deliberately rough —
// good enough to split praise from complaints at a glance; upgrade to an LLM pass
// later if we want nuance. We never present it as certain.

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { searchSites } from "@/lib/site-search";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type Sentiment = "positive" | "negative" | "neutral";

export type WebMention = {
  platform: string;   // "news" | watched site domain, e.g. "reddit.com" | "quora.com"
  title: string;
  url: string;
  source: string | null;   // publisher / outlet
  publishedAt: string;      // ISO
  snippet: string;
  sentiment: Sentiment;
};

export type MentionResult = {
  query: string;
  mentions: WebMention[];
  counts: { positive: number; negative: number; neutral: number; total: number };
  connectors: { platform: string; icon: string; status: "live" | "needs-setup"; note: string }[];
  fetchedAt: string;
};

// ---------- shared XML helpers (same style as google-alerts-rss.ts) ----------

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}
function stripTags(html: string): string {
  return decodeEntities(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function tagAll(block: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  const out: string[] = []; let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}
function hostOf(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

// ---------- lexicon sentiment (edu / reputation tuned) ----------

const NEG = ["scam", "fraud", "fake", "cheat", "cheated", "worst", "waste", "avoid",
  "disappointed", "disappointing", "refund", "misleading", "false promise", "not worth",
  "poor", "terrible", "horrible", "rude", "complaint", "warning", "beware", "regret",
  "unprofessional", "delay", "no response", "money back", "duped", "trap"];
const POS = ["genuine", "helpful", "best", "great", "excellent", "recommend", "recommended",
  "thank", "thanks", "grateful", "supportive", "amazing", "wonderful", "trusted", "reliable",
  "smooth", "professional", "guidance", "cleared", "success", "achieved", "happy", "satisfied",
  "worth it", "top", "brilliant"];

function scoreSentiment(text: string): Sentiment {
  const low = ` ${text.toLowerCase()} `;
  let s = 0;
  for (const w of POS) if (low.includes(w)) s += 1;
  for (const w of NEG) if (low.includes(w)) s -= 1;
  if (s > 0) return "positive";
  if (s < 0) return "negative";
  return "neutral";
}

// ---------- Google News RSS (the live free source) ----------

async function fetchGoogleNews(query: string, geo = "IN"): Promise<WebMention[]> {
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=en-${geo}&gl=${geo}&ceid=${geo}:en`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml,text/xml,*/*" },
    timeoutMs: 12_000,
  });
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  const xml = await res.text();

  const out: WebMention[] = [];
  for (const item of tagAll(xml, "item")) {
    const rawTitle = decodeEntities(tag(item, "title") || "").trim();
    const link = decodeEntities(tag(item, "link") || "").trim();
    if (!rawTitle || !link) continue;
    // Google News titles read "Headline - Publisher"; the <source> tag carries the
    // clean publisher, so prefer it and strip the suffix from the headline.
    const src = (tag(item, "source") ? stripTags(tag(item, "source")!) : null) || hostOf(link);
    const title = src && rawTitle.endsWith(` - ${src}`) ? rawTitle.slice(0, -(src.length + 3)) : rawTitle;
    const snippet = stripTags(tag(item, "description") || "").slice(0, 220);
    const pub = tag(item, "pubDate");
    const publishedAt = pub ? new Date(pub).toISOString() : new Date().toISOString();
    out.push({
      platform: "news",
      title, url: link, source: src, publishedAt, snippet,
      sentiment: scoreSentiment(`${title} ${snippet}`),
    });
  }
  return out;
}

// ---------- public: search / brand mentions ----------

export async function searchWebMentions(query: string, opts: { limit?: number } = {}): Promise<MentionResult> {
  const q = query.trim();
  const limit = opts.limit ?? 30;

  // Google News (dated) + the four site: lanes (Reddit/Quora/MouthShut/ValueMD)
  // in parallel. Each is best-effort — one dead source never kills the rest.
  const [news, sites] = await Promise.all([
    fetchGoogleNews(q).catch(() => [] as WebMention[]),
    searchSites(q, { limit: 12 }).catch(() => []),
  ]);
  const siteMentions: WebMention[] = sites.map((s) => ({
    platform: s.source,          // e.g. "reddit.com" — UI shows this as the source
    title: s.title,
    url: s.url,
    source: s.source,
    publishedAt: s.publishedAt,  // "" when the engine gives no date
    snippet: s.snippet,
    sentiment: scoreSentiment(`${s.title} ${s.snippet}`),
  }));

  // Dedup by URL, then give each lane its own share of the room.
  //
  // This used to be one sort by date across both lanes, then a slice. Forum hits carry
  // no date (the search engine gives none), so they scored 0, sorted to the bottom and
  // were cut off entirely whenever news filled the limit. Searching the brand hid it —
  // "GooCampus" has almost no news, so Reddit always fitted. Searching a TOPIC exposed
  // it: "NEET PG" returned 30 news articles and not one of the Reddit or Quora threads,
  // even though the engine had returned them.
  //
  // Forum threads are the scarce, hard-to-find half of this feature — a news article is
  // findable anywhere, a student asking "is this course worth it" is not — so they get a
  // guaranteed share rather than competing on a date they do not have. Whatever one lane
  // does not use, the other takes.
  const seen = new Set<string>();
  const dedup = (arr: WebMention[]) => arr.filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)));
  const newsSorted = dedup([...news].sort((a, b) => (+new Date(b.publishedAt) || 0) - (+new Date(a.publishedAt) || 0)));
  const siteSorted = dedup(siteMentions);

  const siteShare = Math.max(1, Math.ceil(limit / 3));
  const siteTake = siteSorted.slice(0, siteShare);
  const newsTake = newsSorted.slice(0, limit - siteTake.length);
  const mentions = [
    ...siteTake,
    ...newsTake,
    // Backfill from whichever lane still has more, so a quiet lane never wastes room.
    ...siteSorted.slice(siteTake.length),
    ...newsSorted.slice(newsTake.length),
  ].slice(0, limit);

  const counts = {
    positive: mentions.filter((m) => m.sentiment === "positive").length,
    negative: mentions.filter((m) => m.sentiment === "negative").length,
    neutral: mentions.filter((m) => m.sentiment === "neutral").length,
    total: mentions.length,
  };

  return {
    query: q,
    mentions,
    counts,
    // Honest source map — what's live free vs what needs a one-time free connect.
    // Ordered by how much each adds to *brand* monitoring (candid praise/complaints).
    connectors: [
      { platform: "Google News", icon: "📰", status: "live", note: "Web + press mentions. Live and free — no setup." },
      { platform: "Reddit", icon: "👽", status: "live", note: "Candid student threads (r/IMG, r/MBBS) via web search. Add a free Serper.dev key for reliable results." },
      { platform: "Quora", icon: "❓", status: "live", note: "'Is GooCampus genuine?' Q&A via web search — key for consultancy reputation. Free Serper key = reliable." },
      { platform: "MouthShut", icon: "💬", status: "live", note: "India consumer reviews / complaints on consultancies via web search." },
      { platform: "ValueMD", icon: "🩺", status: "live", note: "IMG / med-student forum threads via web search." },
      { platform: "Google Reviews", icon: "⭐", status: "needs-setup", note: "Star ratings + complaints on your Google listing. Needs a free Google Places API key." },
    ],
    fetchedAt: new Date().toISOString(),
  };
}
