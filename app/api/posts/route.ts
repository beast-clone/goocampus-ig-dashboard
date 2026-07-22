import { NextResponse } from "next/server";
import { getAccount, fetchMediaInsights, type IGMedia } from "@/lib/instagram";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { metaLimiter } from "@/lib/concurrency";

const GRAPH = "https://graph.facebook.com/v25.0";

// Per-post insights mean one Meta call per post — a cold fetch for a month of
// posts takes 15–30s. The underlying numbers barely move within a day, and this
// endpoint is hit by nearly every page, so cache the finished payload per
// {account, range, limit, insights}. First load is cold; every repeat is instant.
// In-flight de-dupe collapses the burst of identical requests each page fires on
// mount into a single upstream fetch.
type PostsPayload = { live: boolean; count: number; posts: unknown[]; range: { from?: string; to?: string } };
const CACHE = new Map<string, { at: number; body: PostsPayload }>();
const INFLIGHT = new Map<string, Promise<PostsPayload>>();
const TTL_MS = 60 * 60 * 1000;

async function fetchMediaInDateRange(igUserId: string, token: string, fromIso?: string, toIso?: string, hardCap = 500) {
  const fields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_type,media_url,thumbnail_url}";
  let url = `${GRAPH}/${igUserId}/media?fields=${fields}&limit=100&access_token=${token}`;
  const fromTs = fromIso ? new Date(fromIso + "T00:00:00Z").getTime() : -Infinity;
  const toTs = toIso ? new Date(toIso + "T23:59:59Z").getTime() : Infinity;
  const out: IGMedia[] = [];
  while (url && out.length < hardCap) {
    const r = await metaLimiter(() => fetchWithTimeout(url, { cache: "no-store" }));
    if (!r.ok) throw new Error(`Meta ${r.status}: ${await r.text()}`);
    const j = (await r.json()) as { data: IGMedia[]; paging?: { next?: string } };
    let stopPaging = false;
    for (const m of j.data ?? []) {
      const ts = new Date(m.timestamp).getTime();
      if (ts > toTs) continue;
      if (ts < fromTs) { stopPaging = true; break; }
      out.push(m);
      if (out.length >= hardCap) break;
    }
    if (stopPaging) break;
    url = j.paging?.next ?? "";
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "0", 10);
  const withInsights = url.searchParams.get("insights") !== "false";

  const acct = getAccount(accountId);
  if (!acct) return NextResponse.json({ posts: [], note: "No account configured" });

  const cap = limit > 0 ? limit : 500;
  const force = url.searchParams.get("force") === "1";
  const key = `${accountId}|${from || ""}|${to || ""}|${cap}|${withInsights ? "ins" : "raw"}`;

  const build = async (): Promise<PostsPayload> => {
    const media = await fetchMediaInDateRange(acct!.igUserId, acct!.pageAccessToken, from, to, cap);

    const concurrency = 6;
    const posts: unknown[] = [];
    let i = 0;
    async function worker() {
      while (i < media.length) {
        const idx = i++;
        const m = media[idx];
        let reach = 0, shares = 0, saves = 0, totalInteractions = 0, views: number | undefined, avgWatch: number | undefined;
        if (withInsights) {
          const insights = await fetchMediaInsights(acct!, m.id, m.media_type, m.media_product_type);
          for (const ins of insights) {
            const v = ins.values?.[0]?.value;
            if (typeof v !== "number") continue;
            if (ins.name === "reach") reach = v;
            else if (ins.name === "shares") shares = v;
            else if (ins.name === "saved") saves = v;
            else if (ins.name === "total_interactions") totalInteractions = v;
            else if (ins.name === "views") views = v;
            else if (ins.name === "ig_reels_avg_watch_time") avgWatch = v;
          }
        }
        const childUrls = (m.children?.data ?? []).map((ch) => ch.thumbnail_url || ch.media_url || "").filter(Boolean);
        posts[idx] = {
          id: m.id,
          caption: m.caption ?? "",
          mediaUrl: m.thumbnail_url || m.media_url || "",
          mediaUrls: childUrls.length ? childUrls : undefined,   // carousel slides, in order
          permalink: m.permalink,
          type: m.media_product_type === "REELS" ? "REEL" : m.media_type,
          timestamp: m.timestamp,
          likes: m.like_count ?? 0,
          comments: m.comments_count ?? 0,
          reach, shares, saves, totalInteractions, views, avgWatchMs: avgWatch,
        };
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, media.length) }, () => worker()));

    return { live: true, count: posts.length, posts, range: { from, to } };
  };

  // Kick off (or reuse) a build and keep the cache warm.
  const revalidate = (): Promise<PostsPayload> => {
    const flying = INFLIGHT.get(key);
    if (flying) return flying;
    const p = build()
      .then((body) => {
        CACHE.set(key, { at: Date.now(), body });
        return body;
      })
      .finally(() => INFLIGHT.delete(key));
    INFLIGHT.set(key, p);
    return p;
  };

  const hit = CACHE.get(key);
  if (!force && hit) {
    const fresh = Date.now() - hit.at < TTL_MS;
    // Stale → serve the old copy instantly and refresh in the background, so a
    // warmed view is never slow again.
    if (!fresh) revalidate().catch(() => {});
    return NextResponse.json({ ...hit.body, cached: true, stale: !fresh });
  }

  // Cold (or forced) — must wait for the real fetch. Concurrent identical
  // requests share this one build via the in-flight map.
  try {
    const body = await revalidate();
    return NextResponse.json({ ...body, cached: false });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
