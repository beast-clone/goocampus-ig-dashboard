// Connect a YouTube channel from the dashboard (YouTube tab → "Connect this
// channel"). Same Google OAuth client as the other channels and sign-in, same two
// read-only scopes they were given. The grant is saved per channel in
// mh_integration_tokens as "youtube:<key>", which lib/youtube.ts reads first.
import { CHANNELS } from "@/lib/youtube-channels";
import { saveIntegrationToken } from "@/lib/integration-tokens";

export const YT_SCOPES = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly";

// On localhost the request origin IS the registered redirect; in production the
// stable APP_URL has to win (functions see deploy-permalink hosts).
export function youtubeRedirect(reqUrl: string): string {
  const here = new URL(reqUrl);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(here.origin);
  const origin = (local ? here.origin : (process.env.APP_URL || here.origin)).replace(/\/$/, "");
  return `${origin}/api/auth/youtube/callback`;
}

// Swap the code for tokens, check the grant is for the channel asked for (Google
// lets you pick any channel you manage), then save it. Returns the channel title.
export async function saveYouTubeGrant(code: string, redirectUri: string, channelKey: string): Promise<string> {
  const ch = CHANNELS[channelKey];
  if (!ch) throw new Error("Unknown channel");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.YOUTUBE_CLIENT_ID || "", client_secret: process.env.YOUTUBE_CLIENT_SECRET || "", redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || "Google didn't return a lasting permission — try again.");
  const me = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${j.access_token}` } }).then((x) => x.json()).catch(() => ({}));
  const got = (me.items || [])[0] as { id?: string; snippet?: { title?: string } } | undefined;
  if (ch.channelId && got?.id !== ch.channelId) {
    throw new Error(`That permission is for "${got?.snippet?.title || "another channel"}". Pick ${ch.name} on Google's channel list and try again.`);
  }
  await saveIntegrationToken(`youtube:${channelKey}`, j.refresh_token, { note: got?.snippet?.title || ch.name });
  return got?.snippet?.title || ch.name;
}
