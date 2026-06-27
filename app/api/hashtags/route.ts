import { NextResponse } from "next/server";
import { getAccount, fetchMediaInsights, type IGMedia } from "@/lib/instagram";
import { getSupabase } from "@/lib/supabase";

const GRAPH = "https://graph.facebook.com/v25.0";
const HASHTAGS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — your own post stats barely move within a day

async function cacheGet(key: string): Promise<{ payload: unknown; ageMs: number } | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("discover_cache")
    .select("last_fetched, payload")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  return { payload: data.payload, ageMs: Date.now() - new Date(data.last_fetched as string).getTime() };
}

async function cacheSet(key: string, payload: unknown): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("discover_cache").upsert(
    { cache_key: key, source: "hashtags", last_fetched: new Date().toISOString(), payload },
    { onConflict: "cache_key" },
  );
}

async function fetchMediaInDateRange(igUserId: string, token: string, fromIso?: string, toIso?: string, hardCap = 500) {
  const fields = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url";
  let url = `${GRAPH}/${igUserId}/media?fields=${fields}&limit=100&access_token=${token}`;
  const fromTs = fromIso ? new Date(fromIso + "T00:00:00Z").getTime() : -Infinity;
  const toTs = toIso ? new Date(toIso + "T23:59:59Z").getTime() : Infinity;
  const out: IGMedia[] = [];
  while (url && out.length < hardCap) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Meta ${r.status}: ${await r.text()}`);
    const j = (await r.json()) as { data: IGMedia[]; paging?: { next?: string } };
    let stop = false;
    for (const m of j.data ?? []) {
      const ts = new Date(m.timestamp).getTime();
      if (ts > toTs) continue;
      if (ts < fromTs) { stop = true; break; }
      out.push(m);
      if (out.length >= hardCap) break;
    }
    if (stop) break;
    url = j.paging?.next ?? "";
  }
  return out;
}

function extractHashtags(text: string | undefined): string[] {
  if (!text) return [];
  // Unicode hashtag pattern (latin + indic + emoji-adjacent ok)
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  // Lowercase, dedupe per post
  const set = new Set(matches.map((t) => t.toLowerCase()));
  return Array.from(set);
}

type HashtagPostRef = {
  id: string;
  permalink: string;
  thumbnail: string;
  timestamp: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

type HashtagStat = {
  tag: string;
  posts: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgReach: number;
  avgEngagement: number;
  engagementRatePct: number;
  topPosts: HashtagPostRef[];
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const minPosts = parseInt(url.searchParams.get("minPosts") || "2", 10);
  const force = url.searchParams.get("force") === "1";

  const acct = getAccount(accountId);
  if (!acct) return NextResponse.json({ error: "Unknown account" }, { status: 404 });

  const t0 = Date.now();
  const cacheKey = `hashtags:${accountId}:${from || "all"}:${to || "all"}:${minPosts}`;

  // Serve instantly from the fridge if we fetched this same view recently.
  if (!force) {
    const cached = await cacheGet(cacheKey);
    if (cached && cached.ageMs < HASHTAGS_TTL_MS) {
      const payload = cached.payload as Record<string, unknown>;
      return NextResponse.json({ ...payload, cached: true, cacheAgeMs: cached.ageMs, latencyMs: Date.now() - t0 });
    }
  }

  try {
    const media = await fetchMediaInDateRange(acct.igUserId, acct.pageAccessToken, from, to, 500);

    // Pull insights in parallel
    const concurrency = 6;
    const enriched: (HashtagPostRef & { tags: string[]; caption: string })[] = [];
    let i = 0;
    async function worker() {
      while (i < media.length) {
        const idx = i++;
        const m = media[idx];
        let reach = 0, shares = 0, saves = 0;
        try {
          const insights = await fetchMediaInsights(acct!, m.id, m.media_type, m.media_product_type);
          for (const ins of insights) {
            const v = ins.values?.[0]?.value;
            if (typeof v !== "number") continue;
            if (ins.name === "reach") reach = v;
            else if (ins.name === "shares") shares = v;
            else if (ins.name === "saved") saves = v;
          }
        } catch {
          // ignore per-post failures, keep counters at 0
        }
        enriched.push({
          id: m.id,
          permalink: m.permalink,
          thumbnail: m.thumbnail_url || m.media_url || "",
          timestamp: m.timestamp,
          reach,
          likes: m.like_count ?? 0,
          comments: m.comments_count ?? 0,
          shares,
          saves,
          tags: extractHashtags(m.caption),
          caption: m.caption || "",
        });
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, media.length) }, () => worker()));

    // Aggregate per hashtag
    const byTag = new Map<string, HashtagStat>();
    for (const post of enriched) {
      for (const tag of post.tags) {
        let s = byTag.get(tag);
        if (!s) {
          s = {
            tag,
            posts: 0,
            totalReach: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            totalSaves: 0,
            avgReach: 0,
            avgEngagement: 0,
            engagementRatePct: 0,
            topPosts: [],
          };
          byTag.set(tag, s);
        }
        s.posts++;
        s.totalReach += post.reach;
        s.totalLikes += post.likes;
        s.totalComments += post.comments;
        s.totalShares += post.shares;
        s.totalSaves += post.saves;
        s.topPosts.push({
          id: post.id, permalink: post.permalink, thumbnail: post.thumbnail,
          timestamp: post.timestamp, reach: post.reach, likes: post.likes,
          comments: post.comments, shares: post.shares, saves: post.saves,
        });
      }
    }
    const stats: HashtagStat[] = Array.from(byTag.values())
      .filter((s) => s.posts >= minPosts)
      .map((s) => {
        s.avgReach = Math.round(s.totalReach / s.posts);
        const eng = s.totalLikes + s.totalComments + s.totalShares + s.totalSaves;
        s.avgEngagement = Math.round(eng / s.posts);
        s.engagementRatePct = s.totalReach > 0 ? (eng / s.totalReach) * 100 : 0;
        s.topPosts = s.topPosts
          .sort((a, b) => (b.reach || (b.likes + b.comments)) - (a.reach || (a.likes + a.comments)))
          .slice(0, 4);
        return s;
      })
      .sort((a, b) => b.engagementRatePct - a.engagementRatePct);

    const result = {
      live: true,
      range: { from, to },
      postsAnalyzed: media.length,
      uniqueHashtags: byTag.size,
      qualifyingHashtags: stats.length,
      hashtags: stats,
    };
    await cacheSet(cacheKey, result);
    return NextResponse.json({ ...result, cached: false, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
