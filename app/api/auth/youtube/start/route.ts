import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionIsAdmin, isLoggedIn } from "@/lib/auth";
import { CHANNELS } from "@/lib/youtube-channels";
import { YT_SCOPES, youtubeRedirect } from "@/lib/youtube-connect";

// GET /api/auth/youtube/start?channel=samvaya
// Sends an admin to Google to let the dashboard read one channel's stats. Admin
// only — it decides what the whole team sees on the YouTube tab.
// Dynamic: a prerendered copy would freeze one `state` and break every later try.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const here = new URL(req.url);
  const channel = here.searchParams.get("channel") || "";
  const back = (flag: string) => NextResponse.redirect(new URL(`/dashboard/preview/youtube?channel=${encodeURIComponent(channel)}&yt=${flag}`, here.origin));
  if (!isLoggedIn()) return NextResponse.redirect(new URL("/login", here.origin));
  if (!getSessionIsAdmin()) return back("notadmin");
  if (!CHANNELS[channel] || !process.env.YOUTUBE_CLIENT_ID) return back("failed");

  const state = `${randomBytes(16).toString("hex")}.${channel}`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.YOUTUBE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", youtubeRedirect(req.url));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", YT_SCOPES);
  auth.searchParams.set("state", state);
  // offline + consent = a refresh token every time (otherwise it dies within the hour).
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent select_account");
  const res = NextResponse.redirect(auth);
  res.cookies.set("yt_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
