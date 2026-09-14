import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getAccount, fetchBasic, fetchAudience } from "@/lib/instagram";
import { readAudienceMonthSnapshot } from "@/lib/audience-history";

// Audience demographics. Meta's follower_demographics is "right now" only, so for a
// past range (ends before today) we serve the frozen monthly snapshot of the range's
// month instead — that's what makes "Who you reached" reflect the selected month.
// Live/current ranges (ending today) return the current audience.

const todayIso = () => new Date().toISOString().slice(0, 10);

export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const account = getAccount(accountId);
  if (!account) return NextResponse.json({ error: `Unknown account: ${accountId}` }, { status: 404 });

  // Past-range → the month's frozen audience (if we captured it).
  if (from && to && to < todayIso()) {
    const month = from.slice(0, 7);
    const snap = await readAudienceMonthSnapshot(accountId, month);
    if (snap) {
      return NextResponse.json({
        live: false,
        stored: true,
        month,
        capturedAt: snap.capturedAt,
        account: { id: account.id, label: account.label, handle: account.handle, followers: snap.followers },
        ...snap.audience,
      });
    }
  }

  try {
    const [basic, audience] = await Promise.all([
      fetchBasic(account),
      fetchAudience(account),
    ]);
    return NextResponse.json({
      live: true,
      account: { id: account.id, label: account.label, handle: account.handle, followers: basic.followers_count, following: basic.follows_count },
      ...audience,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
