import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { canSeeTab } from "@/lib/permissions";
import { guardRate } from "@/lib/api-guard";
import { syncEbookOrders, lookupEbookPage, ebookTitles, addEbookTitle } from "@/lib/razorpay-ebooks";

// POST /api/materials/ebooks/sync → pull eBook payments from Razorpay into the
// eBook Orders tab (lib/razorpay-ebooks.ts). Same switch as the tab itself.
//   { link }                → look the payment page up (nothing saved)
//   { ebook, link? }        → sync that one eBook (added to the list if new)
//   {}                      → sync every eBook
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { tab: string } }) {
  if (params.tab !== "ebooks") return NextResponse.json({ error: "Only eBook orders sync from Razorpay." }, { status: 404 });
  const me = await rosterById(getSessionUserId());
  if (!canSeeTab(me, "mm-ebooks")) return NextResponse.json({ error: "Your access doesn't include eBook Orders." }, { status: 403 });
  const limited = guardRate(req, "ebook-sync", 20, 600_000);
  if (limited) return limited;
  try {
    const b = (await req.json().catch(() => ({}))) as { link?: string; ebook?: string };
    if (b.link && !b.ebook) return NextResponse.json({ page: await lookupEbookPage(b.link) });
    if (b.ebook) {
      const name = b.ebook.replace(/\s+/g, " ").trim();
      const have = await ebookTitles();
      const known = have.find((t) => t.toLowerCase() === name.toLowerCase());
      const ebook = known || name;
      const titles = known ? have : await addEbookTitle(name, getSessionUserId());
      const page = b.link ? await lookupEbookPage(b.link) : null;
      return NextResponse.json({ ...(await syncEbookOrders(ebook)), ebook, titles, page });
    }
    return NextResponse.json(await syncEbookOrders());
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't read Razorpay"), { status: 502 });
  }
}
