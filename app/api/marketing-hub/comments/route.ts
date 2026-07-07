import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// POST /api/marketing-hub/comments  { postId, authorKey, body }
// Adds one comment to mh_comments. Used by the inline comments thread.

const VALID_KEYS = new Set(["manya", "praveen", "nikhil", "nandu", "maheen"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { postId?: string; authorKey?: string; body?: string };
    if (!body.postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
    if (!body.authorKey || !VALID_KEYS.has(body.authorKey)) {
      return NextResponse.json({ error: "authorKey must be one of manya|praveen|nikhil|nandu|maheen" }, { status: 400 });
    }
    if (!body.body || body.body.trim().length === 0) {
      return NextResponse.json({ error: "body required" }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { data, error } = await sb
      .from("mh_comments")
      .insert({ post_id: body.postId, author_key: body.authorKey, body: body.body.trim() })
      .select("id, author_key, body, resolved, created_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ comment: data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Comment add failed"), { status: 502 });
  }
}
