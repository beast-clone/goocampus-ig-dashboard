import { NextResponse } from "next/server";
import { fetchRedditThread, hasRedditAuth } from "@/lib/reddit";
import { safeError } from "@/lib/errors";

// GET /api/radar/reddit-thread?url=<reddit thread url>
// Full public thread + top comments via Reddit's official API (app-only OAuth).
// Returns { needsAuth: true } (200) when no Reddit app is configured, so the
// reader can fall back to the snippet gracefully instead of erroring.
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") || "";
  if (!url) return NextResponse.json({ error: "url query param required" }, { status: 400 });
  if (!hasRedditAuth()) return NextResponse.json({ needsAuth: true }, { status: 200 });
  try {
    const thread = await fetchRedditThread(url);
    return NextResponse.json(thread);
  } catch (err) {
    return NextResponse.json(safeError(err, "Reddit thread fetch failed"), { status: 502 });
  }
}
