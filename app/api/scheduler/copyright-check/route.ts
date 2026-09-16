import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getAccount } from "@/lib/instagram";
import { resolveAccountForPage } from "@/lib/scheduler-helpers";
import { startCopyrightCheck, readCopyrightCheck } from "@/lib/copyright-check";
import { safeError } from "@/lib/errors";

// Ask Instagram whether a video will trip a copyright match, before it is scheduled.
//
//   POST { videoUrl, page? } → { containerId }
//   GET  ?containerId=…&page=… → { state, message? }
//
// Split in two because the answer takes a minute and a request that waits for it
// would outlive the serverless timeout.
export const dynamic = "force-dynamic";

// The rights match is the same whichever Page publishes it, so an unpicked page just
// falls back to the main account rather than refusing to check.
function account(page: string | null) {
  return (page && resolveAccountForPage(page)) || getAccount("goocampus");
}

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;

  try {
    const b = (await req.json().catch(() => ({}))) as { videoUrl?: string; page?: string };
    const videoUrl = (b.videoUrl || "").trim();
    if (!/^https?:\/\//.test(videoUrl)) {
      return NextResponse.json({ error: "A video URL is required." }, { status: 400 });
    }
    const acc = account(b.page || null);
    if (!acc) return NextResponse.json({ error: "No Instagram account configured." }, { status: 400 });

    return NextResponse.json({ containerId: await startCopyrightCheck(acc, videoUrl) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't start the copyright check"), { status: 502 });
  }
}

export async function GET(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;

  const url = new URL(req.url);
  const containerId = (url.searchParams.get("containerId") || "").trim();
  if (!containerId) return NextResponse.json({ error: "containerId is required." }, { status: 400 });

  const acc = account(url.searchParams.get("page"));
  if (!acc) return NextResponse.json({ error: "No Instagram account configured." }, { status: 400 });

  try {
    return NextResponse.json(await readCopyrightCheck(acc, containerId));
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't read the copyright check"), { status: 502 });
  }
}
