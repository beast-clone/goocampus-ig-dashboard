import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";
import { getAdAccount, fetchAdsForCampaign } from "@/lib/meta-ads";

export async function GET(req: Request, { params }: { params: { campaignId: string } }) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || format(subDays(new Date(), 29), "yyyy-MM-dd");
  const to = url.searchParams.get("to") || format(new Date(), "yyyy-MM-dd");

  const acct = getAdAccount();
  if (!acct) {
    return NextResponse.json({ error: "META_AD_ACCOUNT_ID or META_LONG_LIVED_USER_TOKEN not set" }, { status: 400 });
  }

  try {
    const ads = await fetchAdsForCampaign(acct, params.campaignId, from, to);
    return NextResponse.json({ live: true, campaignId: params.campaignId, ads });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
