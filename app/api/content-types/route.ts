import { NextResponse } from "next/server";
import { isLoggedIn, getSessionIsAdmin, getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { fetchContentTypes, addContentType } from "@/lib/content-types-db";
import { bustMarketingHubCache } from "@/lib/mh-cache";

// Types of work for every type picker (lib/use-content-types.ts). Anyone signed in
// can read; only an admin can add, because a new type appears in every picker and
// decides which half of the team the work goes to.

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isLoggedIn()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ types: await fetchContentTypes() });
}

export async function POST(req: Request) {
  if (!isLoggedIn()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can add a type of work." }, { status: 403 });
  try {
    const b = (await req.json()) as { name?: string; kind?: string };
    const added = await addContentType(String(b.name || ""), String(b.kind || ""), getSessionUserId() || null);
    bustMarketingHubCache();
    return NextResponse.json({ added, types: await fetchContentTypes() });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not add the type"), { status: 400 });
  }
}
