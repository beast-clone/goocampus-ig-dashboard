import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getAccount, getDefaultAccountId, fetchBasic, fetchAccountReachUnique, fetchAccountEngagement, fetchRecentMedia } from "@/lib/instagram";
import { airtableList, CRM_TABLE, dateRangeFormula, pickName } from "@/lib/sales-hub";

// Instagram current-month row for the monthly report (real Meta data).
//   GET /api/reports/instagram-month?from=YYYY-MM-DD&to=YYYY-MM-DD&accountId=
//     → { available, window, followers, reach, contentInteractions, post, reel,
//         story, leads }  (leads = CRM IG/Fb source estimate; DM not available)
export const dynamic = "force-dynamic";
const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  try {
    const u = new URL(req.url);
    const accountId = u.searchParams.get("accountId") || getDefaultAccountId();
    const acc = getAccount(accountId);
    if (!acc) return NextResponse.json({ available: false, reason: "no account" });
    const to = isYMD(u.searchParams.get("to") || "") ? u.searchParams.get("to")! : new Date().toISOString().slice(0, 10);
    const from = isYMD(u.searchParams.get("from") || "") ? u.searchParams.get("from")! : new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

    const [basic, reach, engagement, media, crm] = await Promise.all([
      fetchBasic(acc).catch(() => null),
      fetchAccountReachUnique(acc, from, to).catch(() => null),
      fetchAccountEngagement(acc, from, to).catch(() => null),
      fetchRecentMedia(acc, 100).catch(() => [] as Awaited<ReturnType<typeof fetchRecentMedia>>),
      airtableList<Record<string, unknown>>(CRM_TABLE, {
        filterByFormula: dateRangeFormula("Created Date", from, to),
        fields: ["Lead Source (n8n)"], pageSize: 100, maxRecords: 20_000,
      }).catch(() => []),
    ]);

    // Posts / reels / stories created in the window.
    let post = 0, reel = 0, story = 0;
    for (const m of media || []) {
      const ts = (m.timestamp || "").slice(0, 10);
      if (!ts || ts < from || ts > to) continue;
      if (m.media_product_type === "STORY") story++;
      else if (m.media_product_type === "REELS") reel++;
      else post++;
    }

    // Leads = CRM IG/Fb source leads in the window (the same bucket as Total Organic Leads).
    let leads = 0;
    for (const rec of crm) {
      const s = (pickName(rec.fields["Lead Source (n8n)"]) || "").toLowerCase();
      if (s.includes("instagram") || s.includes("facebook")) leads++;
    }

    return NextResponse.json({
      available: !!basic,
      window: { from, to },
      followers: basic?.followers_count ?? null,
      reach,
      contentInteractions: engagement?.interactions ?? null,
      post, reel, story, leads,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Instagram month report failed"), { status: 502 });
  }
}
