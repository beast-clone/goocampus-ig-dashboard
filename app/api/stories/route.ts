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
    const stories = (j.data ?? []).map((s) => ({
      id: s.id,
      caption: s.caption ?? "",
      mediaUrl: s.thumbnail_url || s.media_url || "",
      permalink: s.permalink ?? "",
      timestamp: s.timestamp,
      mediaType: s.media_type ?? "IMAGE",
    }));
    // Newest first
    stories.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return NextResponse.json({ stories, live: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to fetch stories"), { status: 502 });
  }
}
