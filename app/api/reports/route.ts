import { NextResponse } from "next/server";
import { listReports, getReport, type ReportPlatform } from "@/lib/report-store";
import { safeError } from "@/lib/errors";

// Saved-report archive API.
//   GET /api/reports?platform=instagram        -> saved reports for one platform
//   GET /api/reports?platform=..&accountId=..  -> narrowed to one account
//   GET /api/reports                            -> all saved reports (all platforms)
//   GET /api/reports?key=report:..              -> the full stored report payload
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key) {
      const report = await getReport(key);
      if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });
      return NextResponse.json({ report });
    }
    const platform = (url.searchParams.get("platform") || undefined) as ReportPlatform | undefined;
    const accountId = url.searchParams.get("accountId") || undefined;
    const reports = await listReports({ platform, accountId });
    return NextResponse.json({ reports });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load reports"), { status: 500 });
  }
}
