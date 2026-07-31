import { recordApiCall } from "@/lib/api-usage";

// Organic Sales — reads the E-Book orders straight from the Airtable **Marketing
// Hub** base (a different base than Sales Hub, so we can't reuse the sales-hub
// helper's hard-coded base). Only *paid* orders count as sales. The table is
// small, so we pull paid rows once and aggregate in JS (by book, by month, by
// payment mode) for whatever window the Reports/Organic-Sales tab asks for.

const MARKETING_HUB_BASE = "appLdJFTrothBLDc0";
const E_BOOK_ORDERS_TABLE = "tblDDCWiBZyIsXjca";

function token(): string {
  const t = process.env.AIRTABLE_API_KEY;
  if (!t) throw new Error("AIRTABLE_API_KEY not configured");
  return t;
}

type Rec<T> = { id: string; fields: T; createdTime: string };

async function listPaidOrders<T>(): Promise<Rec<T>[]> {
  const out: Rec<T>[] = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams();
    qs.set("pageSize", "100");
    qs.set("filterByFormula", "{Status}='Paid'");
    if (offset) qs.set("offset", offset);
    const r = await fetch(`https://api.airtable.com/v0/${MARKETING_HUB_BASE}/${E_BOOK_ORDERS_TABLE}?${qs}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
    recordApiCall("Airtable", r.ok, r.status);
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const json = (await r.json()) as { records: Rec<T>[]; offset?: string };
    out.push(...json.records);
    offset = json.offset;
  } while (offset);
  return out;
}

type OrderFields = {
  Service?: string;             // "AMC E Book" | "New Zealand E Book"
  Amount?: number;
  "Payment Mode"?: string;      // "UPI" | "Card"
  "First Name"?: string;
  "Last Name"?: string;
};

export type OrganicSalesReport = {
  source: "airtable" | "none";
  range: { from: string; to: string };
  totals: { sales: number; revenue: number };
  byBook: { book: string; sales: number; revenue: number }[];
  byMode: { mode: string; sales: number }[];
  byMonth: { month: string; sales: number; revenue: number }[];   // last 12 months, chronological
  recent: { date: string; name: string; book: string; amount: number; mode: string }[];
  error?: string;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ym = (iso: string) => iso.slice(0, 7);

// Build the last-12-months axis (YYYY-MM), oldest first, ending at `to`.
function last12Months(toIso: string): string[] {
  const end = new Date(toIso + "T00:00:00Z");
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function organicSales(from: string, to: string): Promise<OrganicSalesReport> {
  const empty: OrganicSalesReport = {
    source: "none", range: { from, to }, totals: { sales: 0, revenue: 0 },
    byBook: [], byMode: [], byMonth: [], recent: [],
  };
  try {
    const rows = await listPaidOrders<OrderFields>();
    // Order date = the record's createdTime (stamped when the payment webhook writes it).
    const orders = rows.map((r) => {
      const f = r.fields;
      const date = (r.createdTime || "").slice(0, 10);
      return {
        date,
        book: f.Service || "Other",
        amount: typeof f.Amount === "number" ? f.Amount : 0,
        mode: f["Payment Mode"] || "—",
        name: [f["First Name"], f["Last Name"]].filter(Boolean).join(" ").trim() || "—",
      };
    });

    // Windowed slice for the headline cards + book/mode/recent breakdowns.
    const inWindow = orders.filter((o) => o.date >= from && o.date <= to);
    const bookMap = new Map<string, { sales: number; revenue: number }>();
    const modeMap = new Map<string, number>();
    for (const o of inWindow) {
      const b = bookMap.get(o.book) || { sales: 0, revenue: 0 };
      b.sales += 1; b.revenue += o.amount; bookMap.set(o.book, b);
      modeMap.set(o.mode, (modeMap.get(o.mode) || 0) + 1);
    }
    const byBook = [...bookMap.entries()].map(([book, v]) => ({ book, ...v })).sort((a, b) => b.revenue - a.revenue);
    const byMode = [...modeMap.entries()].map(([mode, sales]) => ({ mode, sales })).sort((a, b) => b.sales - a.sales);
    const totals = { sales: inWindow.length, revenue: Math.round(inWindow.reduce((s, o) => s + o.amount, 0)) };

    // 12-month trend (independent of the window) for the chart.
    const months = last12Months(to);
    const monthAgg = new Map<string, { sales: number; revenue: number }>(months.map((m) => [m, { sales: 0, revenue: 0 }]));
    for (const o of orders) {
      const m = ym(o.date);
      const slot = monthAgg.get(m);
      if (slot) { slot.sales += 1; slot.revenue += o.amount; }
    }
    const byMonth = months.map((m) => ({ month: m, sales: monthAgg.get(m)!.sales, revenue: Math.round(monthAgg.get(m)!.revenue) }));

    const recent = [...inWindow].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25)
      .map((o) => ({ date: o.date, name: o.name, book: o.book, amount: Math.round(o.amount), mode: o.mode }));

    return { source: "airtable", range: { from, to }, totals, byBook, byMode, byMonth, recent };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : "Failed to load organic sales" };
  }
}

export { ymd };
