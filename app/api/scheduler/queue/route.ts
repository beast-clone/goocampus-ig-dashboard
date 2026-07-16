import { NextResponse } from "next/server";
import { fetchScheduledQueueFromSupabase } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

// Never cache — the queue must reflect the latest enqueue/publish writes immediately.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const posts = await fetchScheduledQueueFromSupabase(100);
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load queue"), { status: 502 });
  }
}
