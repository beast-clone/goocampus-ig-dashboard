import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/instagram";

const GRAPH = "https://graph.facebook.com/v25.0";

// GET /api/scheduler/comments?mediaId=<ig-media-id>&accountId=goocampus
// Live comments (with nested replies) for a published IG post.
export async function GET(req: NextRequest) {
  const mediaId = req.nextUrl.searchParams.get("mediaId");
  const accountId = req.nextUrl.searchParams.get("accountId") || "goocampus";
  if (!mediaId) return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  const acct = getAccount(accountId);
  if (!acct) return NextResponse.json({ error: "unknown account" }, { status: 400 });
  try {
    const fields = "id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}";
    const url = `${GRAPH}/${mediaId}/comments?fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(acct.pageAccessToken)}`;
    const r = await fetch(url, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok || d.error) return NextResponse.json({ error: d.error?.message || `HTTP ${r.status}` }, { status: 502 });
    return NextResponse.json({ comments: d.data || [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

// POST /api/scheduler/comments  { commentId, message, accountId }
// Publishes a public reply to a comment on the account's own post.
export async function POST(req: NextRequest) {
  const { commentId, message, accountId = "goocampus" } = await req.json().catch(() => ({}));
  if (!commentId || !String(message || "").trim()) {
    return NextResponse.json({ error: "commentId and message required" }, { status: 400 });
  }
  const acct = getAccount(accountId);
  if (!acct) return NextResponse.json({ error: "unknown account" }, { status: 400 });
  try {
    const body = new URLSearchParams({ message: String(message).trim(), access_token: acct.pageAccessToken });
    const r = await fetch(`${GRAPH}/${commentId}/replies`, { method: "POST", body });
    const d = await r.json();
    if (!r.ok || d.error) return NextResponse.json({ error: d.error?.message || `HTTP ${r.status}` }, { status: 502 });
    return NextResponse.json({ ok: true, id: d.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
