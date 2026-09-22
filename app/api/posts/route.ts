import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getAccount } from "@/lib/instagram";
import { fetchPostsInRange, readPostsForRangeStored, readPostsForRangeHybrid } from "@/lib/post-history";

// Posts for a date range, with per-post insights. One Meta call per post, so a cold
// month is 15–30s — cached per {account, range, limit, insights} for an hour, with
// in-flight de-dupe collapsing the burst every page fires on mount.
//
// Frozen history: a range that ENDS BEFORE TODAY and asks for insights is served
// from the stored monthly snapshots (lib/post-history) when every covered month is
// stored — instant, stable, zero Meta calls. Current/partial-today ranges stay live.
type PostsPayload = { live: boolean; stored?: boolean; count: number; posts: unknown[]; range: { from?: string; to?: string } };
const CACHE = new Map<string, { at: number; body: PostsPayload }>();
const INFLIGHT = new Map<string, Promise<PostsPayload>>();
const TTL_MS = 60 * 60 * 1000;

const todayIso = () => new Date().toISOString().slice(0, 10);

export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

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

  // Stored-first for a fully-past range with insights.
  if (withInsights && from && to && to < todayIso() && !force) {
    try {
      const stored = await readPostsForRangeStored(accountId, from, to);
      if (stored && stored.length) {
        const sliced = limit > 0 ? stored.slice(0, limit) : stored;
        return NextResponse.json({ live: false, stored: true, count: sliced.length, posts: sliced, range: { from, to } });
      }
    } catch { /* fall through to a live fetch */ }
  }

  const key = `${accountId}|${from || ""}|${to || ""}|${cap}|${withInsights ? "ins" : "raw"}`;

  const build = async (): Promise<PostsPayload> => {
    // A range that ends today still contains frozen past months. Read those from
    // the monthly snapshots and fetch live only what's genuinely missing — a cold
    // 60/90-day window was costing 20-40s by re-fetching every month live, one
    // Meta call per post.
    if (withInsights && from && to) {
      const h = await readPostsForRangeHybrid(acct!, from, to, { withInsights, cap });
      if (h.storedMonths.length) {
        return { live: h.liveMonths.length > 0, stored: true, count: h.posts.length, posts: h.posts, range: { from, to } };
      }
    }
    const posts = await fetchPostsInRange(acct!, from, to, { withInsights, cap });
    return { live: true, count: posts.length, posts, range: { from, to } };
  };

  // Kick off (or reuse) a build and keep the cache warm.
  const revalidate = (): Promise<PostsPayload> => {
    const flying = INFLIGHT.get(key);
    if (flying) return flying;
    const p = build()
      .then((body) => { CACHE.set(key, { at: Date.now(), body }); return body; })
      .finally(() => INFLIGHT.delete(key));
    INFLIGHT.set(key, p);
    return p;
  };

  const hit = CACHE.get(key);
  if (!force && hit) {
    const fresh = Date.now() - hit.at < TTL_MS;
    // Stale → serve the old copy instantly and refresh in the background.
    if (!fresh) revalidate().catch(() => {});
    return NextResponse.json({ ...hit.body, cached: true, stale: !fresh });
  }

  try {
    const body = await revalidate();
    return NextResponse.json({ ...body, cached: false });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
