import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getCampaign, saveCampaign } from "@/lib/campaigns";
import { readTab, writeCells, SheetError } from "@/lib/sheets";
import { safeError } from "@/lib/errors";

// Adds a column to the campaign's sheet and points a dashboard field at it.
//
//   POST { id, use: "status" | "notes", name } → { ok, name }
//
// This exists because the alternative is worse. A sheet filled in at an event
// has no Notes column, so the only columns on offer are ones that already hold
// answers — and pointing Notes at one of those overwrites them the first time
// somebody types. A new column at the end touches nothing that is already there.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;

  try {
    const b = (await req.json().catch(() => ({}))) as { id?: string; use?: string; name?: string };
    const campaign = await getCampaign(b.id || "");
    if (!campaign) return NextResponse.json({ error: "No such campaign" }, { status: 404 });

    // "none" adds the column and maps it to nothing — it shows up read-only
    // beside the lead like every other column in the sheet.
    const use = b.use === "status" ? "statusColumn"
      : b.use === "notes" ? "notesColumn"
      : b.use === "community" ? "communityColumn"
      : b.use === "none" ? null
      : undefined;
    if (use === undefined) return NextResponse.json({ error: "use must be status, notes, community or none" }, { status: 400 });

    const name = (b.name || "").trim();
    if (!name) return NextResponse.json({ error: "Give the column a name" }, { status: 400 });

    const { headers } = await readTab(campaign.spreadsheetId, campaign.tab);

    // Already there under that name: point at it rather than making a second one.
    if (!headers.includes(name)) {
      // Google drops trailing empty cells, so the header row's length IS the first
      // free column.
      await writeCells(campaign.spreadsheetId, [
        { tab: campaign.tab, row: 1, column: headers.length, value: name },
      ]);
    }

    if (use) {
      const saved = await saveCampaign({ ...campaign, [use]: name });
      if (!saved) return NextResponse.json({ error: "Added the column, but couldn't remember it here." }, { status: 200 });
    }

    return NextResponse.json({ ok: true, name });
  } catch (err) {
    if (err instanceof SheetError) return NextResponse.json({ error: err.message, kind: err.kind }, { status: 200 });
    return NextResponse.json(safeError(err, "Couldn't add the column"), { status: 502 });
  }
}
