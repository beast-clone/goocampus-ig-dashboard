import { NextResponse } from "next/server";
import { requireSection, requireCapability } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { writeBackLink } from "@/lib/mh-linkback";
import { publishToPages } from "@/lib/linkedin-publish";

// POST /api/scheduler/publish-linkedin — publish NOW to a GooCampus LinkedIn PAGE.
// Body: { page, text, imageUrl? }   (page = "goocampus" | "world")
//   OR: { postId }  — pulls caption/media/target pages from the mh_posts row.
//
// ⚠️ THIS PUBLISHES A REAL PUBLIC POST. Scheduled posts go through the LinkedIn
// scheduler (/api/scheduler/linkedin) + cron worker instead. Requires a token with
// `w_organization_social`.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  // Publishing is the most expensive action in the product: it is public,
  // immediate and not really undoable. The "content" section alone is held by
  // the Designer, Video-editor and Content-writer presets, i.e. everyone who
  // can open the tab — so section access was deciding who could post to the
  // brand accounts. approve_content exists precisely to separate "can work on
  // a task" from "can ship it". Admins pass automatically, so this changes
  // nothing until a non-admin account exists, which is when it should bite.
  const __noCap = await requireCapability("approve_content");
  if (__noCap) return __noCap;

  try {
    const body = (await req.json()) as { page?: string; text?: string; imageUrl?: string; postId?: string };
    let { page, text, imageUrl } = body;
    const { postId } = body;
    const sb = getSupabase();

    let pages: string[] = page ? [page] : [];
    if (postId && sb) {
      const { data, error } = await sb.from("mh_posts").select("caption, media_urls, publish_to_pages").eq("id", postId).single();
      if (error) throw new Error(error.message);
      text = text ?? data.caption ?? "";
      imageUrl = imageUrl || (data.media_urls as string[] | null)?.[0];
      if (!pages.length) {
        pages = ((data.publish_to_pages as string[] | null) || []).filter((p) => /linkedin/i.test(p));
        if (!pages.length) pages = ["goocampus"];
      }
    }

    if (!pages.length) return NextResponse.json({ error: "page is required (goocampus | world)" }, { status: 400 });
    if (!text && !imageUrl) return NextResponse.json({ error: "nothing to post (text or imageUrl required)" }, { status: 400 });

    const results = await publishToPages(pages, text || "", imageUrl);
    const ok = results.filter((r) => r.ok);

    if (postId && sb && ok.length) {
      await sb.from("mh_posts").update({ publish_status: "published" }).eq("id", postId);
      const first = ok.find((r) => r.ok && r.permalink);
      if (first && first.ok && first.permalink) await writeBackLink({ postId, platform: "linkedin", url: first.permalink });
    }

    if (!ok.length) return NextResponse.json({ error: `publish failed: ${results.map((r) => (r.ok ? "" : r.error)).filter(Boolean).join("; ")}`, results }, { status: 502 });
    return NextResponse.json({ ok: true, published: ok.length, results });
  } catch (err) {
    return NextResponse.json(safeError(err, "LinkedIn publish failed"), { status: 502 });
  }
}
