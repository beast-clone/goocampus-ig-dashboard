import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { refreshAlert, refreshAllActive } from "@/lib/content-radar";
import { safeError } from "@/lib/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Refresh a single alert (POST body { id }) or all active alerts (empty body).
// The dashboard button uses the "all" path; the settings row calls it per-alert.
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  let body: { id?: string } = {};
  try { body = await req.json(); }
  catch { /* empty body is OK — means refresh-all */ }

  try {
    if (body.id) {
      if (!UUID_RE.test(body.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      const r = await refreshAlert(body.id);
      return NextResponse.json({ ok: true, ...r });
    }
    const results = await refreshAllActive();
    const inserted = results.reduce((s, r) => s + r.inserted, 0);
    const errors = results.filter((r) => r.error);
    return NextResponse.json({ ok: true, alerts: results.length, inserted, errors });
  } catch (err) {
    return NextResponse.json(safeError(err, "Refresh failed"), { status: 502 });
  }
}
