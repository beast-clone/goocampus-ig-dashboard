import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";
import { getAdAccount, fetchActiveAdsForDay } from "@/lib/meta-ads";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// Live "ads running now" for the individual dashboard, enriched with each ad's
// real creative image (the active-ads insights feed doesn't include it, so we
// fetch creative{thumbnail_url,image_url} per ad).

const GRAPH = "https://graph.facebook.com/v21.0";

async function adCreative(adId: string, token: string): Promise<{ image: string | null; thumb: string | null }> {
  try {
    // image_url = full-res creative (sharp, image ads). thumbnail_url at 1080 = biggest proxy (video/lead ads).
    const fields = encodeURIComponent("creative{image_url,thumbnail_url.width(1080).height(1080)}");
    const res = await fetchWithTimeout(`${GRAPH}/${adId}?fields=${fields}&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!res.ok) return { image: null, thumb: null };
    const cr = (await res.json()).creative || {};
    return { image: cr.image_url || null, thumb: cr.thumbnail_url || null };
  } catch {
    return { image: null, thumb: null };
  }
}

export async function GET() {
  const acct = await getAdAccount();
  if (!acct) return NextResponse.json({ live: false, ads: [] });
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const active = await fetchActiveAdsForDay(acct, yesterday).catch(() => []);
  const top = active.slice().sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 8);
  const ads = await Promise.all(
    top.map(async (a) => {
      const c = await adCreative(a.ad_id, acct.token);
      return {
        id: a.ad_id,
        name: a.ad_name,
        impressions: a.impressions,
        reach: a.reach,
        ctr: a.ctr,
        leads: a.leads,
        clicks: Math.round((a.impressions || 0) * (a.ctr || 0) / 100),
        image: c.image,
        thumbnail: c.thumb,
      };
    }),
  );
  return NextResponse.json({ live: true, ads });
}
