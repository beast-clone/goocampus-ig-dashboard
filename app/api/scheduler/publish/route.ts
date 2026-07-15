import { NextResponse } from "next/server";
import { getAccount } from "@/lib/instagram";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// POST /api/scheduler/publish  — app-direct Instagram publish (image).
// Body: { accountId, imageUrl, caption }  OR  { postId }  (pulls media/caption/
// account from the mh_posts row and marks it published on success).
//
// ⚠️ THIS PUBLISHES A REAL POST to the target Instagram account. Only call it
// deliberately. Video/Reels + scheduled posts are the n8n worker's job (not here).

const GRAPH = "https://graph.facebook.com/v25.0";

function accountIdForPage(page: string): string | null {
  if (/india|12th|12plus/i.test(page)) return "12thplusdotcom";
  if (/world/i.test(page)) return "goocampusworld";
  if (/main|goocampus/i.test(page)) return "goocampus";
  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { accountId?: string; imageUrl?: string; caption?: string; postId?: string };
    let { accountId, imageUrl, caption } = body;
    const { postId } = body;
    const sb = getSupabase();

    if (postId && sb) {
      const { data, error } = await sb.from("mh_posts").select("media_urls, caption, publish_to_pages").eq("id", postId).single();
      if (error) throw new Error(error.message);
      imageUrl = imageUrl || (data.media_urls as string[] | null)?.[0];
      caption = caption ?? data.caption ?? "";
      const page = (data.publish_to_pages as string[] | null)?.[0];
      accountId = accountId || (page ? accountIdForPage(page) || undefined : undefined);
    }
    if (!accountId) return NextResponse.json({ error: "accountId (or a post with a target page) is required" }, { status: 400 });
    if (!imageUrl) return NextResponse.json({ error: "no media to publish (imageUrl / media_urls is empty)" }, { status: 400 });

    const acc = getAccount(accountId);
    if (!acc) return NextResponse.json({ error: `unknown account "${accountId}"` }, { status: 400 });

    const tok = encodeURIComponent(acc.pageAccessToken);

    // 1) create the media container
    const createUrl = `${GRAPH}/${acc.igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption || "")}&access_token=${tok}`;
    const createRes = await fetch(createUrl, { method: "POST" });
    const created = await createRes.json();
    if (!createRes.ok || created.error) {
      return NextResponse.json({ error: `container step failed: ${created.error?.message || createRes.status}`, meta: created.error }, { status: 502 });
    }
    const creationId = created.id as string;

    // 2) publish the container
    const pubUrl = `${GRAPH}/${acc.igUserId}/media_publish?creation_id=${encodeURIComponent(creationId)}&access_token=${tok}`;
    const pubRes = await fetch(pubUrl, { method: "POST" });
    const published = await pubRes.json();
    if (!pubRes.ok || published.error) {
      return NextResponse.json({ error: `publish step failed: ${published.error?.message || pubRes.status}`, meta: published.error }, { status: 502 });
    }
    const mediaId = published.id as string;

    // 3) fetch the permalink
    let permalink: string | null = null;
    try {
      const permRes = await fetch(`${GRAPH}/${mediaId}?fields=permalink&access_token=${tok}`);
      const perm = await permRes.json();
      permalink = perm.permalink || null;
    } catch { /* permalink is best-effort */ }

    // 4) mark the row published
    if (postId && sb) {
      await sb.from("mh_posts").update({
        publish_status: "published",
        instagram_url: permalink,
        published_at: new Date().toISOString(),
      }).eq("id", postId);
    }

    return NextResponse.json({ ok: true, account: acc.handle, mediaId, permalink });
  } catch (err) {
    return NextResponse.json(safeError(err, "Publish failed"), { status: 502 });
  }
}
