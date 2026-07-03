// Topic-search fetcher — replaces the Google Alerts round-trip.
//
// Uses Bing News RSS (bing.com/news/search?format=rss) — free, no key, no auth,
// AND returns direct publisher URLs (unlike Google News which wraps everything
// through news.google.com and requires JS to decode).
//
// Query URL example:
//   https://www.bing.com/news/search?q=AMC+exam+2026&format=rss

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { RssItem } from "@/lib/google-alerts-rss";

const BING_NEWS_RSS = "https://www.bing.com/news/search";

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractSource(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch { return null; }
}

// Bing News sometimes routes links through its click-tracker
// (bing.com/news/apiclick.aspx?url=REAL) — unwrap that so the reader lands on
// the publisher, not a redirect page, and so hostname-based dedup works.
function extractRealLink(rawLink: string): string {
  const clean = rawLink.replace(/&amp;/g, "&");
  try {
    if (!clean.includes("bing.com")) return clean;
    const u = new URL(clean);
    const real = u.searchParams.get("url") || u.searchParams.get("mediaurl") || u.searchParams.get("q");
    if (real && /^https?:\/\//.test(real)) return real;
    return clean;
  } catch {
    return clean;
  }
}

function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  // Handle CDATA wrapping
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : inner;
}

// Parse RSS 2.0 (channel/item) — Bing News format.
export function parseNewsRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[0];
    const rawTitle = tag(block, "title");
    const rawLink = tag(block, "link");
    const rawPubDate = tag(block, "pubDate");
    const rawDesc = tag(block, "description") || "";
    // Bing puts the publisher name in a plain <source> element.
    const rawSource = tag(block, "source");
    if (!rawTitle || !rawLink) continue;
    const link = extractRealLink(rawLink);
    const title = stripTags(rawTitle);
    const snippet = stripTags(rawDesc).slice(0, 600);
    const publishedAt = rawPubDate ? new Date(rawPubDate).toISOString() : new Date().toISOString();
    items.push({
      title: title.slice(0, 400),
      link,
      publishedAt,
      snippet,
      source: (rawSource && stripTags(rawSource)) || extractSource(link),
    });
  }
  return items;
}

export async function fetchJinaSearch(query: string, limit = 20): Promise<RssItem[]> {
  const q = query.trim();
  if (q.length === 0) throw new Error("Empty search query");
  if (q.length > 300) throw new Error("Search query too long");

  const params = new URLSearchParams({
    q,
    format: "rss",
    cc: "IN",       // country code — India
    setLang: "en",  // interface language
  });
  const url = `${BING_NEWS_RSS}?${params.toString()}`;
  const r = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml",
    },
    timeoutMs: 15_000,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Bing News ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const xml = await r.text();
  const items = parseNewsRss(xml);
  return items.slice(0, limit);
}
