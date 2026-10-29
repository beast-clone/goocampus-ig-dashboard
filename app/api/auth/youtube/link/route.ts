import { NextResponse } from "next/server";
import { googleAuthUrl, readConnectToken, youtubeRedirect } from "@/lib/youtube-connect";
import { connectPage } from "@/lib/connect-page";

// GET /api/auth/youtube/link?t=<connect token>
// The link an admin copies on the Brands page and sends to a channel's owner. Public —
// the owner has no dashboard login — so the signed token is the only thing that lets
// it through. Sends them to Google; /api/auth/youtube/callback saves the grant.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const channel = readConnectToken(t);
  if (!channel || !process.env.YOUTUBE_CLIENT_ID) {
    return connectPage(false, "This link has expired or isn't valid. Ask for a new one.");
  }
  const res = NextResponse.redirect(googleAuthUrl(youtubeRedirect(req.url), `link.${t}`));
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
