import { NextResponse } from "next/server";
import { createContentCalendarRow, type CreatePostInput } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

const ALLOWED_PUBLISH_TO = new Set(["Facebook", "Instagram", "Instagram/Facebook"] as const);
const ALLOWED_PUBLISH_TO_PAGE = new Set([
  "GooCampus Main",
  "GooCampus World",
  "12Plus / GC India",
] as const);

export async function POST(req: Request) {
  let body: Partial<CreatePostInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate
  if (!body.particulars || typeof body.particulars !== "string" || body.particulars.length > 200) {
    return NextResponse.json({ error: "particulars required, max 200 chars" }, { status: 400 });
  }
  if (!body.caption || typeof body.caption !== "string" || body.caption.length > 2200) {
    return NextResponse.json({ error: "caption required, max 2200 chars" }, { status: 400 });
  }
  if (!body.publishTo || !ALLOWED_PUBLISH_TO.has(body.publishTo as never)) {
    return NextResponse.json({ error: "publishTo must be Facebook | Instagram | Instagram/Facebook" }, { status: 400 });
  }
  if (!body.publishToPage || !ALLOWED_PUBLISH_TO_PAGE.has(body.publishToPage as never)) {
    return NextResponse.json({ error: "publishToPage must be GooCampus Main | GooCampus World | 12Plus / GC India" }, { status: 400 });
  }
  const mediaUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)) : [];
  if (mediaUrls.length === 0) {
    return NextResponse.json({ error: "At least one media URL is required" }, { status: 400 });
  }
  if (mediaUrls.length > 10) {
    return NextResponse.json({ error: "Max 10 media items per post" }, { status: 400 });
  }
  if (body.scheduleTimeISO && Number.isNaN(Date.parse(body.scheduleTimeISO))) {
    return NextResponse.json({ error: "scheduleTimeISO must be a valid ISO datetime" }, { status: 400 });
  }

  try {
    const row = await createContentCalendarRow({
      particulars: body.particulars,
      publishTo: body.publishTo as CreatePostInput["publishTo"],
      publishToPage: body.publishToPage as CreatePostInput["publishToPage"],
      caption: body.caption,
      mediaUrls,
      scheduleTimeISO: body.scheduleTimeISO,
      sbu: typeof body.sbu === "string" ? body.sbu : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
    });
    return NextResponse.json({ ok: true, recordId: row.id, createdAt: row.createdTime });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to schedule post"), { status: 502 });
  }
}
