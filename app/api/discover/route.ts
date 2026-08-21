import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import fs from "fs";
import path from "path";
import {
  getAccount, getConfiguredAccounts,
  fetchMentionedMedia, fetchTaggedMedia,
  type DiscoverMedia, type IGAccountConfig,
} from "@/lib/instagram";
import { scrapeHashtagWithFallback, getProviderHealth } from "@/lib/scrapers/router";
import type { ScrapedPost, ScraperProvider } from "@/lib/scrapers/types";
import { getSupabase } from "@/lib/supabase";

type NicheBucket = { label: string; tags: string[] };
type NicheConfig = { brand: string; audience: string; hashtagBuckets: NicheBucket[] };

const MENTIONS_TTL_MS = 30 * 60 * 1000;        // 30 min
const TAGGED_TTL_MS  = 30 * 60 * 1000;
const NICHE_TTL_MS   = 30 * 24 * 60 * 60 * 1000; // 30 days — during App Review testing month, fetch once then serve free from cache
const NICHE_RESULTS_PER_TAG = 9;

function loadNiche(): NicheConfig | null {
  try {
    const file = path.join(process.cwd(), "niche.json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as NicheConfig;
  } catch { return null; }
}

async function cacheGet(key: string): Promise<{ payload: unknown; ageMs: number } | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("discover_cache")
    .select("last_fetched, payload")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  return {
    payload: data.payload,
    ageMs: Date.now() - new Date(data.last_fetched as string).getTime(),
  };
}

async function cacheSet(key: string, source: string, payload: unknown): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("discover_cache").upsert(
    { cache_key: key, source, last_fetched: new Date().toISOString(), payload },
    { onConflict: "cache_key" },
  );
}

function scrapedToDiscoverMedia(p: ScrapedPost): DiscoverMedia {
  return {
    id: p.id,
    caption: p.caption,
    media_type: p.media_type,
    media_url: p.media_url,
    thumbnail_url: p.thumbnail_url,
    permalink: p.permalink,
    timestamp: p.timestamp,
    like_count: p.like_count,
    comments_count: p.comments_count,
    username: p.username,
  };
}

async function loadMentions(force: boolean) {
  const accounts = getConfiguredAccounts();
  // All accounts fetched in parallel (same number of calls as before — just not waiting in a line)
  return Promise.all(accounts.map(async (acc) => {
    const key = `mentions:${acc.id}`;
    if (!force) {
      const cached = await cacheGet(key);
      if (cached && cached.ageMs < MENTIONS_TTL_MS) {
        return { account: acc.id, handle: acc.handle, items: cached.payload as DiscoverMedia[] };
      }
    }
    const items = await fetchMentionedMedia(acc, 25);
    await cacheSet(key, "mentions", items);
    return { account: acc.id, handle: acc.handle, items };
  }));
}

async function loadTagged(force: boolean) {
  const accounts = getConfiguredAccounts();
  // All accounts fetched in parallel (same number of calls as before — just not waiting in a line)
  return Promise.all(accounts.map(async (acc) => {
    const key = `tagged:${acc.id}`;
    if (!force) {
      const cached = await cacheGet(key);
      if (cached && cached.ageMs < TAGGED_TTL_MS) {
        return { account: acc.id, handle: acc.handle, items: cached.payload as DiscoverMedia[] };
      }
    }
    const items = await fetchTaggedMedia(acc, 25);
    await cacheSet(key, "tagged", items);
    return { account: acc.id, handle: acc.handle, items };
  }));
}

async function loadNicheFeed(_acc: IGAccountConfig, force: boolean) {
  const niche = loadNiche();
  if (!niche) return { audience: "", buckets: [], health: null };

  type Bucket = {
    label: string; tag: string; items: DiscoverMedia[];
    cached: boolean; ageMs: number | null;
    provider?: ScraperProvider; error?: string;
  };
  // Flatten every (bucket, hashtag) pair, then fetch them ALL at once instead of
  // one-at-a-time. Same number of API calls (same cost) — just no waiting in a line.
  const pairs = niche.hashtagBuckets.flatMap((b) => b.tags.map((t) => ({ label: b.label, t })));

  const buckets: Bucket[] = await Promise.all(pairs.map(async ({ label, t }) => {
    const clean = t.replace(/^#/, "").toLowerCase();
    const key = `niche_top:${clean}`;
    let payload: DiscoverMedia[] | null = null;
    let cached = false;
    let ageMs: number | null = null;
    let provider: ScraperProvider | undefined;
    let err: string | undefined;

    if (!force) {
      const c = await cacheGet(key);
      if (c && c.ageMs < NICHE_TTL_MS) {
        const wrapped = c.payload as { posts?: DiscoverMedia[]; provider?: ScraperProvider } | DiscoverMedia[];
        if (Array.isArray(wrapped)) {
          payload = wrapped;
        } else {
          payload = wrapped.posts ?? [];
          provider = wrapped.provider;
        }
        cached = true;
        ageMs = c.ageMs;
      }
    }
    if (!payload) {
      try {
        const result = await scrapeHashtagWithFallback({ hashtag: clean, resultsLimit: NICHE_RESULTS_PER_TAG });
        payload = result.posts.map(scrapedToDiscoverMedia);
        provider = result.provider;
        await cacheSet(key, "niche_top", { posts: payload, provider });
        ageMs = 0;
      } catch (e) {
        err = (e as Error).message;
        payload = [];
      }
    }
    return { label, tag: `#${clean}`, items: payload, cached, ageMs, provider, error: err };
  }));
  const health = await getProviderHealth();
  return { audience: niche.audience, buckets, health };
}

async function searchHashtag(clean: string, force: boolean) {
  const key = `niche_top:${clean}`;
  let payload: DiscoverMedia[] | null = null;
  let cached = false;
  let ageMs: number | null = null;
  let provider: ScraperProvider | undefined;
  let err: string | undefined;

  if (!force) {
    const c = await cacheGet(key);
    if (c && c.ageMs < NICHE_TTL_MS) {
      const wrapped = c.payload as { posts?: DiscoverMedia[]; provider?: ScraperProvider } | DiscoverMedia[];
      if (Array.isArray(wrapped)) {
        payload = wrapped;
      } else {
        payload = wrapped.posts ?? [];
        provider = wrapped.provider;
      }
      cached = true;
      ageMs = c.ageMs;
    }
  }
  if (!payload) {
    try {
      const result = await scrapeHashtagWithFallback({ hashtag: clean, resultsLimit: NICHE_RESULTS_PER_TAG });
      payload = result.posts.map(scrapedToDiscoverMedia);
      provider = result.provider;
      await cacheSet(key, "niche_top", { posts: payload, provider });
      ageMs = 0;
    } catch (e) {
      err = (e as Error).message;
      payload = [];
    }
  }
  return { tag: `#${clean}`, items: payload, cached, ageMs, provider, error: err };
}

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const type = url.searchParams.get("type") || "all"; // mentions | tagged | niche | all
  const force = url.searchParams.get("force") === "1";
  const search = (url.searchParams.get("search") || "").replace(/^#/, "").trim().toLowerCase();

  const account = getAccount(accountId);
  if (!account) return NextResponse.json({ error: `Unknown account: ${accountId}` }, { status: 404 });

  const t0 = Date.now();
  try {
    const out: Record<string, unknown> = { latencyMs: 0, type };
    if (search) {
      out.search = await searchHashtag(search, force);
    } else {
      // Run the three sections together rather than one after another.
      const [mentions, tagged, niche] = await Promise.all([
        (type === "mentions" || type === "all") ? loadMentions(force) : Promise.resolve(undefined),
        (type === "tagged"   || type === "all") ? loadTagged(force)   : Promise.resolve(undefined),
        (type === "niche"    || type === "all") ? loadNicheFeed(account, force) : Promise.resolve(undefined),
      ]);
      if (mentions !== undefined) out.mentions = mentions;
      if (tagged   !== undefined) out.tagged   = tagged;
      if (niche    !== undefined) out.niche    = niche;
    }
    out.latencyMs = Date.now() - t0;
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
