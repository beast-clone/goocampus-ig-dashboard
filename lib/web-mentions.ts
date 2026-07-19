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

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type Sentiment = "positive" | "negative" | "neutral";

export type WebMention = {
  platform: "news";
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

  let mentions: WebMention[] = [];
  try {
    mentions = await fetchGoogleNews(q);
  } catch {
    mentions = [];
  }
  // Newest first, deduped by URL, capped.
  const seen = new Set<string>();
  mentions = mentions
    .filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)))
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
    .slice(0, limit);

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
      { platform: "Reddit", icon: "👽", status: "needs-setup", note: "Candid student threads (r/IMG, r/MBBS). Needs a free Reddit OAuth app (client id + secret)." },
      { platform: "Quora", icon: "❓", status: "needs-setup", note: "'Is GooCampus genuine?' style Q&A — big for consultancy reputation. No official API; scrape-based (planned)." },
      { platform: "Google Reviews", icon: "⭐", status: "needs-setup", note: "Star ratings + complaints on your Google listing. Needs a free Google Places API key." },
      { platform: "YouTube", icon: "▶️", status: "needs-setup", note: "Videos + comments mentioning the brand. Needs a free YouTube Data API key." },
    ],
    fetchedAt: new Date().toISOString(),
  };
}
