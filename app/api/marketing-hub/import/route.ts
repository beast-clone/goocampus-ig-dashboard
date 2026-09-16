import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { importFromAirtable } from "@/lib/airtable-import";
import { safeError } from "@/lib/errors";

// Pull a window of Airtable's Content Calendar into the master sheet.
//
//   POST { from, to, dryRun? } → { scanned, created, updated, skipped, errors }
//
// Manual, one way, and idempotent on Airtable's record id — press it twice and the
// second press updates rather than duplicates.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;

  try {
    const b = (await req.json().catch(() => ({}))) as { from?: string; to?: string; dryRun?: boolean };
    const from = (b.from || "").trim();
    const to = (b.to || "").trim();
    if (!DATE.test(from) || !DATE.test(to)) {
      return NextResponse.json({ error: "Pick a start and an end date." }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: "The start date is after the end date." }, { status: 400 });
    }
    // A whole year in one press is a long request and a lot of writes; the button
    // offers months, and this is the backstop for a hand-typed range.
    const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
    if (days > 400) {
      return NextResponse.json({ error: "That range is over a year. Import it a few months at a time." }, { status: 400 });
    }

    const result = await importFromAirtable({ from, to, dryRun: Boolean(b.dryRun) });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't import from Airtable"), { status: 502 });
  }
}
