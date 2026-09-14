import seed from "./data/report-history-seed.json";

// One-time history imported from the team's Notion monthly report (May 2026).
// Each table = the column headers + one row per month (values kept as display
// strings, exactly as the Notion report showed them, e.g. "5.3 L", "40.1K").
// Going forward the report appends each new month from live data.
// See docs/MONTHLY_REPORT_SPEC.md.
export type HistoryTable = { heading: string; header: string[]; rows: string[][] };
export type ReportHistory = {
  organicLeads: HistoryTable;
  instagram: HistoryTable;
  engagement: HistoryTable;
  youtube: HistoryTable;
  facebook: HistoryTable;
  linkedin: HistoryTable;
};

export const REPORT_HISTORY = seed as ReportHistory;
