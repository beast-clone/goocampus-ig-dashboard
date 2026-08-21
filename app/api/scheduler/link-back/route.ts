import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { writeBackLink, type LinkPlatform } from "@/lib/mh-linkback";

// POST /api/scheduler/link-back
// The write-back seam a publisher calls once a post is LIVE, to auto-fill the
// post's Published Links. The app-direct IG route calls writeBackLink() inline;
// n8n (FB / LinkedIn / scheduled) POSTs here after it publishes, with the
// permalink it got back from the platform.
//
// Body: { postId? , airtableRecordId? , platform: instagram|facebook|linkedin , url }
//   - postId          → mh_posts.id (dashboard-originated)
//   - airtableRecordId→ mh_posts.airtable_record_id (n8n knows the Airtable id)

const PLATFORMS = new Set(["instagram", "facebook", "linkedin"]);

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json()) as { postId?: string; airtableRecordId?: string; platform?: string; url?: string };
    if (!b.platform || !PLATFORMS.has(b.platform)) {
      return NextResponse.json({ error: "platform must be instagram | facebook | linkedin" }, { status: 400 });
    }
    if (!b.postId && !b.airtableRecordId) {
      return NextResponse.json({ error: "postId or airtableRecordId is required" }, { status: 400 });
    }
    const res = await writeBackLink({
      postId: b.postId,
      airtableRecordId: b.airtableRecordId,
      platform: b.platform as LinkPlatform,
      url: b.url || "",
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (err) {
    return NextResponse.json(safeError(err, "Link write-back failed"), { status: 502 });
  }
}
