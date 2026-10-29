import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { CHANNELS } from "@/lib/youtube-channels";
import { makeConnectToken } from "@/lib/youtube-connect";

// POST { channel } → { url } — a connect link for the channel's owner (Brands page →
// YouTube → Copy connect link). Admin only. Valid for a day.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSection("system");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can make a connect link." }, { status: 403 });
  const { channel } = (await req.json().catch(() => ({}))) as { channel?: string };
  if (!channel || !CHANNELS[channel]) return NextResponse.json({ error: "No such channel." }, { status: 404 });
  const here = new URL(req.url);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(here.origin);
  const origin = (local ? here.origin : (process.env.APP_URL || here.origin)).replace(/\/$/, "");
  return NextResponse.json({ url: `${origin}/api/auth/youtube/link?t=${encodeURIComponent(makeConnectToken(channel))}` });
}
