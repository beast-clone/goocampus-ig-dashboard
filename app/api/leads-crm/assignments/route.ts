import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getLeadBoard, type Bucket, type LeadBoard } from "@/lib/lead-assignment";

// GET /api/leads-crm/assignments?from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=day|week|month
//
// Leads per day: one row per bucket, one column per counsellor, plus the leads
// themselves so clicking a day doesn't cost another round trip. Read-only.
//
// Cached 15 min per {from|to|bucket} — this pages through the whole CRM range and
// the numbers only move when new leads land.

const CACHE = new Map<string, { at: number; payload: LeadBoard }>();
const TTL_MS = 15 * 60 * 1000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  // Same lead PII (names) as the rest of /api/leads-crm.
  const denied = await requireSection("sales");
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const raw = url.searchParams.get("bucket");
    const bucket: Bucket = raw === "week" || raw === "month" ? raw : "day";
    const force = url.searchParams.get("force") === "1";

    if (!DATE.test(from) || !DATE.test(to)) {
      return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: "from must not be after to" }, { status: 400 });
    }

    const key = `${from}|${to}|${bucket}`;
    const hit = CACHE.get(key);
    if (!force && hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ ...hit.payload, cached: true });
    }

    const payload = await getLeadBoard(from, to, bucket);
    CACHE.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load the lead board"), { status: 502 });
  }
}
