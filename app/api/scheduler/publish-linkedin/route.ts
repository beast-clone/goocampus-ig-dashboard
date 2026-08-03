import { NextResponse } from "next/server";
import { linkedinToken } from "@/lib/linkedin";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { writeBackLink } from "@/lib/mh-linkback";

// POST /api/scheduler/publish-linkedin — publish a post to a GooCampus LinkedIn PAGE.
// Body: { page, text, imageUrl? }   (page = "goocampus" | "world")
//   OR: { postId }  — pulls caption/media/target pages from the mh_posts row and
//                     marks it published on success.
//
// ⚠️ THIS PUBLISHES A REAL PUBLIC POST to the company page. Only call deliberately.
// Requires an access token with `w_organization_social` (see lib/linkedin.ts).

const REST = "https://api.linkedin.com/rest";
const VERSION = process.env.LINKEDIN_VERSION || "202607";

function jsonHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

// Map a page label/key to the org URN we hold in env.
function orgUrnFor(page: string): string | null {
  const p = (page || "").toLowerCase();
  if (/world/.test(p)) return process.env.LINKEDIN_ORG_URN_GCWORLD || null;
  if (/goocampus|main|edu|india|12th/.test(p)) return process.env.LINKEDIN_ORG_URN_GOOCAMPUS || null;
  return null;
}

// Register + upload an image, returning its urn:li:image:... for use in a post.
async function uploadImage(token: string, orgUrn: string, imageUrl: string): Promise<string> {
  const initRes = await fetch(`${REST}/images?action=initializeUpload`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner: orgUrn } }),
  });
  const init = await initRes.json();
  if (!initRes.ok) throw new Error(`image init ${initRes.status}: ${JSON.stringify(init).slice(0, 200)}`);
  const uploadUrl: string = init.value?.uploadUrl;
  const imageUrn: string = init.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("image init returned no uploadUrl/urn");

  const src = await fetch(imageUrl);
  if (!src.ok) throw new Error(`could not fetch source image (${src.status})`);
  const bytes = Buffer.from(await src.arrayBuffer());

  const up = await fetch(uploadUrl, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: bytes });
  if (!up.ok) throw new Error(`image upload failed (${up.status})`);
  return imageUrn;
}

// Publish one post to one org page. Returns the new post URN.
async function publishToOrg(token: string, orgUrn: string, text: string, imageUrl?: string | null): Promise<string> {
  const body: Record<string, unknown> = {
    author: orgUrn,
    commentary: text || "",
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (imageUrl) {
    const imageUrn = await uploadImage(token, orgUrn, imageUrl);
    body.content = { media: { id: imageUrn } };
  }
  const r = await fetch(`${REST}/posts`, { method: "POST", headers: jsonHeaders(token), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`post ${r.status}: ${(await r.text()).slice(0, 250)}`);
  // LinkedIn returns the created post URN in the x-restli-id header.
  return r.headers.get("x-restli-id") || r.headers.get("x-linkedin-id") || "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { page?: string; text?: string; imageUrl?: string; postId?: string };
    const token = await linkedinToken();
    if (!token) return NextResponse.json({ error: "LinkedIn not connected (no access token)" }, { status: 500 });

    let { page, text, imageUrl } = body;
    const { postId } = body;
    const sb = getSupabase();

    // Resolve from an mh_posts row when a postId is given (scheduler / hand-off flow).
    let targets: string[] = page ? [page] : [];
    if (postId && sb) {
      const { data, error } = await sb.from("mh_posts").select("caption, media_urls, publish_to_pages").eq("id", postId).single();
      if (error) throw new Error(error.message);
      text = text ?? data.caption ?? "";
      imageUrl = imageUrl || (data.media_urls as string[] | null)?.[0];
      if (!targets.length) {
        // Only the LinkedIn pages among the post's selected pages.
        targets = ((data.publish_to_pages as string[] | null) || []).filter((p) => /linkedin/i.test(p));
        if (!targets.length) targets = ["goocampus"]; // default to the main page
      }
    }

    if (!targets.length) return NextResponse.json({ error: "page is required (goocampus | world)" }, { status: 400 });
    if (!text && !imageUrl) return NextResponse.json({ error: "nothing to post (text or imageUrl required)" }, { status: 400 });

    const results = [];
    for (const t of targets) {
      const orgUrn = orgUrnFor(t);
      if (!orgUrn) { results.push({ page: t, ok: false as const, error: `unknown page "${t}"` }); continue; }
      try {
        const postUrn = await publishToOrg(token, orgUrn, text || "", imageUrl);
        const permalink = postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : null;
        results.push({ page: t, ok: true as const, orgUrn, postUrn, permalink });
      } catch (e) {
        results.push({ page: t, ok: false as const, error: (e as Error).message });
      }
    }

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
