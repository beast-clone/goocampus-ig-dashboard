import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { countInboundDMs } from "@/lib/dm";

// GET /api/dm/count?account=goocampus&from=YYYY-MM-DD&to=YYYY-MM-DD
// Inbound DMs recorded in the range. Reflects only DMs mirrored into /api/dm/mirror,
// so it reads real numbers once that pipe is live (near-0 until then).
export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;

  const url = new URL(req.url);
  const account = url.searchParams.get("account") || url.searchParams.get("accountId") || undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to are required" }, { status: 400 });

  try {
    const count = await countInboundDMs(account, from, to);
    return NextResponse.json({ count, account: account ?? null, from, to });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
