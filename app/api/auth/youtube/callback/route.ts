import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionIsAdmin, isLoggedIn } from "@/lib/auth";
import { saveYouTubeGrant, youtubeRedirect } from "@/lib/youtube-connect";

// GET /api/auth/youtube/callback?code=…&state=<nonce>.<channel>
// Where Google sends the admin back. Saves the grant and returns to the YouTube tab
// on that channel with a flag the page turns into a sentence.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const here = new URL(req.url);
  const state = here.searchParams.get("state") || "";
  const channel = state.split(".")[1] || "";
  const back = (flag: string, why?: string) => {
    const u = new URL("/dashboard/preview/youtube", here.origin);
    u.searchParams.set("channel", channel);
    u.searchParams.set("yt", flag);
    if (why) u.searchParams.set("why", why.slice(0, 200));
    const res = NextResponse.redirect(u);
    res.cookies.delete("yt_oauth_state");
    return res;
  };
  if (!isLoggedIn()) return NextResponse.redirect(new URL("/login", here.origin));
  if (!getSessionIsAdmin()) return back("notadmin");
  const err = here.searchParams.get("error");
  if (err) return back("denied", err);
  const code = here.searchParams.get("code");
  if (!code || !state || state !== cookies().get("yt_oauth_state")?.value) {
    return back("failed", "The permission took too long or was started somewhere else. Try again.");
  }
  try {
    const title = await saveYouTubeGrant(code, youtubeRedirect(req.url), channel);
    return back("connected", title);
  } catch (e) {
    return back("failed", (e as Error).message);
  }
}
