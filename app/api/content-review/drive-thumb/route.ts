import { NextRequest, NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";

// The thumbnail of a shared Google Drive file, fetched server-side. Creatives handed
// in as Drive links (the speaking reels) have no file here, so Content Review shows
// Drive's own thumbnail. Loaded straight from the browser, Drive answers 503 for a
// signed-in Chrome; fetched from here, with no Google cookies, it serves the image.
export async function GET(req: NextRequest) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[\w-]{20,}$/.test(id)) return NextResponse.json({ error: "Bad file id" }, { status: 400 });
  try {
    const r = await fetch(`https://lh3.googleusercontent.com/d/${id}=w800`, { redirect: "follow" });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) return new NextResponse(null, { status: 404 });
    return new NextResponse(await r.arrayBuffer(), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
