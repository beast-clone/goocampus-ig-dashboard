import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { buildLive, linkedinToken, listAdminedOrgs } from "@/lib/linkedin";
import { cached } from "@/lib/api-cache";

// GET /api/linkedin?page=<gcworld|goocampus>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// LinkedIn organization analytics for the two GooCampus company pages.
//
// Live only — no demo data. Without a token this answers 503 "not connected"; a
// failed live call answers 502 with the reason. Needs LINKEDIN_ACCESS_TOKEN (or the
// stored OAuth token) with r_organization_social + rw_organization_admin, and the
// org URNs (LINKEDIN_ORG_URN_GCWORLD / LINKEDIN_ORG_URN_GOOCAMPUS, else auto-discovered).

const PAGES: Record<string, { id: string; name: string; handle: string; vanityName: string }> = {
  goocampus: { id: "goocampus",  name: "GooCampus",        handle: "GooCampus",       vanityName: "goocampus" },
  gcworld:   { id: "gcworld",    name: "GooCampus World",  handle: "GooCampus World", vanityName: "goocampusworld" },
};

export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

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

    // Both GooCampus World and main GooCampus go live when a token is present and the
    // token's member administers that org (info@goocampus is Super Admin of both:
    // gcworld=urn:li:organization:107157863, goocampus=urn:li:organization:3358713).
    // Main GooCampus needs LINKEDIN_ORG_URN_GOOCAMPUS set; without it, orgUrnFor falls
    // back to auto-discovery. A live-call failure answers 502 — never demo data.
    if ((pageKey === "gcworld" || pageKey === "goocampus") && (await linkedinToken())) {
      try {
        // 24h cache: makes tab flips instant AND protects LinkedIn's tiny per-day
        // quota. Skip caching a rate-limited/degraded snapshot (no followers, or no
        // impressions AND no posts) so it retries and self-heals instead of pinning
        // bad numbers for 24h.
        const livePayload = await cached(
          `li:${pageKey}:${from}:${to}`,
          24 * 60 * 60_000,
          () => buildLive(pageKey, from, to),
          (p) => p.summary.followers > 0 && (p.summary.impressions > 0 || p.posts.length > 0),
        );
        // NO demo data on a live page — show only real posts. If LinkedIn returned
        // none (rate-limited), the UI renders an honest "No posts in this range".
        return NextResponse.json({
          ...livePayload,
          summary: { ...livePayload.summary, posts: livePayload.posts.length },
          postsUnavailable: livePayload.posts.length === 0,
          latencyMs: Date.now() - t0,
        });
      } catch (e) {
        return NextResponse.json({ error: `Couldn't load LinkedIn right now: ${e instanceof Error ? e.message : String(e)}`.slice(0, 240) }, { status: 502 });
      }
    }

    return NextResponse.json({ error: "LinkedIn isn't connected for this page.", notConnected: true }, { status: 503 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "LinkedIn analytics failed" }, { status: 502 });
  }
}
