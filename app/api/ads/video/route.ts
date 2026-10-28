import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getAdAccount, fetchAdVideo } from "@/lib/meta-ads";
import { requireSection } from "@/lib/api-guard";

// GET /api/ads/video?ad=<ad id> → { video: { url, poster } | null }. Asked when an ad
// is opened on the Ads page, so it can play with sound (lib/meta-ads.ts fetchAdVideo).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireSection("ads");
  if (denied) return denied;
  const ad = new URL(req.url).searchParams.get("ad") || "";
  if (!/^\d+$/.test(ad)) return NextResponse.json({ error: "Which ad?" }, { status: 400 });
  try {
    const acct = await getAdAccount();
    if (!acct) return NextResponse.json({ video: null });
    return NextResponse.json({ video: await fetchAdVideo(acct, ad) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load the ad's video"), { status: 502 });
  }
}
