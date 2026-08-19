import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getAssignmentBoard, type AssignmentBoard } from "@/lib/lead-assignment";

// GET /api/leads-crm/assignments?from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=day|week&active=1
//
// The assignment tracker: who holds which leads, how the day/week split looks,
// and which leads landed on a counsellor who was on leave. Read-only.
//
// Cached for 15 min per {from|to|bucket|active} — this fans out to four Airtable
// tables and the numbers only move when the round-robin runs.

const CACHE = new Map<string, { at: number; payload: AssignmentBoard }>();
const TTL_MS = 15 * 60 * 1000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  // Same lead PII (names + mobile numbers) as the rest of /api/leads-crm.
  const denied = await requireSection("sales");
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const bucket = url.searchParams.get("bucket") === "week" ? "week" : "day";
    const activeOnly = url.searchParams.get("active") === "1";
    const force = url.searchParams.get("force") === "1";

    if (!DATE.test(from) || !DATE.test(to)) {
      return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: "from must not be after to" }, { status: 400 });
    }

    const key = `${from}|${to}|${bucket}|${activeOnly ? 1 : 0}`;
    const hit = CACHE.get(key);
    if (!force && hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ ...hit.payload, cached: true });
    }

    const payload = await getAssignmentBoard(from, to, bucket, { activeOnly });
    CACHE.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load the assignment board"), { status: 502 });
  }
}
