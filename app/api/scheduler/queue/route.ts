import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { fetchScheduledQueueFromSupabase } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

// Never cache — the queue must reflect the latest enqueue/publish writes immediately.
export const dynamic = "force-dynamic";

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const posts = await fetchScheduledQueueFromSupabase(100);
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load queue"), { status: 502 });
  }
}
