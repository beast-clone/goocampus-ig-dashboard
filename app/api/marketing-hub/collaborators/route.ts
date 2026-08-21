import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { requireCapability, requireSection } from "@/lib/api-guard";

// Simple CRUD on mh_post_collaborators for the Team pills in the detail panel.
//   POST   /api/marketing-hub/collaborators  { postId, memberKey }
//   POST   /api/marketing-hub/collaborators  { postId, memberKeys: [...] }   // bulk
//   DELETE /api/marketing-hub/collaborators?postId=<uuid>&memberKey=<key>

const VALID_KEYS = new Set(["manya", "praveen", "nikhil", "nandu", "maheen"]);

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const denied = await requireCapability("edit_tasks");
    if (denied) return denied;

    const body = (await req.json()) as { postId?: string; memberKey?: string; memberKeys?: string[] };
    if (!body.postId) return NextResponse.json({ error: "postId required" }, { status: 400 });

    const keys = body.memberKeys && body.memberKeys.length > 0
      ? body.memberKeys.filter((k) => VALID_KEYS.has(k))
      : body.memberKey && VALID_KEYS.has(body.memberKey) ? [body.memberKey] : [];

    if (keys.length === 0) return NextResponse.json({ error: "memberKey(s) required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const rows = keys.map((k) => ({ post_id: body.postId!, member_key: k }));
    // upsert-style: ignore duplicates (composite PK on post_id+member_key handles it)
    const { data, error } = await sb
      .from("mh_post_collaborators")
      .upsert(rows, { onConflict: "post_id,member_key", ignoreDuplicates: true })
      .select("member_key, added_at");

    if (error) throw new Error(error.message);
    return NextResponse.json({ added: data || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Add collaborator failed"), { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const denied = await requireCapability("edit_tasks");
    if (denied) return denied;

    const url = new URL(req.url);
    const postId = url.searchParams.get("postId");
    const memberKey = url.searchParams.get("memberKey");
    if (!postId || !memberKey) return NextResponse.json({ error: "postId + memberKey required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { error } = await sb.from("mh_post_collaborators").delete().eq("post_id", postId).eq("member_key", memberKey);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Remove collaborator failed"), { status: 502 });
  }
}
