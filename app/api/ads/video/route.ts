import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getAdAccount, fetchAdMedia } from "@/lib/meta-ads";
import { requireSection } from "@/lib/api-guard";

// GET /api/ads/video?ad=<ad id> → { video: { kind, url, poster } | null }: the open
// ad's creative at full size — a video plays with sound (lib/meta-ads.ts fetchAdMedia).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireSection("ads");
  if (denied) return denied;
  const ad = new URL(req.url).searchParams.get("ad") || "";
  if (!/^\d+$/.test(ad)) return NextResponse.json({ error: "Which ad?" }, { status: 400 });
  try {
    const acct = await getAdAccount();
    if (!acct) return NextResponse.json({ video: null });
    return NextResponse.json({ video: await fetchAdMedia(acct, ad) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load the ad's video"), { status: 502 });
  }
}
