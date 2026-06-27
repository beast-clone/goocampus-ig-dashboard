// Apify Instagram Hashtag Scraper
// Actor: apify/instagram-hashtag-scraper
// Used to bypass Meta's `instagram_public_content_access` App Review wall
// for niche hashtag content discovery.

const APIFY_BASE = "https://api.apify.com/v2";
const HASHTAG_ACTOR = "apify~instagram-hashtag-scraper";

export type ApifyIGPost = {
  id: string;
  shortCode?: string;
  type: "Image" | "Video" | "Sidecar";
  url: string;
  displayUrl: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  likesCount: number;
  commentsCount: number;
  videoViewCount?: number;
  timestamp: string;
  ownerUsername?: string;
  ownerFullName?: string;
  hashtags?: string[];
};

type RawApifyPost = {
  id: string;
  shortCode?: string;
  type?: string;
  url?: string;
  displayUrl?: string;
  videoUrl?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  hashtags?: string[];
};

function normalizePost(r: RawApifyPost): ApifyIGPost {
  return {
    id: String(r.id ?? r.shortCode ?? ""),
    shortCode: r.shortCode,
    type: (r.type as ApifyIGPost["type"]) ?? "Image",
    url: r.url ?? (r.shortCode ? `https://www.instagram.com/p/${r.shortCode}/` : ""),
    displayUrl: r.displayUrl ?? "",
    videoUrl: r.videoUrl,
    thumbnailUrl: r.displayUrl,
    caption: r.caption ?? "",
    likesCount: r.likesCount ?? 0,
    commentsCount: r.commentsCount ?? 0,
    videoViewCount: r.videoViewCount,
    timestamp: r.timestamp ?? new Date().toISOString(),
    ownerUsername: r.ownerUsername,
    ownerFullName: r.ownerFullName,
    hashtags: r.hashtags ?? [],
  };
}

export async function scrapeHashtagPosts(opts: {
  token: string;
  hashtag: string;
  resultsLimit?: number;
}): Promise<ApifyIGPost[]> {
  const { token, hashtag, resultsLimit = 12 } = opts;
  const clean = hashtag.replace(/^#/, "").trim().toLowerCase();

  const url = `${APIFY_BASE}/acts/${HASHTAG_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hashtags: [clean],
      resultsLimit,
      resultsType: "posts",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify hashtag scraper error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as RawApifyPost[];
  return (Array.isArray(json) ? json : []).map(normalizePost);
}
