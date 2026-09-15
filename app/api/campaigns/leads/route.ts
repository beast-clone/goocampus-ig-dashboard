import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getCampaign } from "@/lib/campaigns";
import { readTab, writeCells, SheetError } from "@/lib/sheets";
import { safeError } from "@/lib/errors";

// The leads of one campaign, read straight from its sheet — there is no copy.
//
//   GET  ?id=<campaign>                        → { campaign, headers, leads }
//   POST { id, rowKey, column, value }         → writes one cell back
//
// Dashboard-owned columns (Status, Notes) are ordinary columns in the sheet. If
// one doesn't exist yet it is reported as missing rather than created silently —
// adding columns to someone's sheet without asking is not ours to do.
export const dynamic = "force-dynamic";

// Which column the status dropdown edits is CHOSEN, not detected.
//
// The first cut hardcoded Confirmed/Pending/Not attending. The second tried to
// spot a status column by shape — fewest distinct values over most rows — and on
// the real sheet that picked "Have you attempted NEET PG in 2026?", a yes/no
// survey answer, over "Confirmed Attendance", which holds the four values the
// team actually uses. Editing it would have overwritten survey responses.
//
// Shape cannot tell you meaning. So the column is picked by a person, exactly as
// the key column is, and the options are whatever values already exist in it —
// no vocabulary is introduced into someone's sheet.
function optionsIn(rows: Record<string, string>[], column: string): string[] {
  const freq = new Map<string, number>();
  for (const r of rows) {
    const v = (r[column] || "").trim();
    if (v) freq.set(v, (freq.get(v) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ error: "No such campaign" }, { status: 404 });

    const { headers, rows } = await readTab(campaign.spreadsheetId, campaign.tab);

    // Row 1 is the header, so a lead on sheet row N is rows[N-2]. Carried through
    // so a write lands on the same line a person is looking at.
    const leads = rows.map((r, i) => ({
      rowKey: (r[campaign.keyColumn] || "").trim(),
      sheetRow: i + 2,
      fields: r,
    }));

    const statusCol = campaign.statusColumn && headers.includes(campaign.statusColumn) ? campaign.statusColumn : null;
    const notesCol = campaign.notesColumn && headers.includes(campaign.notesColumn) ? campaign.notesColumn : null;
    return NextResponse.json({
      campaign,
      headers,
      leads,
      writable: {
        status: statusCol,
        notes: notesCol,
        options: statusCol
          ? optionsIn(rows, statusCol).filter((o) => !(campaign.hiddenStatuses || []).includes(o))
          : [],
      },
    });
  } catch (err) {
    if (err instanceof SheetError) return NextResponse.json({ error: err.message, kind: err.kind }, { status: 200 });
    return NextResponse.json(safeError(err, "Couldn't read the campaign's sheet"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const b = (await req.json().catch(() => ({}))) as { id?: string; rowKey?: string; column?: string; value?: string };
    const campaign = await getCampaign(b.id || "");
    if (!campaign) return NextResponse.json({ error: "No such campaign" }, { status: 404 });
    if (!b.column) return NextResponse.json({ error: "column required" }, { status: 400 });

    // Re-read before writing, and find the row by its key rather than trusting a
    // row number the browser has been holding. Someone may have sorted or
    // inserted rows since the page loaded, and writing to a remembered position
    // would overwrite a stranger's line.
    const { headers, rows } = await readTab(campaign.spreadsheetId, campaign.tab);
    const colIndex = headers.indexOf(b.column);
    if (colIndex < 0) {
      return NextResponse.json({ error: `The sheet has no “${b.column}” column. Add one and try again.` }, { status: 200 });
    }

    const idx = rows.findIndex((r) => (r[campaign.keyColumn] || "").trim() === (b.rowKey || "").trim());
    if (idx < 0) {
      return NextResponse.json({
        error: `That row is no longer in the sheet under ${campaign.keyColumn} “${b.rowKey}”. Someone may have changed or removed it — reload to see the sheet as it is now.`,
      }, { status: 200 });
    }

    await writeCells(campaign.spreadsheetId, [
      { tab: campaign.tab, row: idx + 2, column: colIndex, value: b.value ?? "" },
    ]);
    return NextResponse.json({ ok: true, sheetRow: idx + 2 });
  } catch (err) {
    if (err instanceof SheetError) return NextResponse.json({ error: err.message, kind: err.kind }, { status: 200 });
    return NextResponse.json(safeError(err, "Couldn't write to the sheet"), { status: 502 });
  }
}
