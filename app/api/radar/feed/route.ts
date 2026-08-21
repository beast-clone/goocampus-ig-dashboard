import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { listItems } from "@/lib/content-radar";
import { safeError } from "@/lib/errors";

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const interest = url.searchParams.get("interest") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "200", 10);
  try {
    const items = await listItems({ interest, limit: Number.isFinite(limit) ? Math.min(limit, 500) : 200 });
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load feed"), { status: 502 });
  }
}
