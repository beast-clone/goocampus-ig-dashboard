import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import {
  listReports, getReport, listTrash, trashReport, restoreReport, deleteReportPermanent, type ReportPlatform,
} from "@/lib/report-store";
import { safeError } from "@/lib/errors";

// Saved-report archive API.
//   GET  /api/reports?platform=instagram        -> saved reports for one platform
//   GET  /api/reports?platform=..&accountId=..  -> narrowed to one account
//   GET  /api/reports                            -> all saved reports (all platforms)
//   GET  /api/reports?trash=1                    -> reports in the Recycle Bin
//   GET  /api/reports?key=report:..              -> the full stored report payload
//   DELETE /api/reports?key=..                   -> move report to the Recycle Bin (soft)
//   DELETE /api/reports?key=..&permanent=1       -> delete forever (only from the bin)
//   POST /api/reports { action:"restore", key }  -> recover a report from the bin
export async function GET(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key) {
      const report = await getReport(key);
      if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });
      return NextResponse.json({ report });
    }
    if (url.searchParams.get("trash") === "1") {
      return NextResponse.json({ reports: await listTrash() });
    }
    const platform = (url.searchParams.get("platform") || undefined) as ReportPlatform | undefined;
    const accountId = url.searchParams.get("accountId") || undefined;
    const reports = await listReports({ platform, accountId });
    return NextResponse.json({ reports });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load reports"), { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
    const permanent = url.searchParams.get("permanent") === "1";
    const ok = permanent ? await deleteReportPermanent(key) : await trashReport(key);
    if (!ok) return NextResponse.json({ error: permanent ? "not in Recycle Bin" : "report not found" }, { status: 404 });
    return NextResponse.json({ ok: true, permanent });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to delete report"), { status: 500 });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("analytics");
  if (__denied) return __denied;

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; key?: string };
    if (body.action !== "restore" || !body.key) return NextResponse.json({ error: "expected { action: 'restore', key }" }, { status: 400 });
    const ok = await restoreReport(body.key);
    if (!ok) return NextResponse.json({ error: "report not found in Recycle Bin" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to restore report"), { status: 500 });
  }
}
