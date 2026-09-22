// Revenue tracker (Sales Hub → Revenue). Programme revenue only, READ-ONLY, from the
// Sales Hub "Revenue Tracker" table (see lib/sales-hub.ts for the no-writes rule).
//
// Dating a payment: "Payment Date" when it's filled in, otherwise the "Month & Year"
// single-select (every row has it; ~40% of rows have no Payment Date). The Sales Hub
// page reads Payment Date and Social Leads reads Month & Year, which is why their
// totals could disagree — this uses both, in that order.
//
// "Needs attention" lists every payment logged without an amount or a date, so the
// gap can be filled in Airtable (since Apr 2026 most rows have no Revenue).
import { cached } from "@/lib/api-cache";
import { airtableList, pickName, pickNumber, PRIMARY_INTERESTS_TABLE, REVENUE_TABLE, SALES_HUB_BASE } from "@/lib/sales-hub";

export type Payment = {
  id: string; client: string; owner: string; source: string; programmes: string[];
  amount: number | null;          // null = not filled in
  date: string | null;            // YYYY-MM-DD (Payment Date), null when empty
  month: string;                  // YYYY-MM — from the date, else Month & Year
  airtableUrl: string;            // the Revenue Tracker row (where the amount is typed)
  candidateUrl: string | null;    // the lead's CRM record
};
type Bucket = { key: string; revenue: number; payments: number };
export type RevenueReport = {
  range: { from: string; to: string };
  totals: { revenue: number; payments: number; withAmount: number; avg: number | null };
  previous: { revenue: number; payments: number; from: string; to: string };
  trend: Bucket[];                // last 12 months, oldest first
  byCounsellor: Bucket[]; bySource: Bucket[]; byProgramme: Bucket[];
  payments: Payment[];            // in range, newest first
  needsAttention: (Payment & { missing: ("amount" | "date")[] })[]; // all time, newest first
  generatedAt: string;
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthKey = (label: string) => {
  const [m, y] = label.trim().toLowerCase().split(/\s+/);
  const i = MONTHS.indexOf(m);
  return i >= 0 && /^\d{4}$/.test(y || "") ? `${y}-${String(i + 1).padStart(2, "0")}` : "";
};
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

async function interestNames(): Promise<Map<string, string>> {
  return cached("revenue:interests", 60 * 60_000, async () => {
    const rows = await airtableList<{ Particulars?: string }>(PRIMARY_INTERESTS_TABLE, { fields: ["Particulars"], maxRecords: 500 });
    return new Map(rows.map((r) => [r.id, r.fields.Particulars || ""]));
  });
}

async function allPayments(): Promise<Payment[]> {
  return cached("revenue:payments", 10 * 60_000, async () => {
    const [rows, names] = await Promise.all([
      airtableList<Record<string, unknown>>(REVENUE_TABLE, {
        fields: ["Client's Name", "Payment Date", "Month & Year", "Revenue", "Owner", "Primary Interest", "Lead Source → n8n", "Airtable Link of the Candidate"],
      }),
      interestNames(),
    ]);
    return rows.map((r): Payment => {
      const f = r.fields;
      const date = typeof f["Payment Date"] === "string" ? (f["Payment Date"] as string).slice(0, 10) : null;
      const rev = f["Revenue"];
      return {
        id: r.id,
        client: pickName(f["Client's Name"]) || "(no name)",
        owner: pickName(f["Owner"]) || "Unassigned",
        source: pickName(f["Lead Source → n8n"]) || "Not set",
        programmes: (Array.isArray(f["Primary Interest"]) ? (f["Primary Interest"] as string[]) : []).map((id) => names.get(id) || "").filter(Boolean),
        amount: rev == null || rev === "" ? null : pickNumber(rev),
        date,
        month: date ? date.slice(0, 7) : monthKey(pickName(f["Month & Year"])),
        airtableUrl: `https://airtable.com/${SALES_HUB_BASE}/${REVENUE_TABLE}/${r.id}`,
        candidateUrl: typeof f["Airtable Link of the Candidate"] === "string" ? (f["Airtable Link of the Candidate"] as string) : null,
      };
    });
  });
}

// In range: dated payments by their date; undated ones when their month overlaps the range.
const inRange = (p: Payment, from: string, to: string) =>
  p.date ? p.date >= from && p.date <= to : !!p.month && `${p.month}-01` <= to && lastDay(p.month) >= from;

function bucket(ps: Payment[], keysOf: (p: Payment) => string[]): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const p of ps) {
    const keys = keysOf(p).length ? keysOf(p) : ["Not set"];
    for (const k of keys) {
      const b = m.get(k) || { key: k, revenue: 0, payments: 0 };
      b.revenue += (p.amount || 0) / keys.length; // a payment for two programmes counts half to each
      b.payments += 1;
      m.set(k, b);
    }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue || b.payments - a.payments);
}

export async function revenueReport(from: string, to: string, fresh = false): Promise<RevenueReport> {
  if (fresh) { const { clearCache } = await import("@/lib/api-cache"); clearCache("revenue:payments"); }
  const all = await allPayments();
  const cur = all.filter((p) => inRange(p, from, to));
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const pTo = new Date(Date.parse(from) - 86_400_000).toISOString().slice(0, 10);
  const pFrom = new Date(Date.parse(pTo) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const prev = all.filter((p) => inRange(p, pFrom, pTo));
  const sum = (ps: Payment[]) => ps.reduce((s, p) => s + (p.amount || 0), 0);
  const withAmount = cur.filter((p) => p.amount != null).length;

  // Trend: the 12 months ending with the range's last month.
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  const trend: Bucket[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + i, 1));
    const key = d.toISOString().slice(0, 7);
    const ps = all.filter((p) => p.month === key);
    return { key, revenue: sum(ps), payments: ps.length };
  });

  const byNewest = (a: Payment, b: Payment) => (b.date || `${b.month}-00`).localeCompare(a.date || `${a.month}-00`);
  return {
    range: { from, to },
    totals: { revenue: sum(cur), payments: cur.length, withAmount, avg: withAmount ? sum(cur) / withAmount : null },
    previous: { revenue: sum(prev), payments: prev.length, from: pFrom, to: pTo },
    trend,
    byCounsellor: bucket(cur, (p) => [p.owner]),
    bySource: bucket(cur, (p) => [p.source]),
    byProgramme: bucket(cur, (p) => p.programmes),
    payments: [...cur].sort(byNewest),
    needsAttention: all
      .map((p) => ({ ...p, missing: [...(p.amount == null ? ["amount" as const] : []), ...(p.date ? [] : ["date" as const])] }))
      .filter((p) => p.missing.length)
      .sort(byNewest),
    generatedAt: new Date().toISOString(),
  };
}
