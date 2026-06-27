// Apify Instagram Hashtag Scraper — official Apify actor.
// Pricing: $2.60 per 1,000 results on free plan.
// Apidojo's cheaper $0.50/1K actor was tested and returns {demo:true} placeholders
// without a separate paid rental — so this is the cheapest *actually working* option.

import { ScraperError, type ScrapeResult, type ScrapedPost } from "./types";

const APIFY_BASE = "https://api.apify.com/v2";
const HASHTAG_ACTOR = "apify~instagram-hashtag-scraper";
const COST_PER_RESULT_USD = 0.0026;

type RawPost = {
  id?: string;
  pk?: string;
  shortCode?: string;
  shortcode?: string;
  type?: string;
  url?: string;
  permalink?: string;
  displayUrl?: string;
  display_url?: string;
  videoUrl?: string;
  video_url?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  caption?: string;
  text?: string;
  likesCount?: number;
  likeCount?: number;
  like_count?: number;
  commentsCount?: number;
  commentCount?: number;
  comments_count?: number;
  videoViewCount?: number;
  view_count?: number;
  timestamp?: string;
  takenAtTimestamp?: number;
  taken_at?: number;
  ownerUsername?: string;
  username?: string;
  owner?: { username?: string };
};

function pickType(t?: string): ScrapedPost["media_type"] {
  if (!t) return "IMAGE";
  const u = t.toUpperCase();
  if (u.includes("VIDEO") || u === "REEL" || u === "REELS") return "VIDEO";
  if (u.includes("SIDECAR") || u.includes("CAROUSEL")) return "CAROUSEL_ALBUM";
  return "IMAGE";
}

function pickTimestamp(r: RawPost): string {
  if (r.timestamp) return r.timestamp;
  const epoch = r.takenAtTimestamp ?? r.taken_at;
  if (epoch) return new Date(epoch * 1000).toISOString();
  return new Date().toISOString();
}

function pickPermalink(r: RawPost): string {
  if (r.url) return r.url;
  if (r.permalink) return r.permalink;
  const code = r.shortCode || r.shortcode;
  return code ? `https://www.instagram.com/p/${code}/` : "";
}

function normalize(r: RawPost): ScrapedPost {
  const img = r.displayUrl || r.display_url || r.thumbnailUrl || r.thumbnail_url || "";
  return {
    id: String(r.id ?? r.pk ?? r.shortCode ?? r.shortcode ?? ""),
    caption: r.caption ?? r.text ?? "",
    media_type: pickType(r.type),
    media_url: r.videoUrl ?? r.video_url ?? img,
    thumbnail_url: img,
    permalink: pickPermalink(r),
    timestamp: pickTimestamp(r),
    like_count: r.likesCount ?? r.likeCount ?? r.like_count ?? 0,
    comments_count: r.commentsCount ?? r.commentCount ?? r.comments_count ?? 0,
    username: r.ownerUsername ?? r.username ?? r.owner?.username,
  };
}

export async function scrapeHashtagViaApify(opts: {
  token: string;
  hashtag: string;
  resultsLimit?: number;
}): Promise<ScrapeResult> {
  const { token, hashtag, resultsLimit = 9 } = opts;
  const clean = hashtag.replace(/^#/, "").trim().toLowerCase();
  const url = `${APIFY_BASE}/acts/${HASHTAG_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hashtags: [clean],
        resultsLimit,
        resultsType: "posts",
      }),
      cache: "no-store",
    });
  } catch (err) {
    throw new ScraperError("apify", "server", (err as Error).message);
  }

  if (res.status === 402) throw new ScraperError("apify", "credit_exhausted", "Apify free credit exhausted", 402);
  if (res.status === 429) throw new ScraperError("apify", "rate_limit", "Apify rate-limited", 429);
  if (res.status === 401 || res.status === 403) {
    throw new ScraperError("apify", "auth", `Apify auth error ${res.status}`, res.status);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new ScraperError("apify", "server", `Apify ${res.status}: ${body.slice(0, 160)}`, res.status);
  }

  const json = (await res.json()) as RawPost[];
  if (!Array.isArray(json) || json.length === 0) {
    throw new ScraperError("apify", "empty", "Apify returned empty result set");
  }

  const posts = json.map(normalize).filter((p) => p.id);
  return {
    posts,
    provider: "apify",
    costEstimateUsd: posts.length * COST_PER_RESULT_USD,
    fetchedAt: new Date().toISOString(),
  };
}
