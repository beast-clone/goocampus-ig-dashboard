import { NextResponse } from "next/server";
import { getAccount, fetchBasic, fetchAudience } from "@/lib/instagram";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const account = getAccount(accountId);
  if (!account) return NextResponse.json({ error: `Unknown account: ${accountId}` }, { status: 404 });

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
