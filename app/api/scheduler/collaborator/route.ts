import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getAccount, lookupCollaborator } from "@/lib/instagram";
import { safeError } from "@/lib/errors";

// Confirm an Instagram handle before it goes on a post as a collaborator.
//
//   GET ?handle=goocampusworld[&accountId=goocampus] → { match } | { match: null }
//
// Typing a username and hoping is how the old field worked: a typo was accepted,
// stored, and quietly invited nobody.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;

  const url = new URL(req.url);
  const handle = (url.searchParams.get("handle") || "").trim();
  if (handle.length < 2) return NextResponse.json({ match: null });

  const acc = getAccount(url.searchParams.get("accountId") || "goocampus");
  if (!acc) return NextResponse.json({ match: null, note: "No Instagram account configured" });

  try {
    const match = await lookupCollaborator(acc, handle);
    return NextResponse.json({ match });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't check that handle"), { status: 502 });
  }
}
