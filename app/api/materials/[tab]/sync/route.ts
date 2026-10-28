import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { canSeeTab } from "@/lib/permissions";
import { guardRate } from "@/lib/api-guard";
import { syncEbookOrders } from "@/lib/razorpay-ebooks";

// POST /api/materials/ebooks/sync → pull every eBook payment from Razorpay into the
// eBook Orders tab (lib/razorpay-ebooks.ts). Same switch as the tab itself.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { tab: string } }) {
  if (params.tab !== "ebooks") return NextResponse.json({ error: "Only eBook orders sync from Razorpay." }, { status: 404 });
  const me = await rosterById(getSessionUserId());
  if (!canSeeTab(me, "mm-ebooks")) return NextResponse.json({ error: "Your access doesn't include eBook Orders." }, { status: 403 });
  const limited = guardRate(req, "ebook-sync", 6, 600_000);
  if (limited) return limited;
  try {
    return NextResponse.json(await syncEbookOrders());
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't read Razorpay"), { status: 502 });
  }
}
