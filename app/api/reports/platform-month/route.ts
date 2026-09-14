import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { hasYouTubeAuth, buildLiveYouTube } from "@/lib/youtube";
import { linkedinToken, buildLive as buildLinkedIn } from "@/lib/linkedin";
import { airtableList, CRM_TABLE, dateRangeFormula, pickName } from "@/lib/sales-hub";

// Current-month row for the monthly report, per platform — REAL live data only
// (returns { available:false } if the platform can't be fetched live, so the report
// never shows synthetic numbers). See docs/MONTHLY_REPORT_SPEC.md.
//   GET /api/reports/platform-month?platform=youtube|linkedin&from=&to=&key=goocampus
//     youtube  → { available, subscribers, views, video, shorts, leads }
//     linkedin → { available, followers, impressions, reactions, posts, comments }
export const dynamic = "force-dynamic";
const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function crmSourceCount(from: string, to: string, match: (s: string) => boolean): Promise<number> {
  const rows = await airtableList<Record<string, unknown>>(CRM_TABLE, {
    filterByFormula: dateRangeFormula("Created Date", from, to),
    fields: ["Lead Source (n8n)"], pageSize: 100, maxRecords: 20_000,
  }).catch(() => []);
  let n = 0;
  for (const r of rows) if (match((pickName(r.fields["Lead Source (n8n)"]) || "").toLowerCase())) n++;
  return n;
}

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  try {
    const u = new URL(req.url);
    const platform = (u.searchParams.get("platform") || "").toLowerCase();
    const key = (u.searchParams.get("key") || "goocampus").toLowerCase();
    const to = isYMD(u.searchParams.get("to") || "") ? u.searchParams.get("to")! : new Date().toISOString().slice(0, 10);
    const from = isYMD(u.searchParams.get("from") || "") ? u.searchParams.get("from")! : new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

    if (platform === "youtube") {
      if (!(await hasYouTubeAuth())) return NextResponse.json({ available: false, reason: "no auth" });
      const live = await buildLiveYouTube(key, from, to);
      const s = live.summary;
      const leads = await crmSourceCount(from, to, (src) => src.includes("youtube"));
      return NextResponse.json({ available: true, subscribers: s.subscribers, views: s.views, video: s.postedVideos, shorts: s.postedShorts, leads });
    }

    if (platform === "linkedin") {
      if (!(await linkedinToken())) return NextResponse.json({ available: false, reason: "no token" });
      const live = await buildLinkedIn(key, from, to);
      const reactions = live.posts.reduce((n, p) => n + (p.reactions || 0), 0);
      const comments = live.posts.reduce((n, p) => n + (p.comments || 0), 0);
      return NextResponse.json({ available: true, followers: live.summary.followers, impressions: live.summary.impressions, reactions, posts: live.posts.length, comments });
    }

    return NextResponse.json({ available: false, reason: "unknown platform" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(safeError(err, "Platform month report failed"), { status: 502 });
  }
}
