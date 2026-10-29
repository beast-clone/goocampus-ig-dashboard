import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { canSeeTab } from "@/lib/permissions";
import { ebookTitles, addEbookTitle, removeEbookTitle } from "@/lib/razorpay-ebooks";

// GET /api/materials/ebooks/titles → every e-Book (built-in + added on the page).
// POST { name } → add a new e-Book (or bring a removed one back).
// DELETE { name } → remove an e-Book that has no orders. Same switch as the e-Book Orders tab.
export const dynamic = "force-dynamic";

async function guard(tab: string) {
  if (tab !== "ebooks") return NextResponse.json({ error: "Only e-Book Orders has a list of e-Books." }, { status: 404 });
  const me = await rosterById(getSessionUserId());
  if (!canSeeTab(me, "mm-ebooks")) return NextResponse.json({ error: "Your access doesn't include e-Book Orders." }, { status: 403 });
  return null;
}

export async function GET(_req: Request, { params }: { params: { tab: string } }) {
  const no = await guard(params.tab);
  if (no) return no;
  return NextResponse.json({ titles: await ebookTitles() });
}

export async function POST(req: Request, { params }: { params: { tab: string } }) {
  const no = await guard(params.tab);
  if (no) return no;
  try {
    const { name } = (await req.json()) as { name?: string };
    return NextResponse.json({ titles: await addEbookTitle(String(name || ""), getSessionUserId()) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't add the e-Book"), { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: { tab: string } }) {
  const no = await guard(params.tab);
  if (no) return no;
  try {
    const { name } = (await req.json()) as { name?: string };
    return NextResponse.json({ titles: await removeEbookTitle(String(name || ""), getSessionUserId()) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't remove the e-Book"), { status: 400 });
  }
}
