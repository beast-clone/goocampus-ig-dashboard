import { getSupabase } from "@/lib/supabase";

// Durable archive of generated reports, organised BY PLATFORM (Instagram,
// Facebook, LinkedIn, YouTube) so each channel keeps its own reports. Each report
// is upserted per period bucket into `discover_cache` (source="saved_report") so
// past weeks/months/quarters stay browsable in the Reports tab instead of being
// regenerated + thrown away. Reuses the same cache table the snapshots use.

export type ReportPlatform = "instagram" | "facebook" | "linkedin" | "youtube";
export type ReportPeriod = "weekly" | "monthly" | "quarterly";

export type SavedReportMeta = {
  key: string;
  platform: ReportPlatform;
  accountId: string;
  period: ReportPeriod;
  bucket: string;       // the period window this slot represents (e.g. "2026-07")
  label: string;
  account: string;      // handle shown in the report
  from: string;
  to: string;
  generatedAt: string;
  headline?: { label: string; value: string; delta?: string }[];
};

type StoredRecord = SavedReportMeta & { report: unknown };

// One archive slot per period window, so re-generating the same period UPDATES
// the same entry instead of piling up duplicates.
export function periodBucket(period: ReportPeriod, toDate: string): string {
  const d = new Date(toDate + "T00:00:00Z");
  const y = d.getUTCFullYear();
  if (period === "monthly") return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (period === "quarterly") return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  const dowMon0 = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dowMon0);
  return monday.toISOString().slice(0, 10);
}

function keyFor(platform: ReportPlatform, accountId: string, period: ReportPeriod, bucket: string): string {
  return `report:${platform}:${accountId}:${period}:${bucket}`;
}

type ReportLike = {
  meta: { account: string; label: string; dateRange: { from: string; to: string }; generatedAt: string };
  highlights?: { label: string; value: string; delta?: string }[];
};

export async function saveReport(
  platform: ReportPlatform,
  accountId: string,
  period: ReportPeriod,
  toDate: string,
  report: ReportLike,
): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const bucket = periodBucket(period, toDate);
  const key = keyFor(platform, accountId, period, bucket);
  const record: StoredRecord = {
    key,
    platform,
    accountId,
    period,
    bucket,
    label: report.meta.label,
    account: report.meta.account,
    from: report.meta.dateRange.from,
    to: report.meta.dateRange.to,
    generatedAt: report.meta.generatedAt,
    headline: (report.highlights || []).slice(0, 4).map((h) => ({ label: h.label, value: h.value, delta: h.delta })),
    report,
  };
  await db.from("discover_cache").upsert(
    { cache_key: key, source: "saved_report", last_fetched: new Date().toISOString(), payload: record },
    { onConflict: "cache_key" },
  );
}

export async function listReports(opts?: { platform?: ReportPlatform; accountId?: string }): Promise<SavedReportMeta[]> {
  const db = getSupabase();
  if (!db) return [];
  let q = db.from("discover_cache").select("payload").eq("source", "saved_report");
  if (opts?.platform && opts?.accountId) q = q.like("cache_key", `report:${opts.platform}:${opts.accountId}:%`);
  else if (opts?.platform) q = q.like("cache_key", `report:${opts.platform}:%`);
  const { data } = await q;
  if (!data) return [];
  return data
    .map((r) => r.payload as StoredRecord)
    .map(({ report: _drop, ...meta }) => meta)
    .filter((m) => !opts?.accountId || m.accountId === opts.accountId)
    // newest window first, then most-recently generated
    .sort((a, b) => b.to.localeCompare(a.to) || b.generatedAt.localeCompare(a.generatedAt));
}

export async function getReport(key: string): Promise<unknown | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("discover_cache")
    .select("payload")
    .eq("cache_key", key)
    .eq("source", "saved_report")
    .maybeSingle();
  if (!data) return null;
  return (data.payload as StoredRecord).report;
}
