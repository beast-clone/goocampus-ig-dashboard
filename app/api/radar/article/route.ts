import { NextResponse } from "next/server";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { safeError } from "@/lib/errors";

// In-dashboard reader. Fetches the article HTML directly, runs Mozilla
// Readability (the same engine Firefox Reader View uses) to strip nav / ads /
// footer, and returns cleaned HTML for inline rendering.
//
// Self-hosted so we don't depend on external reader APIs with trial limits.

const MAX_URL_LEN = 2000;
const MAX_HTML_LEN = 2_000_000; // 2MB HTML cap before Readability
const MAX_CONTENT_LEN = 200_000; // trim response body

function looksLikeUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch { return false; }
}

async function resolveRedirect(url: string): Promise<string> {
  try {
    const r = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow",
      timeoutMs: 8_000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GooCampusRadar/1.0)" },
    });
    return r.url || url;
  } catch { return url; }
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const target = u.searchParams.get("url") || "";
  if (!target || target.length > MAX_URL_LEN || !looksLikeUrl(target)) {
    return NextResponse.json({ error: "url query param must be a valid http(s) URL" }, { status: 400 });
  }

  try {
    const resolved = await resolveRedirect(target);

    // Fetch the article HTML with a browser-like UA so publishers don't hand
    // back a mobile stub or a bot-detection page.
    const r = await fetchWithTimeout(resolved, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      timeoutMs: 20_000,
      redirect: "follow",
    });
    if (!r.ok) throw new Error(`Fetch ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const html = await r.text();
    if (html.length > MAX_HTML_LEN) {
      throw new Error("Article HTML too large");
    }

    // Run Readability against a JSDOM window built from the fetched HTML.
    const dom = new JSDOM(html, { url: resolved });
    const doc = dom.window.document;

    // Meta fallbacks — every publisher sets these even on JS-heavy pages.
    const metaTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content")
      || doc.querySelector("title")?.textContent
      || null;
    const metaDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute("content")
      || doc.querySelector('meta[name="description"]')?.getAttribute("content")
      || null;
    const metaImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
    const metaSite = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || null;

    // Readability. Lower the charThreshold so shorter articles (news briefs)
    // don't get rejected.
    const article = new Readability(doc, { charThreshold: 200 }).parse();

    if (article && article.content && (article.textContent?.length ?? 0) > 200) {
      const content = article.content.length > MAX_CONTENT_LEN
        ? article.content.slice(0, MAX_CONTENT_LEN) + "<p><em>…(truncated)</em></p>"
        : article.content;
      return NextResponse.json({
        title: article.title || metaTitle,
        byline: article.byline || null,
        excerpt: article.excerpt || metaDescription || null,
        siteName: article.siteName || metaSite,
        finalUrl: r.url || resolved,
        html: content,
        textLen: article.textContent?.length ?? 0,
      });
    }

    // Fallback: use the OG description as a mini-article. Better than nothing —
    // most publishers pack their lede paragraph into og:description.
    if (metaDescription) {
      const fallbackHtml = `${metaImage ? `<img src="${metaImage}" alt="" />` : ""}<p>${metaDescription}</p><p><em>This publisher renders the full article via JavaScript, so only the summary is available inline. Use "Open on the site" below for the full text.</em></p>`;
      return NextResponse.json({
        title: metaTitle,
        byline: null,
        excerpt: metaDescription,
        siteName: metaSite,
        finalUrl: r.url || resolved,
        html: fallbackHtml,
        textLen: metaDescription.length,
        fallback: true,
      });
    }

    return NextResponse.json({
      title: metaTitle,
      finalUrl: r.url || resolved,
      html: "",
      error: "This site renders its article via JavaScript so extraction returned nothing. Open the original link to read it.",
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Article fetch failed"), { status: 502 });
  }
}
