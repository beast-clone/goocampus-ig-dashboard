// Compact Atom-XML parser scoped to what Google Alerts publishes.
//
// A Google Alerts feed URL looks like:
//   https://www.google.com/alerts/feeds/<userId>/<feedId>
// The response is an Atom 1.0 XML document. Each <entry> contains:
//   <title type="html">…</title>
//   <link href="…" />
//   <published>2026-07-03T…Z</published>
//   <content type="html">… HTML snippet with the article summary …</content>
// The `<link href>` points to a Google redirect URL (google.com/url?...&url=<real>)
// — we unwrap that to the real destination.

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type RssItem = {
  title: string;
  link: string;
  publishedAt: string;   // ISO
  snippet: string;
  source: string | null;
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function unwrapGoogleRedirect(link: string): string {
  try {
    if (!link.includes("google.com/url")) return link;
    const u = new URL(link);
    const real = u.searchParams.get("url") || u.searchParams.get("q");
    return real || link;
  } catch {
    return link;
  }
}

function extractSource(link: string): string | null {
  try {
    const u = new URL(link);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Extract the innerHTML/text of a named tag from an entry block.
function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

// Extract an attribute from a self-closing tag like <link href="…" />.
function attr(block: string, tagName: string, attrName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*\\b${attrName}="([^"]+)"`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

export function parseGoogleAlertsRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const entryRe = /<entry\b[\s\S]*?<\/entry>/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(xml)) !== null) {
    const block = match[0];
    const rawTitle = tag(block, "title");
    const rawContent = tag(block, "content");
    const rawLink = attr(block, "link", "href");
    const rawPublished = tag(block, "published") || tag(block, "updated");
    if (!rawTitle || !rawLink || !rawPublished) continue;
    const link = unwrapGoogleRedirect(rawLink);
    items.push({
      title: stripTags(rawTitle).slice(0, 400),
      link,
      publishedAt: new Date(rawPublished).toISOString(),
      snippet: rawContent ? stripTags(rawContent).slice(0, 600) : "",
      source: extractSource(link),
    });
  }
  return items;
}

// Fetch + parse a Google Alerts RSS feed. Returns items or throws on network / non-2xx.
export async function fetchAlertsFeed(feedUrl: string): Promise<RssItem[]> {
  if (!/^https:\/\/(www\.)?google\.com\/alerts\/feeds\//.test(feedUrl)) {
    throw new Error("URL must be a Google Alerts RSS feed (https://www.google.com/alerts/feeds/…/…)");
  }
  const r = await fetchWithTimeout(feedUrl, {
    headers: { "User-Agent": "Mozilla/5.0 GooCampusRadar/1.0" },
    timeoutMs: 15_000,
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`Feed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const xml = await r.text();
  return parseGoogleAlertsRss(xml);
}
