import { NextResponse } from "next/server";
import { listAlerts, createAlert } from "@/lib/content-radar";
import { safeError } from "@/lib/errors";

export async function GET() {
  try {
    const alerts = await listAlerts();
    return NextResponse.json({ alerts });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load alerts"), { status: 502 });
  }
}

export async function POST(req: Request) {
  let body: { name?: string; primaryInterest?: string; feedUrl?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.name || body.name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.primaryInterest || body.primaryInterest.trim().length === 0) {
    return NextResponse.json({ error: "primaryInterest is required" }, { status: 400 });
  }
  if (!body.feedUrl || !/^https:\/\/(www\.)?google\.com\/alerts\/feeds\/[^/]+\/[^/]+/.test(body.feedUrl)) {
    return NextResponse.json({ error: "feedUrl must be a Google Alerts RSS URL (https://www.google.com/alerts/feeds/…/…)" }, { status: 400 });
  }

  try {
    const alert = await createAlert({ name: body.name, primaryInterest: body.primaryInterest, feedUrl: body.feedUrl });
    return NextResponse.json({ alert });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to save alert"), { status: 502 });
  }
}
