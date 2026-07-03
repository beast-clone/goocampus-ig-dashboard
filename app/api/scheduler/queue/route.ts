import { NextResponse } from "next/server";
import { fetchScheduledPosts } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

export async function GET() {
  try {
    const posts = await fetchScheduledPosts(100);
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load queue"), { status: 502 });
  }
}
