import { fetchWithTimeout } from "./fetch-with-timeout";
// Apify FB Ads Library Scraper
// Actor: curious_coder/facebook-ads-library-scraper

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "curious_coder~facebook-ads-library-scraper";

export type CompetitorAd = {
  ad_archive_id: string;
  page_name: string;
  page_id: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  ad_text: string | null;
  cta_text: string | null;
  cta_url: string | null;
  images: string[];
  videos: string[];
  video_posters: string[];
  permalink: string | null;
  publisher_platforms: string[];
};

export function getApifyToken(): string | null {
  return process.env.APIFY_API_TOKEN || null;
}

type ApifyAdRecord = {
  ad_archive_id?: string;
  page_id?: string;
  start_date?: number | string;
  end_date?: number | string;
  is_active?: boolean;
  publisher_platform?: string[];
  url?: string;
  snapshot?: {
    page_name?: string;
    page_profile_uri?: string;
    body?: { text?: string };
    cta_text?: string;
    cta_type?: string;
    link_url?: string;
    title?: string;
    caption?: string;
    display_format?: string;
    images?: { resized_image_url?: string; original_image_url?: string }[];
    videos?: { video_hd_url?: string; video_sd_url?: string; video_preview_image_url?: string }[];
    creation_time?: number;
  };
};

function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v * 1000).toISOString().slice(0, 10);
  if (typeof v === "string") return v.length >= 10 ? v.slice(0, 10) : v;
  return null;
}

function normalize(rec: ApifyAdRecord): CompetitorAd {
  const snap = rec.snapshot || {};
  return {
    ad_archive_id: String(rec.ad_archive_id || ""),
    page_name: snap.page_name || "",
    page_id: rec.page_id ? String(rec.page_id) : null,
    start_date: toDateStr(rec.start_date),
    end_date: toDateStr(rec.end_date),
    is_active: rec.is_active ?? true,
    ad_text: snap.body?.text || snap.title || null,
    cta_text: snap.cta_text || snap.cta_type || null,
    cta_url: snap.link_url || null,
    images: (snap.images || []).map((i) => i.original_image_url || i.resized_image_url || "").filter(Boolean),
    videos: (snap.videos || []).map((v) => v.video_hd_url || v.video_sd_url || "").filter(Boolean),
    video_posters: (snap.videos || []).map((v) => v.video_preview_image_url || "").filter(Boolean),
    permalink: rec.url || (rec.ad_archive_id ? `https://www.facebook.com/ads/library/?id=${rec.ad_archive_id}` : null),
    publisher_platforms: rec.publisher_platform || [],
  };
}

// ----- Past runs sync -----

const ACTOR_ID_DASH = "curious_coder~facebook-ads-library-scraper";

type ApifyRunSummary = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  defaultDatasetId: string;
  defaultKeyValueStoreId: string;
};

type ApifyRunInput = {
  urls?: { url: string }[];
  count?: number;
  scrapeAdDetails?: boolean;
};

export type ParsedRun = {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  query: string;
  country: string;
  activeOnly: boolean;
  fullCreative: boolean;
  datasetId: string;
  itemCount: number;
};

export async function listSuccessfulRuns(token: string, limit = 100): Promise<ApifyRunSummary[]> {
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID_DASH}/runs?token=${encodeURIComponent(token)}&limit=${limit}&desc=true&status=SUCCEEDED`;
  const r = await fetchWithTimeout(url, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(`Apify list runs failed: ${r.status}`);
  return (j.data?.items || []) as ApifyRunSummary[];
}

async function fetchRunInput(token: string, kvStoreId: string): Promise<ApifyRunInput | null> {
  try {
    const r = await fetchWithTimeout(`https://api.apify.com/v2/key-value-stores/${kvStoreId}/records/INPUT?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchDatasetItems(token: string, datasetId: string): Promise<ApifyAdRecord[]> {
  const r = await fetchWithTimeout(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true`, { cache: "no-store" });
  if (!r.ok) return [];
  return (await r.json()) as ApifyAdRecord[];
}

function parseFbLibraryUrl(rawUrl: string): { query: string; country: string; activeOnly: boolean } | null {
  try {
    const u = new URL(rawUrl);
    const q = u.searchParams.get("q") || "";
    const country = (u.searchParams.get("country") || "IN").toUpperCase();
    const activeOnly = u.searchParams.get("active_status") === "active";
    if (!q) return null;
    return { query: q, country, activeOnly };
  } catch {
    return null;
  }
}

export async function parsePastRuns(token: string): Promise<ParsedRun[]> {
  const runs = await listSuccessfulRuns(token);
  const out: ParsedRun[] = [];
  for (const run of runs) {
    const input = await fetchRunInput(token, run.defaultKeyValueStoreId);
    if (!input || !input.urls || input.urls.length === 0) continue;
    const parsed = parseFbLibraryUrl(input.urls[0].url);
    if (!parsed) continue;
    out.push({
      runId: run.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      query: parsed.query,
      country: parsed.country,
      activeOnly: parsed.activeOnly,
      fullCreative: !!input.scrapeAdDetails,
      datasetId: run.defaultDatasetId,
      itemCount: 0, // filled after fetch
    });
  }
  return out;
}

export async function fetchRunAds(token: string, datasetId: string): Promise<CompetitorAd[]> {
  const items = await fetchDatasetItems(token, datasetId);
  return items.map(normalize).filter((a) => a.ad_archive_id); // drop empties
}

export async function searchCompetitorAds(opts: {
  token: string;
  query: string;
  country?: string;
  activeOnly?: boolean;
  limit?: number;
  fullCreative?: boolean;
}): Promise<CompetitorAd[]> {
  const { token, query, country = "IN", activeOnly = true, limit = 30, fullCreative = false } = opts;
  const count = Math.max(10, limit); // actor requires minimum 10

  // Build FB Ad Library search URL — the scraper accepts a startUrl
  const fbUrl = new URL("https://www.facebook.com/ads/library/");
  fbUrl.searchParams.set("active_status", activeOnly ? "active" : "all");
  fbUrl.searchParams.set("ad_type", "all");
  fbUrl.searchParams.set("country", country);
  fbUrl.searchParams.set("q", query);
  fbUrl.searchParams.set("search_type", "keyword_unordered");

  // Run actor synchronously and get dataset items in one call
  const url = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      urls: [{ url: fbUrl.toString() }],
      count,
      scrapeAdDetails: fullCreative,
      period: "",
    }),
    cache: "no-store",
    // Live Ad Library scrapes routinely take 40-90s (actor boot + page render).
    // The 30s default was cutting real searches off mid-run.
    timeoutMs: 120_000,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as ApifyAdRecord[];
  const ads = json.map(normalize);

  // Keyword search returns everything matching any word ("academically" OR
  // "global"), so when the query is a brand/page name its OWN ads get buried
  // among unrelated advertisers. Float ads whose page name matches the query to
  // the top so a brand search actually leads with that brand's ads.
  const q = query.trim().toLowerCase();
  const qWords = q.split(/\s+/).filter(Boolean);
  const score = (name: string) => {
    const n = name.toLowerCase();
    if (n === q) return 2;                                  // exact page-name match
    if (qWords.length > 1 && qWords.every((w) => n.includes(w))) return 1; // all query words in name
    return 0;
  };
  const hasCreative = (a: CompetitorAd) => (a.images.length || a.videos.length || a.video_posters.length ? 1 : 0);
  // Brand-name matches first; within each tier, ads with a visible creative lead
  // so the results open on real image/video ads, not blank text-only ones.
  return ads.sort((a, b) => score(b.page_name) - score(a.page_name) || hasCreative(b) - hasCreative(a));
}
