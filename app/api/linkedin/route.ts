import { NextResponse } from "next/server";
import { buildLive, linkedinToken, listAdminedOrgs } from "@/lib/linkedin";
import { cached } from "@/lib/api-cache";

// GET /api/linkedin?page=<gcworld|goocampus>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// LinkedIn organization analytics for the two GooCampus company pages.
//
// ⚠️  DEMO MODE. LinkedIn's Community Management API access was still pending
// approval when this was built (applied 2026-06-04). Until the app is approved
// and a token with r_organization_social + rw_organization_admin is issued,
// this route serves DETERMINISTIC demo data shaped EXACTLY like LinkedIn's real
// API responses, so the UI is final and going live is a swap of the fetch
// helpers below — no UI change required.
//
// ── HOW TO GO LIVE (once approved) ─────────────────────────────────────────
// Set these env vars:
//   LINKEDIN_ACCESS_TOKEN         — OAuth token with the scopes above
//   LINKEDIN_ORG_URN_GCWORLD      — e.g. urn:li:organization:XXXXXXX
//   LINKEDIN_ORG_URN_GOOCAMPUS    — e.g. urn:li:organization:YYYYYYY
// Then implement the four fetchLive* helpers at the bottom against these APIs:
//   • Followers over time  → GET /rest/organizationalEntityFollowerStatistics
//                            ?q=organizationalEntity&organizationalEntity={urn}
//                            &timeIntervals=(timeRange:(start,end),timeGranularityType:DAY)
//   • Post performance     → GET /rest/organizationalEntityShareStatistics (+ /rest/posts for text)
//   • Page visitors        → GET /rest/organizationPageStatistics
//   • Demographics         → GET /rest/organizationalEntityFollowerStatistics (lifetime, no timeIntervals)
// Every helper must return the SAME shape the demo builders return here.
// Header for all calls: "LinkedIn-Version: 202405", "X-Restli-Protocol-Version: 2.0.0".
// ───────────────────────────────────────────────────────────────────────────

const PAGES: Record<string, { id: string; name: string; handle: string; vanityName: string; baseFollowers: number; scale: number }> = {
  goocampus: { id: "goocampus",  name: "GooCampus",        handle: "GooCampus",       vanityName: "goocampus",      baseFollowers: 18400, scale: 1.0 },
  gcworld:   { id: "gcworld",    name: "GooCampus World",  handle: "GooCampus World", vanityName: "goocampusworld", baseFollowers: 6250,  scale: 0.42 },
};

// ── Deterministic PRNG so numbers are stable across refreshes (seeded by page+day) ──
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const start = new Date(fromIso + "T00:00:00Z");
  const end = new Date(toIso + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function pctBreakdown(rand: () => number, labels: string[], total: number) {
  // Random-ish weights that sum to 100%, biggest first.
  const weights = labels.map(() => 0.4 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  const rows = labels.map((label, i) => {
    const pct = (weights[i] / sum) * 100;
    return { label, pct: Math.round(pct * 10) / 10, count: Math.round((pct / 100) * total) };
  });
  return rows.sort((a, b) => b.pct - a.pct);
}

function buildDemo(pageKey: string, from: string, to: string) {
  const page = PAGES[pageKey] || PAGES.goocampus;
  const days = daysBetween(from, to);
  const rand = mulberry32(hashSeed(`${page.id}:${from}:${to}`));

  // ── Followers over time ──
  // Walk backwards from today's total so the last point is "current followers".
  const dailyGains: number[] = days.map(() => {
    const base = 6 * page.scale;
    const spike = rand() < 0.12 ? rand() * 60 * page.scale : 0; // occasional viral day
    return Math.max(0, Math.round(base + rand() * 10 * page.scale + spike));
  });
  const totalGain = dailyGains.reduce((a, b) => a + b, 0);
  let running = page.baseFollowers - totalGain;
  const followersOverTime = days.map((date, i) => {
    running += dailyGains[i];
    return { date, followers: running, newFollowers: dailyGains[i] };
  });
  const currentFollowers = running;

  // ── Post performance ──
  const POST_TOPICS = [
    { text: "Why NEET aspirants are choosing MBBS abroad in 2026 — the real numbers", type: "ARTICLE" },
    { text: "5 documents every AMC candidate forgets until it's too late", type: "IMAGE" },
    { text: "Our student cleared PLAB on the first attempt. Here's her exact timeline.", type: "VIDEO" },
    { text: "Australia just changed its HMO intake windows — what it means for you", type: "ARTICLE" },
    { text: "Live webinar recap: Germany's Approbation pathway, simplified", type: "IMAGE" },
    { text: "The one mistake that delays 40% of med-licensing applications", type: "IMAGE" },
    { text: "Meet the counsellor: 12 years guiding doctors across 6 countries", type: "VIDEO" },
    { text: "NZREX vs AMC vs PLAB — which pathway fits your goals?", type: "ARTICLE" },
  ];
  const nPosts = Math.max(3, Math.min(POST_TOPICS.length, Math.round(days.length / 6)));
  const posts = Array.from({ length: nPosts }, (_, i) => {
    const topic = POST_TOPICS[i % POST_TOPICS.length];
    const dayIdx = Math.floor((i + 0.5) * (days.length / nPosts));
    const impressions = Math.round((1200 + rand() * 5200) * page.scale);
    const uniqueImpressions = Math.round(impressions * (0.78 + rand() * 0.15));
    const clicks = Math.round(impressions * (0.02 + rand() * 0.05));
    const reactions = Math.round(impressions * (0.015 + rand() * 0.04));
    const comments = Math.round(reactions * (0.05 + rand() * 0.2));
    const shares = Math.round(reactions * (0.03 + rand() * 0.12));
    const engagements = clicks + reactions + comments + shares;
    return {
      id: `demo-${page.id}-${i}`,
      date: days[Math.min(dayIdx, days.length - 1)],
      text: topic.text,
      type: topic.type,
      impressions,
      uniqueImpressions,
      clicks,
      reactions,
      comments,
      shares,
      engagementRate: Math.round((engagements / impressions) * 1000) / 10, // %
      ctr: Math.round((clicks / impressions) * 1000) / 10,
      thumbnailUrl: null,
      docUrl: null,
      mediaTitle: null,
      permalink: null,
    };
  }).sort((a, b) => b.impressions - a.impressions);

  const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0);
  const totalUniqueImpressions = posts.reduce((s, p) => s + p.uniqueImpressions, 0);
  const totalClicks = posts.reduce((s, p) => s + p.clicks, 0);
  const totalEngagements = posts.reduce((s, p) => s + p.clicks + p.reactions + p.comments + p.shares, 0);
  const avgEngagementRate = totalImpressions ? Math.round((totalEngagements / totalImpressions) * 1000) / 10 : 0;
  const avgCtr = totalImpressions ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0;

  // ── Page visitors ──
  const visitorsOverTime = days.map((date) => {
    const views = Math.round((40 + rand() * 120) * page.scale);
    const unique = Math.round(views * (0.62 + rand() * 0.2));
    return { date, views, unique };
  });
  const totalPageViews = visitorsOverTime.reduce((s, v) => s + v.views, 0);
  const uniqueVisitors = visitorsOverTime.reduce((s, v) => s + v.unique, 0);
  const byPage = pctBreakdown(rand, ["Overview", "About", "Jobs", "Life", "People"], totalPageViews)
    .map((r) => ({ page: r.label, views: r.count }));

  // ── Follower demographics (lifetime) ──
  const demographics = {
    jobFunction: pctBreakdown(rand, ["Healthcare Services", "Education", "Research", "Operations", "Business Development", "Community & Social Services"], currentFollowers),
    seniority:   pctBreakdown(rand, ["Entry", "Senior", "Manager", "Director", "Owner", "Training"], currentFollowers),
    industry:    pctBreakdown(rand, ["Hospital & Health Care", "Higher Education", "Medical Practice", "Pharmaceuticals", "E-Learning", "Research"], currentFollowers),
    location:    pctBreakdown(rand, ["Bengaluru", "Hyderabad", "Delhi NCR", "Chennai", "Mumbai", "Kochi", "International"], currentFollowers),
    companySize: pctBreakdown(rand, ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"], currentFollowers),
  };

  return {
    page: { id: page.id, name: page.name, handle: page.handle, vanityName: page.vanityName },
    source: "demo" as const,
    range: { from, to },
    summary: {
      followers: currentFollowers,
      followerGain: totalGain,
      organicGain: Math.round(totalGain * (0.82 + rand() * 0.12)),
      paidGain: Math.max(0, totalGain - Math.round(totalGain * (0.82 + rand() * 0.12))),
      impressions: totalImpressions,
      uniqueImpressions: totalUniqueImpressions,
      engagementRate: avgEngagementRate,
      ctr: avgCtr,
      pageViews: totalPageViews,
      uniqueVisitors,
      posts: posts.length,
    },
    followersOverTime,
    posts,
    visitors: { totalPageViews, uniqueVisitors, byPage, overTime: visitorsOverTime },
    demographics,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pageKey = (url.searchParams.get("page") || "goocampus").toLowerCase();
    const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
    const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    // Diagnostic: ?probe=orgs → list every org the token's member administers.
    // Tells us whether the main GooCampus page is reachable with this same token.
    if (url.searchParams.get("probe") === "orgs") {
      const token = await linkedinToken();
      if (!token) return NextResponse.json({ error: "no token" }, { status: 400 });
      try {
        return NextResponse.json({ orgs: await listAdminedOrgs(token) });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
      }
    }

    if (!PAGES[pageKey]) {
      return NextResponse.json({ error: "unknown page (use goocampus|gcworld)" }, { status: 400 });
    }

    const t0 = Date.now();

    // GooCampus World goes live when a token is present (that's the approved org).
    // Main GooCampus stays on demo until its own app is approved.
    // Any live-call failure degrades gracefully to demo so the tab never breaks.
    if (pageKey === "gcworld" && (await linkedinToken())) {
      try {
        // 30-min cache: makes tab flips instant AND protects LinkedIn's tiny
        // per-day quota on the follower-statistics endpoint.
        const livePayload = await cached(`li:${pageKey}:${from}:${to}`, 24 * 60 * 60_000, () => buildLive(pageKey, from, to));
        // If the live posts array is empty (per-post stats are a follow-up), borrow the
        // demo posts so the Post-performance section still renders something meaningful.
        const demoForPosts = buildDemo(pageKey, from, to);
        const posts = livePayload.posts.length ? livePayload.posts : demoForPosts.posts;
        return NextResponse.json({
          ...livePayload,
          posts,
          summary: { ...livePayload.summary, posts: posts.length },
          partial: livePayload.posts.length === 0, // true = everything live except per-post table
          latencyMs: Date.now() - t0,
        });
      } catch (e) {
        // fall through to demo, but tell the client why
        const payload = buildDemo(pageKey, from, to);
        return NextResponse.json({
          ...payload,
          source: "demo",
          liveError: e instanceof Error ? e.message : String(e),
          latencyMs: Date.now() - t0,
        });
      }
    }

    const payload = buildDemo(pageKey, from, to);
    return NextResponse.json({ ...payload, source: "demo", latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "LinkedIn analytics failed" }, { status: 502 });
  }
}
