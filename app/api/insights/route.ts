import { NextResponse } from "next/server";
import { getBase, TABLES } from "@/lib/airtable";
import { mockInsights } from "@/lib/mock";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "acc1";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";

  const base = getBase();
  if (!base) {
    return NextResponse.json(mockInsights(accountId, from, to));
  }

  try {
    // TODO once Airtable schema is finalized:
    //   - query TABLES.snapshots where account = accountId AND date BETWEEN from..to
    //   - query TABLES.posts for the most recent post
    //   - aggregate followers/reach/engagement/profileVisits + deltas
    // For now, return mock data so the dashboard renders end-to-end.
    return NextResponse.json(mockInsights(accountId, from, to));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
