import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getAccount, fetchMediaInsights, type IGMedia } from "@/lib/instagram";

// Batched insights endpoint: takes a list of media IDs + their types and returns
// reach/shares/saves/total_interactions/views for each. Frontend calls this in chunks
// of 10 so the Posts/Reels table can paint instantly with media + caption, then
// progressively fill in the engagement columns as each batch returns.
//
// POST body: { accountId, items: [{ id, mediaType, mediaProductType }] }
// Response:  { insights: [{ id, reach, shares, saves, totalInteractions, views?, avgWatchMs? }] }

type Item = { id: string; mediaType: string; mediaProductType?: string };

export async function POST(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  let body: { accountId?: string; items?: Item[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const accountId = body.accountId || "goocampus";
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ insights: [] });
  if (items.length > 25) return NextResponse.json({ error: "Max 25 items per batch" }, { status: 400 });

  const acct = getAccount(accountId);
  if (!acct) return NextResponse.json({ insights: [], note: "No account configured" });
  const account = acct;  // narrow non-null for use inside the async closures below

  // Fan out in parallel — Meta rate-limits per app, but a batch of <=25 is safe and fast.
  const results = await Promise.all(items.map(async (it) => {
    try {
      const insights = await fetchMediaInsights(
        account,
        it.id,
        it.mediaType as IGMedia["media_type"],
        it.mediaProductType as IGMedia["media_product_type"] | undefined,
      );
      let reach = 0, shares = 0, saves = 0, totalInteractions = 0;
      let views: number | undefined, avgWatchMs: number | undefined;
      for (const ins of insights) {
        const v = ins.values?.[0]?.value;
        if (typeof v !== "number") continue;
        if (ins.name === "reach") reach = v;
        else if (ins.name === "shares") shares = v;
        else if (ins.name === "saved") saves = v;
        else if (ins.name === "total_interactions") totalInteractions = v;
        else if (ins.name === "views") views = v;
        else if (ins.name === "ig_reels_avg_watch_time") avgWatchMs = v;
      }
      return { id: it.id, reach, shares, saves, totalInteractions, views, avgWatchMs };
    } catch {
      // One failure shouldn't kill the batch — return zeros so the UI shows "—" gracefully.
      return { id: it.id, reach: 0, shares: 0, saves: 0, totalInteractions: 0 };
    }
  }));

  return NextResponse.json({ insights: results });
}
