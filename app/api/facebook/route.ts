import { NextResponse } from "next/server";
import { getAccount } from "@/lib/instagram";
import { fetchPageProfile, fetchPageInsights, fetchPagePosts, fetchPageAudience } from "@/lib/facebook";
import { cached } from "@/lib/api-cache";

// GET /api/facebook?account=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Facebook Page analytics per brand, using the SAME stored page tokens as the
// Instagram tabs (accounts.local.json → lib/instagram.ts getAccount).
//
// Honest availability (see lib/facebook.ts for the full probe notes):
//   page.followers / fanCount  → REAL for all pages
//   insights.*                 → null today (tokens lack read_insights); the call
//                                is still attempted so a re-scoped token goes
//                                live automatically
//   posts.items                → REAL (message, date, picture, permalink) for
//                                3 of 4 pages; per-post likes/comments are null
//                                (needs pages_read_engagement)
// Anything unreadable is null / available:false — never fabricated.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account") || url.searchParams.get("accountId") || "goocampus";
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const acc = getAccount(accountId);
  if (!acc) return NextResponse.json({ error: "unknown account" }, { status: 400 });
  if (!acc.pageId) return NextResponse.json({ error: "account has no Facebook pageId configured" }, { status: 400 });

  const t0 = Date.now();
  try {
    // Profile is the make-or-break call (followers). Insights + posts degrade
    // gracefully inside lib/facebook.ts (available:false + reason).
    const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit")) || 12));
    // 10-min cache: four Graph calls per load otherwise — tab flips shouldn't re-pay them.
    const [profile, insights, posts, audience] = await cached(
      `fb:${acc.id}:${from}:${to}:${limit}`,
      10 * 60_000,
      () => Promise.all([
        fetchPageProfile(acc),
        fetchPageInsights(acc, from, to),
        fetchPagePosts(acc, limit),
        fetchPageAudience(acc),
      ]),
    );

    return NextResponse.json({
      account: { id: acc.id, label: acc.label, handle: acc.handle, pageId: acc.pageId },
      source: "live" as const,
      range: { from, to },
      page: profile,
      insights,
      posts,
      audience,
      latencyMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Facebook analytics failed" },
      { status: 502 },
    );
  }
}
