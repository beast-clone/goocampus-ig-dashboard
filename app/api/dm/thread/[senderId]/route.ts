import { NextResponse } from "next/server";
import { getThread, listMessages, markThreadRead, peekQueuedReply } from "@/lib/dm";

// GET /api/dm/thread/{senderId}?account=goocampus  → one thread + messages
export async function GET(req: Request, { params }: { params: Promise<{ senderId: string }> }) {
  const { senderId } = await params;
  const url = new URL(req.url);
  const account = url.searchParams.get("account") || "";
  if (!account || !senderId) return NextResponse.json({ error: "Missing account / senderId" }, { status: 400 });

  const thread = await getThread(account, senderId);
  if (!thread) return NextResponse.json({ thread: null, messages: [], queued: null });

  const [messages, queued] = await Promise.all([
    listMessages(account, senderId, 200),
    peekQueuedReply(account, senderId),
  ]);
  // Opening the thread clears unread
  await markThreadRead(account, senderId);
  return NextResponse.json({ thread, messages, queued });
}
