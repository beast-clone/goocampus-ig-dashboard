import { NextRequest, NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { fetchContentCalendarBody, extractCaptionFromContent } from "@/lib/content-calendar";

// Returns the ready-to-post caption for a Content Calendar record — pulled live
// from the Airtable "Content" field's "Caption:" section (mh_posts doesn't mirror it).
export async function GET(req: NextRequest) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const recordId = req.nextUrl.searchParams.get("recordId");
  if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });
  try {
    const { content } = await fetchContentCalendarBody(recordId);
    return NextResponse.json({ caption: extractCaptionFromContent(content) });
  } catch (e) {
    return NextResponse.json({ caption: "", error: (e as Error).message });
  }
}
