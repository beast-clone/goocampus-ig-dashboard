import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { listSpreadsheets, SERVICE_ACCOUNT_EMAIL } from "@/lib/drive";
import { SheetError } from "@/lib/sheets";
import { safeError } from "@/lib/errors";

// The spreadsheets already shared with the dashboard, so a campaign can be
// started from a list instead of a pasted URL.
//
//   GET → { sheets, serviceAccount } | { error, kind }
//
// Editable ones first: a sheet the dashboard can only read is one where every
// status change will be refused later, so it is worth seeing that up front.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const sheets = await listSpreadsheets();
    sheets.sort((a, b) => Number(b.canEdit) - Number(a.canEdit));
    return NextResponse.json({ sheets, serviceAccount: SERVICE_ACCOUNT_EMAIL });
  } catch (err) {
    if (err instanceof SheetError) {
      return NextResponse.json({ error: err.message, kind: err.kind, sheets: [] }, { status: 200 });
    }
    return NextResponse.json(safeError(err, "Couldn't list your sheets"), { status: 502 });
  }
}
