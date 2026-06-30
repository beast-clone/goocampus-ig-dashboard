"use client";
import { useState } from "react";
import { format, subDays, parseISO } from "date-fns";
import { Sidebar } from "@/components/Sidebar";
import { DateRangePicker, type Range, rangeDays } from "@/components/DateRangePicker";
import { AIReportButton } from "@/components/AIReportButton";
import { PdfExportButton } from "@/components/PdfExportButton";
import { TokenExpiryBadge } from "@/components/TokenExpiryBadge";
import { ACCOUNTS, DEFAULT_ACCOUNT_ID } from "@/lib/accounts";

function rangeLabel(r: Range): string {
  const days = rangeDays(r);
  const today = format(new Date(), "yyyy-MM-dd");
  const isToToday = r.to === today;
  if (isToToday && days === 7) return "Last 7 days";
  if (isToToday && days === 30) return "Last 30 days";
  if (isToToday && days === 90) return "Last 90 days";
  if (isToToday && days === 180) return "Last 6 months";
  if (isToToday && days === 365) return "Last 1 year";
  const fromStr = format(parseISO(r.from), "d MMM");
  const toStr = format(parseISO(r.to), "d MMM yyyy");
  return `${fromStr} – ${toStr} (${days} days)`;
}

export function DashboardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: (ctx: { accountId: string; compareAll: boolean; range: Range }) => React.ReactNode;
}) {
  const [accountId, setAccountId] = useState(DEFAULT_ACCOUNT_ID);
  const [compareAll, setCompareAll] = useState(false);
  const [range, setRange] = useState<Range>({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });

  const account = ACCOUNTS.find((a) => a.id === accountId);
  const headerTitle = compareAll ? `${title} — All Accounts` : title;
  const headerSub = compareAll ? "Cross-account comparison" : subtitle ?? account?.handle;

  return (
    <div className="flex">
      <Sidebar
        accountId={accountId}
        onAccountChange={(id) => { setAccountId(id); setCompareAll(false); }}
        onCompareAll={() => setCompareAll(true)}
      />
      <main className="flex-1 p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-3">
              {headerTitle}
              <span className="text-xs font-medium bg-brand-light text-brand rounded-full px-3 py-1">
                {rangeLabel(range)}
              </span>
            </h1>
            <p className="text-sm text-gray-500">{headerSub}</p>
          </div>
          <div className="flex items-center gap-3">
            <TokenExpiryBadge />
            <DateRangePicker value={range} onChange={setRange} />
            <PdfExportButton accountId={compareAll ? "all" : accountId} range={range} />
            <AIReportButton accountId={compareAll ? "all" : accountId} range={range} />
          </div>
        </div>
        {children({ accountId: compareAll ? "all" : accountId, compareAll, range })}
      </main>
    </div>
  );
}
