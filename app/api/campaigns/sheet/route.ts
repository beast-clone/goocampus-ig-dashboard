import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { spreadsheetIdFrom, listTabs, readTab, SheetError } from "@/lib/sheets";
import { safeError } from "@/lib/errors";

// Looks inside a sheet so a campaign can be set up against what is really there.
//
//   POST { url }        → { spreadsheetId, title, tabs }
//   POST { url, tab }   → { headers, rowCount, sample, duplicates }
//
// Nothing is stored by either call. Errors come back as plain instructions —
// "share it with this address" rather than "403" — because the fix is always
// something the person reading it can do.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as { url?: string; tab?: string; keyColumn?: string };
    const id = spreadsheetIdFrom(body.url || "");
    if (!id) {
      return NextResponse.json({ error: "That doesn't look like a Google Sheets link. Paste the whole URL from the address bar." }, { status: 400 });
    }

    if (!body.tab) {
      const { title, tabs } = await listTabs(id);
      return NextResponse.json({ spreadsheetId: id, title, tabs });
    }

    const { headers, rows } = await readTab(id, body.tab);

    // Duplicate check on the chosen key column. A repeated value means an update
    // could land on the wrong person's row, so it is refused at setup rather
    // than discovered after someone's status has been overwritten.
    let duplicates: { value: string; count: number }[] = [];
    if (body.keyColumn && headers.includes(body.keyColumn)) {
      const seen = new Map<string, number>();
      for (const r of rows) {
        const v = (r[body.keyColumn] || "").trim();
        if (v) seen.set(v, (seen.get(v) || 0) + 1);
      }
      duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([value, count]) => ({ value, count })).slice(0, 20);
    }

    return NextResponse.json({
      spreadsheetId: id,
      tab: body.tab,
      headers,
      rowCount: rows.length,
      sample: rows.slice(0, 3),
      duplicates,
    });
  } catch (err) {
    if (err instanceof SheetError) {
      return NextResponse.json({ error: err.message, kind: err.kind }, { status: 200 });
    }
    return NextResponse.json(safeError(err, "Couldn't read that sheet"), { status: 502 });
  }
}
