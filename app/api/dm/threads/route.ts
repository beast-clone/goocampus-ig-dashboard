// Dashboard reads this to populate the DM threads list.
import { NextResponse } from "next/server";
import { listThreads } from "@/lib/dm";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const account = url.searchParams.get("account") || undefined;
  const threads = await listThreads(account);
  // Sort newest first
  threads.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  return NextResponse.json({
    threads,
    counts: {
      total: threads.length,
      unread: threads.reduce((s, t) => s + (t.unread_count || 0), 0),
      human_mode: threads.filter((t) => t.mode === "human").length,
    },
  });
}
