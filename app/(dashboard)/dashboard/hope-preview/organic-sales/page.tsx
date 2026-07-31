"use client";
import { useState } from "react";
import { HopeDashboardShell } from "@/app/(dashboard)/dashboard/hope-preview/HopeDashboardShell";
import { useApi } from "@/lib/use-api";
import { AreaTrend } from "@/components/AreaTrend";
import { IconBook2, IconCoin, IconReceipt, IconCreditCard, IconChevronRight } from "@tabler/icons-react";

const BOOK_TABS = [
  { key: "", label: "All E-Books" },
  { key: "amc", label: "Australia AMC" },
  { key: "nz", label: "New Zealand" },
] as const;

type Report = {
  source: string;
  range: { from: string; to: string };
  totals: { sales: number; revenue: number };
  byBook: { book: string; sales: number; revenue: number }[];
  byMode: { mode: string; sales: number }[];
  byMonth: { month: string; sales: number; revenue: number }[];
  recent: { date: string; paidAt: string; name: string; email: string; phone: string; paymentId: string; book: string; amount: number; mode: string; emailSent: string | null }[];
  error?: string;
};

const inr = (n: number) => "₹" + (n ?? 0).toLocaleString("en-IN");
// Two-decimal rupee (exact charged amount), e.g. ₹715.50
const inr2 = (n: number) => "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => (n ?? 0).toLocaleString("en-IN");
// "AMC E Book" → "Australia AMC E-Book"; "New Zealand E Book" → "New Zealand E-Book"
const bookName = (b: string) => (b === "AMC E Book" ? "Australia AMC E-Book" : b.replace(/ E Book$/, " E-Book"));
// full timestamp "Thu, 22 Jul 2026, 2:41 pm"
const paidWhen = (iso: string) => { if (!iso) return "—"; const d = new Date(iso); return d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }); };
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
  const [book, setBook] = useState<string>("");
  const qs = new URLSearchParams({ from: range.from, to: range.to, ...(book ? { book } : {}) }).toString();
  const { data, isLoading } = useApi<Report>(`/api/organic-sales?${qs}`);
  const notConfigured = data?.source === "none";

  return (
    <div className="hope-scope space-y-6">
      {/* Per-book tabs */}
      <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
        {BOOK_TABS.map((t) => (
          <button key={t.key} onClick={() => setBook(t.key)}
            className={`text-xs font-medium px-3.5 py-1.5 rounded-md transition ${book === t.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat icon={<IconReceipt size={18} className="text-brand" />} label="E-Book sales" value={fmt(data?.totals.sales ?? 0)} sub="paid orders in range" />
        <Stat icon={<IconCoin size={18} className="text-brand" />} label="Revenue" value={inr(data?.totals.revenue ?? 0)} sub="collected in range" />
        <Stat icon={<IconBook2 size={18} className="text-brand" />} label="Titles sold" value={String(data?.byBook.length ?? 0)} sub="AMC · New Zealand" />
      </div>

      {notConfigured && (
        <Card><div className="text-[13px] text-gray-500 text-center py-6">{data?.error || "No paid E-Book orders found for this range."}</div></Card>
      )}

      {/* Per-book + Payment mode side by side (fills the empty space) */}
      <SectionTitle title="Sales by E-Book" sub="Paid orders and revenue per title." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(data?.byBook.length ? data.byBook : (isLoading ? [] : [])).map((b) => (
          <Card key={b.book}>
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: (BOOK_COLORS[b.book] || "#3A57E8") + "1A" }}>
                <IconBook2 size={20} style={{ color: BOOK_COLORS[b.book] || "#3A57E8" }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-[#232D42]">{bookName(b.book)}</div>
                <div className="flex gap-5 mt-2">
                  <div><div className="text-[19px] font-semibold text-[#232D42] tabular-nums">{fmt(b.sales)}</div><div className="text-[11px] text-gray-400">sales</div></div>
                  <div><div className="text-[19px] font-semibold text-[#232D42] tabular-nums">{inr2(b.revenue)}</div><div className="text-[11px] text-gray-400">revenue</div></div>
                  <div><div className="text-[19px] font-semibold text-[#232D42] tabular-nums">{inr2(b.sales ? b.revenue / b.sales : 0)}</div><div className="text-[11px] text-gray-400">avg / sale</div></div>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {/* Payment mode — sits next to the book cards */}
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
        {!isLoading && !data?.byBook.length && <Card><div className="text-[13px] text-gray-400 py-3">No sales in this range.</div></Card>}
      </div>

      {/* 12-month trend — two line graphs */}
      <SectionTitle title="Last 12 months" sub="Monthly trend (independent of the range above)." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHead icon={<IconReceipt size={15} className="text-brand" />} title="Sales per month" />
          <AreaTrend data={(data?.byMonth || []).map((d) => ({ label: monthLabel(d.month), value: d.sales }))} color="#3A57E8" unit="Sales" />
        </Card>
        <Card>
          <CardHead icon={<IconCoin size={15} style={{ color: "#079AA2" }} />} title="Revenue per month" />
          <AreaTrend data={(data?.byMonth || []).map((d) => ({ label: monthLabel(d.month), value: d.revenue }))} color="#079AA2" unit="Revenue" format={inr} />
        </Card>
      </div>

      {/* Recent orders — full width, each row expands to full payment detail */}
      <SectionTitle title="Recent orders" sub="Paid orders in range — click a row to see the full payment detail." />
      <Card>
        {(data?.recent || []).length === 0 ? <div className="text-[13px] text-gray-400 py-2">No orders in this range.</div> : (
          <div className="divide-y divide-gray-50">
            {data!.recent.map((o) => <OrderRow key={o.paymentId || o.paidAt} o={o} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

// A recent-order row that expands on click to show the full payment detail.
function OrderRow({ o }: { o: Report["recent"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 py-2.5 text-[13px] text-left hover:bg-gray-50/60 rounded-lg px-1 -mx-1">
        <IconChevronRight size={15} className={`text-gray-300 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-gray-400 tabular-nums w-[64px] flex-shrink-0">{o.date.slice(5)}</span>
        <span className="flex-1 min-w-0 truncate text-gray-800 font-medium">{o.name}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: (BOOK_COLORS[o.book] || "#8A92A6") + "1A", color: BOOK_COLORS[o.book] || "#8A92A6" }}>{o.book.replace(" E Book", "")}</span>
        <span className="text-gray-400 text-[11px] w-8 flex-shrink-0">{o.mode}</span>
        <span className="text-[#232D42] font-medium tabular-nums w-[86px] text-right flex-shrink-0">{inr2(o.amount)}</span>
      </button>
      {open && (
        <div className="ml-[30px] mb-2 mt-0.5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 bg-gray-50/70 border border-gray-100 rounded-xl p-3 text-[12.5px]">
          <Detail label="Paid on" value={paidWhen(o.paidAt)} />
          <Detail label="Amount" value={inr2(o.amount)} strong />
          <Detail label="E-Book" value={bookName(o.book)} />
          <Detail label="Payment mode" value={o.mode} />
          <Detail label="Email" value={o.email || "—"} />
          <Detail label="Phone" value={o.phone || "—"} />
          <Detail label="Payment ID" value={o.paymentId || "—"} mono />
          <Detail label="Access email sent" value={o.emailSent ? paidWhen(o.emailSent) : "Not sent"} />
        </div>
      )}
    </div>
  );
}
function Detail({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-100/70 last:border-0 py-0.5">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className={`text-right truncate ${strong ? "text-[#232D42] font-semibold" : "text-gray-700"} ${mono ? "font-mono text-[11.5px]" : ""}`} title={value}>{value}</span>
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
