"use client";
import Link from "next/link";
import { IconCurrencyRupee, IconArrowRight } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { useApi } from "@/lib/use-api";
import type { RevenueReport } from "@/lib/revenue";
import { LeadAssignment } from "../LeadAssignment";

// Sales Hub → Leads tracker. One of the six sub-pages under Sales Hub in the sidebar;
// the shell supplies the single date range every Sales page shares.
export default function Page() {
  return (
    <PreviewDashboardShell active="sales" title="Leads tracker" subtitle="Leads you've pinned, plus everything the alert rules caught." hideAccountPicker compact>
      {({ range }) => (
        <div className="space-y-4">
          <RevenueStrip from={range.from} to={range.to} />
          <LeadAssignment range={range} only="tracker" />
        </div>
      )}
    </PreviewDashboardShell>
  );
}

// Revenue at a glance (Nandu: "Kindly please add revenue tracker") → the full Revenue page.
function RevenueStrip({ from, to }: { from: string; to: string }) {
  const { data } = useApi<RevenueReport>(`/api/sales-ops/revenue?from=${from}&to=${to}`);
  if (!data?.totals) return null;
  const missing = data.totals.payments - data.totals.withAmount;
  return (
    <Link href="/dashboard/preview/sales-ops/revenue"
      className="preview-scope flex items-center gap-3 flex-wrap bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-brand">
      <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center flex-shrink-0"><IconCurrencyRupee size={17} stroke={1.8} /></span>
      <span className="text-[14px] text-[#232D42]">
        <b className="font-medium">₹{Math.round(data.totals.revenue).toLocaleString("en-IN")}</b> revenue booked in this period · {data.totals.payments} payment{data.totals.payments === 1 ? "" : "s"}
      </span>
      {missing > 0 && <span className="text-[12px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{missing} without an amount</span>}
      <span className="ml-auto inline-flex items-center gap-1 text-[13px] text-brand">Revenue tracker <IconArrowRight size={14} stroke={1.8} /></span>
    </Link>
  );
}
