import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { listAlerts, createAlert } from "@/lib/content-radar";
import { safeError } from "@/lib/errors";

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const alerts = await listAlerts();
    return NextResponse.json({ alerts });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load alerts"), { status: 502 });
  }
}

// Create an alert. Accepts EITHER:
//   { name, primaryInterest, searchQuery }  — dashboard-native topic (preferred)
//   { name, primaryInterest, feedUrl }      — Google Alerts RSS URL (advanced)
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  let body: { name?: string; primaryInterest?: string; feedUrl?: string; searchQuery?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.name || body.name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.primaryInterest || body.primaryInterest.trim().length === 0) {
    return NextResponse.json({ error: "primaryInterest is required" }, { status: 400 });
  }

  const hasQuery = typeof body.searchQuery === "string" && body.searchQuery.trim().length > 0;
  const hasFeed = typeof body.feedUrl === "string" && body.feedUrl.trim().length > 0;
  if (!hasQuery && !hasFeed) {
    return NextResponse.json({ error: "Provide either a searchQuery (topic) or a feedUrl (Google Alerts RSS)" }, { status: 400 });
  }
  if (hasFeed && !/^https:\/\/(www\.)?google\.com\/alerts\/feeds\/[^/]+\/[^/]+/.test(body.feedUrl!)) {
    return NextResponse.json({ error: "feedUrl must be a Google Alerts RSS URL (https://www.google.com/alerts/feeds/…/…)" }, { status: 400 });
  }
  if (hasQuery && body.searchQuery!.length > 300) {
    return NextResponse.json({ error: "searchQuery too long (max 300 chars)" }, { status: 400 });
  }

  try {
    const alert = await createAlert({
      name: body.name,
      primaryInterest: body.primaryInterest,
      searchQuery: hasQuery ? body.searchQuery! : undefined,
      feedUrl: hasFeed ? body.feedUrl! : undefined,
    });
    return NextResponse.json({ alert });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to save alert"), { status: 502 });
  }
}
