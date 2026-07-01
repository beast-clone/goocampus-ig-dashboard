import { NextResponse } from "next/server";
import { getAccount } from "@/lib/instagram";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { safeError } from "@/lib/errors";

// Meta's Graph API keeps stories on a SEPARATE endpoint from regular media:
//   GET /{ig-user-id}/stories
// The /{ig-user-id}/media endpoint we use for Posts/Reels never returns story items,
// which is why filtering that response for "STORY" always came back empty.
// This route hits the correct endpoint and returns whatever is currently live (24h window).

const GRAPH = "https://graph.facebook.com/v25.0";

type IGStory = {
  id: string;
  caption?: string;
  media_type?: "IMAGE" | "VIDEO";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const acct = getAccount(accountId);
  if (!acct) return NextResponse.json({ stories: [], note: "No account configured" });

  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  const endpoint = `${GRAPH}/${acct.igUserId}/stories?fields=${fields}&access_token=${acct.pageAccessToken}`;

  try {
    const r = await fetchWithTimeout(endpoint, { cache: "no-store" });
    if (!r.ok) {
      const body = await r.text();
      return NextResponse.json(safeError(new Error(`Meta ${r.status}: ${body}`), "Failed to fetch stories"), { status: 502 });
    }
    const j = (await r.json()) as { data?: IGStory[] };
    const baseStories = (j.data ?? []).map((s) => ({
      id: s.id,
      caption: s.caption ?? "",
      mediaUrl: s.thumbnail_url || s.media_url || "",
      permalink: s.permalink ?? "",
      timestamp: s.timestamp,
      mediaType: s.media_type ?? "IMAGE",
    }));

    // Story insights are available WHILE the story is still active (<24h). Metrics differ from
    // regular media: reach, replies, taps_forward, taps_back, exits (no likes/shares/saves).
    // Fire the per-story insights calls in parallel — small N (usually <10 live at once).
    const withStats = await Promise.all(baseStories.map(async (s) => {
      let reach = 0, replies = 0, tapsForward = 0, tapsBack = 0, exits = 0, views = 0;
      try {
        const insightsUrl = `${GRAPH}/${s.id}/insights?metric=reach,replies,taps_forward,taps_back,exits&access_token=${acct.pageAccessToken}`;
        const ir = await fetchWithTimeout(insightsUrl, { cache: "no-store" });
        if (ir.ok) {
          const ij = (await ir.json()) as { data?: Array<{ name: string; values?: Array<{ value: number }> }> };
          for (const ins of ij.data ?? []) {
            const v = ins.values?.[0]?.value;
            if (typeof v !== "number") continue;
            if (ins.name === "reach") { reach = v; views = v; }
            else if (ins.name === "replies") replies = v;
            else if (ins.name === "taps_forward") tapsForward = v;
            else if (ins.name === "taps_back") tapsBack = v;
            else if (ins.name === "exits") exits = v;
          }
        }
      } catch { /* keep zeros — display layer will show a dash */ }
      return { ...s, reach, views, replies, tapsForward, tapsBack, exits };
    }));

    // Newest first
    withStats.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return NextResponse.json({ stories: withStats, live: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to fetch stories"), { status: 502 });
  }
}
