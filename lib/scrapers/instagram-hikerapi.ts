// HikerAPI Instagram Hashtag fallback
// Pricing: $0.0006 per request, 100 free after Telegram activation
// Docs: hikerapi.com — uses x-access-key header
// Endpoint: /v1/hashtag/medias/top → returns top posts for a hashtag as a flat array

import { ScraperError, type ScrapeResult, type ScrapedPost } from "./types";

const HIKER_BASE = "https://api.hikerapi.com";
const COST_PER_REQUEST_USD = 0.0006;

type HikerMedia = {
  id?: string;
  pk?: string | number;
  code?: string;
  media_type?: number;          // 1 = image, 2 = video, 8 = carousel
  product_type?: string;        // "clips" = reel
  caption_text?: string;
  caption?: { text?: string };
  thumbnail_url?: string;
  video_url?: string;
  image_versions2?: { candidates?: { url: string }[] };
  like_count?: number;
  comment_count?: number;
  taken_at?: number;
  taken_at_ts?: number;         // v1 alt name
  user?: { username?: string };
};

function pickType(m: HikerMedia): ScrapedPost["media_type"] {
  if (m.media_type === 2 || m.product_type === "clips") return "VIDEO";
  if (m.media_type === 8) return "CAROUSEL_ALBUM";
  return "IMAGE";
}

function pickImage(m: HikerMedia): string {
  if (m.thumbnail_url) return m.thumbnail_url;
  return m.image_versions2?.candidates?.[0]?.url || "";
}

function normalize(m: HikerMedia): ScrapedPost {
  const img = pickImage(m);
  const epoch = m.taken_at_ts ?? m.taken_at;
  const ts = epoch ? new Date(epoch * 1000).toISOString() : new Date().toISOString();
  return {
    id: String(m.id ?? m.pk ?? m.code ?? ""),
    caption: m.caption_text ?? m.caption?.text ?? "",
    media_type: pickType(m),
    media_url: m.video_url ?? img,
    thumbnail_url: img,
    permalink: m.code ? `https://www.instagram.com/p/${m.code}/` : "",
    timestamp: ts,
    like_count: m.like_count ?? 0,
    comments_count: m.comment_count ?? 0,
    username: m.user?.username,
  };
}

export async function scrapeHashtagViaHikerAPI(opts: {
  key: string;
  hashtag: string;
  resultsLimit?: number;
}): Promise<ScrapeResult> {
  const { key, hashtag, resultsLimit = 9 } = opts;
  const clean = hashtag.replace(/^#/, "").trim().toLowerCase();
  const url = `${HIKER_BASE}/v1/hashtag/medias/top?name=${encodeURIComponent(clean)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-access-key": key, accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw new ScraperError("hikerapi", "server", (err as Error).message);
  }

  if (res.status === 402) throw new ScraperError("hikerapi", "credit_exhausted", "HikerAPI credit exhausted", 402);
  if (res.status === 429) throw new ScraperError("hikerapi", "rate_limit", "HikerAPI rate-limited", 429);
  if (res.status === 401 || res.status === 403) {
    throw new ScraperError("hikerapi", "auth", `HikerAPI auth error ${res.status}`, res.status);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new ScraperError("hikerapi", "server", `HikerAPI ${res.status}: ${body.slice(0, 160)}`, res.status);
  }

  const body = await res.json();
  // v1 endpoint returns a flat array; older payloads can return {state:false,error:...}
  if (body && typeof body === "object" && "state" in body && (body as { state: boolean }).state === false) {
    const err = (body as { error?: string }).error || "HikerAPI returned state:false";
    if (/fund/i.test(err)) throw new ScraperError("hikerapi", "credit_exhausted", err);
    throw new ScraperError("hikerapi", "server", err);
  }
  const arr = Array.isArray(body) ? (body as HikerMedia[]) : [];
  const medias = arr.slice(0, resultsLimit);
  if (medias.length === 0) {
    throw new ScraperError("hikerapi", "empty", "HikerAPI returned empty result set");
  }
  const posts = medias.map(normalize).filter((p) => p.id);
  return {
    posts,
    provider: "hikerapi",
    costEstimateUsd: COST_PER_REQUEST_USD,
    fetchedAt: new Date().toISOString(),
  };
}
