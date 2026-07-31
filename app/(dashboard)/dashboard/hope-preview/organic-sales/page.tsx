"use client";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { useApi } from "@/lib/use-api";
import { IconBook2, IconCoin, IconReceipt, IconCreditCard } from "@tabler/icons-react";

type Report = {
  source: string;
  range: { from: string; to: string };
  totals: { sales: number; revenue: number };
  byBook: { book: string; sales: number; revenue: number }[];
  byMode: { mode: string; sales: number }[];
  byMonth: { month: string; sales: number; revenue: number }[];
  recent: { date: string; name: string; book: string; amount: number; mode: string }[];
  error?: string;
};

const inr = (n: number) => "₹" + (n ?? 0).toLocaleString("en-IN");
const fmt = (n: number) => (n ?? 0).toLocaleString("en-IN");
// "2026-05" → "May 26"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MONTHS[+m - 1]} ${y.slice(2)}`; };
const BOOK_COLORS: Record<string, string> = { "AMC E Book": "#3A57E8", "New Zealand E Book": "#0EA5E9" };

export default function OrganicSalesPage() {
  return (
    <HopeDashboardShell active="organic-sales" title="Organic Sales" hideAccountPicker subtitle="E-Book orders from the Marketing Hub — paid sales only, straight from Airtable. No paid promotion.">
      {({ range }) => <Inner range={range} />}
    </HopeDashboardShell>
  );
}

function Inner({ range }: { range: { from: string; to: string } }) {
  const qs = new URLSearchParams({ from: range.from, to: range.to }).toString();
  const { data, isLoading } = useApi<Report>(`/api/organic-sales?${qs}`);
  const notConfigured = data?.source === "none";

  return (
    <div className="hope-scope space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat icon={<IconReceipt size={18} className="text-brand" />} label="E-Book sales" value={fmt(data?.totals.sales ?? 0)} sub="paid orders in range" />
        <Stat icon={<IconCoin size={18} className="text-brand" />} label="Revenue" value={inr(data?.totals.revenue ?? 0)} sub="collected in range" />
        <Stat icon={<IconBook2 size={18} className="text-brand" />} label="Titles sold" value={String(data?.byBook.length ?? 0)} sub="AMC · New Zealand" />
      </div>

      {notConfigured && (
        <Card><div className="text-[13px] text-gray-500 text-center py-6">{data?.error || "No paid E-Book orders found for this range."}</div></Card>
      )}

      {/* Per-book */}
      <SectionTitle title="Sales by e-book" sub="Paid orders and revenue per title." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data?.byBook.length ? data.byBook : (isLoading ? [] : [])).map((b) => (
          <Card key={b.book}>
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: (BOOK_COLORS[b.book] || "#3A57E8") + "1A" }}>
                <IconBook2 size={20} style={{ color: BOOK_COLORS[b.book] || "#3A57E8" }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-[#232D42]">{b.book}</div>
                <div className="flex gap-6 mt-2">
                  <div><div className="text-[20px] font-semibold text-[#232D42] tabular-nums">{fmt(b.sales)}</div><div className="text-[11px] text-gray-400">sales</div></div>
                  <div><div className="text-[20px] font-semibold text-[#232D42] tabular-nums">{inr(b.revenue)}</div><div className="text-[11px] text-gray-400">revenue</div></div>
                  <div><div className="text-[20px] font-semibold text-[#232D42] tabular-nums">{inr(b.sales ? Math.round(b.revenue / b.sales) : 0)}</div><div className="text-[11px] text-gray-400">avg / sale</div></div>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {!isLoading && !data?.byBook.length && <Card><div className="text-[13px] text-gray-400 py-3">No sales in this range.</div></Card>}
      </div>

      {/* 12-month trend */}
      <SectionTitle title="Last 12 months" sub="Monthly paid sales and revenue (independent of the range above)." />
      <Card><MonthlyChart data={data?.byMonth || []} /></Card>

      {/* Payment split + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHead icon={<IconCreditCard size={15} className="text-brand" />} title="Payment mode" />
          {(data?.byMode || []).length === 0 ? <div className="text-[13px] text-gray-400 py-2">—</div> : (
            <div className="space-y-2">
              {data!.byMode.map((m) => {
                const tot = data!.byMode.reduce((s, x) => s + x.sales, 0) || 1;
                const pct = Math.round((m.sales / tot) * 100);
                return (
                  <div key={m.mode}>
                    <div className="flex justify-between text-[12.5px] mb-0.5"><span className="text-gray-700">{m.mode}</span><span className="text-gray-500 tabular-nums">{m.sales} · {pct}%</span></div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-brand" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <div className="lg:col-span-2">
          <Card>
            <CardHead icon={<IconReceipt size={15} className="text-brand" />} title="Recent orders" sub="Most recent paid orders in range." />
            {(data?.recent || []).length === 0 ? <div className="text-[13px] text-gray-400 py-2">No orders in this range.</div> : (
              <div className="divide-y divide-gray-50">
                {data!.recent.map((o, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 text-[13px]">
                    <span className="text-gray-400 tabular-nums w-[70px] flex-shrink-0">{o.date.slice(5)}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-800">{o.name}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: (BOOK_COLORS[o.book] || "#8A92A6") + "1A", color: BOOK_COLORS[o.book] || "#8A92A6" }}>{o.book.replace(" E Book", "")}</span>
                    <span className="text-gray-400 text-[11px] w-8">{o.mode}</span>
                    <span className="text-[#232D42] font-medium tabular-nums w-[70px] text-right">{inr(o.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// Simple dual-metric monthly bars (revenue bar + sales dot line label).
function MonthlyChart({ data }: { data: { month: string; sales: number; revenue: number }[] }) {
  if (!data.length) return <div className="text-[13px] text-gray-400 py-6 text-center">No data.</div>;
  const maxRev = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="flex items-end gap-2 h-48 pt-4">
      {data.map((d) => {
        const h = Math.round((d.revenue / maxRev) * 100);
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center justify-end h-full group">
            <div className="text-[10px] text-gray-500 tabular-nums mb-1">{d.sales || ""}</div>
            <div className="w-full rounded-t-md bg-brand/85 hover:bg-brand transition-all relative" style={{ height: `${h}%`, minHeight: d.revenue ? 3 : 0 }} title={`${monthLabel(d.month)}: ${d.sales} sales · ${inr(d.revenue)}`} />
            <div className="text-[10px] text-gray-400 mt-1.5 whitespace-nowrap">{monthLabel(d.month)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- atoms ----
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-gray-100 rounded-2xl p-4 md:p-5">{children}</div>;
}
function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[12px] text-gray-500">{icon}{label}</div>
      <div className="text-[24px] font-semibold text-[#232D42] tabular-nums mt-1">{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}
function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return <div className="pt-1"><div className="text-[15px] font-semibold text-[#232D42]">{title}</div><div className="text-[12.5px] text-gray-500">{sub}</div></div>;
}
function CardHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return <div className="flex items-start gap-2 mb-3"><span className="mt-0.5">{icon}</span><div><div className="text-[13.5px] font-semibold text-[#232D42]">{title}</div>{sub && <div className="text-[12px] text-gray-500">{sub}</div>}</div></div>;
}
