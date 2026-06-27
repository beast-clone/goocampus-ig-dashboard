// Normalized post shape every scraper must return.
// Matches DiscoverMedia in lib/instagram.ts so the UI consumes a single type.

export type ScrapedPost = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  username?: string;
};

export type ScraperProvider = "apify" | "hikerapi";

export type ScrapeResult = {
  posts: ScrapedPost[];
  provider: ScraperProvider;
  costEstimateUsd: number;
  fetchedAt: string;
};

export class ScraperError extends Error {
  readonly provider: ScraperProvider;
  readonly status?: number;
  readonly code: "rate_limit" | "credit_exhausted" | "auth" | "server" | "empty" | "unknown";
  constructor(provider: ScraperProvider, code: ScraperError["code"], message: string, status?: number) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}
